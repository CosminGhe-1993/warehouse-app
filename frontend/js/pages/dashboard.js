// Base API URL
import { API } from '../config.js';
import { renderRacks } from './racks.js';
import { renderLogin } from './login.js';
import * as THREE from '../three/three.module.js';
import { hasPermission } from '../permissions.js';
import { setMovingPackage } from '../moveState.js';
import { renderDashboardStats } from './stats.js';
import { setCurrentView } from '../currentView.js';
import { stopRealtimeConnection } from '../realtime.js';

// Same gradient-canvas-as-texture trick as racks.js, used here to shade
// the zone crates' walls.
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

// Same canvas-text-as-sprite approach as racks.js, used here for zone names.
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

// Builds an open crate (floor + 4 walls, no lid) so, from an elevated angle, you see
// two outer walls plus the interior floor through the open top.
function makeOpenBox(size, wallHeight, wallThickness, floorMaterial, wallMaterial) {
    const group = new THREE.Group();

    const floor = new THREE.Mesh(new THREE.BoxGeometry(size, wallThickness, size), floorMaterial);
    floor.position.set(0, -wallThickness / 2, 0);
    group.add(floor);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, size), wallMaterial);
    leftWall.position.set(-size / 2 + wallThickness / 2, wallHeight / 2, 0);
    group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, size), wallMaterial);
    rightWall.position.set(size / 2 - wallThickness / 2, wallHeight / 2, 0);
    group.add(rightWall);

    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(size, wallHeight, wallThickness), wallMaterial);
    frontWall.position.set(0, wallHeight / 2, size / 2 - wallThickness / 2);
    group.add(frontWall);

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(size, wallHeight, wallThickness), wallMaterial);
    backWall.position.set(0, wallHeight / 2, -size / 2 + wallThickness / 2);
    group.add(backWall);

    // Invisible box covering the whole crate, used only for click detection
    const hitBoxGeometry = new THREE.BoxGeometry(size, wallHeight, size);
    const hitBox = new THREE.Mesh(hitBoxGeometry, new THREE.MeshBasicMaterial({ visible: false }));
    hitBox.position.set(0, wallHeight / 2, 0);
    group.add(hitBox);
    group.userData.hitBox = hitBox;

    return group;
}

