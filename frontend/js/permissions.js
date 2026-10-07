// Base API URL
import { API } from './config.js';

// In-memory cache of the logged-in user's flattened permission strings
// (e.g. "Package:Read") - fetched once after login, then checked
// synchronously everywhere the UI needs to show/hide an action.
let permissions = new Set();

export async function loadPermissions(){
    let token = localStorage.getItem('token');
    if (!token) {
        console.error('No token found in localStorage');
        return;
    }

    const response = await fetch(`${API}/auth/permissions`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.ok) {
        const data = await response.json();
        permissions = new Set(data.permissions);
    }
}

// Matches the "Entity:Action" format the backend's GetPermissionsAsync
// produces (see UserService.cs).
export function hasPermission(entity, action) {
    return permissions.has(`${entity}:${action}`);
}