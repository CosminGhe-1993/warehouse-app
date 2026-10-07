import { renderDashboard } from './dashboard.js';
import { loadPermissions } from '../permissions.js';
import { startRealtimeConnection } from '../realtime.js';

// Base API URL
import { API } from '../config.js';

// Builds and shows the login screen entirely via DOM APIs (no HTML
// template) - the pattern every page in this app follows, since there's
// no frontend framework, just vanilla JS manipulating the shared #app div.
export async function renderLogin() {
    const app = document.getElementById('app');
    app.innerHTML = '';

    // Main container
    const container = document.createElement('div');
    container.id = 'login-container';
    container.className = 'login-container';

    // Title
    const title = document.createElement('h2');
    title.id = 'login-title';
    title.textContent = 'Login';

    // Email input
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.id = 'email';
    emailInput.placeholder = 'Email';

    // Password input
    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = 'password';
    passwordInput.placeholder = 'Password';

    // Login button
    const loginBtn = document.createElement('button');
    loginBtn.id = 'login-button';
    loginBtn.textContent = 'Login';

    // Error message paragraph
    const errorMsg = document.createElement('p');
    errorMsg.id = 'login-error';
    errorMsg.className = 'error';

    // Append elements to container
    container.appendChild(title);
    container.appendChild(emailInput);
    container.appendChild(passwordInput);
    container.appendChild(loginBtn);
    container.appendChild(errorMsg);
    app.appendChild(container);

    // Login button click handler
    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value;
        const password = passwordInput.value;

        // Send login request to API
        const response = await fetch(`${API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            // Save token and redirect to dashboard
            const data = await response.json();
            localStorage.setItem('token', data.token);
            await loadPermissions(); // Load permissions after successful login
            startRealtimeConnection();
            renderDashboard();
        } else {
            // Display error message
            errorMsg.textContent = 'Invalid email or password.';
        }
    });
}