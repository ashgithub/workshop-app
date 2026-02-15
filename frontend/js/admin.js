/**
 * Redwood-themed admin dashboard powered by v2 APIs, now with cohort analytics.
 */

let runtimeConfigPromise;
let runtimeConfig = {
    basePath: '',
    bearerToken: '',
    enabled: false,
};

const chartRegistry = new Map();

function loadRuntimeConfig() {
    if (!runtimeConfigPromise) {
        runtimeConfigPromise = fetch('api/runtime-config')
            .then(response => (response.ok ? response.json() : {}))
            .catch(() => ({}))
            .then(data => {
                runtimeConfig = {
                    basePath: data.basePath || '',
                    bearerToken: data.bearerToken || '',
                    enabled: Boolean(data.enabled),
                };
                if (typeof window !== 'undefined') {
                    window.RUNTIME_CONFIG = runtimeConfig;
                }
                return runtimeConfig;
            });
    }
    return runtimeConfigPromise;
}

async function apiFetch(path, options = {}) {
    const config = await loadRuntimeConfig();
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const url = `${config.basePath || ''}${normalized}`;
    const headers = new Headers(options.headers || {});
    if (config.bearerToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${config.bearerToken}`);
    }
    return fetch(url, { ...options, headers });
}

function remember(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn('Unable to persist setting', key, error);
    }
}

function recall(key, defaultValue = null) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : defaultValue;
    } catch (error) {
        return defaultValue;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadRuntimeConfig();
    attachTabs();
    initializeProgressTab();
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
            if (tabName === 'progress') {
                ensureProgressLoaded();
            }
        });
    });
}

function bindDialogs() {
    document.getElementById('new-cohort-btn')?.addEventListener('click', openNewCohortDialog);
    document.getElementById('new-template-btn')?.addEventListener('click', openNewTemplateDialog);
    document.getElementById('new-survey-btn')?.addEventListener('click', () => alert('Survey builder coming soon.'));
    document.getElementById('query-btn')?.addEventListener('click', runQuery);
    document.getElementById('progress-cohort-select')?.addEventListener('change', handleProgressFilters);
    document.getElementById('include-test-toggle')?.addEventListener('change', handleProgressFilters);

    // Game-related event handlers
    document.getElementById('start-game-btn')?.addEventListener('click', startGame);
    document.getElementById('reset-game-btn')?.addEventListener('click', resetGame);
    document.getElementById('location-select')?.addEventListener('change', updateGameProgress);
}

function initializeProgressTab() {
    const cohortSelect = document.getElementById('progress-cohort-select');
    const includeToggle = document.getElementById('include-test-toggle');
    const storedCohort = recall('adminProgressCohort');
    const storedInclude = recall('adminIncludeTest', false);

    if (includeToggle) {
        includeToggle.checked = Boolean(storedInclude);
    }

    if (cohortSelect && storedCohort) {
        cohortSelect.dataset.pendingSelection = String(storedCohort);
    }
}

function ensureProgressLoaded() {
    const cohortSelect = document.getElementById('progress-cohort-select');
    if (!cohortSelect || !cohortSelect.value) {
        renderProgressEmptyState();
        return;
    }
    loadDashboard();
}

function handleProgressFilters() {
    const cohortSelect = document.getElementById('progress-cohort-select');
    const includeToggle = document.getElementById('include-test-toggle');

    if (!cohortSelect || !includeToggle) return;

    remember('adminIncludeTest', includeToggle.checked);

    if (!cohortSelect.value) {
        renderProgressEmptyState();
        return;
    }

    remember('adminProgressCohort', cohortSelect.value);
    loadDashboard();
}

async function loadCohorts() {
    try {
        const response = await apiFetch('/api/cohorts/');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const cohorts = await response.json();
        renderCohorts(cohorts);
        renderProgressCohortOptions(cohorts);
    } catch (error) {
        console.error('Failed to load cohorts', error);
        document.getElementById('cohort-grid').innerHTML = '<p>Unable to load cohorts.</p>';
        renderProgressError('Unable to load cohorts.');
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

function renderProgressCohortOptions(cohorts) {
    const select = document.getElementById('progress-cohort-select');
    if (!select) return;
    const previous = select.dataset.pendingSelection || select.value;
    select.innerHTML = '<option value="">Select cohort</option>';
    cohorts.forEach(cohort => {
        const option = document.createElement('option');
        option.value = String(cohort.id);
        option.textContent = cohort.title;
        select.appendChild(option);
    });
    if (previous && cohorts.some(c => String(c.id) === previous)) {
        select.value = previous;
        select.dataset.pendingSelection = '';
        remember('adminProgressCohort', previous);
        loadDashboard();
    } else {
        renderProgressEmptyState();
    }
}

function renderProgressEmptyState(message = 'Select a cohort to see progress analytics.') {
    const shell = document.getElementById('progress-content');
    if (!shell) return;
    shell.innerHTML = `
        <div class="progress-empty">
            <p>${message}</p>
        </div>
    `;
}

function renderProgressError(message) {
    const shell = document.getElementById('progress-content');
    if (!shell) return;
    shell.innerHTML = `
        <div class="progress-empty error">
            <p>${message}</p>
        </div>
    `;
}

async function loadDashboard() {
    const cohortSelect = document.getElementById('progress-cohort-select');
    const includeToggle = document.getElementById('include-test-toggle');
    if (!cohortSelect || !includeToggle || !cohortSelect.value) return;

    const cohortId = cohortSelect.value;
    const includeTest = includeToggle.checked;

    try {
        const response = await apiFetch(`/api/admin/dashboard?cohort_id=${cohortId}&include_test=${includeTest}`);
        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || 'Unable to load dashboard');
        }
        const data = await response.json();
        renderProgressDashboard(data);
    } catch (error) {
        console.error('Failed to load dashboard', error);
        renderProgressError('Unable to load dashboard metrics.');
    }
}

function renderProgressDashboard(data) {
    if (!data || !data.meta) {
        renderProgressError('Dashboard payload missing.');
        return;
    }

    const shell = document.getElementById('progress-content');
    if (!shell) return;

    shell.innerHTML = `
        <section class="headline-strip" aria-label="Cohort summary">
            <div class="headline-card">
                <p class="headline-label">Total attendees</p>
                <p class="headline-value">${data.headline.attendees_total}</p>
            </div>
            <div class="headline-card">
                <p class="headline-label">Accepted attendees</p>
                <p class="headline-value">${data.headline.attendees_accepted}</p>
            </div>
        </section>
        <section class="chart-grid" aria-label="Progress charts">
            <article class="chart-card" aria-label="Introductions completion">
                <header>
                    <h3>Introductions</h3>
                    <p>${formatCompletionSummary(data.intro.questions)}</p>
                </header>
                <canvas id="intro-completion-chart" aria-label="Introduction completion chart"></canvas>
            </article>
            <article class="chart-card" aria-label="Truth prompt completion">
                <header>
                    <h3>Two Truths & One Lie</h3>
                    <p>${formatTruthSummary(data.intro.questions)}</p>
                </header>
                <div class="small-chart-grid">
                    <canvas id="truth-1-chart" aria-label="Truth 1 completion"></canvas>
                    <canvas id="truth-2-chart" aria-label="Truth 2 completion"></canvas>
                    <canvas id="truth-3-chart" aria-label="Truth 3 completion"></canvas>
                </div>
            </article>
            <article class="chart-card" aria-label="Device preference breakdown">
                <header>
                    <h3>Device preference</h3>
                    <p>${formatChoiceSummary(data.intro.device_pref)}</p>
                </header>
                <canvas id="device-pref-chart" aria-label="Device preference donut"></canvas>
            </article>
            <article class="chart-card" aria-label="T-shirt size breakdown">
                <header>
                    <h3>T-shirt sizes</h3>
                    <p>${formatChoiceSummary(data.intro.tshirt_size)}</p>
                </header>
                <canvas id="tshirt-size-chart" aria-label="T-shirt size donut"></canvas>
            </article>
            <article class="chart-card" aria-label="Onboarding checklist">
                <header>
                    <h3>Onboarding checklist</h3>
                    <p>${formatCompletionSummary(data.onboarding)}</p>
                </header>
                <canvas id="onboarding-step-chart" aria-label="Onboarding steps completion"></canvas>
            </article>
            <article class="chart-card" aria-label="Survey submissions">
                <header>
                    <h3>Survey submissions</h3>
                    <p>${formatSurveySummary(data.surveys)}</p>
                </header>
                <canvas id="survey-completion-chart" aria-label="Survey submission counts"></canvas>
            </article>
        </section>
    `;

    renderIntroCharts(data.intro);
    renderChoiceChart('device-pref-chart', data.intro.device_pref);
    renderChoiceChart('tshirt-size-chart', data.intro.tshirt_size);
    renderOnboardingChart(data.onboarding);
    renderSurveyChart(data.surveys);
}

function formatCompletionSummary(items) {
    if (!Array.isArray(items) || !items.length) {
        return 'No responses yet.';
    }
    const completed = items.reduce((total, item) => total + (item.completed || 0), 0);
    const total = items.reduce((sum, item) => sum + (item.total || 0), 0);
    return `${completed} of ${total} responses`;
}

function formatTruthSummary(items) {
    if (!Array.isArray(items) || !items.length) {
        return 'No responses yet.';
    }
    const truths = items.filter(item => item.code && item.code.startsWith('truth_'));
    if (!truths.length) return 'No truth prompts configured.';
    const completed = truths.reduce((total, item) => total + (item.completed || 0), 0);
    const total = truths.reduce((sum, item) => sum + (item.total || 0), 0);
    return `${completed} of ${total} prompt responses`;
}

function formatChoiceSummary(data) {
    if (!data || !data.breakdown || !data.breakdown.length) {
        return 'No responses yet.';
    }
    return `${data.completed} of ${data.total} responses`;
}

function formatSurveySummary(items) {
    if (!Array.isArray(items) || !items.length) {
        return 'No surveys completed yet.';
    }
    const completed = items.reduce((total, item) => total + (item.completed || 0), 0);
    const expected = items.reduce((sum, item) => sum + (item.expected || 0), 0);
    return `${completed} of ${expected} submissions`;
}

function renderIntroCharts(intro) {
    if (!intro) return;
    const truthCodes = ['truth_1', 'truth_2', 'truth_3'];
    const truthCharts = ['truth-1-chart', 'truth-2-chart', 'truth-3-chart'];

    const textQuestions = (intro.questions || []).filter(q => !['device_pref', 'tshirt_size'].includes(q.code));
    renderStackedBar('intro-completion-chart', textQuestions, {
        grouped: true,
        labelKey: 'label'
    });

    truthCodes.forEach((code, index) => {
        const question = textQuestions.find(item => item.code === code);
        if (!question) {
            destroyChart(truthCharts[index]);
            const canvas = document.getElementById(truthCharts[index]);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            return;
        }
        renderStackedBar(truthCharts[index], [question], {
            grouped: false,
            labelKey: 'label'
        });
    });
}

function renderStackedBar(canvasId, items, options = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !Array.isArray(items) || !items.length) {
        destroyChart(canvasId);
        return;
    }

    const labels = items.map(item => item[options.labelKey || 'label'] || item.code);
    const completedData = items.map(item => item.completed || 0);
    const pendingData = items.map(item => item.pending || 0);

    createChart(canvasId, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Completed',
                    data: completedData,
                    backgroundColor: 'rgba(40, 167, 69, 0.75)',
                    borderRadius: 4,
                },
                {
                    label: 'Pending',
                    data: pendingData,
                    backgroundColor: 'rgba(232, 121, 12, 0.65)',
                    borderRadius: 4,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0,
                    },
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                },
            },
            plugins: {
                legend: {
                    display: options.grouped,
                    position: 'bottom',
                },
            },
        },
    });
}

function renderChoiceChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || !Array.isArray(data.breakdown) || !data.breakdown.length) {
        destroyChart(canvasId);
        return;
    }

    const labels = data.breakdown.map(item => item.label || item.value);
    const counts = data.breakdown.map(item => item.count || 0);
    const palette = generatePalette(counts.length);

    createChart(canvasId, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    data: counts,
                    backgroundColor: palette,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
            },
        },
    });
}

function renderOnboardingChart(items) {
    renderStackedBar('onboarding-step-chart', items, { grouped: false, labelKey: 'label' });
}

function renderSurveyChart(items) {
    const canvasId = 'survey-completion-chart';
    const canvas = document.getElementById(canvasId);
    if (!canvas || !Array.isArray(items) || !items.length) {
        destroyChart(canvasId);
        return;
    }

    createChart(canvasId, {
        type: 'bar',
        data: {
            labels: items.map(item => item.name),
            datasets: [
                {
                    label: 'Submissions',
                    data: items.map(item => item.completed || 0),
                    backgroundColor: 'rgba(79, 70, 229, 0.75)',
                    borderRadius: 6,
                },
                {
                    label: 'Target',
                    data: items.map(item => item.expected || 0),
                    type: 'line',
                    borderColor: 'rgba(148, 163, 184, 0.9)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                },
            },
            scales: {
                y: { beginAtZero: true },
            },
        },
    });
}

function generatePalette(length) {
    const baseColors = [
        'rgba(199, 70, 52, 0.85)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(34, 197, 94, 0.8)',
        'rgba(234, 179, 8, 0.8)',
        'rgba(107, 114, 128, 0.8)',
        'rgba(129, 140, 248, 0.8)',
        'rgba(249, 115, 22, 0.8)',
        'rgba(16, 185, 129, 0.8)'
    ];
    const colors = [];
    for (let i = 0; i < length; i += 1) {
        colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
}

function createChart(canvasId, config) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') {
        console.warn('Chart.js unavailable, skipping chart', canvasId);
        return;
    }
    destroyChart(canvasId);
    const chart = new Chart(canvas.getContext('2d'), config);
    chartRegistry.set(canvasId, chart);
}

function destroyChart(canvasId) {
    const chart = chartRegistry.get(canvasId);
    if (chart) {
        chart.destroy();
        chartRegistry.delete(canvasId);
    }
}

function formatDateRange(startDate, endDate) {
    if (!startDate) return '';
    const start = new Date(startDate);
    if (!Number.isFinite(start.getTime())) return startDate;
    if (!endDate) {
        return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    const end = new Date(endDate);
    if (!Number.isFinite(end.getTime())) {
        return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
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

async function loadDashboard() {
    const cohortSelect = document.getElementById('progress-cohort-select');
    const includeToggle = document.getElementById('include-test-toggle');
    if (!cohortSelect || !cohortSelect.value) return;

    const cohortId = cohortSelect.value;
    const includeTest = includeToggle?.checked || false;

    try {
        const response = await apiFetch(`/api/admin/dashboard?cohort_id=${cohortId}&include_test=${includeTest}`);
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const data = await response.json();
        renderProgressDashboard(data);
    } catch (error) {
        console.error('Failed to load dashboard', error);
        renderProgressError('Unable to load dashboard metrics.');
    }
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

// Remaining game, query, and onboarding helper functions unchanged...

// Ensure charts cleanup on unload
window.addEventListener('beforeunload', () => {
    chartRegistry.forEach((chart, id) => {
        if (chart) chart.destroy();
        chartRegistry.delete(id);
    });
});
