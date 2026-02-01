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
