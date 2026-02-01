/**
 * Attendee portal powered by the rebuilt Oracle APIs.
 */

const apiBase = (window.PROXY_CONFIG && window.PROXY_CONFIG.basePath) || '';

function apiFetch(path, options = {}) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return fetch(`${apiBase}${normalized}`, options);
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

function showAgenda(imagePath) {
    const modal = document.getElementById('agenda-modal');
    const modalImg = document.getElementById('modal-img');
    if (!modal || !modalImg) return;
    modalImg.src = imagePath;
    modal.style.display = 'block';
}

function closeAgendaModal() {
    const modal = document.getElementById('agenda-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const attendeeId = getAttendeeId();
    if (!attendeeId) {
        showMessage('Session expired. Please login again.', 'error');
        return;
    }

    attachTabs();
    loadAttendee(attendeeId);
    document.getElementById('refresh-tasks')?.addEventListener('click', () => loadTasks(attendeeId));

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

async function loadAttendee(attendeeId) {
    try {
        hideMessage();
        const response = await apiFetch(`/api/attendees/${attendeeId}`);
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const attendee = await response.json();
        renderProfile(attendee);
        renderProgress(attendee.progress || {});
        renderIntroductions(attendee.intros || [], attendee.progress || {}, attendee.acknowledged || false);
        await loadTasks(attendeeId);
        await loadSurveys(attendeeId);
    } catch (error) {
        console.error('Failed to load attendee', error);
        showMessage('Unable to load your workshop companion dashboard. Please try again.', 'error');
    }
}

function renderProfile(attendee) {
    const nameEl = document.getElementById('attendee-name');
    const emailEl = document.getElementById('attendee-email');
    const locationEl = document.getElementById('location-details');
    const avatarEl = document.getElementById('profile-img');

    nameEl.textContent = attendee.full_name || 'AI Workshop Companion';
    emailEl.textContent = attendee.email;

    if (locationEl) {
        const cohort = attendee.cohort || {};
        const dateRange = cohort.start_date
            ? formatDateRange(cohort.start_date, cohort.end_date, cohort.start_time, cohort.end_time)
            : null;
        const locationLines = [
            cohort.title ? `<strong>Cohort:</strong> ${cohort.title}` : null,
            cohort.room ? `<strong>Room:</strong> ${cohort.room}` : null,
            dateRange ? `<strong>Dates:</strong> ${dateRange}` : null,
        ].filter(Boolean);

        locationEl.innerHTML = locationLines.length
            ? `<div class="cohort-meta">${locationLines.map(line => `<p>${line}</p>`).join('')}</div>`
            : '';
    }

    if (avatarEl) {
        const imagePath = attendee.profile_image;
        if (imagePath) {
            avatarEl.src = imagePath;
        } else {
            avatarEl.src = 'static/images/default-avatar.svg';
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

function renderProgress(progress) {
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
            key: 'ack',
            label: 'Workshop acknowledgment',
            summary: `${progress.ack_completed ? 1 : 0} / ${progress.ack_total || 1}`,
            total: progress.ack_total || 1,
            completed: progress.ack_completed ? 1 : 0,
        },
        {
            key: 'intro',
            label: 'Introductions',
            summary: `${progress.intro_completed || 0} / ${progress.intro_total || 0}`,
            total: progress.intro_total || 0,
            completed: progress.intro_completed || 0,
        },
        {
            key: 'tasks',
            label: 'Onboarding checklist',
            summary: `${progress.tasks_completed || 0} / ${progress.tasks_total || 0}`,
            total: progress.tasks_total || 0,
            completed: progress.tasks_completed || 0,
        },
        {
            key: 'surveys',
            label: 'Surveys',
            summary: `${progress.surveys_completed || 0} / ${progress.surveys_total || 0}`,
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
                <div class="metric-row ${statusClass}">
                    <span class="metric-label">${icon} ${section.label}</span>
                    <span class="metric-value">${section.summary}</span>
                </div>
            `;
        })
        .join('');

}

async function loadTasks(attendeeId) {
    try {
        const response = await apiFetch(`/api/tasks/attendees/${attendeeId}`);
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const tasks = await response.json();
        renderTasks(attendeeId, tasks);
    } catch (error) {
        console.error('Failed to load tasks', error);
        renderTasks(attendeeId, []);
    }
}

function renderTasks(attendeeId, tasks) {
    const container = document.getElementById('task-list');
    if (!container) return;
    if (!tasks.length) {
        container.innerHTML = '<p>No tasks assigned yet. Check back soon!</p>';
        return;
    }

    container.innerHTML = tasks
        .map(task => {
            const completed = task.status === 'COMPLETED';
            return `
                <div class="task-item ${completed ? 'completed' : ''}">
                    <div>
                        <h4>${task.title}</h4>
                        ${task.description ? `<p class="task-description">${task.description}</p>` : ''}
                        ${task.instructions_url ? `<a href="${task.instructions_url}" target="_blank" rel="noopener">View instructions</a>` : ''}
                    </div>
                    <div class="task-actions">
                        <label class="switch">
                            <input type="checkbox" data-task-id="${task.task_id}" ${completed ? 'checked' : ''}>
                            <span>Done</span>
                        </label>
                    </div>
                </div>
            `;
        })
        .join('');

    container.querySelectorAll('input[type="checkbox"]').forEach(box => {
        box.addEventListener('change', async event => {
            const taskId = Number(event.target.getAttribute('data-task-id'));
            const status = event.target.checked ? 'COMPLETED' : 'PENDING';
            try {
                const response = await apiFetch(`/api/tasks/attendees/${attendeeId}/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status }),
                });
                if (!response.ok) {
                    throw new Error(await response.text());
                }
                showMessage('Task updated', 'success');
                loadAttendee(attendeeId);
            } catch (error) {
                console.error('Task update failed', error);
                showMessage('Unable to update task. Please retry.', 'error');
                event.target.checked = !event.target.checked;
            }
        });
    });
}

