import { HUB_URL } from './config.js';
import { refreshView } from './currentView.js';

// Single shared SignalR connection for the whole app.
let connection = null;

// Opens the real-time connection to the backend hub. The JWT is passed as
// a query string param (not an Authorization header) because WebSocket
// connections can't set custom headers - the backend's JwtBearerEvents
// handler on Program.cs reads it from there specifically for this path.
export function startRealtimeConnection() {
    const token = localStorage.getItem('token');
    if (!token) {
        return;
    }

    connection = new signalR.HubConnectionBuilder()
        .withUrl(`${HUB_URL}?access_token=${token}`)
        .withAutomaticReconnect()
        .build();

    // Whenever any server-side mutation broadcasts this event, re-render
    // whatever page is currently open so it reflects the latest data.
    connection.on('WarehouseChanged', () => {
        refreshView();
    });

    connection.start().catch(err => console.error('Eroare la conectarea SignalR:', err));
}

export function stopRealtimeConnection() {
    if (connection) {
        connection.stop();
        connection = null;
    }
}
