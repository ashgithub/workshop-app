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

    // Query functionality
    const queryBtn = document.getElementById('query-btn');
    const queryInput = document.getElementById('query-input');
    const queryResults = document.getElementById('query-results');

    if (queryBtn) {
        queryBtn.addEventListener('click', async function() {
            const query = queryInput.value.trim();
            if (query) {
                queryResults.innerHTML = '<p>Processing query...</p>';
                try {
                    const response = await fetch('/api/admin/query', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: query })
                    });
                    if (!response.ok) {
                        throw new Error('Query failed');
                    }
                    const data = await response.json();
                    let resultsHtml = `<h4>Results for: "${data.query}"</h4><p><strong>Summary:</strong> ${data.summary}</p>`;
                    if (data.results && data.results.length > 0) {
                        resultsHtml += '<ul>';
                        data.results.forEach(result => {
                            for (let key in result) {
                                resultsHtml += `<li>${key}: ${JSON.stringify(result[key])}</li>`;
                            }
                        });
                        resultsHtml += '</ul>';
                    }
                    queryResults.innerHTML = resultsHtml;
                } catch (error) {
                    console.error('Error executing query:', error);
                    queryResults.innerHTML = '<p>Error processing query. Please try again.</p>';
                }
            }
        });
    }

    // Assign global DOM elements
    locationSelect = document.getElementById('location-select');
    gameProgress = document.getElementById('game-progress');

    // Game functionality
    const startGameBtn = document.getElementById('start-game-btn');
    gameDisplay = document.getElementById('game-display');
    const resetGameBtn = document.getElementById('reset-game-btn');

    // Location change event for progress update
    if (locationSelect) {
        locationSelect.addEventListener('change', async function() {
            const location = this.value;
            if (location) {
                gameProgress.style.display = 'inline'; // Show the badge
                try {
                    const response = await fetch(`/api/admin/game/progress?location=${location}`);
                    if (response.ok) {
                        const data = await response.json();
                        gameProgress.innerHTML = data.progress;
                        if (data.total === 0) {
                            gameProgress.innerHTML += ' (No one has statements yet – time to get those truths flowing!)';
                        } else if (data.played === data.total) {
                            gameProgress.innerHTML += ' (All truths revealed! Ready for a rematch? Will present live!)';
                        }
                    } else {
                        gameProgress.innerHTML = '?/?';
                    }
                } catch (error) {
                    console.error('Error loading progress:', error);
                    gameProgress.innerHTML = '?/?';
                }
            } else {
                gameProgress.style.display = 'none';
                gameProgress.innerHTML = '';
            }
        });
    }

    if (startGameBtn) {
        startGameBtn.addEventListener('click', async function() {
            const location = locationSelect ? locationSelect.value : '';
            if (!location) {
                if (gameDisplay) gameDisplay.innerHTML = '<p>Please select a location first.</p>';
                return;
            }

            currentLocation = location;
            await loadNextAttendee();
        });
    }

    if (resetGameBtn) {
        resetGameBtn.addEventListener('click', async function() {
            const location = locationSelect ? locationSelect.value : '';
            if (!location) {
                alert('Please select a location first.');
                return;
            }

            if (!confirm(`Are you sure you want to reset the 2 Truths and a Lie game for all attendees in ${location}? This will set PLAYED_2T1L to 'N' for everyone in that location.`)) {
                return;
            }

            try {
                const response = await fetch(`/api/admin/game/reset?location=${location}`, {
                    method: 'PUT'
                });
                if (response.ok) {
                    const data = await response.json();
                    alert(data.message);
                    // Clear current display and reload next if in game
                    if (gameDisplay) gameDisplay.innerHTML = '<p>Game reset for location. You can now start a new game.</p>';
                    currentLocation = location; // Keep location selected
                    // Refresh progress
                    if (locationSelect) locationSelect.dispatchEvent(new Event('change'));
                } else {
                    throw new Error('Reset failed');
                }
            } catch (error) {
                console.error('Error resetting game:', error);
                alert('Error resetting game. Please try again.');
            }
        });
    }
});

let currentLocation = '';
let gameDisplay;
let locationSelect;
let gameProgress;

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

        // Load locations for game
        await loadLocations();

    } catch (error) {
        console.error('Error loading admin data:', error);
        showError('Failed to load admin data. Please try again.');
    }
}

