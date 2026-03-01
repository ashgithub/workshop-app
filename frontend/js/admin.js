/**
 * Redwood-themed admin dashboard powered by v2 APIs, now with cohort analytics.
 */

let runtimeConfigPromise;
let runtimeConfig = {
    basePath: '',
    bearerToken: '',
    enabled: false,
};

function normalizeDocumentRelativePath(value) {
    if (!value) return '';
    let path = String(value).trim();
    if (!path) return '';
    // We want paths like "static/images/..." so they resolve under /workshop-app/...
    // when hosted behind a prefix.
    if (path.startsWith('/')) {
        path = path.slice(1);
    }
    return path;
}

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
    const headers = new Headers(options.headers || {});
    if (config.bearerToken && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${config.bearerToken}`);
    }

    const method = (options.method || 'GET').toUpperCase();
    const startedAt = performance?.now ? performance.now() : Date.now();
    console.log('[apiFetch]', { method, path, runtimeBasePath: config.basePath, proxyEnabled: config.enabled });

    try {
        const response = await fetch(path, { ...options, headers });
        const elapsedMs = (performance?.now ? performance.now() : Date.now()) - startedAt;
        console.log('[apiFetch:response]', {
            method,
            path,
            status: response.status,
            ok: response.ok,
            elapsedMs: Math.round(elapsedMs),
        });
        return response;
    } catch (error) {
        const elapsedMs = (performance?.now ? performance.now() : Date.now()) - startedAt;
        console.error('[apiFetch:error]', { method, path, elapsedMs: Math.round(elapsedMs), error });
        throw error;
    }
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
    loadGameCohorts();
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
    document.getElementById('query-btn')?.addEventListener('click', runQuery);
    document.getElementById('progress-cohort-select')?.addEventListener('change', handleProgressFilters);
    document.getElementById('include-test-toggle')?.addEventListener('change', handleProgressFilters);

    // Game-related event handlers
    document.getElementById('start-game-btn')?.addEventListener('click', startGame);
    document.getElementById('reset-game-btn')?.addEventListener('click', resetGame);
    document.getElementById('cohort-select')?.addEventListener('change', handleGameCohortChange);
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

    // Cohort selection changed - load dashboard

    if (!cohortSelect.value) {
        renderProgressEmptyState();
        return;
    }

    remember('adminProgressCohort', cohortSelect.value);
    loadDashboard();
}

async function loadCohorts() {
    try {
        const response = await apiFetch('api/cohorts/');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const cohorts = await response.json();
        renderProgressCohortOptions(cohorts);
    } catch (error) {
        console.error('Failed to load cohorts', error);
        renderProgressError('Unable to load cohorts.');
    }
}

async function loadGameCohorts() {
    try {
        const response = await apiFetch('api/cohorts/');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const cohorts = await response.json();
        renderGameCohortOptions(cohorts);
    } catch (error) {
        console.error('Failed to load cohorts for game', error);
    }
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

    // Debug logs removed for production

    let selectedCohort = null;

    // Auto-select if there's exactly one cohort
    if (cohorts.length === 1) {
        selectedCohort = String(cohorts[0].id);
    }
    // Otherwise, restore previous selection if it still exists
    else if (previous && cohorts.some(c => String(c.id) === previous)) {
        selectedCohort = previous;
    }

    if (selectedCohort) {
        select.value = selectedCohort;
        select.dataset.pendingSelection = '';
        remember('adminProgressCohort', selectedCohort);
        loadDashboard();
    } else {
        renderProgressEmptyState();
    }
}

function renderGameCohortOptions(cohorts) {
    const select = document.getElementById('cohort-select');
    if (!select) return;
    const previous = recall('adminGameCohort');
    select.innerHTML = '<option value="">Select Cohort</option>';
    cohorts.forEach(cohort => {
        const option = document.createElement('option');
        option.value = String(cohort.id);
        option.textContent = cohort.title;
        select.appendChild(option);
    });

    let selectedCohort = null;

    // Auto-select if there's exactly one cohort
    if (cohorts.length === 1) {
        selectedCohort = String(cohorts[0].id);
    }
    // Otherwise, restore previous selection if it still exists
    else if (previous && cohorts.some(c => String(c.id) === previous)) {
        selectedCohort = previous;
    }

    if (selectedCohort) {
        select.value = selectedCohort;
        remember('adminGameCohort', selectedCohort);
        updateGameProgress();
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
        const response = await apiFetch(`api/admin/dashboard?cohort_id=${cohortId}&include_test=${includeTest}`);
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

    // Show loading state while charts are being rendered
    shell.innerHTML = `
        <section class="headline-strip" aria-label="Cohort summary">
            <div class="headline-card">
                <p class="headline-label">Total attendees</p>
                <p class="headline-value">${data.headline.attendees_total}</p>
            </div>
            <div class="headline-card">
                <div class="headline-content">
                    <p class="headline-label">Accepted attendees</p>
                    <p class="headline-value">${data.headline.attendees_accepted}</p>
                </div>
                <button class="view-details-btn" onclick="showAcceptedAttendeesDetails()">View Details</button>
            </div>
        </section>
        <section class="chart-grid" aria-label="Progress charts">
            <div class="chart-loading">Loading charts...</div>
        </section>
    `;

    // Use setTimeout to allow DOM to update before rendering charts
    setTimeout(() => {
        try {
            renderCharts(data);
        } catch (error) {
            console.error('Failed to render charts:', error);
            renderProgressError('Failed to render dashboard charts.');
        }
    }, 10);
}

function renderCharts(data) {
    const shell = document.getElementById('progress-content');
    if (!shell) return;

    shell.innerHTML = `
        <section class="headline-strip" aria-label="Cohort summary">
            <div class="headline-card">
                <p class="headline-label">Total attendees</p>
                <p class="headline-value">${data.headline.attendees_total}</p>
            </div>
            <div class="headline-card">
                <div class="headline-content">
                    <p class="headline-label">Accepted attendees</p>
                    <p class="headline-value">${data.headline.attendees_accepted}</p>
                </div>
                <button class="view-details-btn" onclick="showAcceptedAttendeesDetails()">View Details</button>
            </div>
        </section>

        <div class="chart-tabs">
            <div class="chart-tab-buttons">
                <button class="chart-tab-btn active" data-chart-tab="intro">Introduction</button>
                <button class="chart-tab-btn" data-chart-tab="onboarding">Onboarding</button>
                <button class="chart-tab-btn" data-chart-tab="surveys">Surveys</button>
            </div>

            <div class="chart-tab-content active" id="intro-chart-tab">
                <section class="chart-grid" aria-label="Introduction charts">
                    <article class="chart-card" aria-label="Introductions completion">
                        <header>
                            <h3>Introduction Questions</h3>
                            <p>${formatCompletionSummary(data.intro.questions)}</p>
                        </header>
                        <div id="intro-completion-chart" class="simple-chart-container"></div>
                    </article>
                    <article class="chart-card" aria-label="Truth prompt completion">
                        <header>
                            <h3>Two Truths & One Lie</h3>
                            <p>${formatTruthSummary(data.intro.questions)}</p>
                        </header>
                        <div id="truth-summary-chart" class="simple-chart-container"></div>
                    </article>
                </section>
            </div>

            <div class="chart-tab-content" id="onboarding-chart-tab">
                <section class="chart-grid" aria-label="Onboarding charts">
                    <article class="chart-card" aria-label="Onboarding checklist">
                        <header>
                            <h3>Onboarding Checklist</h3>
                            <p>${formatCompletionSummary(data.onboarding)}</p>
                        </header>
                        <div id="onboarding-step-chart" class="simple-chart-container"></div>
                    </article>
                </section>
            </div>

            <div class="chart-tab-content" id="surveys-chart-tab">
                <section class="chart-grid" aria-label="Survey charts">
                    <article class="chart-card" aria-label="Survey submissions">
                        <header>
                            <h3>Survey Submissions</h3>
                            <p>${formatSurveySummary(data.surveys)}</p>
                        </header>
                        <div id="survey-completion-chart" class="simple-chart-container"></div>
                    </article>
                </section>
            </div>
        </div>
    `;

    // Attach chart tab event listeners
    attachChartTabListeners();

    // Render charts for each tab
    renderIntroCharts(data.intro);
    renderOnboardingChart(data.onboarding);
    renderSurveyChart(data.surveys);
}

function attachChartTabListeners() {
    const tabButtons = document.querySelectorAll('.chart-tab-btn');
    const tabContents = document.querySelectorAll('.chart-tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-chart-tab');

            // Update active button
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update active content
            tabContents.forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}-chart-tab`)?.classList.add('active');
        });
    });
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

    const allQuestions = intro.questions || [];

    // Include device_pref and tshirt_size choice questions in the main list
    const choiceQuestions = [];
    if (intro.device_pref) {
        choiceQuestions.push(intro.device_pref);
    }
    if (intro.tshirt_size) {
        choiceQuestions.push(intro.tshirt_size);
    }

    // Combine all questions, then separate truth questions from other intro questions
    const combinedQuestions = [...allQuestions, ...choiceQuestions];
    const truthQuestions = combinedQuestions.filter(q => q.code && q.code.startsWith('truth_'));
    const otherIntroQuestions = combinedQuestions.filter(q => !q.code || !q.code.startsWith('truth_'));

    // Render main introduction completion chart (excluding truth questions)
    renderSimpleProgressChart('intro-completion-chart', otherIntroQuestions, 'intro');

    // Render consolidated Two Truths & One Lie summary
    if (truthQuestions.length > 0) {
        // Create a summary item for all truth questions combined
        const totalCompleted = truthQuestions.reduce((sum, q) => sum + (q.completed || 0), 0);
        const totalTotal = truthQuestions.reduce((sum, q) => sum + (q.total || 0), 0);
        const summaryItem = {
            code: 'truth_summary',
            label: 'Two Truths & One Lie (All Prompts)',
            completed: totalCompleted,
            total: totalTotal
        };
        renderSimpleProgressChart('truth-summary-chart', [summaryItem], 'intro');
    } else {
        const container = document.getElementById('truth-summary-chart');
        if (container) container.innerHTML = '<p>No truth prompts configured.</p>';
    }
}

