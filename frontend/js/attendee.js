/**
 * Attendee portal powered by the rebuilt Oracle APIs.
 */

let runtimeConfigPromise;
let runtimeConfig = {
    basePath: '',
    bearerToken: '',
    enabled: false,
};

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
    return fetch(path, { ...options, headers });
}

function handleAvatarFallback(img) {
    if (!img || img.dataset.fallbackApplied === 'true') {
        return;
    }
    img.dataset.fallbackApplied = 'true';
    img.src = `${runtimeConfig.basePath}/static/images/default-avatar.svg`;
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

function showAgenda(imagePath) {
    const modal = document.getElementById('agenda-modal');
    const modalImg = document.getElementById('modal-img');
    if (!modal || !modalImg) return;
    modalImg.src = `${runtimeConfig.basePath}${imagePath.startsWith('/') ? imagePath : `/${imagePath}`}`;
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
            avatarEl.src = `${runtimeConfig.basePath}${imagePath.startsWith('/') ? imagePath : `/${imagePath}`}`;
        } else {
            avatarEl.src = `${runtimeConfig.basePath}/static/images/default-avatar.svg`;
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
            }
        });
    });

    // Save All Button
    const saveAllBtn = document.getElementById('save-all-onboarding');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', async () => {
            let saveCount = 0;
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

        // Load all submissions in parallel
        const submissions = await Promise.all(
            templates.map(template => fetchSurveySubmission(attendeeId, template.id))
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
            console.debug('Survey completion check', { submission, meaningfulCount: meaningful.length, totalResponses: responses.length });
            return meaningful.length > 0;
        };

        const normalizedSubmissions = submissions.map(submission => {
            if (!submission) return null;
            const isComplete = isSubmissionComplete(submission);
            return { ...submission, isComplete };
        });

        const completed = normalizedSubmissions.filter(sub => sub?.isComplete).length;
        const total = templates.length;

        const pill = document.getElementById('surveys-progress-pill');
        if (pill) {
            pill.textContent = `${completed} of ${total} completed`;
        }

        renderSurveyTabs(templates, normalizedSubmissions, attendeeId, submission => Boolean(submission?.isComplete) || isSubmissionComplete(submission));
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
        const response = await apiFetch(`/api/surveys/submissions/${attendeeId}/${templateId}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.debug('No submission yet for template', templateId);
    }
    return null;
}

function renderSurveyTabs(templates, submissions, attendeeId, isCompleteFn = () => false) {
    const tabButtons = document.getElementById('survey-tab-buttons');
    const tabContent = document.getElementById('survey-tab-content');

    if (!tabButtons || !tabContent) return;

    // Create tab buttons
    const buttonsHtml = templates.map((template, index) => {
        const submission = submissions[index];
        const isCompleted = Boolean(submission && submission.isComplete === true);
        const completed = typeof submission?.isComplete === 'boolean' ? submission.isComplete : isCompleteFn(submission);
        const isActive = index === 0;

        console.debug('Survey tab render', {
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
    const contentHtml = templates.map((template, index) => {
        const submission = submissions[index];
        const isActive = index === 0;
        return renderSurveyTabContent(template, submission, attendeeId, isActive, isCompleteFn);
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

    // Initialize rating functionality for all tabs
    initSurveyRatings(attendeeId);
}

function renderSurveyTabContent(template, submission, attendeeId, isActive, isCompleteFn = () => false) {
    // Create answers map from submission
    const answers = {};
    if (submission && submission.answers && isCompleteFn(submission)) {
        submission.answers.forEach(answer => {
            const value = answer?.response;
            if (value === null || value === undefined) return;
            const normalized = typeof value === 'string' ? value.trim() : String(value).trim();
            if (!normalized || normalized === '0' || normalized.toLowerCase() === 'null') return;

            // Map the first rating answer and first two text answers
            if (!answers.rating && /^\d+$/.test(normalized)) {
                answers.rating = parseInt(normalized, 10);
            } else if (!answers.whatLiked) {
                answers.whatLiked = normalized;
            } else if (!answers.whatBetter) {
                answers.whatBetter = normalized;
            }
        });
    }

    return `
        <div class="survey-tab-content ${isActive ? 'active' : ''}" data-content="${template.id}">
            <div class="survey-form">
                <h3>${template.name}</h3>
                <p class="survey-description">${template.description || 'Share your feedback to help us improve.'}</p>

                <div class="rating-section">
                    <label>How would you rate this session?</label>
                    <div class="emoji-rating" id="rating-${template.id}" data-selected-rating="${answers.rating || ''}">
                        <button class="emoji-btn ${answers.rating === 1 ? 'selected' : ''}" data-rating="1" title="Poor">😞</button>
                        <button class="emoji-btn ${answers.rating === 2 ? 'selected' : ''}" data-rating="2" title="Below Average">🙁</button>
                        <button class="emoji-btn ${answers.rating === 3 ? 'selected' : ''}" data-rating="3" title="Average">😐</button>
                        <button class="emoji-btn ${answers.rating === 4 ? 'selected' : ''}" data-rating="4" title="Good">🙂</button>
                        <button class="emoji-btn ${answers.rating === 5 ? 'selected' : ''}" data-rating="5" title="Excellent">😊</button>
                    </div>
                    <div class="selected-rating" id="selected-${template.id}">${answers.rating ? `Selected: ${['😞', '🙁', '😐', '🙂', '😊'][answers.rating - 1]} (${answers.rating}/5)` : ''}</div>
                </div>

                <div class="form-group">
                    <label>What did you like about this session?</label>
                    <textarea id="liked-${template.id}" rows="3" placeholder="Share what worked well...">${answers.whatLiked || ''}</textarea>
                </div>

                <div class="form-group">
                    <label>What could be improved?</label>
                    <textarea id="better-${template.id}" rows="3" placeholder="Suggestions for improvement...">${answers.whatBetter || ''}</textarea>
                </div>

                <button class="btn-primary submit-survey-btn" data-template="${template.id}" data-attendee="${attendeeId}">Submit Feedback</button>
            </div>
        </div>
    `;
}

function showSurvey(attendeeId, templateId) {
    // Create modal for survey
    const modal = document.createElement('div');
    modal.className = 'modal survey-modal';
    modal.innerHTML = `
        <div class="modal-content survey-modal-content">
            <span class="close">&times;</span>
            <div id="survey-content">
                <div class="survey-loading">Loading survey...</div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Show modal
    modal.style.display = 'block';

    // Load survey content
    loadSurveyContent(attendeeId, templateId);

    // Close handlers
    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => {
        modal.remove();
    };

    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.remove();
        }
    });
}

