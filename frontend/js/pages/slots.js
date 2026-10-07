// Base API URL
import { API } from '../config.js';
import { renderPackageInfo } from './package.js';
import { renderRacks } from './racks.js';
import * as THREE from '../three/three.module.js';
import { OrbitControls } from '../three/OrbitControls.js';
import { LineMaterial } from '../three/LineMaterial.js';
import { LineSegmentsGeometry } from '../three/LineSegmentsGeometry.js';
import { Wireframe } from '../three/Wireframe.js';
import { getMovingPackage, setMovingPackage, clearMovingPackage } from '../moveState.js';
import { addSelectedLocation, getSelectedLocations, removeSelectedLocation, clearSelectedLocations } from '../editState.js';
import { hasPermission } from '../permissions.js';
import { setCurrentView } from '../currentView.js';

// Returns a group with the text painted on two back-to-back planes, one facing
// +Z and one facing -Z. Unlike a Sprite, this does not billboard toward the
// camera - it stays flush against whichever cube face it's attached to,
// rotating rigidly with the scene. Using two FrontSide planes instead of one
// DoubleSide plane avoids the mirrored-text look you'd get viewing a single
// plane's back face.
function makeLabel(text, fontSize, scaleX, scaleY) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${fontSize}px Calibri`;
    ctx.fillStyle = 'black';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.FrontSide });
    const geometry = new THREE.PlaneGeometry(scaleX, scaleY);

    const group = new THREE.Group();
    const front = new THREE.Mesh(geometry, material);
    front.position.z = 0.002;
    group.add(front);
    const back = new THREE.Mesh(geometry, material);
    back.rotation.y = Math.PI;
    back.position.z = -0.002;
    group.add(back);
    return group;
}

// Renders one rack's slots as a 3D grid of colored cubes (green/orange/red
// = free/partial/full), with full OrbitControls (rotate/zoom/pan), plus
// the local buffer panel and slot-merge workflow. This is the most complex
// page in the app - most of its size comes from computing merged-slot
// geometry (see addSlotCube) and the several small menus/panels it manages.
export async function renderSlots(rackId, zoneId) {
    setCurrentView(() => renderSlots(rackId, zoneId));
    let data = [];
    const app = document.getElementById('app');
    app.innerHTML = '';

    const topBar = document.createElement('div');
    topBar.id = 'top-bar';
    app.appendChild(topBar);

    const backButton = document.createElement('button');
    backButton.id = 'slots-back-button';
    backButton.textContent = 'Inapoi';
    backButton.addEventListener('click', () => {
        renderRacks(zoneId);
    });
    topBar.appendChild(backButton);

    const title = document.createElement('h2');
    title.id = 'slots-title';
    title.className = 'nav-title';
    title.textContent = 'Sloturi';
    topBar.appendChild(title);

    // Created up front (hidden unless a selection already exists, e.g. after a
    // re-render) so it never has to be appended late - only Editare reveals it.
    if (hasPermission('Slot', 'Update')) {
        const finishButton = document.createElement('button');
        finishButton.id = 'finish-button';
        finishButton.textContent = 'Finalizare';
        finishButton.style.display = getSelectedLocations().length > 0 ? 'inline-block' : 'none';
        finishButton.addEventListener('click', async () => {
            if (getSelectedLocations().length === 0) {
                alert('Selecteaza cel putin un slot!');
                return;
            }
            // Warn (but don't block) if the selection spans multiple
            // levels - a valid but unusual merge the operator should
            // double check before confirming.
            const selectedLevels = new Set(getSelectedLocations().map(id => data.find(s => s.id === id).level));

            let confirmMessage = `Sunteti sigur ca doriti sa uniti ${getSelectedLocations().length} sloturi?`;
            if (selectedLevels.size > 1) {
                confirmMessage = `Atentie, sloturile selectate sunt pe niveluri diferite! ` + confirmMessage;
            }

            if (!confirm(confirmMessage)) {
                return;
            }

            const token = localStorage.getItem('token');
            const response = await fetch(`${API}/slots/merge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ SlotIds: getSelectedLocations() })
            });

            if (response.ok) {
                clearSelectedLocations();
                renderSlots(rackId, zoneId);
            } else {
                alert('Eroare la unirea sloturilor.');
            }
        });
        topBar.appendChild(finishButton);
    }

    const contentArea = document.createElement('div');
    contentArea.id = 'content-area';
    app.appendChild(contentArea);

    const leftColumn = document.createElement('div');
    leftColumn.id = 'left-column';
    contentArea.appendChild(leftColumn);

    const canvasContainer = document.createElement('div');
    canvasContainer.id = 'canvas-container';
    leftColumn.appendChild(canvasContainer);

    const rightColumn = document.createElement('div');
    rightColumn.id = 'right-column';
    contentArea.appendChild(rightColumn);

    const bufferControls = document.createElement('div');
    bufferControls.id = 'buffer-controls';
    rightColumn.appendChild(bufferControls);

    const bufferButton = document.createElement('button');
    bufferButton.id = 'buffer-toggle-button';
    bufferButton.textContent = 'Tampon';
    bufferButton.addEventListener('click', () => {
        toggleBufferPanel(rackId);
    });
    bufferControls.appendChild(bufferButton);

    if (hasPermission('Package', 'Create')) {
        const addBufferButton = document.createElement('button');
        addBufferButton.id = 'buffer-add-button';
        addBufferButton.textContent = 'Adauga in tampon';
        addBufferButton.addEventListener('click', () => {
            document.getElementById('buffer-panel').style.display = 'block';
            showAddBufferForm(rackId);
        });
        bufferControls.appendChild(addBufferButton);
    }

    // Only shown mid-move (a package was picked up elsewhere and is
    // waiting for a destination) - lets the operator drop it straight
    // into this rack's buffer instead of a specific slot.
    if (getMovingPackage().packageIds.length > 0 && hasPermission('Package', 'Update')) {
        const putInBufferButton = document.createElement('button');
        putInBufferButton.id = 'put-in-rack-buffer-button';
        putInBufferButton.textContent = 'Pune in tamponul acestui raft';
        putInBufferButton.addEventListener('click', async () => {
            const movingPackage = getMovingPackage();
            const token = localStorage.getItem('token');
            let hadError = false;

            for (const packageId of movingPackage.packageIds) {
                const response = await fetch(`${API}/packages/move-to-buffer/${packageId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ RackId: rackId })
                });
                if (!response.ok) {
                    hadError = true;
                }
            }

            clearMovingPackage();
            if (hadError) {
                alert('Eroare la mutarea in tamponul acestui raft.');
            } else {
                alert('Pachetul a fost mutat in tamponul acestui raft!');
            }
            renderSlots(rackId, zoneId);
        });
        bufferControls.appendChild(putInBufferButton);
    }

    const bufferPanel = document.createElement('div');
    bufferPanel.id = 'buffer-panel';
    bufferPanel.style.display = 'none';
    rightColumn.appendChild(bufferPanel);

    // Unlike the flat 2.5D racks view, slots get a true perspective camera
    // with OrbitControls, since this is the one screen where rotating
    // around the rack to see slot depth/merges actually matters.
    const scene = new THREE.Scene();

    // Width the canvas can use, capped at the old 800px: the whole
    // #content-area when the page is stacked in one column (small screens),
    // otherwise what's left beside the right-hand panel (16rem is reserved
    // for it, plus the gap), minus the canvas container's 1px border on each
    // side.
    function availableCanvasWidth() {
        const areaStyle = getComputedStyle(contentArea);
        const stacked = areaStyle.flexDirection === 'column';
        const besideWidth = stacked ? 0 : 256 + (parseFloat(areaStyle.columnGap) || 0);
        return Math.floor(contentArea.clientWidth - besideWidth) - 2;
    }

    // Narrow screens get a much taller canvas (taller than it is wide) so
    // there's room to rotate the rack and it doesn't look squeezed.
    function canvasSizeFor(availableWidth) {
        const width = Math.max(240, Math.min(800, availableWidth));
        const height = Math.round(width * (width < 560 ? 1.2 : 0.75));
        return { width, height };
    }

    const initialSize = canvasSizeFor(availableCanvasWidth());
    const camera = new THREE.PerspectiveCamera(75, initialSize.width / initialSize.height, 0.5, 50);
    camera.position.z = 5;
    const renderer = new THREE.WebGLRenderer();
    // Capped at 2 so text stays sharp on high-density phone screens without
    // making the canvas needlessly expensive to render.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(initialSize.width, initialSize.height);
    renderer.setClearColor(0xf0f0f0);
    renderer.domElement.id = 'slots-canvas';
    canvasContainer.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/slots/by-rack/${rackId}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.ok) {
        data = await response.json();
        console.log(data);

        const cols = 4;
        const maxLevel = Math.max(...data.map(slot => slot.level));
        const rows = maxLevel;
        const cubes = [];
        const hitboxes = [];
        // Kept so their resolution can follow the canvas size (see applyLayout).
        const lineMaterials = [];

        const statusColors = { 0: 0x00cc00, 1: 0xffa500, 2: 0xff0000 };

        // Draws one slot as a cube, sized/positioned to also represent
        // merges: a merged slot's cube spans the bounding box of every
        // absorbed slot's original grid cell (width/height in the plane,
        // full depth for an A+B face merge) instead of drawing separate
        // cubes for each absorbed slot.
        function addSlotCube(slot) {
            const col = parseInt(slot.code) - 1;
            const row = slot.level - 1;
            // Older merges (from before Level was tracked on MergedSlotRef) have no level
            // field at all - treat those as same-row as the survivor, matching old behavior.
            const mergedFrom = (slot.mergedFrom || []).map(m => ({ ...m, level: m.level || slot.level }));

            // Entries at the exact same (level, code) as the survivor are a depth merge
            // (Face A + Face B combined into one full-depth slot). Everything else is a
            // planar merge (same row = width, different row = height, or both).
            const depthEntries = mergedFrom.filter(m => m.code === slot.code && m.level === slot.level);
            const planarEntries = mergedFrom.filter(m => !(m.code === slot.code && m.level === slot.level));

            const allCodes = [parseInt(slot.code), ...planarEntries.map(m => parseInt(m.code))];
            const allLevels = [slot.level, ...planarEntries.map(m => m.level)];
            const minCode = Math.min(...allCodes);
            const maxCode = Math.max(...allCodes);
            const minLevel = Math.min(...allLevels);
            const maxLevel = Math.max(...allLevels);

            const width = maxCode - minCode + 1;
            const heightSpan = maxLevel - minLevel + 1;
            const isFullDepth = depthEntries.length > 0;
            const depth = isFullDepth ? 1 : 0.5;
            const zOffset = isFullDepth ? 0 : (slot.face === 'A' ? 0.25 : -0.25);

            // How far the bounding-box center sits from the survivor's own cell, in grid units.
            const xCenterOffset = (minCode + maxCode) / 2 - parseInt(slot.code);
            const yCenterOffset = (minLevel + maxLevel) / 2 - slot.level;

            const geometry = new THREE.BoxGeometry(width, heightSpan, depth);
            geometry.translate(xCenterOffset, yCenterOffset, 0);
            const color = statusColors[slot.status] ?? 0x00cc00;
            const mergeTier = (isFullDepth ? 1 : 0) + (width > 1 || heightSpan > 1 ? 1 : 0);
            const material = new THREE.MeshBasicMaterial({
                color: color,
                polygonOffset: mergeTier > 0,
                polygonOffsetFactor: mergeTier,
                polygonOffsetUnits: mergeTier
            });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.x = col - (cols - 1) / 2;
            cube.position.y = row - (rows - 1) / 2;
            cube.position.z = zOffset;
            cube.userData.slotId = slot.id;
            cube.userData.status = slot.status;
            cube.userData.color = color;
            cube.userData.mergeCount = mergedFrom.length;

            const edgeGeometry = new THREE.EdgesGeometry(geometry);
            const wireframeGeometry = new LineSegmentsGeometry().fromEdgesGeometry(edgeGeometry);
            const lineMaterial = new LineMaterial({
                color: 0x000000,
                linewidth: 3,
                resolution: new THREE.Vector2(800, 600)
            });
            lineMaterials.push(lineMaterial);
            const wireframe = new Wireframe(wireframeGeometry, lineMaterial);
            wireframe.raycast = function () {};
            cube.add(wireframe);

            const hitboxEpsilon = 0.2;
            const hitboxDepthEpsilon = 0.5;
            const hitboxGeometry = new THREE.BoxGeometry(width - hitboxEpsilon, heightSpan - hitboxEpsilon, Math.max(depth - hitboxDepthEpsilon, 0.1));
            hitboxGeometry.translate(xCenterOffset, yCenterOffset, 0);
            const hitbox = new THREE.Mesh(hitboxGeometry, new THREE.MeshBasicMaterial({ visible: false }));
            cube.add(hitbox);
            hitboxes.push(hitbox);

            const sequentialNumber = row * cols + col + 1;
            const labelText = isFullDepth ? `${sequentialNumber}` : `${sequentialNumber}${slot.face}`;
            cube.userData.label = labelText;
            const codeLabel = makeLabel(labelText, 70, 0.7, 0.35);
            const labelZ = isFullDepth ? 0.55 : (slot.face === 'A' ? 0.3 : -0.3);
            codeLabel.position.set(xCenterOffset, 0.28 + yCenterOffset, labelZ);
            cube.add(codeLabel);

            if (isFullDepth) {
                const backLabel = makeLabel(labelText, 70, 0.7, 0.35);
                backLabel.position.set(xCenterOffset, 0.28 + yCenterOffset, -labelZ);
                cube.add(backLabel);
            }

            scene.add(cube);
            cubes.push(cube);
            return cube;
        }

        data.forEach((slot) => {
            addSlotCube(slot);
        });

        // Sizes the canvas to the available width and moves the camera to
        // the distance where the whole rack (cols x rows) just fits both
        // horizontally and vertically, instead of a fixed distance that left
        // the rack small. The viewing direction is kept, so a rotation the
        // user already made isn't lost when the window resizes. The animate
        // loop redraws every frame, so no explicit render is needed here.
        const padding = 0.6;
        let lastWidth = 0;
        function applyLayout() {
            const { width, height } = canvasSizeFor(availableCanvasWidth());
            // Height follows from width, so an unchanged width needs no work
            // (this also stops the height changes we cause from re-triggering us).
            if (width === lastWidth) {
                return;
            }
            lastWidth = width;

            renderer.setSize(width, height);
            // The wireframe lines are drawn in screen pixels and need to know
            // the real canvas size, not the old fixed 800x600.
            lineMaterials.forEach(material => material.resolution.set(width, height));
            camera.aspect = width / height;

            const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
            const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
            const distanceToFitWidth = (cols / 2 + padding) / Math.tan(horizontalHalfFov);
            const distanceToFitHeight = (rows / 2 + padding) / Math.tan(verticalHalfFov);
            camera.position.setLength(Math.max(distanceToFitWidth, distanceToFitHeight) * 1.05);
            camera.updateProjectionMatrix();
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

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        // Tracks pointerdown position so a drag-to-rotate (OrbitControls)
        // isn't misread as a tap on a slot - only a press that didn't move
        // more than 5px counts as an actual slot tap.
        let mouseDownX = 0;
        let mouseDownY = 0;
        let pressedOnCanvas = false;
        renderer.domElement.addEventListener('pointerdown', (event) => {
            pressedOnCanvas = event.isPrimary;
            mouseDownX = event.clientX;
            mouseDownY = event.clientY;
        });

        // Uses pointerup instead of click: this version of OrbitControls
        // calls preventDefault() on touchstart, which on touch screens
        // cancels the browser's follow-up click event - so a click listener
        // never fires on a phone. pointerup is unaffected and also fires
        // for mouse, so it works for both.
        renderer.domElement.addEventListener('pointerup', (event) => {
            // Only a primary-button press that started on this canvas (not a
            // right-click pan, a second finger, or a drag that merely ended here).
            if (!pressedOnCanvas || !event.isPrimary || event.button !== 0) {
                return;
            }
            pressedOnCanvas = false;

            const movedDistance = Math.hypot(event.clientX - mouseDownX, event.clientY - mouseDownY);
            if (movedDistance > 5) {
                return;
            }

            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(hitboxes);
            if (intersects.length > 0) {
                const clicked = intersects[0].object.parent;
                const clickedSlotId = clicked.userData.slotId;

                // Three different meanings for a slot click, depending on
                // what mode the page is currently in:
                if (getMovingPackage().packageIds.length > 0) {
                    // 1) A package is mid-move - this click picks the destination.
                    confirmMove(clickedSlotId, rackId, zoneId);
                } else if (getSelectedLocations().length > 0) {
                    // 2) Already selecting slots for a merge - toggle this one.
                    const alreadySelected = getSelectedLocations().includes(clickedSlotId);
                    if (alreadySelected) {
                        removeSelectedLocation(clickedSlotId);
                        clicked.material.color.set(clicked.userData.color);
                    } else {
                        addSelectedLocation(clickedSlotId);
                        clicked.material.color.set(0x3399ff);
                    }
                } else {
                    // 3) Normal mode - open the per-slot action menu.
                    showSlotMenu(clickedSlotId, rackId, zoneId, cubes);
                }
            }
        });

        document.addEventListener('click', (event) => {
            const menu = document.getElementById('slot-menu');
            if (!menu) {
                return;
            }
            // Look up the canvas fresh (instead of using renderer.domElement)
            // since this listener stays attached to document across re-renders,
            // and a stale reference would point at a canvas no longer on the page.
            const canvas = document.getElementById('slots-canvas');
            const clickedInsideCanvas = canvas && canvas.contains(event.target);
            const clickedInsideMenu = menu.contains(event.target);
            if (!clickedInsideCanvas && !clickedInsideMenu) {
                closeSlotMenu();
            }
        });
    }
}

// Shows/hides the rack's local buffer panel, loading its content fresh
// each time it's opened.
async function toggleBufferPanel(rackId) {
    const bufferPanel = document.getElementById('buffer-panel');
    if (bufferPanel.style.display === 'none') {
        bufferPanel.style.display = 'block';
        await renderBufferPanel(rackId);
    } else {
        bufferPanel.style.display = 'none';
    }
}

// Lists every package currently sitting in this rack's local buffer, each
// with a remaining-days countdown computed client-side from enteredAt.
async function renderBufferPanel(rackId) {
    const bufferPanel = document.getElementById('buffer-panel');
    bufferPanel.innerHTML = '';

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/packages/by-rack-buffer/${rackId}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = response.ok ? await response.json() : [];

    data.forEach((pkg) => {
        const item = document.createElement('div');
        item.id = `buffer-item-${pkg.id}`;

        const info = document.createElement('p');
        const daysPassed = Math.floor((Date.now() - new Date(pkg.enteredAt)) / (1000 * 60 * 60 * 24));
        const daysRemaining = pkg.maxBufferDays - daysPassed;
        info.textContent = `${pkg.recipient} - ${pkg.description} - ${daysRemaining} zile ramase`;
        item.appendChild(info);

        if (hasPermission('Package', 'Delete')) {
            const removeButton = document.createElement('button');
            removeButton.id = `buffer-remove-button-${pkg.id}`;
            removeButton.textContent = 'Scoate din tampon';
            removeButton.addEventListener('click', () => {
                showBufferRemoveMenu(pkg, rackId, item);
            });
            item.appendChild(removeButton);
        }

        bufferPanel.appendChild(item);
    });
}

// Small in-page menu (not a native confirm()) offering the two ways a
// buffered package can leave: picked up entirely, or moved into an actual
// slot. Acts as a toggle - clicking the button again while open closes it.
function showBufferRemoveMenu(pkg, rackId, item) {
    const existingMenu = document.getElementById(`buffer-remove-menu-${pkg.id}`);
    if (existingMenu) {
        existingMenu.remove();
        return;
    }

    const menu = document.createElement('div');
    menu.id = `buffer-remove-menu-${pkg.id}`;

    const pickedUpButton = document.createElement('button');
    pickedUpButton.id = `buffer-picked-up-button-${pkg.id}`;
    pickedUpButton.textContent = 'A fost ridicat';
    pickedUpButton.addEventListener('click', async () => {
        if (confirm(`Sunteti sigur ca pachetul ${pkg.recipient} a fost ridicat?`)) {
            const token = localStorage.getItem('token');
            await fetch(`${API}/packages/${pkg.id}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            renderBufferPanel(rackId);
        }
    });
    menu.appendChild(pickedUpButton);

    const moveToSlotButton = document.createElement('button');
    moveToSlotButton.id = `buffer-move-to-slot-button-${pkg.id}`;
    moveToSlotButton.textContent = 'Muta in slot';
    moveToSlotButton.addEventListener('click', () => {
        // Empty string origin (not a real slot id) is how the rest of the
        // code recognizes "this move started from a buffer, not a slot" -
        // see confirmMove's fromBuffer check.
        setMovingPackage([pkg.id], '');
        alert('Selectati slotul destinatie facand click pe el in raft.');
        menu.remove();
    });
    menu.appendChild(moveToSlotButton);

    item.appendChild(menu);
}

// Small inline form for adding a brand-new package directly into this
// rack's local buffer (LocationType 1 - see the request body below).
function showAddBufferForm(rackId) {
    const bufferPanel = document.getElementById('buffer-panel');

    const formDiv = document.createElement('div');
    formDiv.id = 'buffer-add-form';

    const recipientInput = document.createElement('input');
    recipientInput.id = 'buffer-recipient-input';
    recipientInput.type = 'text';
    recipientInput.placeholder = 'Destinatar';
    formDiv.appendChild(recipientInput);

    const descriptionInput = document.createElement('input');
    descriptionInput.id = 'buffer-description-input';
    descriptionInput.type = 'text';
    descriptionInput.placeholder = 'Descriere';
    formDiv.appendChild(descriptionInput);

    const daysInput = document.createElement('input');
    daysInput.id = 'buffer-days-input';
    daysInput.type = 'number';
    daysInput.min = '1';
    daysInput.max = '30';
    daysInput.placeholder = 'Zile (max 30)';
    formDiv.appendChild(daysInput);

    const confirmButton = document.createElement('button');
    confirmButton.id = 'buffer-form-confirm-button';
    confirmButton.textContent = 'Adauga';
    confirmButton.addEventListener('click', async () => {
        const recipient = recipientInput.value;
        const days = parseInt(daysInput.value);

        if (!recipient) {
            alert('Va rog completati destinatarul.');
            return;
        }
        if (!days || days < 1 || days > 30) {
            alert('Perioada trebuie sa fie intre 1 si 30 de zile.');
            return;
        }

        const token = localStorage.getItem('token');
        const response = await fetch(`${API}/packages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                Recipient: recipient,
                Description: descriptionInput.value,
                CurrentLocationId: rackId,
                SlotIds: [],
                LocationType: 1,
                MaxBufferDays: days
            })
        });

        if (response.ok) {
            renderBufferPanel(rackId);
        } else {
            alert('Eroare la adaugarea pachetului in tampon.');
        }
    });
    formDiv.appendChild(confirmButton);

    const cancelButton = document.createElement('button');
    cancelButton.id = 'buffer-form-cancel-button';
    cancelButton.textContent = 'Anuleaza';
    cancelButton.addEventListener('click', () => {
        formDiv.remove();
    });
    formDiv.appendChild(cancelButton);

    bufferPanel.appendChild(formDiv);
}

// The per-slot popup menu opened by a normal (non-move, non-select) click
// on a slot cube - view its contents, start editing/merging it, or
// override its status.
function showSlotMenu(slotId, rackId, zoneId, cubes) {
    closeSlotMenu();

    const menu = document.createElement('div');
    menu.id = 'slot-menu';

    const clickedCube = cubes.find(cube => cube.userData.slotId === slotId);
    const title = document.createElement('h3');
    title.id = 'slot-menu-title';
    title.textContent = clickedCube ? `Slot ${clickedCube.userData.label}` : 'Slot';
    menu.appendChild(title);

    const showButton = document.createElement('button');
    showButton.id = 'slot-menu-show-button';
    showButton.textContent = 'Vizualizare';
    showButton.addEventListener('click', () => {
        renderPackageInfo(slotId, rackId, zoneId);
        closeSlotMenu();
    });
    menu.appendChild(showButton);

    if (hasPermission('Slot', 'Update')) {
        const editButton = document.createElement('button');
        editButton.id = 'slot-menu-edit-button';
        editButton.textContent = 'Editare';
        editButton.addEventListener('click', () => {
            addSelectedLocation(slotId);
            const selectedCubes = cubes.filter(cube => getSelectedLocations().includes(cube.userData.slotId));
            selectedCubes.forEach(cube => {
                cube.material.color.set(0x3399ff);
            });
            document.getElementById('finish-button').style.display = 'inline-block';
            closeSlotMenu();
        });
        menu.appendChild(editButton);
    }

    // 2 = Full, 1 = PartiallyOccupied (matches the backend's SlotStatus enum).
    async function setManualStatus(newStatus) {
        console.log('setManualStatus called with', newStatus, 'for slot', slotId);
        const token = localStorage.getItem('token');
        await fetch(`${API}/slots/${slotId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(newStatus)
        });
        renderSlots(rackId, zoneId);
        closeSlotMenu();
    }

    if (hasPermission('Slot', 'Update')) {
        const markFullButton = document.createElement('button');
        markFullButton.id = 'slot-menu-mark-full-button';
        markFullButton.textContent = 'Marcheaza Plin';
        markFullButton.addEventListener('click', () => setManualStatus(2));
        menu.appendChild(markFullButton);

        const markPartialButton = document.createElement('button');
        markPartialButton.id = 'slot-menu-mark-partial-button';
        markPartialButton.textContent = 'Marcheaza Partial';
        markPartialButton.addEventListener('click', () => setManualStatus(1));
        menu.appendChild(markPartialButton);
    }

    document.getElementById('right-column').appendChild(menu);
}

function closeSlotMenu() {
    const menu = document.getElementById('slot-menu');
    if (menu) {
        menu.remove();
    }
}

// Prompts for the destination slot's status right after a buffer-to-slot
// move completes, since a package coming out of a buffer has no prior
// slot status to infer from - the operator has to say whether it fills
// the slot or only partially occupies it.
function showDestinationStatusMenu(slotId, rackId, zoneId) {
    const menu = document.createElement('div');
    menu.id = 'destination-status-menu';

    const label = document.createElement('p');
    label.id = 'destination-status-label';
    label.textContent = 'Pachet mutat. Marcheaza slotul destinatie:';
    menu.appendChild(label);

    const markFullButton = document.createElement('button');
    markFullButton.id = 'destination-mark-full-button';
    markFullButton.textContent = 'Plin';
    markFullButton.addEventListener('click', async () => {
        await setSlotStatus(slotId, 2);
        renderSlots(rackId, zoneId);
    });
    menu.appendChild(markFullButton);

    const markPartialButton = document.createElement('button');
    markPartialButton.id = 'destination-mark-partial-button';
    markPartialButton.textContent = 'Partial';
    markPartialButton.addEventListener('click', async () => {
        await setSlotStatus(slotId, 1);
        renderSlots(rackId, zoneId);
    });
    menu.appendChild(markPartialButton);

    document.getElementById('right-column').appendChild(menu);
}

async function setSlotStatus(slotId, status) {
    const token = localStorage.getItem('token');
    await fetch(`${API}/slots/${slotId}/status`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(status)
    });
}

// Finishes a move started elsewhere (a slot's menu, or the buffer panel) -
// moves every package in movingPackage.packageIds to destSlotId, then
// only for a buffer-origin move, prompts for the new slot's status since
// there's no previous slot state to carry over.
async function confirmMove(destSlotId, rackId, zoneId) {
    const movingPackage = getMovingPackage();
    const fromBuffer = movingPackage.originSlotId === '';
    const token = localStorage.getItem('token');
    let hadError = false;

    for (const packageId of movingPackage.packageIds) {
        const response = await fetch(`${API}/packages/move/${packageId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                OriginSlotId: movingPackage.originSlotId,
                DestSlotId: destSlotId
            })
        });

        if (!response.ok) {
            hadError = true;
        }
    }

    clearMovingPackage();

    if (hadError) {
        alert('Eroare la mutarea unuia sau mai multor pachete.');
        renderSlots(rackId, zoneId);
        return;
    }

    if (fromBuffer) {
        showDestinationStatusMenu(destSlotId, rackId, zoneId);
        return;
    }

    alert('Pachetul/pachetele au fost mutate cu succes!');
    renderSlots(rackId, zoneId);
}
