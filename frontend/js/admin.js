/**
 * Redwood-themed admin dashboard powered by v2 APIs.
 */

const apiBase = (window.PROXY_CONFIG && window.PROXY_CONFIG.basePath) || '';

function apiFetch(path, options = {}) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return fetch(`${apiBase}${normalized}`, options);
}

document.addEventListener('DOMContentLoaded', () => {
    attachTabs();
    loadCohorts();
    loadTemplates();
    loadSurveys();
    loadLocations();
    bindDialogs();
});

function attachTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${tabName}-tab`)?.classList.add('active');
        });
    });
}

function bindDialogs() {
    document.getElementById('new-cohort-btn')?.addEventListener('click', openNewCohortDialog);
    document.getElementById('new-template-btn')?.addEventListener('click', openNewTemplateDialog);
    document.getElementById('new-survey-btn')?.addEventListener('click', () => alert('Survey builder coming soon.'));
    document.getElementById('query-btn')?.addEventListener('click', runQuery);

    // Game-related event handlers
    document.getElementById('start-game-btn')?.addEventListener('click', startGame);
    document.getElementById('reset-game-btn')?.addEventListener('click', resetGame);
    document.getElementById('location-select')?.addEventListener('change', updateGameProgress);
}

async function loadCohorts() {
    try {
        const response = await apiFetch('/api/cohorts/');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const cohorts = await response.json();
        renderCohorts(cohorts);
    } catch (error) {
        console.error('Failed to load cohorts', error);
        document.getElementById('cohort-grid').innerHTML = '<p>Unable to load cohorts.</p>';
    }
}

function renderCohorts(cohorts) {
    const grid = document.getElementById('cohort-grid');
    if (!grid) return;
    if (!cohorts.length) {
        grid.innerHTML = '<p>No cohorts yet. Create one to get started.</p>';
        return;
    }
    grid.innerHTML = cohorts
        .map(cohort => `
            <article class="cohort-card">
                <header>
                    <h3>${cohort.title}</h3>
                    <span class="badge">${cohort.cohort_code}</span>
                </header>
                <p>${cohort.location_name || 'Location TBA'}</p>
                ${cohort.start_date ? `<p>${formatDateRange(cohort.start_date, cohort.end_date)}</p>` : ''}
                <button class="btn-secondary" data-cohort="${cohort.id}">Invite attendee</button>
            </article>
        `)
        .join('');

    grid.querySelectorAll('[data-cohort]').forEach(btn => {
        btn.addEventListener('click', () => openInviteDialog(btn.getAttribute('data-cohort')));
    });
}

async function loadTemplates() {
    try {
        const response = await apiFetch('/api/tasks/templates');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const templates = await response.json();
        renderTemplates(templates);
    } catch (error) {
        console.error('Failed to load templates', error);
        document.getElementById('template-list').innerHTML = '<p>Unable to load templates.</p>';
    }
}

function renderTemplates(templates) {
    const list = document.getElementById('template-list');
    if (!list) return;
    if (!templates.length) {
        list.innerHTML = '<p>No templates yet. Add onboarding steps for attendees.</p>';
        return;
    }
    list.innerHTML = templates
        .map(template => `
            <div class="template-card">
                <div>
                    <h3>${template.title}</h3>
                    ${template.description ? `<p>${template.description}</p>` : ''}
                    ${template.instructions_url ? `<a href="${template.instructions_url}" target="_blank">Instructions</a>` : ''}
                </div>
                <span class="badge ${template.required ? 'complete' : 'pending'}">${template.required ? 'Required' : 'Optional'}</span>
            </div>
        `)
        .join('');
}

async function loadSurveys() {
    try {
        const response = await apiFetch('/api/surveys/templates');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const surveys = await response.json();
        const list = document.getElementById('survey-list');
        list.innerHTML = surveys
            .map(survey => `
                <div class="survey-card">
                    <div class="survey-card-header">
                        <h4>${survey.name}</h4>
                        <span class="badge ${survey.active ? 'complete' : 'pending'}">${survey.active ? 'Active' : 'Inactive'}</span>
                    </div>
                    <p>${survey.description || 'No description provided.'}</p>
                </div>
            `)
            .join('');
    } catch (error) {
        console.error('Failed to load surveys', error);
        document.getElementById('survey-list').innerHTML = '<p>Unable to load surveys.</p>';
    }
}

function openNewCohortDialog() {
    const title = prompt('Cohort title (e.g., MDC March 2026)');
    if (!title) return;
    const cohort_code = prompt('Cohort code (e.g., MDC2026)');
    if (!cohort_code) return;
    apiFetch('/api/cohorts/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cohort_code, title, location_name: 'MDC', address: 'MDC Mexico', room: 'TBD' }),
    })
        .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
        .then(() => loadCohorts())
        .catch(err => {
            console.error('Create cohort failed', err);
            alert('Unable to create cohort');
        });
}

function openInviteDialog(cohortId) {
    const email = prompt('Attendee email');
    if (!email) return;
    const full_name = prompt('Attendee full name (optional)');

    apiFetch(`/api/cohorts/${cohortId}/attendees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name }),
    })
        .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
        .then(data => {
            if (data.status === 'existing') {
                alert('Attendee already exists in this cohort');
            } else {
                alert('Attendee invited and checklist generated');
            }
        })
        .catch(err => {
            console.error('Invite failed', err);
            alert('Unable to invite attendee');
        });
}

