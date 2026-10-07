// Module-level state tracking a package the user picked up and is about
// to drop into a different slot, across the two-step move flow
// (pick origin -> pick destination).
const movingPackage = {
    packageIds: [],
    originSlotId: null
};

export function setMovingPackage(packageIds, originSlotId) {
    movingPackage.packageIds = packageIds;
    movingPackage.originSlotId = originSlotId;
}

export function getMovingPackage() {
    return movingPackage;
}

export function clearMovingPackage() {
    movingPackage.packageIds = [];
    movingPackage.originSlotId = null;
}
