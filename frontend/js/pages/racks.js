// Base API URL
import { API } from '../config.js';
import { renderSlots } from './slots.js';
import { renderDashboard } from './dashboard.js';
import * as THREE from '../three/three.module.js';
import { setCurrentView } from '../currentView.js';

// A tiny 4x256 canvas painted with a vertical gradient, used as a texture
// on the rack's top/side faces to fake shading without real 3D lighting.
function makeGradientTexture(topColor, bottomColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return new THREE.CanvasTexture(canvas);
}

// Renders text onto a canvas and wraps it as a THREE.Sprite (always faces
// the camera) - this is how rack names are drawn in the 3D/2.5D scene,
// since Three.js has no built-in text mesh.
function makeLabel(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 46px Calibri';
    ctx.fillStyle = '#1a2733';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.6, 0.65, 1);
    return sprite;
}

// Builds a flat quad mesh from 4 corners (given in order: bottom-left, bottom-right, top-right, top-left)
function makeQuad(p1, p2, p3, p4, material) {
    const positions = new Float32Array([
        ...p1, ...p2, ...p3,
        ...p1, ...p3, ...p4
    ]);
    const uvs = new Float32Array([
        0, 0, 1, 0, 1, 1,
        0, 0, 1, 1, 0, 1
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
}

// Builds a cavalier-projection box: the front face is a true, undistorted square;
// the top and right faces are parallelograms suggesting depth (no camera-angle involved).
function makeObliqueRack(size, skew, frontMaterial, gradientMaterial) {
    const half = size / 2;
    const fbl = [-half, -half, 0];
    const fbr = [half, -half, 0];
    const ftr = [half, half, 0];
    const ftl = [-half, half, 0];

    const back = (p) => [p[0] + skew, p[1] + skew, p[2] - 0.05];
    const tbl = back(ftl);
    const tbr = back(ftr);
    const rbt = tbr;
    const rbb = back(fbr);

    const group = new THREE.Group();
    group.add(makeQuad(fbl, fbr, ftr, ftl, frontMaterial));
    group.add(makeQuad(ftl, ftr, tbr, tbl, gradientMaterial));
    group.add(makeQuad(fbr, ftr, rbt, rbb, gradientMaterial));

    // Invisible solid box behind the visible faces, used only for click detection
    const hitBoxGeometry = new THREE.BoxGeometry(size, size, size * 0.6);
    const hitBoxMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeometry, hitBoxMaterial);
    hitBox.position.set(skew / 2, skew / 2, -size * 0.3);
    group.add(hitBox);
    group.userData.hitBox = hitBox;

    return group;
}

// Renders the zone view: a grid of racks drawn with Three.js (2.5D oblique
// boxes, not true 3D) on the left, and the zone's occupancy panel on the
// right. Clicking a rack navigates into its slots (renderSlots).
export async function renderRacks(zoneId) {
    setCurrentView(() => renderRacks(zoneId));
    const app = document.getElementById('app');
    app.innerHTML = '';

    const topBar = document.createElement('div');
    topBar.id = 'top-bar';
    app.appendChild(topBar);

    const backButton = document.createElement('button');
    backButton.id = 'racks-back-button';
    backButton.textContent = 'Inapoi';
    backButton.addEventListener('click', () => {
        renderDashboard();
    });
    topBar.appendChild(backButton);

    const title = document.createElement('h2');
    title.id = 'racks-title';
    title.className = 'nav-title';
    title.textContent = 'Rafturi';
    topBar.appendChild(title);

    const contentArea = document.createElement('div');
    contentArea.id = 'content-area';
    app.appendChild(contentArea);

    const leftColumn = document.createElement('div');
    leftColumn.id = 'left-column';
    contentArea.appendChild(leftColumn);

    const rightColumn = document.createElement('div');
    rightColumn.id = 'right-column';
    rightColumn.className = 'wide-column';
    contentArea.appendChild(rightColumn);

    const occupancyPanel = document.createElement('div');
    occupancyPanel.id = 'rack-occupancy-panel';
    rightColumn.appendChild(occupancyPanel);
    renderOccupancyPanel(zoneId);

    const canvasContainer = document.createElement('div');
    canvasContainer.id = 'canvas-container';
    leftColumn.appendChild(canvasContainer);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    // Width the canvas can use, capped at the old 800px: the whole
    // #content-area when the page is stacked in one column (small screens),
    // otherwise what's left beside the occupancy panel (its CSS min-width
    // plus the gap), minus the canvas container's 1px border on each side.
    function availableCanvasWidth() {
        const areaStyle = getComputedStyle(contentArea);
        const stacked = areaStyle.flexDirection === 'column';
        const besideWidth = stacked
            ? 0
            : (parseFloat(getComputedStyle(rightColumn).minWidth) || 0) + (parseFloat(areaStyle.columnGap) || 0);
        return Math.floor(contentArea.clientWidth - besideWidth) - 2;
    }

    const initialWidth = Math.max(240, Math.min(800, availableCanvasWidth()));

    const renderer = new THREE.WebGLRenderer();
    // Capped at 2 so text stays sharp on high-density phone screens without
    // making the canvas needlessly expensive to render.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(initialWidth, Math.round(initialWidth * 0.75));
    renderer.setClearColor(0xf0f0f0);
    renderer.domElement.id = 'racks-canvas';
    canvasContainer.appendChild(renderer.domElement);

    function render() {
        renderer.render(scene, camera);
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/racks/by-zone/${zoneId}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        console.log(data);

        const size = 2.4;
        const skew = 1.1;
        const spacing = size + skew + 0.8;
        const padding = 1.5;
        const groups = [];

        const gradientTexture = makeGradientTexture('#a9cbe8', '#3d6690');
        const gradientMaterial = new THREE.MeshBasicMaterial({ map: gradientTexture, side: THREE.DoubleSide });
        const frontMaterial = new THREE.MeshBasicMaterial({ color: '#5a8fc2', side: THREE.DoubleSide });

        // Racks are created once; where they sit depends on how many columns
        // fit the current width, so their positions are set in applyLayout.
        data.forEach((rack) => {
            const rackGroup = makeObliqueRack(size, skew, frontMaterial, gradientMaterial);
            rackGroup.userData.rackId = rack.id;

            const label = makeLabel(rack.name);
            label.position.set(0, 0, 0.05);
            rackGroup.add(label);

            scene.add(rackGroup);
            groups.push(rackGroup);
        });

        // Lays the racks out on a grid for the current available width (5
        // columns when wide, 3 on a phone; the row count grows to fit however
        // many racks the zone has), sizes the canvas to match the grid's
        // shape, and sets the orthographic camera's view bounds to fit the
        // whole grid, so all racks are visible instead of a fixed zoom that
        // could crop some out.
        let lastWidth = 0;
        function applyLayout() {
            const width = Math.max(240, Math.min(800, availableCanvasWidth()));
            // Height follows from width, so an unchanged width needs no work
            // (this also stops the height changes we cause from re-triggering us).
            if (width === lastWidth) {
                return;
            }
            lastWidth = width;

            const cols = width < 560 ? 3 : 5;
            const rows = Math.ceil(data.length / cols);
            groups.forEach((rackGroup, index) => {
                const rowStart = Math.floor(index / cols) * cols;
                const rowLength = Math.min(cols, data.length - rowStart);
                const x = (index % cols) * spacing - (rowLength - 1) * spacing / 2;
                const y = Math.floor(index / cols) * spacing - (rows - 1) * spacing / 2;
                rackGroup.position.set(x, y, 0);
            });

            const gridWidth = Math.min(cols, data.length) * spacing;
            const gridHeight = rows * spacing;
            // Never shorter than the old 4:3 shape, but taller when the grid
            // itself is tall (few columns, many rows) so racks aren't tiny.
            const height = Math.round(width * Math.max(0.75, (gridHeight + 2 * padding) / (gridWidth + 2 * padding)));
            renderer.setSize(width, height);

            const aspect = width / height;
            const viewSize = Math.max(gridHeight / 2 + padding, (gridWidth / 2 + padding) / aspect, 2.5);
            camera.left = -viewSize * aspect;
            camera.right = viewSize * aspect;
            camera.top = viewSize;
            camera.bottom = -viewSize;
            camera.updateProjectionMatrix();

            render();
        }
        applyLayout();

        // Follows the window size (including phone rotation). The observer
        // watches #content-area, which is replaced when leaving this page, so
        // it stops itself once this canvas is no longer in the document.
        const resizeObserver = new ResizeObserver(() => {
            if (!renderer.domElement.isConnected) {
                resizeObserver.disconnect();
                return;
            }
            applyLayout();
        });
        resizeObserver.observe(contentArea);

        // Click-to-navigate via raycasting: convert the click's pixel
        // position into normalized device coordinates, cast a ray from the
        // camera through that point, and see which rack's invisible
        // hitBox it hits (not the visible faces directly - see
        // makeObliqueRack for why).
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const hitBoxes = groups.map(g => g.userData.hitBox);

        renderer.domElement.addEventListener('click', (event) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(hitBoxes);
            if (intersects.length > 0) {
                renderSlots(intersects[0].object.parent.userData.rackId, zoneId);
            }
        });
    } else {
        render();
    }
}

