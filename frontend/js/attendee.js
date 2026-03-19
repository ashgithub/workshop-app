/**
 * Attendee portal powered by the rebuilt Oracle APIs.
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

function handleAvatarFallback(img) {
    if (!img || img.dataset.fallbackApplied === 'true') {
        return;
    }
    img.dataset.fallbackApplied = 'true';
    img.src = 'static/images/default-avatar.svg';
}

function getAttendeeId() {
    const userId = localStorage.getItem('user_id');
    if (!userId || !userId.startsWith('ATTENDEE_')) {
        return null;
    }
    return Number(userId.replace('ATTENDEE_', ''));
}

function showMessage(text, type = 'success') {
    const messageDiv = document.getElementById('global-message');
    if (!messageDiv) {
        return;
    }
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
    if (type === 'success') {
        setTimeout(() => (messageDiv.style.display = 'none'), 3500);
    }
}

function hideMessage() {
    const messageDiv = document.getElementById('global-message');
    if (messageDiv) {
        messageDiv.style.display = 'none';
    }
}

function setButtonLoading(button, loadingText) {
    if (!button) return null;
    if (button.dataset.loading === 'true') return null;

    const originalText = button.textContent;
    button.dataset.loading = 'true';
    button.dataset.originalText = originalText;
    button.disabled = true;
    button.classList.add('loading');
    button.textContent = loadingText;

    return () => {
        button.disabled = false;
        button.classList.remove('loading');
        button.textContent = button.dataset.originalText || originalText;
        delete button.dataset.loading;
        delete button.dataset.originalText;
    };
}

function setFieldSavingState(container, saving) {
    const status = container?.querySelector('.field-status');
    if (!status) return;

    if (saving) {
        if (!status.dataset.originalHtml) {
            status.dataset.originalHtml = status.innerHTML;
            status.dataset.originalClass = status.className;
        }
        status.className = 'field-status pending saving';
        status.innerHTML = '<span class="status-icon">…</span>Saving...';
        return;
    }

    if (status.dataset.originalHtml) {
        status.innerHTML = status.dataset.originalHtml;
        status.className = status.dataset.originalClass || 'field-status';
        delete status.dataset.originalHtml;
        delete status.dataset.originalClass;
    }
}

function showAgenda(imagePath) {
    const modal = document.getElementById('agenda-modal');
    const modalImg = document.getElementById('modal-img');
    if (!modal || !modalImg) return;
    modalImg.src = normalizeDocumentRelativePath(imagePath);
    modal.style.display = 'block';
}

function closeAgendaModal() {
    const modal = document.getElementById('agenda-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function closeAttendanceModal() {
    const modal = document.getElementById('attendance-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function renderPageSections(pageSections) {
    // Update intro section
    if (pageSections.intro) {
        const introTitle = document.querySelector('#intro-tab h2');
        const introDesc = document.querySelector('#intro-tab .section-subtext');
        if (introTitle) introTitle.textContent = pageSections.intro.title || 'Meet Your Cohort';
        if (introDesc) introDesc.innerHTML = renderDescriptionWithLink(pageSections.intro);
    }

    // Update tasks section
    if (pageSections.tasks) {
        const tasksTitle = document.querySelector('#tasks-tab h2');
        const tasksDesc = document.querySelector('#tasks-tab .section-subtext');
        if (tasksTitle) tasksTitle.textContent = pageSections.tasks.title || 'Pre-Workshop Checklist';
        if (tasksDesc) tasksDesc.innerHTML = renderDescriptionWithLink(pageSections.tasks);
    }

    // Update surveys section
    if (pageSections.surveys) {
        const surveysTitle = document.querySelector('#surveys-tab h2');
        const surveysDesc = document.querySelector('#surveys-tab .section-subtext');
        if (surveysTitle) surveysTitle.textContent = pageSections.surveys.title || 'Surveys';
        if (surveysDesc) surveysDesc.innerHTML = renderDescriptionWithLink(pageSections.surveys);
    }
}

function renderDescriptionWithLink(section) {
    const description = section.description || '';
    const linkText = section.link_text;
    const linkUrl = section.link_url;

    if (linkText && linkUrl) {
        return `${description} see <a href="${linkUrl}" target="_blank">[${linkText}]</a> for details`;
    }
    return description;
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadRuntimeConfig();
    const attendeeId = getAttendeeId();
    if (!attendeeId) {
        showMessage('Session expired. Please login again.', 'error');
        return;
    }

    loadAttendee(attendeeId);

    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        closeBtn.onclick = closeAgendaModal;
    }

    window.addEventListener('click', event => {
        const modal = document.getElementById('agenda-modal');
        if (event.target === modal) {
            closeAgendaModal();
        }
    });



    const attendanceCloseBtn = document.querySelector('#attendance-modal .close');
    if (attendanceCloseBtn) {
        attendanceCloseBtn.onclick = closeAttendanceModal;
    }

    window.addEventListener('click', event => {
        const modal = document.getElementById('attendance-modal');
        if (event.target === modal) {
            closeAttendanceModal();
        }
    });

    const confirmSubmitBtn = document.getElementById('confirm-attendance-submit');
    if (confirmSubmitBtn) {
        confirmSubmitBtn.addEventListener('click', async () => {
            const attendeeId = getAttendeeId();
            if (!attendeeId) return;
            const restoreButton = setButtonLoading(confirmSubmitBtn, 'Confirming...');
            try {
                const response = await apiFetch(`api/attendees/${attendeeId}/ack`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ acknowledged: true }),
                });
                if (!response.ok) {
                    throw new Error(await response.text());
                }
                showSuccess('Participation confirmed!');
                closeAttendanceModal();
                loadAttendee(attendeeId);
            } catch (error) {
                console.error('Failed to confirm attendance', error);
                showMessage('Unable to confirm attendance. Please retry.', 'error');
            } finally {
                restoreButton?.();
            }
        });
    }
});

async function loadAttendee(attendeeId) {
    try {
        hideMessage();
        const response = await apiFetch(`api/attendees/${attendeeId}`);
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const attendee = await response.json();

        // Load page sections configuration
        const sectionsResponse = await apiFetch('api/page-sections');
        const pageSections = sectionsResponse.ok ? await sectionsResponse.json() : {};

        renderProfile(attendee);
        renderProgress(attendee.progress || {}, pageSections);
        renderPageSections(pageSections);
        // Don't load sections initially - wait for navigation (surveys load when tab opened)
    } catch (error) {
        console.error('Failed to load attendee', error);
        showMessage('Unable to load your workshop companion dashboard. Please try again.', 'error');
    }
}

function navigateToSection(section) {
    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));

    // Show the selected section
    const targetTab = document.getElementById(`${section}-tab`);
    if (targetTab) {
        targetTab.classList.add('active');
    }

    // Load data if needed (same as original tabs)
    const attendeeId = getAttendeeId();
    if (!attendeeId) return;

    switch (section) {
        case 'tasks':
            loadOnboarding(attendeeId);
            break;
        case 'surveys':
            loadSurveys(attendeeId);
            break;
        case 'intro':
            // Load attendee data and render introductions
            apiFetch(`api/attendees/${attendeeId}`)
                .then(res => res.json())
                .then(attendee => {
                    const progress = attendee.progress || {};
                    renderIntroductions(attendee.intros || [], progress, attendee.acknowledged || false);
                });
            break;
    }
}

function renderProfile(attendee) {
    const nameEl = document.getElementById('attendee-name');
    const emailEl = document.getElementById('attendee-email');
    const titleEl = document.getElementById('attendee-title');
    const managerEl = document.getElementById('attendee-manager');
    const locationEl = document.getElementById('location-details');
    const avatarEl = document.getElementById('profile-img');
    const confirmationEl = document.getElementById('attendance-confirmation');

    nameEl.textContent = attendee.full_name || 'AI Workshop Companion';
    emailEl.textContent = attendee.email;

    if (titleEl) {
        titleEl.textContent = attendee.title ? `Role: ${attendee.title}` : 'Role: Pending';
        titleEl.style.display = attendee.title ? 'inline-flex' : 'none';
    }

    if (managerEl) {
        managerEl.textContent = attendee.manager ? `Manager: ${attendee.manager}` : 'Manager: Pending';
        managerEl.style.display = attendee.manager ? 'inline-flex' : 'none';
    }

    if (locationEl) {
        const cohort = attendee.cohort || {};
        const dateRange = cohort.start_date
            ? formatDateRange(cohort.start_date, cohort.end_date, cohort.start_time, cohort.end_time)
            : null;

        const infoLines = [
            `<strong>Role:</strong> ${attendee.title || 'Pending'}`,
            `<strong>Manager:</strong> ${attendee.manager || 'Pending'}`,
        ];

        if (cohort.title) {
            infoLines.push(`<strong>Cohort:</strong> ${cohort.title}`);
        }
        if (cohort.room) {
            infoLines.push(`<strong>Room:</strong> ${cohort.room}`);
        }
        if (dateRange) {
            infoLines.push(`<strong>Dates:</strong> ${dateRange}`);
        }

        locationEl.innerHTML = `<div class="cohort-meta">${infoLines.map(line => `<p>${line}</p>`).join('')}</div>`;
    }

    if (avatarEl) {
        const imagePath = attendee.profile_image;
        if (imagePath) {
            avatarEl.src = normalizeDocumentRelativePath(imagePath);
        } else {
            avatarEl.src = 'static/images/default-avatar.svg';
        }
    }

    if (confirmationEl) {
        const acknowledged = attendee.acknowledged || false;
        if (acknowledged) {
            confirmationEl.innerHTML = '<p class="attendance-confirmed">✓ Participation Confirmed</p>';
        } else {
            confirmationEl.innerHTML = '<button class="btn-primary confirm-attendance-btn" id="confirm-attendance-btn">Confirm Attendance</button>';
            // Add event listener to the newly created button
            const confirmBtn = document.getElementById('confirm-attendance-btn');
            if (confirmBtn) {
                confirmBtn.addEventListener('click', () => {
                    const modal = document.getElementById('attendance-modal');
                    if (modal) {
                        modal.style.display = 'block';
                    }
                });
            }
        }
    }

    const viewAgendaBtn = document.getElementById('view-agenda-btn');
    const agendaPath = attendee?.cohort?.agenda_url;
    if (viewAgendaBtn) {
        if (agendaPath) {
            viewAgendaBtn.style.display = 'inline-flex';
            viewAgendaBtn.onclick = () => showAgenda(agendaPath);
        } else {
            viewAgendaBtn.style.display = 'none';
        }
    }

    const profileNote = document.getElementById('profile-info-note');
    if (profileNote) {
        profileNote.innerHTML = '<em>If anything above needs updating, drop a note in the Slack channel.</em>';
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

function renderProgress(progress, pageSections = {}) {
    const overall = progress.overall_progress || 0;
    const track = document.getElementById('overall-progress-fill');
    const label = document.getElementById('overall-progress-label');
    const progressBar = document.querySelector('.progress-track');

    if (track) {
        track.style.width = `${overall}%`;
    }
    if (label) {
        label.textContent = `${overall}%`;
    }
    if (progressBar) {
        progressBar.setAttribute('aria-valuenow', String(overall));
    }

    const metrics = document.getElementById('progress-metrics');
    if (!metrics) return;

    const sections = [
        {
            key: 'intro',
            label: pageSections.intro?.title || 'Introductions',
            summary: `${progress.intro_completed || 0} of ${progress.intro_total || 0} completed`,
            total: progress.intro_total || 0,
            completed: progress.intro_completed || 0,
        },
        {
            key: 'tasks',
            label: pageSections.tasks?.title || 'Onboarding checklist',
            summary: `${progress.tasks_completed || 0} of ${progress.tasks_total || 0} completed`,
            total: progress.tasks_total || 0,
            completed: progress.tasks_completed || 0,
        },
        {
            key: 'surveys',
            label: pageSections.surveys?.title || 'Surveys',
            summary: `${progress.surveys_completed || 0} of ${progress.surveys_total || 0} completed`,
            total: progress.surveys_total || 0,
            completed: progress.surveys_completed || 0,
        },
    ];

    metrics.innerHTML = sections
        .map(section => {
            const complete = section.total && section.completed >= section.total;
            const icon = complete ? '✅' : '🔄';
            const statusClass = complete ? 'metric-complete' : 'metric-pending';
            return `
                <div class="metric-row ${statusClass}" data-section="${section.key}">
                    <span class="metric-label">${icon} ${section.label}</span>
                    <span class="metric-value">${section.summary}</span>
                </div>
            `;
        })
        .join('');

    // Add click handlers for navigation
    metrics.querySelectorAll('.metric-row').forEach(row => {
        row.addEventListener('click', () => {
            const section = row.getAttribute('data-section');
            navigateToSection(section);
        });
    });

}

async function loadOnboarding(attendeeId) {
    try {
        const response = await apiFetch(`api/onboarding/attendees/${attendeeId}`);
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const onboarding = await response.json();
        renderOnboarding(attendeeId, onboarding);
    } catch (error) {
        console.error('Failed to load onboarding', error);
        renderOnboarding(attendeeId, []);
    }
}

function renderOnboarding(attendeeId, onboarding) {
    const container = document.getElementById('task-list');
    const pill = document.getElementById('onboarding-progress-pill');
    if (!container || !pill) return;
    if (!onboarding.length) {
        container.innerHTML = '<p>Onboarding checklist will appear here once available.</p>';
        return;
    }

    const completed = onboarding.filter(o => o.response && o.response.trim()).length;
    const total = onboarding.length;

    // Update progress pill
    pill.textContent = `${completed} of ${total} completed`;

    let html = `
        <div class="onboarding-fields">
    `;

    onboarding.forEach((item, index) => {
        const answered = item.response && item.response.trim().length > 0;
        const renderer = getOnboardingRenderer(item);
        const statusClass = answered ? 'complete' : 'pending';

        html += `
            <div class="field-group ${answered ? 'completed' : ''}" data-question-group="${item.question_id}">
                <div class="field-header">
                    <div class="field-title">${index + 1}. ${item.prompt}</div>
                    <div class="field-status ${statusClass}">
                        <span class="status-icon">${answered ? '✓' : '○'}</span>
                        ${answered ? 'Complete' : 'Pending'}
                    </div>
                </div>
                <div class="intro-input">
                    ${renderer(item, item.response || '')}
                </div>
            </div>
        `;
    });

    html += `<button class="btn-primary save-all-btn" id="save-all-onboarding">Save All Changes</button>`;
    html += `</div>`;

    container.innerHTML = html;

    // Individual Save Listeners
    container.querySelectorAll('[data-question]').forEach(input => {
        input.addEventListener('change', async (event) => {
            const questionId = Number(event.target.dataset.question);
            const question = onboarding.find(item => item.question_id === questionId);
            if (!question) return;
            const container = event.target.closest('.field-group');
            const response = getOnboardingInputValue(question, container);
            if (response === (question.response || '')) return;

            try {
                setFieldSavingState(container, true);
                const saveResponse = await apiFetch(`api/onboarding/attendees/${attendeeId}/${questionId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ response }),
                });
                if (!saveResponse.ok) {
                    throw new Error(await saveResponse.text());
                }
                showSuccess('Saved');
                loadAttendee(attendeeId);
            } catch (error) {
                console.error('Failed to save onboarding response', error);
                showMessage('Save failed. Please retry.', 'error');
            } finally {
                setFieldSavingState(container, false);
            }
        });
    });

    // Save All Button
    const saveAllBtn = document.getElementById('save-all-onboarding');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', async () => {
            const restoreButton = setButtonLoading(saveAllBtn, 'Saving...');
            let saveCount = 0;
            try {
                for (const question of onboarding) {
                    const container = document.querySelector(`[data-question-group="${question.question_id}"]`);
                    const response = container ? getOnboardingInputValue(question, container) : '';
                    if (response === (question.response || '')) continue;
                    try {
                        const saveResponse = await apiFetch(`api/onboarding/attendees/${attendeeId}/${question.question_id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ response }),
                        });
                        if (saveResponse.ok) {
                            saveCount++;
                        }
                    } catch (error) {
                        console.error('Save failed for', question.code, error);
                    }
                }
                if (saveCount > 0) {
                    showSuccess(`${saveCount} changes saved`);
                    loadAttendee(attendeeId);
                } else {
                    showMessage('No changes to save.', 'info');
                }
            } finally {
                restoreButton?.();
            }
        });
    }
}

async function loadSurveys(attendeeId) {
    try {
        const response = await apiFetch('api/surveys/templates');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const templates = await response.json();

        const surveyData = await Promise.all(
            templates.map(async template => {
                const [submission, questions] = await Promise.all([
                    fetchSurveySubmission(attendeeId, template.id),
                    fetchSurveyQuestions(template.id),
                ]);
                return { template, submission, questions };
            })
        );

        const isSubmissionComplete = submission => {
            if (!submission) return false;
            const responses = Array.isArray(submission.answers) ? submission.answers : [];
            const meaningful = responses.filter(answer => {
                if (!answer) return false;
                const raw = answer.response;
                if (raw === null || raw === undefined) return false;
                const normalized = typeof raw === 'string' ? raw.trim() : String(raw).trim();
                if (!normalized) return false;
                if (normalized === '0') return false;
                if (normalized.toLowerCase && normalized.toLowerCase() === 'null') return false;
                return true;
            });
            console.log('Survey completion check', { submission, meaningfulCount: meaningful.length, totalResponses: responses.length });
            return meaningful.length > 0;
        };

        const normalizedSurveyData = surveyData.map(item => {
            if (!item.submission) {
                return { ...item, submission: null };
            }
            const isComplete = isSubmissionComplete(item.submission);
            return {
                ...item,
                submission: { ...item.submission, isComplete },
            };
        });

        const completed = normalizedSurveyData.filter(item => item.submission?.isComplete).length;
        const total = templates.length;

        const pill = document.getElementById('surveys-progress-pill');
        if (pill) {
            pill.textContent = `${completed} of ${total} completed`;
        }

        renderSurveyTabs(normalizedSurveyData, attendeeId, submission => Boolean(submission?.isComplete) || isSubmissionComplete(submission));
    } catch (error) {
        console.error('Failed to load surveys', error);
        const container = document.getElementById('survey-tabs');
        if (container) {
            container.innerHTML = '<p>Surveys will appear here closer to the workshop.</p>';
        }
    }
}

async function fetchSurveySubmission(attendeeId, templateId) {
    try {
        const response = await apiFetch(`api/surveys/submissions/${attendeeId}/${templateId}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.log('No submission yet for template', templateId);
    }
    return null;
}

async function fetchSurveyQuestions(templateId) {
    const response = await apiFetch(`api/surveys/templates/${templateId}/questions`);
    if (!response.ok) {
        throw new Error(`Failed to load survey questions for template ${templateId}`);
    }
    return await response.json();
}

function renderSurveyTabs(surveyData, attendeeId, isCompleteFn = () => false) {
    const tabButtons = document.getElementById('survey-tab-buttons');
    const tabContent = document.getElementById('survey-tab-content');

    if (!tabButtons || !tabContent) return;

    // Create tab buttons
    const buttonsHtml = surveyData.map(({ template, submission }) => {
        const completed = typeof submission?.isComplete === 'boolean' ? submission.isComplete : isCompleteFn(submission);
        const isActive = surveyData[0]?.template.id === template.id;

        console.log('Survey tab render', {
            templateId: template.id,
            templateName: template.name,
            completed,
            answers: submission?.answers || []
        });

        return `
            <button class="survey-tab-btn ${completed ? 'completed' : ''} ${isActive ? 'active' : ''}" data-tab="${template.id}">
                <span class="tab-name">${template.name}</span>
                <span class="pill ${completed ? 'pill-complete' : 'pill-pending'}">${completed ? 'Complete' : 'Pending'}</span>
            </button>
        `;
    }).join('');

    tabButtons.innerHTML = buttonsHtml;

    // Create tab content
    const contentHtml = surveyData.map(({ template, submission, questions }) => {
        const isActive = surveyData[0]?.template.id === template.id;
        return renderSurveyTabContent(template, submission, questions, attendeeId, isActive, isCompleteFn);
    }).join('');

    tabContent.innerHTML = contentHtml;

    // Add tab switching functionality
    tabButtons.querySelectorAll('.survey-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons and content
            tabButtons.querySelectorAll('.survey-tab-btn').forEach(b => b.classList.remove('active'));
            tabContent.querySelectorAll('.survey-tab-content').forEach(c => c.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            btn.classList.add('active');
            const templateId = btn.getAttribute('data-tab');
            const contentDiv = tabContent.querySelector(`[data-content="${templateId}"]`);
            if (contentDiv) {
                contentDiv.classList.add('active');
            }
        });
    });

    // Initialize survey interaction functionality for all tabs
    initSurveyInteractions(attendeeId, surveyData);
}

function renderSurveyTabContent(template, submission, questions, attendeeId, isActive, isCompleteFn = () => false) {
    const answers = getSurveyAnswerMap(submission, isCompleteFn);
    const questionFieldsHtml = questions.map((question, index) => {
        const renderer = getSurveyRenderer(question);
        const answerValue = answers[question.id] || '';
        const answered = typeof answerValue === 'string' ? answerValue.trim().length > 0 : Boolean(answerValue);
        const statusClass = answered ? 'complete' : 'pending';

        return `
            <div class="field-group ${answered ? 'completed' : ''}" data-question-group="${question.id}">
                <div class="field-header">
                    <div class="field-title">${index + 1}. ${question.prompt}</div>
                    <div class="field-status ${statusClass}">
                        <span class="status-icon">${answered ? '✓' : '○'}</span>
                        ${answered ? 'Complete' : 'Pending'}
                    </div>
                </div>
                <div class="intro-input">
                    ${renderer(question, answerValue)}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="survey-tab-content ${isActive ? 'active' : ''}" data-content="${template.id}">
            <div class="survey-form">
                <h3>${template.name}</h3>
                <p class="survey-description">${template.description || 'Share your feedback to help us improve.'}</p>
                <div class="survey-fields">${questionFieldsHtml}</div>
                <button class="btn-primary submit-survey-btn" data-template="${template.id}" data-attendee="${attendeeId}">Submit Feedback</button>
            </div>
        </div>
    `;
}

const surveyRenderers = {
    text: (question, value = '') =>
        `<input type="text" data-question="${question.id}" value="${value}" placeholder="Enter your response..." class="survey-input">`,

    textarea: (question, value = '') =>
        `<textarea data-question="${question.id}" placeholder="Enter your response..." class="survey-textarea">${value}</textarea>`,

    choice: (question, value = '') => {
        const options = question.options ? JSON.parse(question.options).options || [] : [];
        if (isEmojiRatingQuestion(question, options)) {
            return renderEmojiRating(question, value, options);
        }
        return `
            <div class="choice-group" role="radiogroup" aria-label="${question.prompt}">
                ${options.map(option => {
                    const checked = option.value === value ? 'checked' : '';
                    return `
                        <label class="choice-option">
                            <input type="radio" name="survey-choice-${question.id}" value="${option.value}" data-question="${question.id}" ${checked}>
                            <span>${option.label}</span>
                        </label>
                    `;
                }).join('')}
            </div>
        `;
    },
};

function getSurveyRenderer(question) {
    const type = question.question_type || 'text';
    return surveyRenderers[type] || surveyRenderers.text;
}

function isEmojiRatingQuestion(question, options = []) {
    if ((question.question_type || 'text') !== 'choice') return false;
    const values = options.map(option => String(option.value));
    return values.length === 5 && ['1', '2', '3', '4', '5'].every(value => values.includes(value));
}

function renderEmojiRating(question, value = '', options = []) {
    const emojiMap = {
        '1': '😞',
        '2': '🙁',
        '3': '😐',
        '4': '🙂',
        '5': '😊',
    };
    const selectedValue = String(value || '');
    const selectedOption = options.find(option => String(option.value) === selectedValue);
    return `
        <div class="rating-section">
            <div class="emoji-rating" data-question-id="${question.id}" data-selected-rating="${selectedValue}">
                ${['1', '2', '3', '4', '5'].map(ratingValue => {
                    const selectedClass = selectedValue === ratingValue ? 'selected' : '';
                    const option = options.find(item => String(item.value) === ratingValue);
                    const title = option?.label || ratingValue;
                    return `
                        <button type="button" class="emoji-btn ${selectedClass}" data-rating="${ratingValue}" data-question="${question.id}" title="${title}">${emojiMap[ratingValue]}</button>
                    `;
                }).join('')}
            </div>
            <div class="selected-rating" id="selected-question-${question.id}">${selectedOption ? `Selected: ${emojiMap[selectedValue]} (${selectedOption.label})` : ''}</div>
            <input type="hidden" data-question="${question.id}" value="${selectedValue}">
        </div>
    `;
}

function getSurveyAnswerMap(submission, isCompleteFn = () => false) {
    const answers = {};
    if (submission && submission.answers && isCompleteFn(submission)) {
        submission.answers.forEach(answer => {
            const value = answer?.response;
            if (value === null || value === undefined) return;
            answers[answer.question_id] = String(value);
        });
    }
    return answers;
}

function getSurveyInputValue(question, container) {
    const type = question.question_type || 'text';
    if (type === 'choice') {
        const hidden = container.querySelector(`input[type="hidden"][data-question="${question.id}"]`);
        if (hidden) {
            return hidden.value || '';
        }
        const checked = container.querySelector(`input[data-question="${question.id}"]:checked`);
        return checked?.value || '';
    }
    const field = container.querySelector(`[data-question="${question.id}"]`);
    return field?.value || '';
}

function initSurveyInteractions(attendeeId, surveyData) {
    // Add rating button functionality
    document.querySelectorAll('.emoji-rating').forEach(rating => {
        const buttons = rating.querySelectorAll('.emoji-btn');
        const questionId = rating.getAttribute('data-question-id');
        const selectedDiv = document.getElementById(`selected-question-${questionId}`);
        const hiddenInput = rating.parentElement?.querySelector(`input[type="hidden"][data-question="${questionId}"]`);
        const currentSurveyData = surveyData.flatMap(item => item.questions || []).find(question => String(question.id) === String(questionId));
        const options = currentSurveyData?.options ? JSON.parse(currentSurveyData.options).options || [] : [];

        buttons.forEach(button => {
            button.addEventListener('click', function() {
                // Remove selected class from all buttons in this rating
                buttons.forEach(btn => btn.classList.remove('selected'));
                // Add selected class to clicked button
                this.classList.add('selected');

                const ratingValue = this.getAttribute('data-rating') || '';
                const emoji = this.textContent;
                const selectedOption = options.find(option => String(option.value) === String(ratingValue));
                if (selectedDiv) {
                    selectedDiv.textContent = selectedOption
                        ? `Selected: ${emoji} (${selectedOption.label})`
                        : `Selected: ${emoji} (${ratingValue})`;
                }

                // Store the rating value
                rating.setAttribute('data-selected-rating', ratingValue);
                if (hiddenInput) {
                    hiddenInput.value = ratingValue;
                }
            });
        });
    });

    // Add submit button functionality
    document.querySelectorAll('.submit-survey-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.dataset.loading === 'true') return;
            const templateId = Number(btn.getAttribute('data-template'));
            const attendeeIdFromBtn = btn.getAttribute('data-attendee');
            const currentSurvey = surveyData.find(item => item.template.id === templateId);
            await submitTabbedSurvey(attendeeIdFromBtn, templateId, currentSurvey?.questions || [], btn);
        });
    });
}

async function submitTabbedSurvey(attendeeId, templateId, questions, submitButton) {
    const restoreButton = setButtonLoading(submitButton, 'Submitting...');
    try {
        const answers = [];

        for (const question of questions) {
            const container = document.querySelector(`.survey-tab-content[data-content="${templateId}"] [data-question-group="${question.id}"]`);
            if (!container) continue;

            const response = getSurveyInputValue(question, container);
            if (response && String(response).trim()) {
                answers.push({
                    question_id: question.id,
                    response,
                });
            }
        }

        const response = await apiFetch(`api/surveys/submissions/${attendeeId}/${templateId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        });

        if (!response.ok) {
            throw new Error('Failed to submit survey');
        }

        submitButton.textContent = 'Refreshing page...';
        showMessage('Refreshing page...', 'info');
        await Promise.all([
            loadSurveys(Number(attendeeId)),
            loadAttendee(Number(attendeeId)),
        ]);
        showSuccess('Survey submitted successfully!');
    } catch (error) {
        console.error('Failed to submit survey', error);
        showMessage('Failed to submit survey. Please try again.', 'error');
    } finally {
        restoreButton?.();
    }
}

function showSuccess(text) {
    showMessage(text, 'success');
}

// Legacy helper placeholders retained for compatibility
function showError(text) {
    showMessage(text, 'error');
}

const introRenderers = {
    text: (intro, value = '') =>
        `<input type="text" data-question="${intro.question_id}" value="${value}" placeholder="${intro.help_text || 'Enter your response...'}">`,
    textarea: (intro, value = '') =>
        `<textarea data-question="${intro.question_id}" placeholder="${intro.help_text || 'Write your response...'}">${value}</textarea>`,
    choice: (intro, value = '') => {
        const options = intro.config?.options || [];
        return `
            <div class="choice-group" role="radiogroup" aria-label="${intro.prompt}">
                ${options
                    .map(option => {
                        const checked = option.value === value ? 'checked' : '';
                        return `
                            <label class="choice-option">
                                <input type="radio" name="intro-choice-${intro.question_id}" value="${option.value}" data-question="${intro.question_id}" ${checked}>
                                <span>${option.label}</span>
                            </label>
                        `;
                    })
                    .join('')}
            </div>
        `;
    },
};

function getRenderer(intro) {
    const type = intro.question_type || 'text';
    return introRenderers[type] || introRenderers.text;
}

function getInputValue(intro, container) {
    const type = intro.question_type || 'text';
    if (type === 'choice') {
        const checked = container.querySelector(`input[data-question="${intro.question_id}"]:checked`);
        return checked?.value || '';
    }
    const field = container.querySelector(`[data-question="${intro.question_id}"]`);
    return field?.value || '';
}

const onboardingRenderers = {
    text: (question, value = '') =>
        `<input type="text" data-question="${question.question_id}" value="${value}" placeholder="${question.help_text || 'Enter your response...'}">`,
    textarea: (question, value = '') =>
        `<textarea data-question="${question.question_id}" placeholder="${question.help_text || 'Enter your response...'}">${value}</textarea>`,
    choice: (question, value = '') => {
        const options = question.config?.options || [];
        return `
            <div class="choice-group" role="radiogroup" aria-label="${question.prompt}">
                ${options
                    .map(option => {
                        const checked = option.value === value ? 'checked' : '';
                        return `
                            <label class="choice-option">
                                <input type="radio" name="onboarding-choice-${question.question_id}" value="${option.value}" data-question="${question.question_id}" ${checked}>
                                <span>${option.label}</span>
                            </label>
                        `;
                    })
                    .join('')}
            </div>
        `;
    },
};

function getOnboardingRenderer(question) {
    const type = question.question_type || 'text';
    return onboardingRenderers[type] || onboardingRenderers.text;
}

function getOnboardingInputValue(question, container) {
    const type = question.question_type || 'text';
    if (type === 'choice') {
        const checked = container.querySelector(`input[data-question="${question.question_id}"]:checked`);
        return checked?.value || '';
    }
    const field = container.querySelector(`[data-question="${question.question_id}"]`);
    return field?.value || '';
}

function renderIntroFields(intros, truthAnswered) {
    let fieldsHtml = '';
    const truthIntros = intros.filter(i => i.code && i.code.startsWith('truth_'));
    const allTruthsCompleted = truthAnswered === truthIntros.length;

    let questionNum = 1;

    // Team Name
    const team = intros.find(i => i.code === 'team_name');
    if (team) {
        const completed = team.response && team.response.trim().length > 0;
        const renderer = getRenderer(team);
        const statusClass = completed ? 'complete' : 'pending';
        fieldsHtml += `
            <div class="field-group ${completed ? 'completed' : ''}" data-question-group="${team.question_id}">
                <div class="field-header">
                    <div class="field-title">${questionNum++}. ${team.prompt}</div>
                    <div class="field-status ${statusClass}">
                        <span class="status-icon">${completed ? '✓' : '○'}</span>
                        ${completed ? 'Complete' : 'Pending'}
                    </div>
                </div>
                <div class="intro-input">
                    ${renderer(team, team.response || '')}
                </div>
            </div>
        `;
    }

    // Intro
    const introField = intros.find(i => i.code === 'intro');
    if (introField) {
        const completed = introField.response && introField.response.trim().length > 0;
        const renderer = getRenderer(introField);
        const statusClass = completed ? 'complete' : 'pending';
        fieldsHtml += `
            <div class="field-group ${completed ? 'completed' : ''}" data-question-group="${introField.question_id}">
                <div class="field-header">
                    <div class="field-title">${questionNum++}. ${introField.prompt}</div>
                    <div class="field-status ${statusClass}">
                        <span class="status-icon">${completed ? '✓' : '○'}</span>
                        ${completed ? 'Complete' : 'Pending'}
                    </div>
                </div>
                <div class="intro-input">
                    ${renderer(introField, introField.response || '')}
                </div>
            </div>
        `;
    }

    // 2 Truths and a Lie Group
    if (truthIntros.length > 0) {
        const parentStatusClass = allTruthsCompleted ? 'complete' : 'pending';
        fieldsHtml += `
            <div class="field-group ${allTruthsCompleted ? 'completed' : ''}" data-truth-group="true">
                <div class="field-header">
                    <div class="field-title">${questionNum++}. 2 Truths and a Lie</div>
                    <div class="field-status ${parentStatusClass}">
                        <span class="status-icon">${allTruthsCompleted ? '✓' : '○'}</span>
                        ${truthAnswered} / ${truthIntros.length}
                    </div>
                </div>
        `;
        const roman = ['i', 'ii', 'iii'];
        truthIntros.forEach((truth, index) => {
            const completed = truth.response && truth.response.trim().length > 0;
            const renderer = getRenderer(truth);
            const statusClass = completed ? 'complete' : 'pending';
            fieldsHtml += `
                <div class="sub-field ${completed ? 'completed' : ''}" data-question-group="${truth.question_id}">
                    <div class="field-header">
                        <div class="field-title">${roman[index]}. ${truth.prompt}</div>
                        <div class="field-status ${statusClass}">
                            <span class="status-icon">${completed ? '✓' : '○'}</span>
                            ${completed ? 'Complete' : 'Pending'}
                        </div>
                    </div>
                    <div class="intro-input">
                        ${renderer(truth, truth.response || '')}
                    </div>
                </div>
            `;
        });
        fieldsHtml += `</div>`;
    }

    // Device Preference
    const device = intros.find(i => i.code === 'device_pref');
    if (device) {
        const completed = device.response && device.response.trim().length > 0;
        const renderer = getRenderer(device);
        const statusClass = completed ? 'complete' : 'pending';
        fieldsHtml += `
            <div class="field-group ${completed ? 'completed' : ''}" data-question-group="${device.question_id}">
                <div class="field-header">
                    <div class="field-title">${questionNum++}. ${device.prompt}</div>
                    <div class="field-status ${statusClass}">
                        <span class="status-icon">${completed ? '✓' : '○'}</span>
                        ${completed ? 'Complete' : 'Pending'}
                    </div>
                </div>
                <div class="intro-input">
                    ${renderer(device, device.response || '')}
                </div>
            </div>
        `;
    }

    // T-Shirt Size
    const tshirt = intros.find(i => i.code === 'tshirt_size');
    if (tshirt) {
        const completed = tshirt.response && tshirt.response.trim().length > 0;
        const renderer = getRenderer(tshirt);
        const statusClass = completed ? 'complete' : 'pending';
        fieldsHtml += `
            <div class="field-group ${completed ? 'completed' : ''}" data-question-group="${tshirt.question_id}">
                <div class="field-header">
                    <div class="field-title">${questionNum++}. ${tshirt.prompt}</div>
                    <div class="field-status ${statusClass}">
                        <span class="status-icon">${completed ? '✓' : '○'}</span>
                        ${completed ? 'Complete' : 'Pending'}
                    </div>
                </div>
                <div class="intro-input">
                    ${renderer(tshirt, tshirt.response || '')}
                </div>
            </div>
        `;
    }

    fieldsHtml += `<button class="btn-primary save-all-btn" id="save-all-intros">Save All Changes</button>`;

    return fieldsHtml;
}

function renderIntroductions(intros, progress, acknowledged) {
    const list = document.getElementById('intro-list');
    const pill = document.getElementById('intro-progress-pill');
    if (!list || !pill) return;

    const total = progress.intro_total || intros.length;
    const completed = progress.intro_completed || 0;
    pill.textContent = `${completed} of ${total} completed`;

    const truthIntros = intros.filter(i => i.code && i.code.startsWith('truth_'));
    const truthAnswered = truthIntros.filter(i => i.response && i.response.trim()).length;

    let html = '';
    // Introduction Section
    html += `
        <section class="intro-section" data-section="intro">
            ${!intros.length ? '<p>Introductions will appear here once available.</p>' : renderIntroFields(intros, truthAnswered)}
        </section>
    `;

    list.innerHTML = html;

    // Individual Save Listeners
    list.querySelectorAll('[data-question]').forEach(input => {
        input.addEventListener('blur', async (event) => {
            const questionId = Number(event.target.dataset.question);
            const intro = intros.find(item => item.question_id === questionId);
            if (!intro) return;
            const container = event.target.closest('.field-group') || event.target.closest('.sub-field');
            const response = getInputValue(intro, container);
            if (response.trim() === (intro.response || '').trim()) return;
            const attendeeId = getAttendeeId();
            if (!attendeeId) return;
            try {
                setFieldSavingState(container, true);
                const saveResponse = await apiFetch(`api/intros/attendees/${attendeeId}/${questionId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ response }),
                });
                if (!saveResponse.ok) {
                    throw new Error(await saveResponse.text());
                }
                showSuccess('Saved');
                loadAttendee(attendeeId);
            } catch (error) {
                console.error('Failed to save', error);
                showMessage('Save failed. Please retry.', 'error');
            } finally {
                setFieldSavingState(container, false);
            }
        });
    });

    // Save All Button
    const saveAllBtn = document.getElementById('save-all-intros');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', async () => {
            const attendeeId = getAttendeeId();
            if (!attendeeId) return;
            const restoreButton = setButtonLoading(saveAllBtn, 'Saving...');
            let saveCount = 0;
            try {
                for (const intro of intros) {
                    const container = list.querySelector(`[data-question="${intro.question_id}"]`)
                        ?.closest('.field-group, .sub-field');
                    const response = container ? getInputValue(intro, container) : '';
                    if (response.trim() === (intro.response || '').trim()) continue;
                    try {
                        const saveResponse = await apiFetch(`api/intros/attendees/${attendeeId}/${intro.question_id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ response }),
                        });
                        if (saveResponse.ok) {
                            saveCount++;
                        }
                    } catch (error) {
                        console.error('Save failed for', intro.code, error);
                    }
                }
                if (saveCount > 0) {
                    showSuccess(`${saveCount} changes saved`);
                    loadAttendee(attendeeId);
                } else {
                    showMessage('No changes to save.', 'info');
                }
            } finally {
                restoreButton?.();
            }
        });
    }
}