// Simple choice breakdown renderer for device preferences and t-shirt sizes
function renderChoiceBreakdown(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container || !data || !Array.isArray(data.breakdown) || !data.breakdown.length) {
        if (container) container.innerHTML = '<p>No responses yet.</p>';
        return;
    }

    const total = data.total || data.breakdown.reduce((sum, item) => sum + (item.count || 0), 0);
    const html = data.breakdown.map(item => {
        const count = item.count || 0;
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        const label = item.label || item.value || 'Unknown';

        return `
            <div class="choice-item">
                <div class="choice-label">${label}</div>
                <div class="choice-bar-container">
                    <div class="choice-bar-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="choice-stats">${count} (${percentage}%)</div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
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
                    ticks: {
                        precision: 0,
                        callback: function(value) {
                            return Number.isInteger(value) ? value : '';
                        }
                    }
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
    renderSimpleProgressChart('onboarding-step-chart', items);
}

function renderSurveyChart(items) {
    const container = document.getElementById('survey-completion-chart');
    if (!container || !Array.isArray(items) || !items.length) {
        if (container) container.innerHTML = '';
        return;
    }

    const html = items.map(item => {
        const completed = item.completed || 0;
        const expected = item.expected || 1;
        const percentage = expected > 0 ? Math.round((completed / expected) * 100) : 0;
        const name = item.name || 'Unknown Survey';

        return `
            <div class="progress-item">
                <div class="progress-label">${name}</div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="progress-stats">${completed}/${expected} (${percentage}%)</div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
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





async function loadLocations() {
    try {
        const response = await apiFetch('api/admin/locations');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const data = await response.json();
        const select = document.getElementById('location-select');
        if (!select) return;

        select.innerHTML = '<option value="">Select Location</option>';
        (data.locations || []).forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load locations', error);
    }
}

// Game-related functions
let currentCohort = '';

async function updateGameProgress() {
    const cohortSelect = document.getElementById('cohort-select');
    const gameProgress = document.getElementById('game-progress');
    if (!cohortSelect || !gameProgress) return;

    const cohortId = cohortSelect.value;
    if (cohortId) {
        gameProgress.style.display = 'inline';
        try {
            const response = await apiFetch(`api/admin/game/progress?cohort_id=${cohortId}`);
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
    const cohortSelect = document.getElementById('cohort-select');
    const gameDisplay = document.getElementById('game-display');
    if (!cohortSelect || !gameDisplay) return;

    const cohortId = cohortSelect.value;
    if (!cohortId) {
        gameDisplay.innerHTML = '<p>Please select a cohort first.</p>';
        return;
    }

    currentCohort = cohortId;
    await loadNextAttendee();
}

async function resetGame() {
    const cohortSelect = document.getElementById('cohort-select');
    const gameDisplay = document.getElementById('game-display');
    if (!cohortSelect) return;

    const cohortId = cohortSelect.value;
    if (!cohortId) {
        alert('Please select a cohort first.');
        return;
    }

    if (!confirm(`Are you sure you want to reset the 2 Truths and a Lie game for all attendees in this cohort? This will set all attendees back to unplayed status.`)) {
        return;
    }

    try {
        const response = await apiFetch(`api/admin/game/reset?cohort_id=${cohortId}`, {
            method: 'PUT'
        });
        if (response.ok) {
            const data = await response.json();
            alert(data.message);
            if (gameDisplay) gameDisplay.innerHTML = '<p>Game reset for cohort. You can now start a new game.</p>';
            currentCohort = cohortId;
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
        const response = await apiFetch(`api/admin/game/next?cohort_id=${currentCohort}`);
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

    // Format profile image
    const imagePath = attendee.profile_image;
    let avatarHtml;
    if (imagePath) {
        avatarHtml = `<img id="profile-img" src="${normalizeDocumentRelativePath(imagePath)}" alt="Profile Photo" style="width: 120px; height: 120px; border-radius: 8px; object-fit: cover;">`;
    } else {
        avatarHtml = `<img id="profile-img" src="static/images/default-avatar.svg" alt="Profile Photo" style="width: 120px; height: 120px; border-radius: 8px; object-fit: cover;">`;
    }

    // Format attendee info (hide cohort/room/date details for game)
    const infoLines = [
        `<strong>Role:</strong> ${attendee.title || 'Pending'}`,
        `<strong>Manager:</strong> ${attendee.manager || 'Pending'}`,
    ];

    const locationDetailsHtml = `<div class="cohort-meta">${infoLines.map(line => `<p>${line}</p>`).join('')}</div>`;

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
        <div class="attendee-portal card" style="margin: 20px 0;">
            <div class="attendee-profile" style="display: flex; gap: 30px; align-items: flex-start;">
                <div class="profile-image">
                    ${avatarHtml}
                </div>
                <div class="profile-info" style="flex: 1;">
                    <h1 style="margin: 0; font-size: 1.8rem; color: #333;">${attendee.full_name}</h1>
                    <p style="margin: 5px 0; color: #666; font-size: 1.1rem;">${attendee.email}</p>
                    ${locationDetailsHtml}
                </div>
            </div>

            <div class="intro-section" style="margin-top: 30px;">
                <div class="section-header">
                    <div>
                        <h2>Introduction</h2>
                        <p class="section-subtext">Get to know this attendee</p>
                    </div>
                </div>
                <div class="intro-panel" style="background: #f8f9fa; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 10px;">
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
                const putResponse = await apiFetch(`api/admin/game/play/${attendeeId}`, {
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
                const response = await apiFetch(`api/admin/game/reveal/${attendeeId}?lie_number=${lieNumber}`, {
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

function formatDateRange(start, end, startTime, endTime) {
    if (!start) {
        return null;
    }
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : null;
    const startText = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    if (endDate) {
        const endText = endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const year = startDate.getFullYear();
        const dateRange = `${startText} – ${endText} ${year}`;
        const timeRange = formatTimeRange(startTime, endTime);
        return timeRange ? `${dateRange} · ${timeRange}` : dateRange;
    }
    const singleDate = startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const timeRange = formatTimeRange(startTime, endTime);
    return timeRange ? `${singleDate} · ${timeRange}` : singleDate;
}

function formatTimeRange(startTime, endTime) {
    const startText = formatTime(startTime);
    const endText = formatTime(endTime);

    if (startText && endText) {
        return `${startText} – ${endText}`;
    }
    return startText || endText || null;
}

function formatTime(value) {
    if (!value) {
        return null;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    // Fallback: return raw string if not a valid date (e.g., "9:00 AM")
    return value;
}

function handleGameCohortChange() {
    const cohortSelect = document.getElementById('cohort-select');
    if (cohortSelect) {
        remember('adminGameCohort', cohortSelect.value);
        updateGameProgress();
    }
}

function runQuery() {
    const queryInput = document.getElementById('query-input');
    const queryResults = document.getElementById('query-results');
    const queryButton = document.getElementById('query-btn');

    if (!queryInput || !queryResults) return;

    const query = queryInput.value.trim();
    if (!query) {
        alert('Please enter a query.');
        return;
    }

    queryResults.innerHTML = '<div class="query-loading">Running query...</div>';
    if (queryButton) {
        queryButton.disabled = true;
        queryButton.textContent = 'Running...';
    }

    apiFetch('api/admin/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    })
        .then(async response => {
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload.detail || 'Query failed');
            }
            renderQueryResults(payload, queryResults);
        })
        .catch(error => {
            queryResults.innerHTML = `<div class="query-error">${error.message}</div>`;
        })
        .finally(() => {
            if (queryButton) {
                queryButton.disabled = false;
                queryButton.textContent = 'Run Query';
            }
        });
}

function renderQueryResults(payload, container) {
    if (!container) return;

    const summary = payload.summary || 'Query complete.';
    const sql = payload.sql || '';
    const columns = Array.isArray(payload.columns) ? payload.columns : [];
    const rows = Array.isArray(payload.results) ? payload.results : [];

    const headerHtml = `
        <div class="query-summary">
            <div class="query-summary-title">${summary}</div>
            <div class="query-summary-meta">Rows: ${rows.length}</div>
        </div>
    `;

    const sqlHtml = sql
        ? `
            <div class="query-block">
                <div class="query-block-title">Generated SQL</div>
                <pre class="query-sql"><code>${escapeHtml(formatSql(sql))}</code></pre>
            </div>
        `
        : '';

    const tableHtml = rows.length
        ? buildQueryTable(columns, rows)
        : '<div class="query-empty">No results returned.</div>';

    container.innerHTML = headerHtml + sqlHtml + tableHtml;
}

function formatSql(sql) {
    if (!sql) return '';
    const normalized = String(sql).trim();
    if (!normalized) return '';
    if (normalized.includes('\n')) return normalized;

    const tokens = [
        'SELECT',
        'FROM',
        'WHERE',
        'GROUP BY',
        'HAVING',
        'ORDER BY',
        'LIMIT',
        'OFFSET',
        'UNION',
        'UNION ALL',
        'LEFT JOIN',
        'RIGHT JOIN',
        'INNER JOIN',
        'OUTER JOIN',
        'FULL JOIN',
        'JOIN',
        'ON',
        'AND',
        'OR',
    ];

    let formatted = normalized;
    tokens.forEach(token => {
        const escaped = token.replace(/\s+/g, '\\s+');
        const pattern = new RegExp(`\\s+(${escaped})\\s+`, 'gi');
        formatted = formatted.replace(pattern, `\n$1 `);
    });

    return formatted
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join('\n');
}

function buildQueryTable(columns, rows) {
    let columnList = columns;
    if (!columnList.length && rows.length) {
        columnList = Object.keys(rows[0]);
    }

    const headerCells = columnList.map(col => `<th>${escapeHtml(col)}</th>`).join('');
    const bodyRows = rows
        .map(row => {
            const cells = columnList.map(col => `<td>${escapeHtml(row[col])}</td>`).join('');
            return `<tr>${cells}</tr>`;
        })
        .join('');

    return `
        <div class="query-table-wrapper">
            <table class="query-table">
                <thead><tr>${headerCells}</tr></thead>
                <tbody>${bodyRows}</tbody>
            </table>
        </div>
    `;
}

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Progress Details Modal Functions
function initProgressDetailsModal() {
    const modal = document.getElementById('progress-modal');
    const closeBtn = document.getElementById('modal-close');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeProgressModal);
    }

    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeProgressModal();
            }
        });
    }

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && modal.style.display === 'block') {
            closeProgressModal();
        }
    });
}

function openProgressModal(title) {
    const modal = document.getElementById('progress-modal');
    const modalTitle = document.getElementById('modal-title');

    if (modal && modalTitle) {
        modalTitle.textContent = title;
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
}

function closeProgressModal() {
    const modal = document.getElementById('progress-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = ''; // Restore scrolling
    }
}

async function showProgressDetails(questionType, questionId, questionTitle) {
    const cohortId = document.getElementById('progress-cohort-select')?.value;
    const includeTest = document.getElementById('include-test-toggle')?.checked || false;

    if (!cohortId) {
        alert('Please select a cohort first.');
        return;
    }

    try {
        let apiUrl = '';
        if (questionType === 'intro') {
            apiUrl = `api/admin/progress/intro/${questionId}/details?cohort_id=${cohortId}&include_test=${includeTest}`;
        } else if (questionType === 'onboarding') {
            apiUrl = `api/admin/progress/onboarding/${questionId}/details?cohort_id=${cohortId}&include_test=${includeTest}`;
        } else if (questionType === 'survey') {
            apiUrl = `api/admin/progress/survey/${questionId}/details?cohort_id=${cohortId}&include_test=${includeTest}`;
        }

        const response = await apiFetch(apiUrl);
        if (!response.ok) {
            throw new Error('Failed to load participant details');
        }

        const data = await response.json();
        renderProgressModal(data, questionTitle);
        openProgressModal(questionTitle);

    } catch (error) {
        console.error('Error loading progress details:', error);
        alert('Failed to load participant details. Please try again.');
    }
}

async function showAcceptedAttendeesDetails() {
    const cohortId = document.getElementById('progress-cohort-select')?.value;
    const includeTest = document.getElementById('include-test-toggle')?.checked || false;

    if (!cohortId) {
        alert('Please select a cohort first.');
        return;
    }

    try {
        const apiUrl = `api/admin/progress/attendees/accepted?cohort_id=${cohortId}&include_test=${includeTest}`;

        const response = await apiFetch(apiUrl);
        if (!response.ok) {
            throw new Error('Failed to load participant details');
        }

        const data = await response.json();
        renderProgressModal(data, 'Accepted Attendees');
        openProgressModal('Accepted Attendees');

    } catch (error) {
        console.error('Error loading accepted attendees details:', error);
        alert('Failed to load participant details. Please try again.');
    }
}

function renderProgressModal(data, questionTitle) {
    const modalTabs = document.getElementById('modal-tabs');
    const modalContent = document.getElementById('modal-tab-content');

    if (!modalTabs || !modalContent || !data.tabs) return;

    // Render tabs
    const tabsHtml = data.tabs.map((tab, index) => `
        <button class="modal-tab-btn ${index === 0 ? 'active' : ''}" data-tab-index="${index}">
            ${tab.label} (${tab.participants.length})
        </button>
    `).join('');

    modalTabs.innerHTML = tabsHtml;

    // Render initial tab content
    if (data.tabs.length > 0) {
        renderModalTabContent(data.tabs[0]);
    }

    // Add tab click handlers
    modalTabs.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabIndex = parseInt(e.target.dataset.tabIndex);

            // Update active tab button
            modalTabs.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Render tab content
            renderModalTabContent(data.tabs[tabIndex]);
        });
    });
}

