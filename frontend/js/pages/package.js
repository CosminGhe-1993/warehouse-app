// Base API URL
import { API } from '../config.js';
import { renderSlots } from './slots.js';
import { renderDashboard } from './dashboard.js';
import { setMovingPackage } from '../moveState.js';
import { renderRacks } from './racks.js';
import { clearMovingPackage } from '../moveState.js';
import { hasPermission } from '../permissions.js';
import { setCurrentView } from '../currentView.js';

// Shows the packages inside one slot (plain HTML cards in a CSS grid, one per
// package), plus add/move/remove actions. No canvas here - there's nothing 3D
// or drawn about a flat list of cards, and HTML lays out responsively on its own.
export async function renderPackageInfo(slotId, rackId, zoneId, alreadyMarkedPartial = false) {
    let markedPartial = alreadyMarkedPartial;
    setCurrentView(() => renderPackageInfo(slotId, rackId, zoneId, markedPartial));
    let data = [];
    const app = document.getElementById('app');
    app.innerHTML = '';

    const topBar = document.createElement('div');
    topBar.id = 'top-bar';
    app.appendChild(topBar);

    const backButton = document.createElement('button');
    backButton.id = 'package-back-button';
    backButton.textContent = 'Inapoi';
    backButton.addEventListener('click', async () => {
        // Leaving this screen without ever explicitly marking the slot
        // "partial" defaults it back to Full - a slot that still has
        // packages in it should never silently read as anything else
        // unless the operator says otherwise.
        if (data.length > 0 && !markedPartial) {
            const token = localStorage.getItem('token');
            await fetch(`${API}/slots/${slotId}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(2)
            });
        }
        renderSlots(rackId, zoneId);
    });
    topBar.appendChild(backButton);

    const title = document.createElement('h2');
    title.id = 'package-title';
    title.className = 'nav-title';
    title.textContent = 'Pachete';
    topBar.appendChild(title);

    const contentArea = document.createElement('div');
    contentArea.id = 'content-area';
    app.appendChild(contentArea);

    const leftColumn = document.createElement('div');
    leftColumn.id = 'left-column';
    contentArea.appendChild(leftColumn);

    const rightColumn = document.createElement('div');
    rightColumn.id = 'right-column';
    contentArea.appendChild(rightColumn);

    // Created up front so every action button (added here or later, after the
    // fetch below resolves) lands in the same visual group, regardless of when
    // it's created - see the "Marcheaza ca partial" ordering bug for why.
    const actionsBar = document.createElement('div');
    actionsBar.id = 'package-actions-bar';
    rightColumn.appendChild(actionsBar);

    if (hasPermission('Package', 'Create')) {
        const addPackageButton = document.createElement('button');
        addPackageButton.id = 'add-package-button';
        addPackageButton.textContent = 'Adauga pachet';
        addPackageButton.addEventListener('click', () => {
            showAddPackageForm(slotId, rackId, zoneId);
        });
        actionsBar.appendChild(addPackageButton);
    }

    const packageGrid = document.createElement('div');
    packageGrid.id = 'package-grid';
    leftColumn.appendChild(packageGrid);

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/packages/by-slot/${slotId}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.ok) {
        data = await response.json();
        console.log(data);
        if (data.length > 0 && hasPermission('Slot', 'Update')){
            const markPartialButton = document.createElement('button');
            markPartialButton.id = 'mark-partial-button';
            markPartialButton.textContent = 'Marcheaza ca partial';
            markPartialButton.addEventListener('click', async () => {
                const token = localStorage.getItem('token');
                const response = await fetch(`${API}/slots/${slotId}/status`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                        },
                    body: JSON.stringify(1)
                });
                    markedPartial = true;
                    renderPackageInfo(slotId, rackId, zoneId, true);
                });
            actionsBar.appendChild(markPartialButton);
        }

        // Package selection here is purely visual/local state (not
        // editState.js's slot-merge selection) - tracks which package
        // cards the operator has clicked, to enable the bulk actions below.
        let moveButtons = [];
        let selectedPackageIds = [];

        let removeSelectedButton = null;
        if (hasPermission('Package', 'Delete')) {
            removeSelectedButton = document.createElement('button');
            removeSelectedButton.id = 'remove-selected-button';
            removeSelectedButton.textContent = 'Scoate pachetele selectate';
            removeSelectedButton.style.display = 'none';
            removeSelectedButton.addEventListener('click', async () => {
                if (confirm(`Sunteti sigur ca doriti sa scoateti pachetele selectate?`)) {
                    const token = localStorage.getItem('token');
                    for (const pkgId of selectedPackageIds) {
                        const response = await fetch(`${API}/packages/${pkgId}`, {
                            method: 'DELETE',
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        });
                        if (!response.ok) {
                            alert(`Eroare la scoaterea pachetului cu ID ${pkgId}.`);
                        }
                    }
                    alert('Pachetele selectate au fost scoase cu succes!');
                    renderPackageInfo(slotId, rackId, zoneId);
                }
            });
            actionsBar.appendChild(removeSelectedButton);
        }

        let moveSelectedButton = null;
        if (hasPermission('Package', 'Update')) {
            moveSelectedButton = document.createElement('button');
            moveSelectedButton.id = 'move-selected-button';
            moveSelectedButton.textContent = 'Muta pachetele selectate';
            moveSelectedButton.style.display = 'none';
            moveSelectedButton.addEventListener('click', () => {
                if (confirm('Sunteti sigur ca doriti sa mutati pachetele selectate?')) {
                    setMovingPackage(selectedPackageIds, slotId);
                    showMoveDestinationMenu(rackId, zoneId, slotId);
                }
            });
            actionsBar.appendChild(moveSelectedButton);
        }

        data.forEach((pkg) => {
            const card = document.createElement('div');
            card.id = `package-card-${pkg.id}`;
            card.className = 'package-card';
            packageGrid.appendChild(card);

            const cardTitle = document.createElement('p');
            cardTitle.className = 'package-card-title';
            cardTitle.textContent = pkg.recipient;
            card.appendChild(cardTitle);

            // Per-card buttons live inside the card (not loose in #app), so
            // they stay grouped with the package they act on.
            const cardActions = document.createElement('div');
            cardActions.className = 'package-card-actions';
            card.appendChild(cardActions);

            let movePackageButton = null;
            if (hasPermission('Package', 'Update')) {
                movePackageButton = document.createElement('button');
                movePackageButton.id = `move-package-button-${pkg.id}`;
                movePackageButton.textContent = 'Muta pachet';
                movePackageButton.style.display = 'none';
                movePackageButton.addEventListener('click', () => {
                    if (confirm(`Sunteti sigur ca doriti sa mutati pachetul ${pkg.recipient}?`)) {
                        setMovingPackage([pkg.id], slotId);
                        showMoveDestinationMenu(rackId, zoneId, slotId);
                    }
                });
                cardActions.appendChild(movePackageButton);
                moveButtons.push(movePackageButton);
            }

            let removePackageButton = null;
            if (hasPermission('Package', 'Delete')) {
                removePackageButton = document.createElement('button');
                removePackageButton.id = `remove-package-button-${pkg.id}`;
                removePackageButton.textContent = 'Scoate pachet';
                removePackageButton.style.display = 'none';
                removePackageButton.addEventListener('click', async () => {
                    if (confirm(`Sunteti sigur ca doriti sa scoateti pachetul ${pkg.recipient}?`)) {
                        const response = await fetch(`${API}/packages/${pkg.id}`, {
                            method: 'DELETE',
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        });
                        if (response.ok) {
                            alert('Pachet scos cu succes!');
                            renderPackageInfo(slotId, rackId, zoneId);
                        } else {
                            alert('Eroare la scoaterea pachetului.');
                        }
                    }
                });
                cardActions.appendChild(removePackageButton);
                moveButtons.push(removePackageButton);
            }

            // Clicking a card both reveals its own move/remove buttons AND
            // toggles it into the multi-select set (the "selected" class
            // changes its color) that drives the bulk "selected packages"
            // buttons above - the two interactions share the same click.
            card.addEventListener('click', (event) => {
                // Clicks on the card's own buttons bubble up here too - those
                // are actions, not a selection toggle.
                if (event.target.closest('button')) {
                    return;
                }
                if (movePackageButton) movePackageButton.style.display = 'inline-block';
                if (removePackageButton) removePackageButton.style.display = 'inline-block';
                if (selectedPackageIds.includes(pkg.id)) {
                    selectedPackageIds = selectedPackageIds.filter(id => id !== pkg.id);
                    card.classList.remove('selected');
                }
                else{
                    selectedPackageIds.push(pkg.id);
                    card.classList.add('selected');
                }
                // Bulk buttons only make sense once 2+ packages are picked -
                // a single selection uses its own per-card buttons instead.
                if (removeSelectedButton) removeSelectedButton.style.display = selectedPackageIds.length > 1 ? 'inline-block' : 'none';
                if (moveSelectedButton) moveSelectedButton.style.display = selectedPackageIds.length > 1 ? 'inline-block' : 'none';
            });
        });
    }
}

// Inline form for adding a brand-new package directly into this slot.
function showAddPackageForm(slotId, rackId, zoneId) {
    const rightColumn = document.getElementById('right-column');
    const formDiv = document.createElement('div');
    formDiv.id = 'add-package-form';
    rightColumn.appendChild(formDiv);

    const recipientInput = document.createElement('input');
    recipientInput.id = 'package-recipient-input';
    recipientInput.type = 'text';
    recipientInput.placeholder = 'Destinatar';
    formDiv.appendChild(recipientInput);

    const description = document.createElement('input');
    description.id = 'package-description-input';
    description.type = 'text';
    description.placeholder = 'Descriere';
    formDiv.appendChild(description);

    const addButton = document.createElement('button');
    addButton.id = 'package-form-add-button';
    addButton.textContent = 'Adauga';
    addButton.addEventListener('click', async () => {
        const recipient = recipientInput.value;
        const descriptionValue = description.value;
        if (recipient) {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API}/packages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ Recipient: recipient, CurrentLocationId: slotId, SlotIds: [slotId], Description: descriptionValue })
            });

            if (response.ok) {
                alert('Pachet adaugat cu succes!');
                renderPackageInfo(slotId, rackId, zoneId);
            } else {
                alert('Eroare la adaugarea pachetului.');
            }
        } else {
            alert('Va rog completati destinatarul.');
        }
    });
    formDiv.appendChild(addButton);

    const cancelButton = document.createElement('button');
    cancelButton.id = 'package-form-cancel-button';
    cancelButton.textContent = 'Anuleaza';
    cancelButton.addEventListener('click', () => {
        formDiv.remove();
    });
    formDiv.appendChild(cancelButton);
}

// Once a package/set of packages is picked up (setMovingPackage already
// called), this menu is how the operator navigates to wherever the
// destination slot actually is - possibly a different zone or rack
// entirely, not just another slot in the current rack.
function showMoveDestinationMenu(rackId, zoneId, slotId) {
    const rightColumn = document.getElementById('right-column');

    const menu = document.createElement('div');
    menu.id = 'move-destination-menu';
    rightColumn.appendChild(menu);

    const otherZoneButton = document.createElement('button');
    otherZoneButton.id = 'move-other-zone-button';
    otherZoneButton.textContent = 'Alta Zona';
    otherZoneButton.addEventListener('click', () => {
        renderDashboard();
    });

    const otherRackButton = document.createElement('button');
    otherRackButton.id = 'move-other-rack-button';
    otherRackButton.textContent = 'Alt Raft';
    otherRackButton.addEventListener('click', () => {
        renderRacks(zoneId);
    });

    const otherSlotButton = document.createElement('button');
    otherSlotButton.id = 'move-other-slot-button';
    otherSlotButton.textContent = 'Alt Slot';
    otherSlotButton.addEventListener('click', () => {
        renderSlots(rackId, zoneId);
    });

    const cancelButton = document.createElement('button');
    cancelButton.id = 'move-cancel-button';
    cancelButton.textContent = 'Anuleaza';
    cancelButton.addEventListener('click', () => {
        clearMovingPackage();
        renderPackageInfo(slotId, rackId, zoneId);
    });

    menu.appendChild(otherZoneButton);
    menu.appendChild(otherRackButton);
    menu.appendChild(otherSlotButton);
    menu.appendChild(cancelButton);
}