async function loadSurveyContent(attendeeId, templateId) {
    try {
        // Load template info and questions
        const templateResponse = await apiFetch(`/api/surveys/templates/${templateId}`);
        if (!templateResponse.ok) {
            throw new Error('Failed to load survey template');
        }
        const template = await templateResponse.json();

        // Load existing submission if any
        const submission = await fetchSurveySubmission(attendeeId, templateId);

        // Load questions
        const questionsResponse = await apiFetch(`/api/surveys/templates/${templateId}/questions`);
        if (!questionsResponse.ok) {
            throw new Error('Failed to load survey questions');
        }
        const questions = await questionsResponse.json();

        renderSurveyForm(attendeeId, template, questions, submission);
    } catch (error) {
        console.error('Failed to load survey', error);
        document.getElementById('survey-content').innerHTML = '<p>Unable to load survey. Please try again.</p>';
    }
}

function renderSurveyForm(attendeeId, template, questions, submission) {
    const container = document.getElementById('survey-content');

    // Create answers map from submission
    const answers = {};
    if (submission && submission.answers) {
        submission.answers.forEach(answer => {
            answers[answer.question_id] = answer.response;
        });
    }

    let html = `
        <div class="survey-header">
            <h2>${template.name}</h2>
            <p class="survey-description">${template.description || ''}</p>
        </div>
        <div class="survey-progress">
            <div class="progress-pill" id="survey-progress-pill">0 of ${questions.length} answered</div>
        </div>
        <form class="survey-form" id="survey-form">
    `;

    questions.forEach((question, index) => {
        const answered = answers[question.id] && answers[question.id].trim();
        const renderer = getSurveyRenderer(question);
        const statusClass = answered ? 'complete' : 'pending';

        html += `
            <div class="field-group ${answered ? 'completed' : ''}" data-question-group="${question.id}">
                <div class="field-header">
                    <div class="field-title">${index + 1}. ${question.prompt}</div>
                    <div class="field-status ${statusClass}">
                        <span class="status-icon">${answered ? '✓' : '○'}</span>
                        ${answered ? 'Complete' : 'Pending'}
                    </div>
                </div>
                <div class="intro-input">
                    ${renderer(question, answers[question.id] || '')}
                </div>
            </div>
        `;
    });

    html += `
            <div class="survey-actions">
                <button type="submit" class="btn-primary">Submit Survey</button>
            </div>
        </form>
    `;

    container.innerHTML = html;

    // Update progress
    updateSurveyProgress();

    // Add form submission handler
    const form = document.getElementById('survey-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitSurvey(attendeeId, template.id, questions);
    });

    // Add change listeners for auto-save
    container.querySelectorAll('[data-question]').forEach(input => {
        input.addEventListener('change', () => {
            updateSurveyProgress();
        });
    });
}

