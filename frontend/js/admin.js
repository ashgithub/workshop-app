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
        const response = await apiFetch('/api/cohorts/');
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
        const response = await apiFetch('/api/cohorts/');
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

    // Show loading state while charts are being rendered
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
                <p class="headline-label">Accepted attendees</p>
                <p class="headline-value">${data.headline.attendees_accepted}</p>
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
    renderSimpleProgressChart('intro-completion-chart', otherIntroQuestions);

    // Render consolidated Two Truths & One Lie summary
    if (truthQuestions.length > 0) {
        // Create a summary item for all truth questions combined
        const totalCompleted = truthQuestions.reduce((sum, q) => sum + (q.completed || 0), 0);
        const totalTotal = truthQuestions.reduce((sum, q) => sum + (q.total || 0), 0);
        const summaryItem = {
            label: 'Two Truths & One Lie (All Prompts)',
            completed: totalCompleted,
            total: totalTotal
        };
        renderSimpleProgressChart('truth-summary-chart', [summaryItem]);
    } else {
        const container = document.getElementById('truth-summary-chart');
        if (container) container.innerHTML = '<p>No truth prompts configured.</p>';
    }
}

// Simple progress chart renderer - no Chart.js dependency
function renderSimpleProgressChart(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container || !Array.isArray(items) || !items.length) {
        if (container) container.innerHTML = '';
        return;
    }

    const html = items.map(item => {
        // Check if this is a choice question with breakdown data
        if (item.breakdown && Array.isArray(item.breakdown) && item.breakdown.length > 0) {
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
                <div class="progress-item choice-question">
                    <div class="progress-label">${item.label || item.code || 'Unknown'}</div>
                    <div class="choice-breakdown-container">
                        ${choiceHtml}
                    </div>
                </div>
            `;
        } else {
            // Render simple progress bar for text questions
            const completed = item.completed || 0;
            const total = item.total || 1;
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
            const label = item.label || item.code || 'Unknown';

            return `
                <div class="progress-item">
                    <div class="progress-label">${label}</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <div class="progress-stats">${completed}/${total} (${percentage}%)</div>
                </div>
            `;
        }
    }).join('');

    container.innerHTML = html;
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
        const response = await apiFetch('/api/admin/locations');
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

// Game and query functions (placeholders)
function startGame() {
    const cohortSelect = document.getElementById('cohort-select');
    if (!cohortSelect || !cohortSelect.value) {
        alert('Please select a cohort first.');
        return;
    }
    alert('Game functionality is not currently implemented.');
}

function resetGame() {
    const cohortSelect = document.getElementById('cohort-select');
    if (!cohortSelect || !cohortSelect.value) {
        alert('Please select a cohort first.');
        return;
    }
    alert('Game reset functionality is not currently implemented.');
}

function handleGameCohortChange() {
    const cohortSelect = document.getElementById('cohort-select');
    if (cohortSelect) {
        remember('adminGameCohort', cohortSelect.value);
        updateGameProgress();
    }
}

function updateGameProgress() {
    // Update game progress display when cohort changes
    const cohortSelect = document.getElementById('cohort-select');
    const gameProgress = document.getElementById('game-progress');
    if (gameProgress) {
        gameProgress.style.display = cohortSelect && cohortSelect.value ? 'inline' : 'none';
    }
}

function runQuery() {
    const queryInput = document.getElementById('query-input');
    const queryResults = document.getElementById('query-results');

    if (!queryInput || !queryResults) return;

    const query = queryInput.value.trim();
    if (!query) {
        alert('Please enter a query.');
        return;
    }

    queryResults.innerHTML = '<p>Running query...</p>';

    // Placeholder - NL SQL functionality is disabled
    setTimeout(() => {
        queryResults.innerHTML = '<p>Natural language SQL queries are currently disabled.</p>';
    }, 1000);
}

// Ensure charts cleanup on unload
window.addEventListener('beforeunload', () => {
    chartRegistry.forEach((chart, id) => {
        if (chart) chart.destroy();
        chartRegistry.delete(id);
    });
});