function renderModalTabContent(tab) {
    const modalContent = document.getElementById('modal-tab-content');

    if (!modalContent || !tab.participants) return;

    if (tab.participants.length === 0) {
        modalContent.innerHTML = '<div class="no-participants">No participants in this category.</div>';
        return;
    }

    const participantsHtml = tab.participants.map((participant, index) => `
        <div class="participant-item">
            <div class="participant-name">${index + 1}. ${participant.name}</div>
            <div class="participant-email">${participant.email}</div>
        </div>
    `).join('');

    const emails = tab.participants.map(p => p.email).join(', ');

    modalContent.innerHTML = `
        <div class="participant-list">
            ${participantsHtml}
        </div>
        <button class="copy-emails-btn" onclick="copyEmailsToClipboard('${emails.replace(/'/g, "\\'")}')">
            Copy All Email Addresses
        </button>
    `;
}

function copyEmailsToClipboard(emails) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(emails).then(() => {
            showCopyFeedback();
        }).catch(() => {
            fallbackCopyEmails(emails);
        });
    } else {
        fallbackCopyEmails(emails);
    }
}

function fallbackCopyEmails(emails) {
    const textArea = document.createElement('textarea');
    textArea.value = emails;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        document.execCommand('copy');
        showCopyFeedback();
    } catch (err) {
        console.error('Fallback copy failed:', err);
        alert('Failed to copy emails. Please copy manually: ' + emails);
    }

    document.body.removeChild(textArea);
}