function openNewTemplateDialog() {
    const title = prompt('Task title');
    if (!title) return;
    apiFetch('/api/tasks/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, required: true, display_order: 0 }),
    })
        .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
        .then(() => loadTemplates())
        .catch(err => {
            console.error('Create template failed', err);
            alert('Unable to create template');
        });
}

async function runQuery() {
    const query = document.getElementById('query-input')?.value.trim();
    if (!query) return;
    const results = document.getElementById('query-results');
    results.innerHTML = '<p>Running query...</p>';
    try {
        const response = await apiFetch('/api/admin/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const data = await response.json();
        results.innerHTML = formatQueryResult(data);
    } catch (error) {
        console.error('Query failed', error);
        results.innerHTML = '<p>Query failed. Please try again.</p>';
    }
}

function formatQueryResult(data) {
    let html = `<h4>${data.query}</h4>`;
    if (data.summary) {
        html += `<p>${data.summary}</p>`;
    }
    if (Array.isArray(data.results) && data.results.length) {
        html += '<table class="query-table"><thead><tr>';
        const headers = Object.keys(data.results[0]);
        html += headers.map(h => `<th>${h}</th>`).join('');
        html += '</tr></thead><tbody>';
        data.results.forEach(row => {
            html += '<tr>' + headers.map(h => `<td>${row[h]}</td>`).join('') + '</tr>';
        });
        html += '</tbody></table>';
    } else {
        html += '<p>No rows returned.</p>';
    }
    return html;
}

// Game-related functions
let currentLocation = '';

async function loadLocations() {
    try {
        const response = await apiFetch('/api/admin/locations');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const data = await response.json();
        const select = document.getElementById('location-select');
        if (select) {
            select.innerHTML = '<option value="">Select Location</option>';
            data.locations.forEach(location => {
                const option = document.createElement('option');
                option.value = location;
                option.textContent = location;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Failed to load locations', error);
    }
}

async function updateGameProgress() {
    const locationSelect = document.getElementById('location-select');
    const gameProgress = document.getElementById('game-progress');
    if (!locationSelect || !gameProgress) return;

    const location = locationSelect.value;
    if (location) {
        gameProgress.style.display = 'inline';
        try {
            const response = await apiFetch(`/api/admin/game/progress?location=${location}`);
            if (response.ok) {
                const data = await response.json();
                gameProgress.textContent = data.progress;
                if (data.total === 0) {
                    gameProgress.textContent += ' (No one has statements yet – time to get those truths flowing!)';
                } else if (data.played === data.total) {
                    gameProgress.textContent += ' (All truths revealed! Ready for a rematch? Will present live!)';
                }
            } else {
                gameProgress.textContent = '?/?';
            }
        } catch (error) {
            console.error('Error updating progress:', error);
            gameProgress.textContent = '?/?';
        }
    } else {
        gameProgress.style.display = 'none';
        gameProgress.textContent = '';
    }
}

async function startGame() {
    const locationSelect = document.getElementById('location-select');
    const gameDisplay = document.getElementById('game-display');
    if (!locationSelect || !gameDisplay) return;

    const location = locationSelect.value;
    if (!location) {
        gameDisplay.innerHTML = '<p>Please select a location first.</p>';
        return;
    }

    currentLocation = location;
    await loadNextAttendee();
}

async function resetGame() {
    const locationSelect = document.getElementById('location-select');
    const gameDisplay = document.getElementById('game-display');
    if (!locationSelect) return;

    const location = locationSelect.value;
    if (!location) {
        alert('Please select a location first.');
        return;
    }

    if (!confirm(`Are you sure you want to reset the 2 Truths and a Lie game for all attendees in ${location}? This will set all attendees back to unplayed status.`)) {
        return;
    }

    try {
        const response = await apiFetch(`/api/admin/game/reset?location=${location}`, {
            method: 'PUT'
        });
        if (response.ok) {
            const data = await response.json();
            alert(data.message);
            if (gameDisplay) gameDisplay.innerHTML = '<p>Game reset for location. You can now start a new game.</p>';
            currentLocation = location;
            await updateGameProgress();
        } else {
            throw new Error('Reset failed');
        }
    } catch (error) {
        console.error('Error resetting game:', error);
        alert('Error resetting game. Please try again.');
    }
}

async function loadNextAttendee() {
    const gameDisplay = document.getElementById('game-display');
    if (!gameDisplay) return;

    gameDisplay.innerHTML = '<p>Loading next attendee...</p>';

    try {
        const response = await apiFetch(`/api/admin/game/next?location=${currentLocation}`);
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
    const gameDisplay = document.getElementById('game-display');
    if (!gameDisplay) return;

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
            <div class="left-column" style="flex: 1;">
                <h3 style="margin: 0; font-size: 1.5rem; color: #333;">${attendee.name}</h3>
                <p style="margin: 5px 0; color: #666;">Location: ${attendee.location}</p>
                <div class="right-column intro-panel" style="background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 10px;">
                    <h4 style="margin-top: 0; margin-bottom: 10px; color: #475569;">Introduction</h4>
                    ${introHtml}
                </div>
            </div>
        </div>
        ${statementsHtml}
        <div class="game-actions" style="margin-top: 20px; display: flex; gap: 10px;">
            <button class="btn-primary" id="mark-played" data-id="${attendee.id}">Mark as Played</button>
            <button class="btn-secondary" id="next-person">Next Person</button>
            <button class="btn-secondary" id="reveal-lie" data-id="${attendee.id}">Reveal Lie</button>
        </div>
    `;

    gameDisplay.innerHTML = html;

    // Add event listeners for buttons
    const markBtn = document.getElementById('mark-played');
    if (markBtn) {
        markBtn.addEventListener('click', async function() {
            const attendeeId = this.dataset.id;
            try {
                const putResponse = await apiFetch(`/api/admin/game/play/${attendeeId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (putResponse.ok) {
                    console.log('Marked as played');
                    await updateGameProgress();
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

    const revealBtn = document.getElementById('reveal-lie');
    if (revealBtn) {
        revealBtn.addEventListener('click', async function() {
            const attendeeId = this.dataset.id;
            const lieNumber = prompt('Which statement is the lie? (1, 2, or 3)');
            if (!lieNumber || !['1', '2', '3'].includes(lieNumber)) {
                alert('Please enter 1, 2, or 3');
                return;
            }

            try {
                const response = await apiFetch(`/api/admin/game/reveal/${attendeeId}?lie_number=${lieNumber}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    const data = await response.json();
                    alert(data.message);
                    await updateGameProgress();
                } else {
                    alert('Error revealing lie. Please try again.');
                }
            } catch (error) {
                console.error('Error revealing lie:', error);
                alert('Error revealing lie.');
            }
        });
    }
}