// Top-level landing page after login: a 3D grid of zone "crates" to click
// into (Three.js), plus the docked sidebar holding buffer/alerts controls,
// the zone-threshold form, and the natural-language assistant chat.
export async function renderDashboard() {
    setCurrentView(() => renderDashboard());
    const app = document.getElementById('app');
    app.innerHTML = '';

    const topBar = document.createElement('div');
    topBar.id = 'top-bar';
    app.appendChild(topBar);

    const title = document.createElement('h2');
    title.id = 'dashboard-title';
    title.textContent = 'Depozit - Zone';
    topBar.appendChild(title);

    const logoutButton = document.createElement('button');
    logoutButton.id = 'logout-button';
    logoutButton.textContent = 'Log out';
    logoutButton.addEventListener('click', () => {
        localStorage.removeItem('token');
        stopRealtimeConnection();
        renderLogin();
    });
    topBar.appendChild(logoutButton);

    const dashboardSidebar = document.createElement('div');
    dashboardSidebar.id = 'dashboard-sidebar';
    app.appendChild(dashboardSidebar);

    // Everything that isn't the chat lives in here - buttons, toggle panels,
    // and the zone-threshold form - so it's visually one group, above the chat.
    const controlsPanel = document.createElement('div');
    controlsPanel.id = 'dashboard-controls-panel';
    dashboardSidebar.appendChild(controlsPanel);

    const controlsPanelTitle = document.createElement('h3');
    controlsPanelTitle.textContent = 'Control depozit';
    controlsPanel.appendChild(controlsPanelTitle);

    const controlsBar = document.createElement('div');
    controlsBar.id = 'dashboard-controls-bar';
    controlsPanel.appendChild(controlsBar);

    const centralBufferButton = document.createElement('button');
    centralBufferButton.id = 'central-buffer-toggle-button';
    centralBufferButton.textContent = 'Tampon central';
    centralBufferButton.addEventListener('click', () => {
        toggleCentralBufferPanel();
    });
    controlsBar.appendChild(centralBufferButton);

    if (hasPermission('Package', 'Create')) {
        const addCentralBufferButton = document.createElement('button');
        addCentralBufferButton.id = 'central-buffer-add-button';
        addCentralBufferButton.textContent = 'Adauga in tampon central';
        addCentralBufferButton.addEventListener('click', () => {
            document.getElementById('central-buffer-panel').style.display = 'block';
            showAddCentralBufferForm();
        });
        controlsBar.appendChild(addCentralBufferButton);
    }

    const alertsButton = document.createElement('button');
    alertsButton.id = 'alerts-toggle-button';
    alertsButton.textContent = 'Alerte';
    alertsButton.addEventListener('click', () => {
        toggleAlertsPanel();
    });
    controlsBar.appendChild(alertsButton);

    const statsButton = document.createElement('button');
    statsButton.id = 'stats-nav-button';
    statsButton.textContent = 'Statistici';
    statsButton.addEventListener('click', () => {
        renderDashboardStats();
    });
    controlsBar.appendChild(statsButton);

    const centralBufferPanel = document.createElement('div');
    centralBufferPanel.id = 'central-buffer-panel';
    centralBufferPanel.style.display = 'none';
    controlsPanel.appendChild(centralBufferPanel);

    const alertsPanel = document.createElement('div');
    alertsPanel.id = 'alerts-panel';
    alertsPanel.style.display = 'none';
    controlsPanel.appendChild(alertsPanel);

    const assistantSection = document.createElement('div');
    assistantSection.id = 'assistant-section';
    dashboardSidebar.appendChild(assistantSection);

    const assistantHeader = document.createElement('div');
    assistantHeader.id = 'assistant-header';
    assistantSection.appendChild(assistantHeader);

    const assistantTitle = document.createElement('p');
    assistantTitle.id = 'assistant-title';
    assistantTitle.textContent = 'Asistent - intreaba in limbaj natural';
    assistantHeader.appendChild(assistantTitle);

    // Only visible on small screens (see style.css), where the chat is a
    // panel that slides over the page instead of a fixed part of the sidebar.
    const assistantCloseButton = document.createElement('button');
    assistantCloseButton.id = 'assistant-close-button';
    assistantCloseButton.textContent = 'Inchide';
    assistantCloseButton.addEventListener('click', () => {
        assistantSection.classList.remove('assistant-open');
    });
    assistantHeader.appendChild(assistantCloseButton);

    const assistantResults = document.createElement('div');
    assistantResults.id = 'assistant-results';
    assistantSection.appendChild(assistantResults);

    const assistantBar = document.createElement('div');
    assistantBar.id = 'assistant-bar';
    assistantSection.appendChild(assistantBar);

    // Enter submits the same way the button does - handleAssistantQuery is
    // the entry point into the whole Groq function-calling flow.
    const assistantInput = document.createElement('input');
    assistantInput.id = 'assistant-input';
    assistantInput.type = 'text';
    assistantInput.placeholder = 'Ex: ce a facut Operator Test pe 22.09.2026?';
    assistantInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleAssistantQuery(assistantInput.value);
            assistantInput.value = '';
        }
    });
    assistantBar.appendChild(assistantInput);

    const assistantSubmitButton = document.createElement('button');
    assistantSubmitButton.id = 'assistant-submit-button';
    assistantSubmitButton.textContent = 'Cauta';
    assistantSubmitButton.addEventListener('click', () => {
        handleAssistantQuery(assistantInput.value);
        assistantInput.value = '';
    });
    assistantBar.appendChild(assistantSubmitButton);

    // Small-screen only (hidden by CSS on desktop): a floating button that
    // opens the chat panel, so the assistant is always one tap away instead
    // of sitting at the bottom of a long scrolling page. Must come after
    // assistantSection in the DOM - the CSS hides it while the panel is open
    // using a sibling selector.
    const assistantToggleButton = document.createElement('button');
    assistantToggleButton.id = 'assistant-toggle-button';
    assistantToggleButton.textContent = 'Asistent';
    assistantToggleButton.addEventListener('click', () => {
        assistantSection.classList.add('assistant-open');
        assistantInput.focus();
    });
    dashboardSidebar.appendChild(assistantToggleButton);

    const canvasContainer = document.createElement('div');
    canvasContainer.id = 'canvas-container';
    app.appendChild(canvasContainer);

    const scene = new THREE.Scene();

    // The canvas is sized from the space actually available (up to the old
    // 800px cap), not a fixed 800x600: narrow screens get fewer columns of
    // zones and a taller shape, so the zones stay big enough to read.
    function canvasSizeFor(availableWidth) {
        const width = Math.max(240, Math.min(800, availableWidth));
        const cols = width < 560 ? 3 : 5;
        const height = cols === 3 ? Math.round(width * 0.9) : Math.round(width * 0.75);
        return { width, height, cols };
    }

    // Width left for the canvas inside #app (its content box, minus the
    // canvas container's 1px border on each side).
    function availableCanvasWidth() {
        const style = getComputedStyle(app);
        return Math.floor(app.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)) - 2;
    }

    const initialSize = canvasSizeFor(availableCanvasWidth());
    const camera = new THREE.PerspectiveCamera(45, initialSize.width / initialSize.height, 0.1, 200);

    const renderer = new THREE.WebGLRenderer();
    // Capped at 2 so text stays sharp on high-density phone screens without
    // making the canvas needlessly expensive to render.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(initialSize.width, initialSize.height);
    renderer.setClearColor(0xf0f0f0);
    renderer.domElement.id = 'zones-canvas';
    canvasContainer.appendChild(renderer.domElement);

    function render() {
        renderer.render(scene, camera);
    }

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/zones`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        console.log(data);

        if (hasPermission('Zone', 'Update')) {
            showZoneThresholdForm(data);
        }

        const size = 2.4;
        const wallHeight = 1.0;
        const wallThickness = 0.12;
        const spacing = size + 1.2;
        const padding = 1.5;
        const groups = [];

        const gradientTexture = makeGradientTexture('#d8c3a0', '#9c8259');
        const wallMaterial = new THREE.MeshBasicMaterial({ map: gradientTexture });
        const floorMaterial = new THREE.MeshBasicMaterial({ color: '#c9b28a' });

        // Zones are created once; where they sit depends on how many columns
        // fit the current width, so their positions are set in applyLayout.
        data.forEach((zone) => {
            const zoneGroup = makeOpenBox(size, wallHeight, wallThickness, floorMaterial, wallMaterial);
            zoneGroup.userData.zoneId = zone.id;

            const label = makeLabel(zone.name);
            label.position.set(0, 0.08, 0);
            zoneGroup.add(label);

            scene.add(zoneGroup);
            groups.push(zoneGroup);
        });

        // Re-lays the zones out on a grid for the current available width,
        // resizes the renderer, and re-frames the camera so the whole grid
        // fits both horizontally and vertically. Unlike racks.js's
        // orthographic top-down camera, this is a perspective camera above
        // and behind the grid, so the distance is derived from the grid size
        // and the camera's horizontal/vertical field of view.
        let lastWidth = 0;
        function applyLayout() {
            const { width, height, cols } = canvasSizeFor(availableCanvasWidth());
            // Height follows from width, so an unchanged width needs no work
            // (this also stops the height changes we cause from re-triggering us).
            if (width === lastWidth) {
                return;
            }
            lastWidth = width;

            const rows = Math.ceil(data.length / cols);
            groups.forEach((zoneGroup, index) => {
                const rowStart = Math.floor(index / cols) * cols;
                const rowLength = Math.min(cols, data.length - rowStart);
                const x = (index % cols) * spacing - (rowLength - 1) * spacing / 2;
                const z = Math.floor(index / cols) * spacing - (rows - 1) * spacing / 2;
                zoneGroup.position.set(x, 0, z);
            });

            renderer.setSize(width, height);
            camera.aspect = width / height;

            const gridWidth = Math.min(cols, data.length) * spacing;
            const gridDepth = rows * spacing;
            const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov / 2);
            const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
            const distanceToFitWidth = (gridWidth / 2 + padding) / Math.tan(horizontalHalfFov);
            // 0.8 = how much of the grid's depth shows up vertically, given
            // the camera looks down at the grid from an angle.
            const distanceToFitDepth = (gridDepth / 2 * 0.8 + padding) / Math.tan(verticalHalfFov);
            const camDist = Math.max(distanceToFitWidth, distanceToFitDepth) * 1.1;
            camera.position.set(0, camDist * 0.8, camDist * 0.6);
            camera.lookAt(0, 0, 0);
            camera.updateProjectionMatrix();

            render();
        }
        applyLayout();

        // Follows the window size (including phone rotation). The observer
        // watches #app, which outlives this page, so it stops itself once
        // this canvas has been replaced by another page.
        const resizeObserver = new ResizeObserver(() => {
            if (!renderer.domElement.isConnected) {
                resizeObserver.disconnect();
                return;
            }
            applyLayout();
        });
        resizeObserver.observe(app);

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const hitBoxes = groups.map(g => g.userData.hitBox);

        // Same raycasting click-to-navigate pattern as racks.js.
        renderer.domElement.addEventListener('click', (event) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(hitBoxes);
            if (intersects.length > 0) {
                renderRacks(intersects[0].object.parent.userData.zoneId);
            }
        });
    } else {
        render();
    }
}

// The model sometimes returns just the letter ("A") instead of the full name
// ("Zona A") - accept either, matching on the name or its last word.
function findZoneByFuzzyName(zones, zoneName) {
    const normalizedQuery = zoneName.trim().toLowerCase();
    return zones.find(z => {
        const normalizedName = z.name.trim().toLowerCase();
        return normalizedName === normalizedQuery || normalizedName.endsWith(` ${normalizedQuery}`);
    });
}

// Module-level (not per-render) so it survives across re-renders of the
// dashboard - e.g. a SignalR-triggered refresh shouldn't wipe out the
// ongoing conversation the assistant needs for follow-up questions.
let conversationHistory = [];

// Single choke point for every chat bubble shown on screen - also where
// every message gets appended to conversationHistory, so the UI and the
// history sent to the backend never drift out of sync with each other.
function addChatMessage(role, text) {
    const resultsPanel = document.getElementById('assistant-results');
    const message = document.createElement('p');
    message.className = `chat-message chat-message-${role}`;
    message.textContent = text;
    resultsPanel.appendChild(message);
    resultsPanel.scrollTop = resultsPanel.scrollHeight;
    conversationHistory.push({ Role: role, Content: text });
}

// Entry point for the assistant chat. Snapshots the history BEFORE
// addChatMessage adds the current query to it - the current query is sent
// separately as Query, so the History field must only contain what came
// before it, not include itself.
async function handleAssistantQuery(query) {
    if (!query) {
        return;
    }

    const historyForRequest = [...conversationHistory];
    addChatMessage('user', query);

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/assistant/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ Query: query, History: historyForRequest })
    });

    if (!response.ok) {
        addChatMessage('assistant', 'Eroare la interpretarea cererii.');
        return;
    }

    const results = await response.json();
    console.log(results);

    // The backend can return more than one tool call for a single question
    // (e.g. "which racks are full AND what's in them") - process each one
    // in order rather than assuming there's only ever one result.
    for (const result of results) {
        await processAssistantResult(result, token);
    }
}

// Executes ONE tool call the AI decided on. The backend (GroqService) only
// decides WHAT to do - this function is where that decision actually turns
// into real work: calling the matching REST endpoint and/or navigating to
// a different page, branching on result.action (the tool name).
async function processAssistantResult(result, token) {
    if (result.action === 'operator_activity') {
        const who = result.userName || 'toti operatorii';
        addChatMessage('assistant', `Te duc la Statistici, activitatea pentru ${who} pe ${result.date}.`);
        renderDashboardStats(result.userName, result.date);
    } else if (result.action === 'find_package') {
        const packagesResponse = await fetch(`${API}/packages/by-recipient/${encodeURIComponent(result.recipient)}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const packages = packagesResponse.ok ? await packagesResponse.json() : [];

        if (packages.length === 0) {
            addChatMessage('assistant', `Niciun pachet gasit pentru "${result.recipient}".`);
        } else {
            const summary = packages.map(pkg => `${pkg.recipient} - ${pkg.description || 'fara descriere'}`).join('; ');
            addChatMessage('assistant', `Am gasit ${packages.length} pachet(e): ${summary}`);
        }
    } else if (result.action === 'navigate_zone' || result.action === 'rack_occupancy') {
        const zonesResponse = await fetch(`${API}/zones`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const zones = zonesResponse.ok ? await zonesResponse.json() : [];
        const match = findZoneByFuzzyName(zones, result.zoneName);

        if (match) {
            addChatMessage('assistant', result.action === 'rack_occupancy'
                ? `Te duc in ${match.name}, unde vezi ocuparea rafturilor.`
                : `Te duc in ${match.name}.`);
            renderRacks(match.id);
        } else {
            addChatMessage('assistant', `Nu am gasit zona "${result.zoneName}".`);
        }
    } else if (result.action === 'warehouse_occupancy') {
        const occupancyResponse = await fetch(`${API}/racks/occupancy`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const zoneSummaries = occupancyResponse.ok ? await occupancyResponse.json() : [];

        if (zoneSummaries.length === 0) {
            addChatMessage('assistant', 'Nu exista rafturi cu sloturi configurate momentan.');
        } else {
            const summary = zoneSummaries
                .map(z => {
                    const parts = [];
                    if (z.fullRackNames.length > 0) parts.push(`pline: ${z.fullRackNames.join(', ')}`);
                    if (z.partialRackNames.length > 0) parts.push(`partiale: ${z.partialRackNames.join(', ')}`);
                    if (z.emptyRackNames.length > 0) parts.push(`goale: ${z.emptyRackNames.join(', ')}`);
                    return `${z.zoneName} - ${parts.join('; ')}`;
                })
                .join(' | ');
            addChatMessage('assistant', summary);
        }
    } else if (result.action === 'list_zone_packages') {
        const zonesResponse = await fetch(`${API}/zones`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const zones = zonesResponse.ok ? await zonesResponse.json() : [];
        const match = findZoneByFuzzyName(zones, result.zoneName);

        if (!match) {
            addChatMessage('assistant', `Nu am gasit zona "${result.zoneName}".`);
        } else {
            const packagesResponse = await fetch(`${API}/packages/by-zone/${match.id}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            const packages = packagesResponse.ok ? await packagesResponse.json() : [];

            if (packages.length === 0) {
                addChatMessage('assistant', `Nu exista pachete in ${match.name}.`);
            } else {
                const summary = packages
                    .map(pkg => {
                        const label = pkg.description ? `${pkg.recipient} (${pkg.description})` : pkg.recipient;
                        return `${label} - ${pkg.locationName}`;
                    })
                    .join('; ');
                addChatMessage('assistant', `Pachete in ${match.name}: ${summary}`);
            }
        }
    } else {
        addChatMessage('assistant', result.message || 'Nu am inteles cererea, incearca sa reformulezi.');
    }
}

// Buffer and alerts panels are mutually exclusive (accordion-style) -
// opening one always closes the other, so they never overlap in the
// same sidebar space.
async function toggleCentralBufferPanel() {
    const panel = document.getElementById('central-buffer-panel');
    const wasHidden = panel.style.display === 'none';
    document.getElementById('alerts-panel').style.display = 'none';
    if (wasHidden) {
        panel.style.display = 'block';
        await renderCentralBufferPanel();
    } else {
        panel.style.display = 'none';
    }
}

// Lists packages sitting in the warehouse-wide central buffer (as opposed
// to a specific rack's local buffer - see slots.js's renderBufferPanel).
async function renderCentralBufferPanel() {
    const panel = document.getElementById('central-buffer-panel');
    panel.innerHTML = '';

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/packages/central-buffer`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = response.ok ? await response.json() : [];

    data.forEach((pkg) => {
        const item = document.createElement('div');
        item.id = `central-buffer-item-${pkg.id}`;

        const info = document.createElement('p');
        const daysPassed = Math.floor((Date.now() - new Date(pkg.enteredAt)) / (1000 * 60 * 60 * 24));
        const daysRemaining = pkg.maxBufferDays - daysPassed;
        info.textContent = `${pkg.recipient} - ${pkg.description} - ${daysRemaining} zile ramase`;
        item.appendChild(info);

        if (hasPermission('Package', 'Delete')) {
            const removeButton = document.createElement('button');
            removeButton.id = `central-buffer-remove-button-${pkg.id}`;
            removeButton.textContent = 'A fost ridicat';
            removeButton.addEventListener('click', async () => {
                if (confirm(`Sunteti sigur ca pachetul ${pkg.recipient} a fost ridicat?`)) {
                    await fetch(`${API}/packages/${pkg.id}`, {
                        method: 'DELETE',
                        headers: {
                            Authorization: `Bearer ${token}`
                        }
                    });
                    renderCentralBufferPanel();
                }
            });
            item.appendChild(removeButton);
        }

        if (hasPermission('Package', 'Update')) {
            const moveButton = document.createElement('button');
            moveButton.id = `central-buffer-move-button-${pkg.id}`;
            moveButton.textContent = 'Muta';
            moveButton.addEventListener('click', () => {
                // Empty origin id here too (see slots.js) - marks this as
                // a buffer-originated move, no specific origin slot to track.
                setMovingPackage([pkg.id], '');
                alert('Selectati o zona, apoi un raft: alegeti un slot anume sau tamponul local al raftului.');
                panel.style.display = 'none';
            });
            item.appendChild(moveButton);
        }

        panel.appendChild(item);
    });
}

// Inline form for adding a brand-new package straight into the central
// buffer (LocationType 2, and an empty CurrentLocationId since it doesn't
// belong to any specific rack).
function showAddCentralBufferForm() {
    const panel = document.getElementById('central-buffer-panel');

    const formDiv = document.createElement('div');
    formDiv.id = 'central-buffer-add-form';

    const recipientInput = document.createElement('input');
    recipientInput.id = 'central-buffer-recipient-input';
    recipientInput.type = 'text';
    recipientInput.placeholder = 'Destinatar';
    formDiv.appendChild(recipientInput);

    const descriptionInput = document.createElement('input');
    descriptionInput.id = 'central-buffer-description-input';
    descriptionInput.type = 'text';
    descriptionInput.placeholder = 'Descriere';
    formDiv.appendChild(descriptionInput);

    const daysInput = document.createElement('input');
    daysInput.id = 'central-buffer-days-input';
    daysInput.type = 'number';
    daysInput.min = '1';
    daysInput.max = '30';
    daysInput.placeholder = 'Zile (max 30)';
    formDiv.appendChild(daysInput);

    const confirmButton = document.createElement('button');
    confirmButton.id = 'central-buffer-form-confirm-button';
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
                CurrentLocationId: '',
                SlotIds: [],
                LocationType: 2,
                MaxBufferDays: days
            })
        });

        if (response.ok) {
            renderCentralBufferPanel();
        } else {
            alert('Eroare la adaugarea pachetului in tamponul central.');
        }
    });
    formDiv.appendChild(confirmButton);

    const cancelButton = document.createElement('button');
    cancelButton.id = 'central-buffer-form-cancel-button';
    cancelButton.textContent = 'Anuleaza';
    cancelButton.addEventListener('click', () => {
        formDiv.remove();
    });
    formDiv.appendChild(cancelButton);

    panel.appendChild(formDiv);
}

