// Tiny indirection layer so SignalR (realtime.js) can trigger a refresh of
// "whatever page is currently shown" without importing every page module
// directly - each page registers its own refresh function here when it
// renders, overwriting whatever the previous page registered.
let refreshCurrentView = () => {};

// Called by each page's render function on load, to register how it
// should redraw itself when live data changes.
export function setCurrentView(refreshFn) {
    refreshCurrentView = refreshFn;
}

// Called by realtime.js when the "WarehouseChanged" signal arrives.
export function refreshView() {
    refreshCurrentView();
}