function updateAdminProfile(adminData) {
    // Could add admin profile display here if needed
    console.log('Admin profile:', adminData.name, adminData.email_address);
}

async function updateAttendeesList() {
    const attendeesTab = document.getElementById('attendees-tab');
    const tableContainer = attendeesTab.querySelector('.attendees-table');
    if (tableContainer) {
        tableContainer.innerHTML = '<p>Loading attendees...</p>';
    } else {
        const existingContent = attendeesTab.innerHTML;
        const newContent = existingContent.replace(
            '<button class="btn-primary">Export to CSV</button>',
            '<div class="attendees-table" style="margin: 20px 0;"><p>Loading attendees...</p></div><button class="btn-primary" id="export-csv">Export to CSV</button>'
        );
        attendeesTab.innerHTML = newContent;
    }

    try {
        const response = await fetch('/api/admin/attendees');
        if (!response.ok) {
            throw new Error('Failed to fetch attendees');
        }
        const attendees = await response.json();

        const tableHtml = `
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Name</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Email</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Location</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Team</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Progress</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">ACK</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Onboarded</th>
                        <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Played 2T1L</th>
                    </tr>
                </thead>
                <tbody>
                    ${attendees.map(attendee => `
                        <tr style="border: 1px solid #ddd;">
                            <td style="padding: 8px;">${attendee.name || 'N/A'}</td>
                            <td style="padding: 8px;">${attendee.email_address}</td>
                            <td style="padding: 8px;">${attendee.location || 'N/A'}</td>
                            <td style="padding: 8px;">${attendee.team || 'N/A'}</td>
                            <td style="padding: 8px;">${attendee.overall_progress}%</td>
                            <td style="padding: 8px;">${attendee.ack === 'Y' ? 'Yes' : 'No'}</td>
                            <td style="padding: 8px;">${attendee.on_boarded === 'Y' ? 'Yes' : 'No'}</td>
                            <td style="padding: 8px;">${attendee.played_2t1l === 'Y' ? 'Yes' : 'No'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        const tableContainer = attendeesTab.querySelector('.attendees-table');
        tableContainer.innerHTML = tableHtml;

        // Add CSV export functionality
        const exportBtn = document.getElementById('export-csv');
        if (exportBtn && attendees.length > 0) {
            exportBtn.addEventListener('click', () => exportToCSV(attendees));
        }

    } catch (error) {
        console.error('Error loading attendees:', error);
        const tableContainer = attendeesTab.querySelector('.attendees-table');
        if (tableContainer) {
            tableContainer.innerHTML = '<p>Error loading attendees. Please try again.</p>';
        }
    }
}

function exportToCSV(attendees) {
    const headers = ['Name', 'Email', 'Location', 'Team', 'Progress (%)', 'ACK', 'Onboarded', 'Played 2T1L'];
    const csvRows = [
        headers.join(','),
        ...attendees.map(attendee => [
            attendee.name || '',
            attendee.email_address,
            attendee.location || '',
            attendee.team || '',
            attendee.overall_progress,
            attendee.ack === 'Y' ? 'Yes' : 'No',
            attendee.on_boarded === 'Y' ? 'Yes' : 'No',
            attendee.played_2t1l === 'Y' ? 'Yes' : 'No'
        ].join(','))
    ].join('\n');

    const blob = new Blob([csvRows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workshop_attendees.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

async function loadLocations() {
    const locationSelect = document.getElementById('location-select');

    if (locationSelect) {
        try {
            const response = await fetch('/api/admin/locations');
            if (response.ok) {
                const data = await response.json();
                // Clear existing options except default
                locationSelect.innerHTML = '<option value="">Select Location</option>';
                data.locations.forEach(loc => {
                    const option = document.createElement('option');
                    option.value = loc;
                    option.textContent = loc;
                    locationSelect.appendChild(option);
                });
            } else {
                console.error('Failed to load locations');
            }
        } catch (error) {
            console.error('Error loading locations:', error);
        }
    }
}

async function loadNextAttendee() {
    if (!currentLocation) return;

    gameDisplay.innerHTML = '<p>Loading next attendee...</p>';

    try {
        const response = await fetch(`/api/admin/game/next?location=${currentLocation}`);
        if (!response.ok) {
            throw new Error('Failed to fetch attendee');
        }
        const data = await response.json();

        if (data.attendee) {
            displayAttendee(data.attendee);
        } else {
            gameDisplay.innerHTML = `<p>${data.message || 'No more attendees available.'}</p>`;
        }
    } catch (error) {
        console.error('Error loading next attendee:', error);
        gameDisplay.innerHTML = '<p>Error loading attendee. Please try again.</p>';
    }
}

function displayAttendee(attendee) {
    const imageHtml = attendee.image_filename ? 
        `<img src="/api/attendees/${attendee.student_id}/image" alt="Profile Image" class="profile-image" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; align-self: flex-start;">` : 
        '<div class="no-image" style="width: 120px; height: 120px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; align-self: flex-start; color: #9ca3af; font-size: 48px;">👤</div>';

    let introHtml;
    if (!attendee.intro) {
        introHtml = '<p>This mystery attendee is saving their story for the spotlight – uncover it live!</p>';
    } else {
        introHtml = `<p style="margin: 0; white-space: pre-wrap;">${attendee.intro}</p>`;
    }

    let statementsHtml;
    if (!attendee.tl1 && !attendee.tl2 && !attendee.tl3) {
        statementsHtml = `
            <div class="statements" style="margin: 20px 0;">
                <h4>2 Truths and 1 Lie:</h4>
                <p>This attendee was too busy to craft their lies – we'll present statements live!</p>
            </div>
        `;
    } else {
        statementsHtml = `
            <div class="statements" style="margin: 20px 0;">
                <h4>2 Truths and 1 Lie:</h4>
                <ol style="padding-left: 20px;">
                    <li>${attendee.tl1 || 'Statement not provided'}</li>
                    <li>${attendee.tl2 || 'Statement not provided'}</li>
                    <li>${attendee.tl3 || 'Statement not provided'}</li>
                </ol>
            </div>
        `;
    }

    const html = `
        <div class="attendee-card" style="display: flex; gap: 20px; border: 1px solid #ddd; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <div class="left-column" style="flex: 1; display: flex; flex-direction: column; gap: 10px; align-items: flex-start;">
                <h3 style="margin: 0; font-size: 1.5rem; color: #333;">${attendee.name}</h3>
                <p style="margin: 0; color: #666; font-weight: 500;">Team: ${attendee.team || 'N/A'}</p>
                ${imageHtml}
            </div>
            <div class="right-column intro-panel" style="flex: 1; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <h4 style="margin-top: 0; margin-bottom: 10px; color: #475569;">Introduction</h4>
                ${introHtml}
            </div>
        </div>
        ${statementsHtml}
        <div class="game-actions" style="margin-top: 20px; display: flex; gap: 10px;">
            <button class="btn-primary" id="mark-played" data-id="${attendee.student_id}">Mark as Played</button>
            <button class="btn-secondary" id="next-person">Next Person</button>
        </div>
    `;

    gameDisplay.innerHTML = html;

    // Add event listeners for buttons
    const markBtn = document.getElementById('mark-played');
    if (markBtn) {
        markBtn.addEventListener('click', async function() {
            const studentId = this.dataset.id;
            try {
                const putResponse = await fetch(`/api/admin/game/played/${studentId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (putResponse.ok) {
                    console.log('Marked as played');
                    await loadNextAttendee();
                } else {
                    alert('Error marking as played. Please try again.');
                }
            } catch (error) {
                console.error('Error marking as played:', error);
                alert('Error marking as played.');
            }
        });
    }

    const nextBtn = document.getElementById('next-person');
    if (nextBtn) {
        nextBtn.addEventListener('click', loadNextAttendee);
    }
}

// Global function for intro expander
function toggleIntro(btn) {
    const fullIntro = btn.nextElementSibling;
    if (fullIntro.style.display === 'none' || fullIntro.style.display === '') {
        fullIntro.style.display = 'block';
        btn.textContent = 'Read less';
    } else {
        fullIntro.style.display = 'none';
        btn.textContent = 'Read more';
    }
}

function showError(message) {
    // Simple error notification
    alert('❌ ' + message);
}