// Right-side panel showing the zone's racks grouped into Full/Empty/Partial
// tabs (fetched from the by-zone occupancy endpoint - see RacksController).
async function renderOccupancyPanel(zoneId) {
    const panel = document.getElementById('rack-occupancy-panel');
    panel.innerHTML = '';

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/racks/by-zone/${zoneId}/occupancy`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (!response.ok) {
        panel.textContent = 'Eroare la incarcarea ocuparii rafturilor.';
        return;
    }

    const data = await response.json();
    console.log(data);

    const tabBar = document.createElement('div');
    tabBar.id = 'occupancy-tab-bar';
    panel.appendChild(tabBar);

    const tabContent = document.createElement('div');
    tabContent.id = 'occupancy-tab-content';
    panel.appendChild(tabContent);

    const fullSection = document.createElement('div');
    fullSection.id = 'occupancy-full';
    tabContent.appendChild(fullSection);

    const emptySection = document.createElement('div');
    emptySection.id = 'occupancy-empty';
    tabContent.appendChild(emptySection);

    const partialSection = document.createElement('div');
    partialSection.id = 'occupancy-partial';
    tabContent.appendChild(partialSection);

    const tabs = [
        { sectionId: 'occupancy-full', label: 'Pline', racks: data.fullRacks },
        { sectionId: 'occupancy-empty', label: 'Goale', racks: data.emptyRacks },
        { sectionId: 'occupancy-partial', label: 'Partiale', racks: data.partialRacks }
    ];

    function switchOccupancyTab(activeSectionId) {
        tabs.forEach(tab => {
            document.getElementById(tab.sectionId).style.display = tab.sectionId === activeSectionId ? 'block' : 'none';
            document.getElementById(`occupancy-tab-button-${tab.sectionId}`).classList.toggle('active', tab.sectionId === activeSectionId);
        });
    }

    tabs.forEach(tab => {
        const tabButton = document.createElement('button');
        tabButton.id = `occupancy-tab-button-${tab.sectionId}`;
        tabButton.className = 'tab-button';
        tabButton.textContent = tab.label;
        tabButton.addEventListener('click', () => switchOccupancyTab(tab.sectionId));
        tabBar.appendChild(tabButton);

        const section = document.getElementById(tab.sectionId);
        if (tab.racks.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'Niciun raft in aceasta categorie.';
            section.appendChild(emptyMessage);
        } else {
            tab.racks.forEach(rack => {
                const entry = document.createElement('p');
                entry.id = `occupancy-rack-${rack.id}`;
                entry.textContent = rack.name;
                section.appendChild(entry);
            });
        }
    });

    switchOccupancyTab('occupancy-full');
}
