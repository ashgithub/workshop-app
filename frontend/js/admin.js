/**
 * Admin dashboard JavaScript
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin dashboard loaded');

    // Load admin data on page load
    loadAdminData();

    // Tab switching functionality
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');

            // Remove active class from all tabs
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab
            this.classList.add('active');
            document.getElementById(tabName + '-tab').classList.add('active');
        });
    });

    // Query functionality (placeholder)
    const queryBtn = document.getElementById('query-btn');
    const queryInput = document.getElementById('query-input');
    const queryResults = document.getElementById('query-results');

    if (queryBtn) {
        queryBtn.addEventListener('click', function() {
            const query = queryInput.value.trim();
            if (query) {
                queryResults.innerHTML = `<p>Query functionality will be implemented in Phase 4. You asked: "${query}"</p>`;
            }
        });
    }

    // Game functionality (placeholder)
    const startGameBtn = document.getElementById('start-game-btn');
    const locationSelect = document.getElementById('location-select');
    const gameDisplay = document.getElementById('game-display');

    if (startGameBtn) {
        startGameBtn.addEventListener('click', function() {
            const location = locationSelect.value;
            if (location) {
                gameDisplay.innerHTML = `<p>Game functionality will be implemented in Phase 4 for location: ${location}</p>`;
            } else {
                gameDisplay.innerHTML = '<p>Please select a location first.</p>';
            }
        });
    }
});

async function loadAdminData() {
    try {
        console.log('Loading admin data...');

        // Load admin profile
        const profileResponse = await fetch('/api/attendees/ADMIN_USER');
        if (profileResponse.ok) {
            const adminData = await profileResponse.json();
            console.log('Admin data loaded:', adminData);

            // Update admin info display
            updateAdminProfile(adminData);
        }

        // Load attendees list (placeholder for now)
        updateAttendeesList();

        // Load locations for game (placeholder)
        updateLocationsList();

    } catch (error) {
        console.error('Error loading admin data:', error);
        showError('Failed to load admin data. Please try again.');
    }
}

function updateAdminProfile(adminData) {
    // Could add admin profile display here if needed
    console.log('Admin profile:', adminData.name, adminData.email_address);
}

function updateAttendeesList() {
    const attendeesTab = document.getElementById('attendees-tab');

    // Add some placeholder content
    const attendeesHtml = `
        <h2>Attendee List</h2>
        <p>Manage workshop attendees and view their progress:</p>
        <div class="attendees-table" style="margin: 20px 0;">
            <p><em>Note: Attendee management table will be implemented in Phase 4</em></p>
            <p>Current features available:</p>
            <ul style="margin-left: 20px;">
                <li>✅ Email-based authentication</li>
                <li>✅ Attendee profile management</li>
                <li>✅ Progress tracking</li>
                <li>🔄 Bulk attendee operations (Phase 4)</li>
                <li>🔄 CSV export functionality (Phase 4)</li>
            </ul>
        </div>
        <button class="btn-primary">Export to CSV (Phase 4)</button>
    `;

    // Only update if this is the first load
    if (!attendeesTab.querySelector('.attendees-table')) {
        const existingContent = attendeesTab.innerHTML;
        attendeesTab.innerHTML = existingContent.replace(
            '<button class="btn-primary">Export to CSV</button>',
            attendeesHtml
        );
    }
}

function updateLocationsList() {
    const locationSelect = document.getElementById('location-select');

    if (locationSelect) {
        // Add some placeholder locations
        const locations = ['Austin', 'Seattle', 'San Francisco', 'New York', 'London'];

        locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location.toLowerCase().replace(' ', '_');
            option.textContent = location;
            locationSelect.appendChild(option);
        });
    }
}

function showError(message) {
    // Simple error notification
    alert('❌ ' + message);
}