async function toggleAlertsPanel() {
    const panel = document.getElementById('alerts-panel');
    const wasHidden = panel.style.display === 'none';
    document.getElementById('central-buffer-panel').style.display = 'none';
    if (wasHidden) {
        panel.style.display = 'block';
        await renderAlertsPanel();
    } else {
        panel.style.display = 'none';
    }
}

// Lists every package that's sat past its zone's configured
// AlertThresholdDays (see PackagesController.GetAlertsAsync).
async function renderAlertsPanel() {
    const panel = document.getElementById('alerts-panel');
    panel.innerHTML = '';

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/packages/alerts`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    const data = response.ok ? await response.json() : [];

    if (data.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.id = 'alerts-empty-message';
        emptyMessage.textContent = 'Nu exista alerte momentan.';
        panel.appendChild(emptyMessage);
        return;
    }

    data.forEach((alertItem) => {
        const item = document.createElement('p');
        item.id = `alert-item-${alertItem.packageId}`;
        item.className = 'alert-item';
        item.textContent = `${alertItem.recipient} - ${alertItem.description} - Zona ${alertItem.zoneName}, Raft ${alertItem.rackName} - ${alertItem.daysInLocation} zile (prag ${alertItem.thresholdDays})`;
        panel.appendChild(item);
    });
}

// Admin-only form (gated by the Zone:Update permission check at the call
// site) for setting how many days a package can sit in a zone before it
// starts showing up in the alerts panel.
function showZoneThresholdForm(zones) {
    const controlsPanel = document.getElementById('dashboard-controls-panel');

    const formDiv = document.createElement('div');
    formDiv.id = 'zone-threshold-form';

    const formTitle = document.createElement('p');
    formTitle.id = 'zone-threshold-form-title';
    formTitle.textContent = 'Prag alerta vechime pachet, per zona:';
    formDiv.appendChild(formTitle);

    const formControls = document.createElement('div');
    formControls.id = 'zone-threshold-controls';
    formDiv.appendChild(formControls);

    const zoneSelect = document.createElement('select');
    zoneSelect.id = 'zone-threshold-select';
    zones.forEach((zone) => {
        const option = document.createElement('option');
        option.value = zone.id;
        option.textContent = zone.name;
        zoneSelect.appendChild(option);
    });
    formControls.appendChild(zoneSelect);

    const thresholdInput = document.createElement('input');
    thresholdInput.id = 'zone-threshold-input';
    thresholdInput.type = 'number';
    thresholdInput.min = '0';
    thresholdInput.placeholder = 'Prag alerta (zile)';
    formControls.appendChild(thresholdInput);

    const saveButton = document.createElement('button');
    saveButton.id = 'zone-threshold-save-button';
    saveButton.textContent = 'Salveaza prag';
    saveButton.addEventListener('click', async () => {
        const threshold = parseInt(thresholdInput.value);
        if (!threshold || threshold < 1) {
            alert('Introduceti un prag valid (numar de zile).');
            return;
        }

        const selectedZone = zones.find(z => z.id === zoneSelect.value);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API}/zones/${selectedZone.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                Name: selectedZone.name,
                Description: selectedZone.description,
                AlertThresholdDays: threshold
            })
        });

        if (response.ok) {
            alert('Prag salvat cu succes!');
        } else {
            alert('Eroare la salvarea pragului.');
        }
    });
    formControls.appendChild(saveButton);

    controlsPanel.appendChild(formDiv);
}
