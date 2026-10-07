// Module-level state (not a class/store) tracking which slots are
// currently selected for a merge - shared across whichever page imports
// this module, since ES modules are singletons.
let selectedSlotIds = [];

export function addSelectedLocation(slotId) {
    selectedSlotIds.push(slotId);
}

export function removeSelectedLocation(slotId) {
    selectedSlotIds = selectedSlotIds.filter(id => id !== slotId);
}

export function getSelectedLocations() {
    return selectedSlotIds;
}

export function clearSelectedLocations() {
    selectedSlotIds = [];
}
