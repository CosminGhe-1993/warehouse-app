import { API } from '../config.js';
import { renderDashboard } from './dashboard.js';
import { setCurrentView } from '../currentView.js';

// Turns one RecentActivityDto into a single readable line. Which verb to
// use (added/removed/moved) is inferred from which location fields are
// present - a missing "from" means it entered the warehouse, a missing
// "to" means it was removed, both present means an actual move.
function formatActivityEntry(activity) {
    const date = new Date(activity.timestamp).toLocaleString();
    const packageLabel = activity.description ? `${activity.recipient} (${activity.description})` : activity.recipient;

    let actionText;
    if (!activity.fromLocationName) {
        actionText = `adaugat in ${activity.toLocationName}`;
    } else if (!activity.toLocationName) {
        actionText = `scos din ${activity.fromLocationName}`;
    } else {
        actionText = `mutat din ${activity.fromLocationName} in ${activity.toLocationName}`;
    }

    return `${date} - ${activity.userName} - ${packageLabel} - ${actionText}`;
}

// Renders the tabbed Statistics page. filterUserName/filterDate come from
// the assistant's "operator_activity" tool navigating here with a specific
// operator+date already chosen - when set, the page jumps straight to the
// filtered operator-activity tab instead of the default occupancy tab.
export async function renderDashboardStats(filterUserName = null, filterDate = null) {
    // Re-registers itself (with the same filter args) as the refresh
    // handler, so a SignalR "WarehouseChanged" event while this page is
    // open re-fetches and redraws it, preserving whatever filter was active.
    setCurrentView(() => renderDashboardStats(filterUserName, filterDate));
    const app = document.getElementById('app');
    app.innerHTML = '';

    const topBar = document.createElement('div');
    topBar.id = 'top-bar';
    app.appendChild(topBar);

    const backButton = document.createElement('button');
    backButton.id = 'stats-back-button';
    backButton.textContent = 'Inapoi';
    backButton.addEventListener('click', () => {
        renderDashboard();
    });
    topBar.appendChild(backButton);

    const title = document.createElement('h2');
    title.id = 'stats-title';
    title.className = 'nav-title';
    title.textContent = 'Statistici';
    topBar.appendChild(title);

    const tabBar = document.createElement('div');
    tabBar.id = 'stats-tab-bar';
    app.appendChild(tabBar);

    // Container divs are created empty, up front, in the order they should
    // appear on the page - their content gets filled in after the fetch
    // resolves below, so nothing has to be re-appended out of order.
    const statsContent = document.createElement('div');
    statsContent.id = 'stats-content';
    app.appendChild(statsContent);

    const occupancySection = document.createElement('div');
    occupancySection.id = 'stats-occupancy';
    statsContent.appendChild(occupancySection);

    const bufferSection = document.createElement('div');
    bufferSection.id = 'stats-buffer';
    statsContent.appendChild(bufferSection);

    const alertsSection = document.createElement('div');
    alertsSection.id = 'stats-alerts';
    statsContent.appendChild(alertsSection);

    const recentActivitySection = document.createElement('div');
    recentActivitySection.id = 'stats-recent-activity';
    statsContent.appendChild(recentActivitySection);

    const operatorActivitySection = document.createElement('div');
    operatorActivitySection.id = 'stats-operator-activity';
    statsContent.appendChild(operatorActivitySection);

    const tabs = [
        { sectionId: 'stats-occupancy', label: 'Ocupare' },
        { sectionId: 'stats-buffer', label: 'Tampon' },
        { sectionId: 'stats-alerts', label: 'Alerte' },
        { sectionId: 'stats-recent-activity', label: 'Activitate recenta' },
        { sectionId: 'stats-operator-activity', label: 'Activitate per operator' }
    ];

    // Shows the one matching section and hides the rest, and syncs the
    // "active" styling onto the corresponding tab button.
    function switchTab(activeSectionId) {
        tabs.forEach(tab => {
            document.getElementById(tab.sectionId).style.display = tab.sectionId === activeSectionId ? 'block' : 'none';
            document.getElementById(`stats-tab-button-${tab.sectionId}`).classList.toggle('active', tab.sectionId === activeSectionId);
        });
    }

    tabs.forEach(tab => {
        const tabButton = document.createElement('button');
        tabButton.id = `stats-tab-button-${tab.sectionId}`;
        tabButton.className = 'tab-button';
        tabButton.textContent = tab.label;
        tabButton.addEventListener('click', () => switchTab(tab.sectionId));
        tabBar.appendChild(tabButton);
    });

    switchTab('stats-occupancy');

    const token = localStorage.getItem('token');
    const response = await fetch(`${API}/dashboard/stats`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (!response.ok) {
        occupancySection.textContent = 'Eroare la incarcarea statisticilor.';
        return;
    }

    const data = await response.json();
    console.log(data);

    const occupancyTitle = document.createElement('h3');
    occupancyTitle.textContent = 'Ocupare sloturi';
    occupancySection.appendChild(occupancyTitle);
    const occupancyText = document.createElement('p');
    occupancyText.id = 'stats-occupancy-text';
    occupancyText.textContent = `Libere: ${data.freeSlots} | Partiale: ${data.partialSlots} | Pline: ${data.fullSlots}`;
    occupancySection.appendChild(occupancyText);

    const bufferTitle = document.createElement('h3');
    bufferTitle.textContent = 'Tampon';
    bufferSection.appendChild(bufferTitle);
    const bufferText = document.createElement('p');
    bufferText.id = 'stats-buffer-text';
    bufferText.textContent = `Local: ${data.localBufferCount} | Central: ${data.centralBufferCount}`;
    bufferSection.appendChild(bufferText);

    const alertsTitle = document.createElement('h3');
    alertsTitle.textContent = 'Alerte active';
    alertsSection.appendChild(alertsTitle);
    const alertsText = document.createElement('p');
    alertsText.id = 'stats-alerts-text';
    alertsText.textContent = `${data.activeAlertsCount}`;
    alertsSection.appendChild(alertsText);

    const recentActivityTitle = document.createElement('h3');
    recentActivityTitle.textContent = 'Activitate recenta';
    recentActivitySection.appendChild(recentActivityTitle);
    if (data.recentActivity.length === 0) {
        const emptyMessage = document.createElement('p');
        emptyMessage.textContent = 'Nicio activitate inregistrata.';
        recentActivitySection.appendChild(emptyMessage);
    } else {
        data.recentActivity.forEach((activity, index) => {
            const entry = document.createElement('p');
            entry.id = `stats-recent-activity-${index}`;
            entry.textContent = formatActivityEntry(activity);
            recentActivitySection.appendChild(entry);
        });
    }

    // A filter was requested (from the assistant, or a manual drill-down):
    // fetch the specific operator+date activity list instead of showing
    // the generic per-operator counts.
    if (filterDate) {
        const filteredTitle = document.createElement('h3');
        filteredTitle.textContent = filterUserName
            ? `Activitate: ${filterUserName}, ${filterDate}`
            : `Activitate: toti operatorii, ${filterDate}`;
        operatorActivitySection.appendChild(filteredTitle);

        const filteredResponse = await fetch(`${API}/dashboard/activity?userName=${encodeURIComponent(filterUserName || '')}&date=${encodeURIComponent(filterDate)}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const filteredActivity = filteredResponse.ok ? await filteredResponse.json() : [];

        if (filteredActivity.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'Nicio activitate gasita pentru aceasta cautare.';
            operatorActivitySection.appendChild(emptyMessage);
        } else {
            filteredActivity.forEach((activity, index) => {
                const entry = document.createElement('p');
                entry.id = `stats-filtered-activity-${index}`;
                entry.textContent = formatActivityEntry(activity);
                operatorActivitySection.appendChild(entry);
            });
        }

        switchTab('stats-operator-activity');
    } else {
        const operatorActivityTitle = document.createElement('h3');
        operatorActivityTitle.textContent = 'Activitate per operator';
        operatorActivitySection.appendChild(operatorActivityTitle);
        if (data.activityByOperator.length === 0) {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'Nicio activitate inregistrata.';
            operatorActivitySection.appendChild(emptyMessage);
        } else {
            data.activityByOperator.forEach((operatorStat, index) => {
                const entry = document.createElement('p');
                entry.id = `stats-operator-activity-${index}`;
                entry.textContent = `${operatorStat.userName}: ${operatorStat.count} actiuni`;
                operatorActivitySection.appendChild(entry);
            });
        }
    }
}