function updateSurveyProgress() {
    const questions = document.querySelectorAll('.field-group[data-question-group]');
    const answered = Array.from(questions).filter(q => {
        const inputs = q.querySelectorAll('[data-question]');
        return Array.from(inputs).some(input => {
            if (input.type === 'radio' || input.type === 'checkbox') {
                return input.checked;
            }
            return input.value && input.value.trim();
        });
    }).length;

    const pill = document.getElementById('survey-progress-pill');
    if (pill) {
        pill.textContent = `${answered} of ${questions.length} completed`;
    }
}

async function submitSurvey(attendeeId, templateId, questions) {
    try {
        const answers = [];

        for (const question of questions) {
            const container = document.querySelector(`[data-question-group="${question.id}"]`);
            if (!container) continue;

            const response = getSurveyInputValue(question, container);
            if (response) {
                answers.push({
                    question_id: question.id,
                    response: response
                });
            }
        }

        const response = await apiFetch(`/api/surveys/submissions/${attendeeId}/${templateId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        });

        if (!response.ok) {
            throw new Error('Failed to submit survey');
        }

        showSuccess('Survey submitted successfully!');
        // Close modal and refresh surveys
        document.querySelector('.survey-modal').remove();
        loadAttendee(attendeeId);
    } catch (error) {
        console.error('Failed to submit survey', error);
        showMessage('Failed to submit survey. Please try again.', 'error');
    }
}

const surveyRenderers = {
    text: (question, value = '') =>
        `<input type="text" data-question="${question.id}" value="${value}" placeholder="${question.help_text || 'Enter your response...'}" class="survey-input">`,

    textarea: (question, value = '') =>
        `<textarea data-question="${question.id}" placeholder="${question.help_text || 'Enter your response...'}" class="survey-textarea">${value}</textarea>`,

    choice: (question, value = '') => {
        const options = question.options ? JSON.parse(question.options).options || [] : [];
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

function getSurveyInputValue(question, container) {
    const type = question.question_type || 'text';
    if (type === 'choice') {
        const checked = container.querySelector(`input[data-question="${question.id}"]:checked`);
        return checked?.value || '';
    }
    const field = container.querySelector(`[data-question="${question.id}"]`);
    return field?.value || '';
}

function initSurveyButtons(attendeeId) {
    document.querySelectorAll('[data-survey]').forEach(btn => {
        btn.addEventListener('click', () => {
            const templateId = btn.getAttribute('data-survey');
            showSurvey(attendeeId, templateId);
        });
    });
}

function initSurveyRatings(attendeeId) {
    // Add rating button functionality
    document.querySelectorAll('.emoji-rating').forEach(rating => {
        const buttons = rating.querySelectorAll('.emoji-btn');
        const templateId = rating.id.replace('rating-', '');
        const selectedDiv = document.getElementById(`selected-${templateId}`);

        buttons.forEach(button => {
            button.addEventListener('click', function() {
                // Remove selected class from all buttons in this rating
                buttons.forEach(btn => btn.classList.remove('selected'));
                // Add selected class to clicked button
                this.classList.add('selected');

                const ratingValue = this.getAttribute('data-rating');
                const emoji = this.textContent;
                if (selectedDiv) {
                    selectedDiv.textContent = `Selected: ${emoji} (${ratingValue}/5)`;
                }

                // Store the rating value
                rating.setAttribute('data-selected-rating', ratingValue);
            });
        });
    });

    // Add submit button functionality
    document.querySelectorAll('.submit-survey-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const templateId = btn.getAttribute('data-template');
            const attendeeIdFromBtn = btn.getAttribute('data-attendee');
            await submitSimpleSurvey(attendeeIdFromBtn, templateId);
        });
    });
}

async function submitSimpleSurvey(attendeeId, templateId) {
    try {
        const rating = document.getElementById(`rating-${templateId}`)?.getAttribute('data-selected-rating');
        const whatLiked = document.getElementById(`liked-${templateId}`)?.value.trim() || '';
        const whatBetter = document.getElementById(`better-${templateId}`)?.value.trim() || '';

        if (!rating) {
            showMessage('Please select a rating before submitting.', 'error');
            return;
        }

        // Fetch questions to get actual question IDs
        const questionsResponse = await apiFetch(`/api/surveys/templates/${templateId}/questions`);
        if (!questionsResponse.ok) {
            throw new Error('Failed to load survey questions');
        }
        const questions = await questionsResponse.json();

        // Create answers using actual question IDs
        const answers = [];

        // First question gets the rating
        if (questions.length > 0) {
            answers.push({
                question_id: questions[0].id,
                response: rating
            });
        }

        // Second question gets "what liked"
        if (questions.length > 1 && whatLiked) {
            answers.push({
                question_id: questions[1].id,
                response: whatLiked
            });
        }

        // Third question gets "what could be improved"
        if (questions.length > 2 && whatBetter) {
            answers.push({
                question_id: questions[2].id,
                response: whatBetter
            });
        }

        const response = await apiFetch(`/api/surveys/submissions/${attendeeId}/${templateId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        });

        if (!response.ok) {
            throw new Error('Failed to submit survey');
        }

        showSuccess('Survey submitted successfully!');
        // Update tab status
        const tabBtn = document.querySelector(`.survey-tab-btn[data-tab="${templateId}"]`);
        if (tabBtn) {
            tabBtn.classList.add('completed');
            const pill = tabBtn.querySelector('.pill');
            if (pill) {
                pill.className = 'pill pill-complete';
                pill.textContent = 'Complete';
            }
        }
        // Refresh progress
        loadAttendee(attendeeId);
    } catch (error) {
        console.error('Failed to submit survey', error);
        showMessage('Failed to submit survey. Please try again.', 'error');
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
                const saveResponse = await apiFetch(`/api/intros/attendees/${attendeeId}/${questionId}`, {
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
            }
        });
    });

    // Save All Button
    const saveAllBtn = document.getElementById('save-all-intros');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', async () => {
            const attendeeId = getAttendeeId();
            if (!attendeeId) return;
            let saveCount = 0;
            for (const intro of intros) {
                const container = list.querySelector(`[data-question="${intro.question_id}"]`)
                    ?.closest('.field-group, .sub-field');
                const response = container ? getInputValue(intro, container) : '';
                if (response.trim() === (intro.response || '').trim()) continue;
                try {
                    const saveResponse = await apiFetch(`/api/intros/attendees/${attendeeId}/${intro.question_id}`, {
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
        });
    }
}
