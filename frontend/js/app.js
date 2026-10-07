// App entry point (loaded as a module from index.html). Decides which
// screen to show first based purely on whether a JWT is already saved -
// this is a single-page app with no router, each "page" module just
// clears and repopulates the shared #app container.
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { loadPermissions } from './permissions.js';
import { startRealtimeConnection } from './realtime.js';

const token = localStorage.getItem('token');

if (token) {
    // Already logged in from a previous session - skip straight to the
    // dashboard, but still need to (re)load permissions and reconnect
    // SignalR since neither survives a page reload.
    await loadPermissions();
    startRealtimeConnection();
    renderDashboard();
} else {
    renderLogin();
}