function showCopyFeedback() {
    // Create a temporary feedback element
    const feedback = document.createElement('div');
    feedback.textContent = 'Emails copied to clipboard!';
    feedback.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--rw-success);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        z-index: 1001;
        font-weight: 500;
    `;

    document.body.appendChild(feedback);

    setTimeout(() => {
        if (feedback.parentNode) {
            feedback.parentNode.removeChild(feedback);
        }
    }, 2000);
}

// Updated renderSimpleProgressChart to include "View Details" buttons
function renderSimpleProgressChart(containerId, items, questionType) {
    const container = document.getElementById(containerId);
    if (!container || !Array.isArray(items) || !items.length) {
        if (container) container.innerHTML = '';
        return;
    }

    const html = items.map((item, index) => {
        // Check if this is a choice question with breakdown data
        if (item.breakdown && Array.isArray(item.breakdown) && item.breakdown.length > 0) {
            // Calculate total responses
            const totalResponses = item.breakdown.reduce((sum, c) => sum + (c.count || 0), 0);

            // Render choice breakdown
            const choiceHtml = item.breakdown.map(choice => {
                const count = choice.count || 0;
                const total = item.completed || item.breakdown.reduce((sum, c) => sum + (c.count || 0), 0);
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                const label = choice.label || choice.value || 'Unknown';

                return `
                    <div class="choice-breakdown-item">
                        <div class="choice-breakdown-label">${label}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                        <div class="progress-stats">${count}/${total} (${percentage}%)</div>
                    </div>
                `;
            }).join('');

            return `
                <div class="progress-item-container">
                    <div class="progress-item choice-question">
                        <div class="progress-label">${index + 1}. ${item.label || item.code || 'Unknown'}</div>
                        <div class="choice-total-summary">${totalResponses} of ${item.total || totalResponses}</div>
                        <div class="choice-breakdown-container">
                            ${choiceHtml}
                        </div>
                    </div>
                    <button class="view-details-btn" onclick="showProgressDetails('${questionType}', '${item.code}', '${item.label || item.code || 'Question'}')">
                        View Details
                    </button>
                </div>
            `;
        } else {
            // Render simple progress bar for text questions
            const completed = item.completed || 0;
            const total = item.total || 1;
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
            const label = item.label || item.code || 'Unknown';

            return `
                <div class="progress-item-container">
                    <div class="progress-item">
                        <div class="progress-label">${index + 1}. ${label}</div>
                        <div class="total-summary">${completed} of ${total}</div>
                        <div class="progress-bar-container">
                            <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                        <div class="progress-stats">${completed}/${total} (${percentage}%)</div>
                    </div>
                    <button class="view-details-btn" onclick="showProgressDetails('${questionType}', '${item.code}', '${label}')">
                        View Details
                    </button>
                </div>
            `;
        }
    }).join('');

    container.innerHTML = html;
}

// Updated renderOnboardingChart to include buttons
function renderOnboardingChart(items) {
    renderSimpleProgressChart('onboarding-step-chart', items, 'onboarding');
}

// Updated renderSurveyChart to include buttons
function renderSurveyChart(items) {
    const container = document.getElementById('survey-completion-chart');
    if (!container || !Array.isArray(items) || !items.length) {
        if (container) container.innerHTML = '';
        return;
    }

    const html = items.map((item, index) => {
        const completed = item.completed || 0;
        const expected = item.expected || 1;
        const percentage = expected > 0 ? Math.round((completed / expected) * 100) : 0;
        const name = item.name || 'Unknown Survey';

        return `
            <div class="progress-item-container">
                <div class="progress-item">
                    <div class="progress-label">${index + 1}. ${name}</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="progress-stats">${completed}/${expected} (${percentage}%)</div>
                </div>
                <button class="view-details-btn" onclick="showProgressDetails('survey', '${item.template_id}', '${name}')">
                    View Details
                </button>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Add CSS for view details button
const style = document.createElement('style');
style.textContent = `
    .view-details-btn {
        margin-top: 8px;
        padding: 4px 12px;
        background: var(--rw-accent);
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
        font-weight: 500;
        transition: background 0.2s ease;
    }
    .view-details-btn:hover {
        background: var(--rw-accent-dark);
    }
`;
document.head.appendChild(style);

// Initialize modal when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initProgressDetailsModal();
});

// Ensure charts cleanup on unload
window.addEventListener('beforeunload', () => {
    chartRegistry.forEach((chart, id) => {
        if (chart) chart.destroy();
        chartRegistry.delete(id);
    });
});