async function loadSurveys(attendeeId) {
    try {
        const response = await apiFetch('/api/surveys/templates');
        if (!response.ok) {
            throw new Error(await response.text());
        }
        const templates = await response.json();
       const cards = await Promise.all(
           templates.map(async template => {
               const submission = await fetchSurveySubmission(attendeeId, template.id);
               return renderSurveyCard(template, submission);
           })
       );
       document.getElementById('survey-grid').innerHTML = cards.join('');
        initSurveyButtons(attendeeId);
    } catch (error) {
        console.error('Failed to load surveys', error);
        document.getElementById('survey-grid').innerHTML = '<p>Surveys will appear here closer to the workshop.</p>';
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

function renderSurveyCard(template, submission) {
    const completed = Boolean(submission);
    const badge = completed
        ? '<span class="badge complete">Complete</span>'
        : '<span class="badge pending">Pending</span>';

    return `
        <div class="survey-card">
            <div class="survey-card-header">
                <h4>${template.name}</h4>
                ${badge}
            </div>
            <p>${template.description || 'Share your feedback to help us improve.'}</p>
            <button class="btn-secondary" data-survey="${template.id}">
                ${completed ? 'Review responses' : 'Start survey'}
            </button>
        </div>
    `;
}

function showSurveyUnavailable() {
    alert('Survey flow will open closer to the workshop date.');
}

function initSurveyButtons(attendeeId) {
    document.querySelectorAll('[data-survey]').forEach(btn => {
        btn.addEventListener('click', () => showSurveyUnavailable());
    });
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
        `<input type="text" data-question="${intro.question_id}" value="${value}" placeholder="${intro.prompt}">`,
    textarea: (intro, value = '') =>
        `<textarea data-question="${intro.question_id}" placeholder="Write your response...">${value}</textarea>`,
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
    const fill = document.getElementById('intro-progress-fill');
    if (!list || !pill || !fill) return;

    const total = progress.intro_total || intros.length;
    const answered = progress.intro_completed || 0;
    pill.textContent = `${answered} of ${total} answered`;
    const percent = total ? Math.round((answered / total) * 100) : 0;
    fill.style.width = `${percent}%`;

    const truthIntros = intros.filter(i => i.code && i.code.startsWith('truth_'));
    const truthAnswered = truthIntros.filter(i => i.response && i.response.trim()).length;

    let html = '';
    // Acknowledgement Section
    const ackCompleted = acknowledged ? 1 : 0;
    html += `
        <section class="intro-section" data-section="ack">
            <header class="section-header">
                <h3>Acknowledgement</h3>
                <div class="section-progress" data-progress="ack">${ackCompleted} / 1</div>
            </header>
            <div class="field-group ${acknowledged ? 'completed' : ''}">
                <div class="field-header">
                    <div class="field-title">Workshop guidelines acknowledgement</div>
                    <div class="field-status ${acknowledged ? 'complete' : 'pending'}">
                        <span class="status-icon">${acknowledged ? '✓' : '○'}</span>
                        ${acknowledged ? 'Complete' : 'Pending'}
                    </div>
                </div>
                <div class="intro-input">
                    <label class="checkbox-label">
                        <input type="checkbox" id="ack-checkbox" ${acknowledged ? 'checked disabled' : ''}>
                        <span>I acknowledge that I have read and agree to the workshop guidelines and code of conduct.</span>
                    </label>
                    ${acknowledged ? '' : '<button class="btn-secondary ack-btn" id="ack-save">Submit acknowledgement</button>'}
                </div>
            </div>
        </section>
    `;

    // Introduction Section
    html += `
        <section class="intro-section" data-section="intro">
            <header class="section-header">
                <h3>Introduction</h3>
                <div class="section-progress" data-progress="intro">${answered} / ${total}</div>
            </header>
            ${!intros.length ? '<p>Introductions will appear here once available.</p>' : renderIntroFields(intros, truthAnswered)}
        </section>
    `;

    list.innerHTML = html;

    const ackSaveBtn = document.getElementById('ack-save');
    if (ackSaveBtn) {
        ackSaveBtn.addEventListener('click', async () => {
            const checkbox = document.getElementById('ack-checkbox');
            if (!checkbox.checked) {
                showMessage('Please check the acknowledgement box first.', 'error');
                return;
            }
            const attendeeId = getAttendeeId();
            if (!attendeeId) return;
            try {
                const ackResponse = await apiFetch(`/api/attendees/${attendeeId}/ack`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ acknowledged: true }),
                });
                if (!ackResponse.ok) {
                    throw new Error(await ackResponse.text());
                }
                showSuccess('Acknowledgement saved');
                loadAttendee(attendeeId);
            } catch (error) {
                console.error('Failed to save acknowledgement', error);
                showMessage('Unable to save acknowledgement. Please retry.', 'error');
            }
        });
    }

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
