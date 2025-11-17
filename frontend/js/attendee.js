/**
 * Attendee portal JavaScript
 */

document.addEventListener('DOMContentLoaded', function() {
    // Get student ID from localStorage
    const studentId = localStorage.getItem('student_id');

    if (studentId) {
        document.getElementById('student-id').textContent = studentId;
        loadAttendeeData(studentId);
    } else {
        console.error('No student ID found in localStorage');
        showError('Session expired. Please login again.');
    }

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

    console.log('Attendee portal loaded for student:', studentId);
});

async function loadAttendeeData(studentId) {
    try {
        console.log('Loading attendee data for:', studentId);
        const response = await fetch(`api/attendees/${studentId}`);

        if (!response.ok) {
            throw new Error(`Failed to load attendee data: ${response.status}`);
        }

        const attendee = await response.json();
        console.log('Attendee data loaded:', attendee);

        // Update profile information
        updateAttendeeProfile(attendee);

        // Update progress overview
        updateProgressOverview(attendee);

        // Update introduction section
        updateIntroductionSection(attendee);

        // Load tasks data
        await loadTasksData(studentId, attendee);

        // Load surveys data (placeholder for now)
        updateSurveysSection(attendee);

    } catch (error) {
        console.error('Error loading attendee data:', error);
        showError('Failed to load attendee data. Please try again.');
    }
}

function updateProgressOverview(attendee) {
    const progressTab = document.getElementById('progress-tab');
    const progress = attendee.progress;

    const progressHtml = `
        <h2>Progress Overview</h2>
        <div class="progress-summary">
            <div class="progress-item">
                <span class="progress-label">Workshop Acknowledgment:</span>
                <span class="progress-status ${progress.ack_completed ? 'completed' : 'pending'}">
                    ${progress.ack_completed ? '✓ Completed' : '○ Pending'}
                </span>
            </div>
            <div class="progress-item">
                <span class="progress-label">Introduction:</span>
                <span class="progress-status ${progress.intro_completed ? 'completed' : 'pending'}">
                    ${progress.intro_fields_completed}/${progress.intro_fields_total} completed
                </span>
            </div>
            <div class="progress-item">
                <span class="progress-label">Onboarding Tasks:</span>
                <span class="progress-status">
                    ${progress.tasks_completed}/${progress.tasks_total} completed
                </span>
            </div>
            <div class="progress-item">
                <span class="progress-label">Surveys:</span>
                <span class="progress-status ${progress.surveys_submitted ? 'completed' : 'pending'}">
                    ${progress.surveys_completed}/${progress.surveys_total} completed
                </span>
            </div>
        </div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress.overall_progress}%"></div>
        </div>
        <p><strong>${progress.overall_progress}% Complete</strong></p>
    `;

    progressTab.innerHTML = progressHtml;
}

function updateIntroductionSection(attendee) {
    const introTab = document.getElementById('introduction-tab');

    // Calculate progress for each subsection
    // Acknowledgement section: 1 item
    const ackCompleted = attendee.ack === 'Y' ? 1 : 0;
    const ackTotal = 1;

    // Introduction section: 4 items (team, intro text, truths/lies, device)
    let introCompletedCount = 0;
    const introTotal = 4;

    if (attendee.team && attendee.team.trim()) introCompletedCount++;
    if (attendee.intro && attendee.intro.trim()) introCompletedCount++;
    if ((attendee.tl1 && attendee.tl1.trim()) &&
        (attendee.tl2 && attendee.tl2.trim()) &&
        (attendee.tl3 && attendee.tl3.trim())) introCompletedCount++;
    if (attendee.mac_pc) introCompletedCount++;

    const introHtml = `
        <h2>Introduction</h2>

        <div class="subsection">
            <h3>Acknowledgement <span class="progress-indicator">${ackCompleted}/${ackTotal} completed</span></h3>
            <div class="subsection-content">
                <div class="form-group ${attendee.ack === 'Y' ? 'completed' : ''}">
                    <label for="ack-checkbox">
                        <input type="checkbox" id="ack-checkbox" ${attendee.ack === 'Y' ? 'checked' : ''}>
                        I acknowledge participation in this workshop
                    </label>
                </div>
            </div>
        </div>

        <div class="subsection">
            <h3>Introduction <span class="progress-indicator">${introCompletedCount}/${introTotal} completed</span></h3>
            <div class="subsection-content">
                <div class="form-group ${attendee.team && attendee.team.trim() ? 'completed' : ''}">
                    <label for="team-input">1. Team Name:</label>
                    <input type="text" id="team-input" value="${attendee.team || ''}" placeholder="Enter your team name">
                </div>

                <div class="form-group ${attendee.intro && attendee.intro.trim() ? 'completed' : ''}">
                    <label for="intro-textarea">2. Introduction:</label>
                    <textarea id="intro-textarea" rows="4" placeholder="Tell us about yourself...">${attendee.intro || ''}</textarea>
                </div>

                <div class="form-group ${(attendee.tl1 && attendee.tl1.trim()) && (attendee.tl2 && attendee.tl2.trim()) && (attendee.tl3 && attendee.tl3.trim()) ? 'completed' : ''}">
                    <label>3. 2 Truths and a Lie:</label>
                    <input type="text" id="tl1-input" value="${attendee.tl1 || ''}" placeholder="Truth or Lie #1">
                    <input type="text" id="tl2-input" value="${attendee.tl2 || ''}" placeholder="Truth or Lie #2">
                    <input type="text" id="tl3-input" value="${attendee.tl3 || ''}" placeholder="Truth or Lie #3">
                </div>

                <div class="form-group ${attendee.mac_pc ? 'completed' : ''}">
                    <label>4. Device Preference:</label>
                    <label><input type="radio" name="device" value="M" ${attendee.mac_pc === 'M' ? 'checked' : ''}> Mac</label>
                    <label><input type="radio" name="device" value="P" ${attendee.mac_pc === 'P' ? 'checked' : ''}> PC</label>
                </div>
            </div>
        </div>

        <button id="save-intro-btn" class="btn-primary">Save Introduction</button>
    `;

    introTab.innerHTML = introHtml;

    // Add save functionality
    document.getElementById('save-intro-btn').addEventListener('click', () => saveIntroduction(attendee.student_id));
}

async function saveIntroduction(studentId) {
    const updateData = {
        ack: document.getElementById('ack-checkbox').checked ? 'Y' : 'N',
        team: document.getElementById('team-input').value.trim(),
        tl1: document.getElementById('tl1-input').value.trim(),
        tl2: document.getElementById('tl2-input').value.trim(),
        tl3: document.getElementById('tl3-input').value.trim(),
        intro: document.getElementById('intro-textarea').value.trim(),
        mac_pc: document.querySelector('input[name="device"]:checked')?.value
    };

    try {
        const response = await fetch(`api/attendees/${studentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData)
        });

        if (response.ok) {
            showSuccess('Introduction saved successfully!');
            // Reload data to reflect changes
            loadAttendeeData(studentId);
        } else {
            throw new Error('Failed to save introduction');
        }
    } catch (error) {
        console.error('Error saving introduction:', error);
        showError('Failed to save introduction. Please try again.');
    }
}

async function loadTasksData(studentId, attendee) {
    try {
        const response = await fetch(`api/tasks/${studentId}`);
        if (response.ok) {
            const tasks = await response.json();
            updateTasksSection(tasks, studentId, attendee);
        } else {
            console.log('Tasks API not available, showing placeholder');
            updateTasksSection([], studentId, attendee);
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        updateTasksSection([], studentId, attendee);
    }
}

function updateTasksSection(tasks, studentId, attendee) {
    const tasksTab = document.getElementById('tasks-tab');

    // Create task mapping for display names
    const taskNames = {
        'tenancy_access': 'Access tenancy setup',
        'install_uv': 'Install UV package manager',
        'install_vscode': 'Install VS Code',
        'install_cline': 'Install Cline extension',
        'install_aider': 'Install Aider',
        'install_sqlcl': 'Install SQLcl',
        'setup_oci': 'Setup OCI configuration',
        'clone_repo': 'Clone workshop repository',
        'uv_sync': 'Run UV sync',
        'setup_env': 'Setup environment',
        'run_code': 'Run workshop code'
    };

    // Create task items HTML and count completed tasks
    let tasksListHtml = '';
    const taskOrder = ['tenancy_access', 'install_uv', 'install_vscode', 'install_cline', 'install_aider', 'install_sqlcl', 'setup_oci', 'clone_repo', 'uv_sync', 'setup_env', 'run_code'];
    let completedCount = 0;

    taskOrder.forEach((taskCode, index) => {
        const task = tasks.find(t => t.task_code === taskCode);
        const isCompleted = task ? task.completed === 'Y' : false;
        if (isCompleted) completedCount++;
        const taskName = taskNames[taskCode] || taskCode;
        const taskNumber = index + 1;

        tasksListHtml += `
            <div class="task-item ${isCompleted ? 'completed' : ''}">
                <input type="checkbox" id="task-${index + 1}" data-task="${taskCode}" ${isCompleted ? 'checked' : ''}>
                <label for="task-${index + 1}">${taskNumber}. ${taskName}</label>
            </div>
        `;
    });

    const tasksHtml = `
        <h2>Onboarding Tasks <span class="progress-indicator">${completedCount}/${taskOrder.length} completed</span></h2>
        <p>Complete these tasks to finish your workshop onboarding:</p>
        <div class="tasks-list">
            ${tasksListHtml}
        </div>
        <div class="form-group">
            <label for="onboarding-comments-textarea">Onboarding Comments:</label>
            <textarea id="onboarding-comments-textarea" rows="3" placeholder="Any comments about the onboarding process...">${attendee.onboarding_comments || ''}</textarea>
        </div>
        <button id="save-comments-btn" class="btn-primary">Save Comments</button>
    `;

    tasksTab.innerHTML = tasksHtml;

    // Add event listeners to checkboxes
    taskOrder.forEach((taskCode, index) => {
        const checkbox = document.getElementById(`task-${index + 1}`);
        if (checkbox) {
            checkbox.addEventListener('change', async (event) => {
                await updateTaskCompletion(studentId, taskCode, event.target.checked);
            });
        }
    });

    // Add save comments functionality
    document.getElementById('save-comments-btn').addEventListener('click', () => saveOnboardingComments(studentId));
}

async function updateTaskCompletion(studentId, taskCode, completed) {
    try {
        const response = await fetch(`api/tasks/${studentId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                task_code: taskCode,
                completed: completed ? 'Y' : 'N'
            })
        });

        if (response.ok) {
            // Reload attendee data to update progress (silent success)
            loadAttendeeData(studentId);
        } else {
            throw new Error('Failed to update task');
        }
    } catch (error) {
        console.error('Error updating task:', error);
        showError('Failed to update task. Please try again.');
        // Revert checkbox state on error
        const checkbox = document.querySelector(`[data-task="${taskCode}"]`);
        if (checkbox) {
            checkbox.checked = !completed;
        }
    }
}

async function saveOnboardingComments(studentId) {
    const comments = document.getElementById('onboarding-comments-textarea').value.trim();

    const updateData = {
        onboarding_comments: comments
    };

    try {
        const response = await fetch(`api/attendees/${studentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData)
        });

        if (response.ok) {
            showSuccess('Comments saved successfully!');
            // Reload data to reflect changes
            loadAttendeeData(studentId);
        } else {
            throw new Error('Failed to save comments');
        }
    } catch (error) {
        console.error('Error saving comments:', error);
        showError('Failed to save comments. Please try again.');
    }
}

function updateSurveysSection(attendee) {
    const surveysTab = document.getElementById('surveys-tab');

    // Define all session surveys
    const sessionSurveys = [
        { code: 'onboarding', name: 'Onboarding', shortName: 'Onboarding' },
        { code: 'llms', name: 'LLMs Session', shortName: 'LLMs' },
        { code: 'rag', name: 'RAG Session', shortName: 'RAG' },
        { code: 'function_calling', name: 'Function Calling', shortName: 'Functions' },
        { code: 'agents', name: 'Agents Session', shortName: 'Agents' },
        { code: 'database', name: 'Database Session', shortName: 'Database' },
        { code: 'speech', name: 'Speech Session', shortName: 'Speech' },
        { code: 'vision', name: 'Vision Session', shortName: 'Vision' },
        { code: 'demos', name: 'Demos Session', shortName: 'Demos' },
        { code: 'dev_productivity', name: 'Dev Productivity', shortName: 'Dev Tools' }
    ];

    // Compute completed surveys from attendee.progress
    const progress = attendee.progress;
    let surveysCompleted = 0;
    let completedMap = {};

    // For each session survey, check if completed (using progress or fallback)
    if (progress && progress.intro_details) {
        sessionSurveys.forEach((survey) => {
            if (progress[`survey_${survey.code}_completed`] !== undefined) {
                completedMap[survey.code] = !!progress[`survey_${survey.code}_completed`];
            } else if (progress[`surveys_completed`] !== undefined) {
                // progressive fallback for demo: If progress.surveys_completed >= n, count n as done
                completedMap[survey.code] = false;
            }
            // We'll do live validation later
        });
    }

    // If attendee.surveys_completed exists & is a number, reflect in completedMap
    if (progress && typeof progress.surveys_completed === "number") {
        // Just assume the first N are completed
        for (let i = 0; i < progress.surveys_completed; i++) {
            completedMap[sessionSurveys[i]?.code] = true;
        }
    }

    // Count completed
    surveysCompleted = Object.values(completedMap).filter(Boolean).length;

    // Now let's display the count in a badge
    let surveyHeaderCount = `${surveysCompleted}/${sessionSurveys.length} completed`;

    // Place the survey progress badge to the right of the Workshop Surveys header
    let surveysHeaderHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h2 style="margin-bottom:0;">Workshop Surveys</h2>
          <span class="progress-indicator">${surveyHeaderCount}</span>
        </div>
        <p>Rate each workshop session individually:</p>
    `;

    // Create survey tab navigation
    let surveyTabsHtml = `<div class="survey-tabs"><div class="tab-buttons">`;
    let surveyContentHtml = '<div class="tab-content-container">';

    sessionSurveys.forEach((survey, index) => {
        // Is this survey completed?
        const isCompleted = !!completedMap[survey.code];
        const statusIcon = isCompleted ? '✅' : '⏳';

        surveyTabsHtml += `
            <button class="survey-tab-btn ${isCompleted ? 'completed' : ''} ${index === 0 ? 'active' : ''}" data-tab="${survey.code}">
                <span class="tab-name">${survey.shortName}</span>
                ${
                  isCompleted
                    ? '<span class="pill pill-complete">Complete</span>'
                    : '<span class="pill pill-pending">Incomplete</span>'
                }
            </button>
        `;

        // Prefill placeholders with unique ids; these will be populated dynamically
        surveyContentHtml += `
            <div class="survey-tab-content ${index === 0 ? 'active' : ''}" id="${survey.code}-tab">
                <div class="survey-form">
                    <h3>${survey.name}</h3>
                    <p>Please rate this workshop session and provide your feedback.</p>

                    <div class="rating-section">
                        <label>How would you rate this session?</label>
                        <div class="emoji-rating" id="${survey.code}-rating">
                            <button class="emoji-btn" data-rating="1" title="Poor">😞</button>
                            <button class="emoji-btn" data-rating="2" title="Below Average">🙁</button>
                            <button class="emoji-btn" data-rating="3" title="Average">😐</button>
                            <button class="emoji-btn" data-rating="4" title="Good">🙂</button>
                            <button class="emoji-btn" data-rating="5" title="Excellent">😊</button>
                        </div>
                        <div class="selected-rating" id="${survey.code}-selected"></div>
                    </div>

                    <div class="form-group">
                        <label>What did you like about this session?</label>
                        <textarea id="${survey.code}-liked" rows="3" placeholder="Share what worked well..."></textarea>
                    </div>

                    <div class="form-group">
                        <label>What could be improved?</label>
                        <textarea id="${survey.code}-better" rows="3" placeholder="Suggestions for improvement..."></textarea>
                    </div>

                    <button class="btn-primary" data-survey="${survey.code}">Submit Feedback</button>
                    <div class="survey-loading" id="${survey.code}-loading" style="display:none;color:#999;font-size:0.95em;margin-top:8px;">Loading previous response...</div>
                </div>
            </div>
        `;
    });

    // Client-side: After all tabs rendered above, load prior data
    setTimeout(() => {
        const studentId = localStorage.getItem("student_id");
        sessionSurveys.forEach((survey) => {
            const loadingDiv = document.getElementById(`${survey.code}-loading`);
            if (loadingDiv) loadingDiv.style.display = "block";
            fetch(`api/surveys/?student_id=${encodeURIComponent(studentId)}&survey_type=${encodeURIComponent(survey.code)}`)
                .then(resp => {
                    if (!resp.ok) throw new Error(`Failed to get previous survey`);
                    return resp.json();
                })
                .then(data => {
                    // Fill if data found
                    if (data && (data.rating || data.what_liked || data.what_better)) {
                        // Set rating buttons
                        const ratingDiv = document.getElementById(`${survey.code}-rating`);
                        if (ratingDiv && data.rating) {
                            const btns = ratingDiv.querySelectorAll(".emoji-btn");
                            btns.forEach(btn => {
                                if (btn.getAttribute('data-rating') === String(data.rating)) {
                                    btn.classList.add("selected");
                                    ratingDiv.setAttribute('data-selected-rating', data.rating);
                                    const selectedDiv = document.getElementById(`${survey.code}-selected`);
                                    if (selectedDiv) {
                                        selectedDiv.textContent = `Selected: ${btn.textContent} (${data.rating}/5)`;
                                    }
                                }
                            });
                        }
                        // Set what_liked/what_better if available
                        if (data.what_liked !== undefined) {
                            const liked = document.getElementById(`${survey.code}-liked`);
                            if (liked) liked.value = data.what_liked;
                        }
                        if (data.what_better !== undefined) {
                            const better = document.getElementById(`${survey.code}-better`);
                            if (better) better.value = data.what_better;
                        }
                        // Optionally show that data is loaded after a short timeout
                        setTimeout(() => { if (loadingDiv) loadingDiv.style.display = "none"; }, 500);
                    } else {
                        if (loadingDiv) loadingDiv.style.display = "none";
                    }
                })
                .catch(() => { if (loadingDiv) loadingDiv.style.display = "none"; });
        });
    }, 1);

    // Add overall feedback as a separate tab
    const overallCompleted = attendee.progress.surveys_submitted; // Overall feedback submitted

    surveyTabsHtml += `
        <button class="survey-tab-btn ${overallCompleted ? 'completed' : ''}" data-tab="overall">
            <span class="tab-name">Overall</span>
            ${
              overallCompleted
                ? '<span class="pill pill-complete">Complete</span>'
                : '<span class="pill pill-pending">Incomplete</span>'
            }
        </button>
    </div>`;

    surveyContentHtml += `
        <div class="survey-tab-content" id="overall-tab">
            <div class="survey-form">
                <h3>Overall Workshop Feedback</h3>
                <div class="rating-section">
                    <label>How would you rate the overall workshop experience?</label>
                    <div class="emoji-rating" id="overall-rating">
                        <button class="emoji-btn" data-rating="1" title="Poor">😞</button>
                        <button class="emoji-btn" data-rating="2" title="Below Average">🙁</button>
                        <button class="emoji-btn" data-rating="3" title="Average">😐</button>
                        <button class="emoji-btn" data-rating="4" title="Good">🙂</button>
                        <button class="emoji-btn" data-rating="5" title="Excellent">😊</button>
                    </div>
                    <div class="selected-rating" id="overall-selected"></div>
                </div>
                <div class="form-group">
                    <label>Overall comments about the workshop:</label>
                    <textarea id="overall-comments" rows="4" placeholder="Your overall thoughts..."></textarea>
                </div>
                <div class="form-group">
                    <label>Future workshop ideas:</label>
                    <textarea id="overall-future" rows="3" placeholder="Suggestions for future workshops..."></textarea>
                </div>
                <button class="btn-primary" data-survey="overall">Submit Overall Feedback</button>
            </div>
        </div>
    </div>`;

    const surveysHtml = `
        ${surveysHeaderHtml}
        ${surveyTabsHtml}
        ${surveyContentHtml}
    `;

    surveysTab.innerHTML = surveysHtml;

    // Add tab switching functionality
    const tabButtons = surveysTab.querySelectorAll('.survey-tab-btn');
    const tabContents = surveysTab.querySelectorAll('.survey-tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');

            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked tab
            this.classList.add('active');
            document.getElementById(tabName + '-tab').classList.add('active');
        });
    });

    // Add emoji rating functionality
    const emojiRatings = surveysTab.querySelectorAll('.emoji-rating');
    emojiRatings.forEach(rating => {
        const buttons = rating.querySelectorAll('.emoji-btn');
        const surveyCode = rating.id.replace('-rating', '');
        const selectedDiv = document.getElementById(surveyCode + '-selected');

        buttons.forEach(button => {
            button.addEventListener('click', function() {
                // Remove selected class from all buttons in this rating
                buttons.forEach(btn => btn.classList.remove('selected'));
                // Add selected class to clicked button
                this.classList.add('selected');

                const ratingValue = this.getAttribute('data-rating');
                const emoji = this.textContent;
                selectedDiv.textContent = `Selected: ${emoji} (${ratingValue}/5)`;

                // Store the rating value
                this.closest('.emoji-rating').setAttribute('data-selected-rating', ratingValue);
            });
        });
    });

    // Add submit button functionality
    const submitButtons = surveysTab.querySelectorAll('.btn-primary[data-survey]');
    submitButtons.forEach(button => {
        button.addEventListener('click', function() {
            const surveyCode = this.getAttribute('data-survey');
            submitIndividualSurvey(attendee.student_id, surveyCode);
        });
    });
}

async function submitSessionSurveys(studentId) {
    const sessionSurveys = [
        'onboarding', 'llms', 'rag', 'function_calling', 'agents',
        'database', 'speech', 'vision', 'demos', 'dev_productivity'
    ];

    let submittedCount = 0;

    for (const surveyType of sessionSurveys) {
        const rating = document.getElementById(`${surveyType}-rating`).value;
        const liked = document.getElementById(`${surveyType}-liked`).value.trim();
        const better = document.getElementById(`${surveyType}-better`).value.trim();

        // Only submit if at least rating is provided
        if (rating) {
            try {
                const response = await fetch('api/surveys/', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        student_id: studentId,
                        survey_type: surveyType,
                        rating: parseInt(rating),
                        what_liked: liked,
                        what_better: better
                    })
                });

                if (response.ok) {
                    submittedCount++;
                    // Clear the form
                    document.getElementById(`${surveyType}-rating`).value = '';
                    document.getElementById(`${surveyType}-liked`).value = '';
                    document.getElementById(`${surveyType}-better`).value = '';
                }
            } catch (error) {
                console.error(`Error submitting ${surveyType} survey:`, error);
            }
        }
    }

    if (submittedCount > 0) {
        showSuccess(`Submitted ${submittedCount} session survey(s) successfully!`);
        // Reload data to update progress
        loadAttendeeData(studentId);
    } else {
        showError('Please fill out at least one survey rating.');
    }
}

async function submitOverallFeedback(studentId) {
    const rating = document.getElementById('overall-rating').value;
    const comments = document.getElementById('overall-comments').value.trim();
    const futureIdeas = document.getElementById('future-ideas').value.trim();

    if (!rating) {
        showError('Please provide an overall rating.');
        return;
    }

    try {
        const response = await fetch('api/surveys/overall', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                student_id: studentId,
                overall_rating: parseInt(rating),
                overall_comments: comments,
                future_ideas: futureIdeas
            })
        });

        if (response.ok) {
            showSuccess('Overall feedback submitted successfully!');
            // Clear the form
            document.getElementById('overall-rating').value = '';
            document.getElementById('overall-comments').value = '';
            document.getElementById('future-ideas').value = '';
            // Reload data to update progress, but do not switch tabs
            const activeSurveyTab = document.querySelector('.survey-tab-btn.active');
            const activeSurvey = activeSurveyTab ? activeSurveyTab.getAttribute('data-tab') : null;
            loadAttendeeData(studentId);
            setTimeout(() => {
                if (activeSurvey) {
                    const btn = document.querySelector(`.survey-tab-btn[data-tab="${activeSurvey}"]`);
                    if (btn && !btn.classList.contains('active')) btn.click();
                }
            }, 250);
        } else {
            throw new Error('Failed to submit feedback');
        }
    } catch (error) {
        console.error('Error submitting overall feedback:', error);
        showError('Failed to submit feedback. Please try again.');
    }
}

function updateAttendeeProfile(attendee) {
    // Update attendee name
    const nameElement = document.getElementById('attendee-name');
    if (nameElement) {
        nameElement.textContent = attendee.name || 'Workshop Attendee';
    }

    // Update email
    const emailElement = document.getElementById('attendee-email');
    if (emailElement && attendee.email_address) {
        emailElement.textContent = attendee.email_address;
    }

    // Update location details and agenda button
    const locationDetails = document.getElementById('location-details');
    const viewAgendaBtn = document.getElementById('view-agenda-btn');
    if (attendee.location) {
        locationDetails.innerHTML = `
            <p>Location: ${attendee.location.name} (${attendee.location.code}) - ${attendee.location.room}</p>
            <p>Meeting Time: ${attendee.location.meeting_time}</p>
        `;
        if (attendee.location.agenda_image_path) {
            viewAgendaBtn.style.display = 'block';
            viewAgendaBtn.onclick = () => showAgenda(attendee.location.agenda_image_path);
        } else {
            viewAgendaBtn.style.display = 'none';
        }
    } else {
        locationDetails.innerHTML = '<p>Location: TBD</p>';
        viewAgendaBtn.style.display = 'none';
    }

    // Update profile image
    const imgElement = document.getElementById('profile-img');
    if (imgElement && attendee.image_filename) {
        // Use the image serving endpoint
        imgElement.src = `api/attendees/${attendee.student_id}/image`;
        imgElement.style.display = 'block';
    } else {
        // Keep the default/fallback image - try SVG first
        imgElement.src = 'static/images/default-avatar.svg';
    }
}

// Modal functions
function showAgenda(imagePath) {
    const modal = document.getElementById('agenda-modal');
    const modalImg = document.getElementById('modal-img');
    modalImg.src = imagePath;
    modal.style.display = 'block';
}

function closeModal() {
    const modal = document.getElementById('agenda-modal');
    modal.style.display = 'none';
}

// Event listener for close button
document.addEventListener('DOMContentLoaded', function() {
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        closeBtn.onclick = closeModal;
    }
    window.onclick = function(event) {
        const modal = document.getElementById('agenda-modal');
        if (event.target == modal) {
            closeModal();
        }
    }
});

function showSuccess(message) {
    // Simple success notification
    alert('✅ ' + message);
}

async function submitIndividualSurvey(studentId, surveyCode) {
    const ratingElement = document.getElementById(`${surveyCode}-rating`);
    const rating = ratingElement ? ratingElement.getAttribute('data-selected-rating') : null;
    const liked = document.getElementById(`${surveyCode}-liked`).value.trim();
    const better = document.getElementById(`${surveyCode}-better`).value.trim();

    if (!rating) {
        showError('Please select a rating for this session.');
        return;
    }

    try {
        let response;
        if (surveyCode === 'overall') {
            // Overall feedback
            const comments = document.getElementById('overall-comments').value.trim();
            const futureIdeas = document.getElementById('overall-future').value.trim();

            response = await fetch('api/surveys/overall', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    student_id: studentId,
                    overall_rating: parseInt(rating),
                    overall_comments: comments,
                    future_ideas: futureIdeas
                })
            });
        } else {
            // Individual session survey
            response = await fetch('api/surveys/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    student_id: studentId,
                    survey_type: surveyCode,
                    rating: parseInt(rating),
                    what_liked: liked,
                    what_better: better
                })
            });
        }

        if (response.ok) {
            showSuccess('Feedback submitted successfully!');
            // Clear the form
            if (surveyCode === 'overall') {
                document.getElementById('overall-comments').value = '';
                document.getElementById('overall-future').value = '';
                document.getElementById('overall-selected').textContent = '';
                const overallButtons = document.querySelectorAll('#overall-rating .emoji-btn');
                overallButtons.forEach(btn => btn.classList.remove('selected'));
                document.getElementById('overall-rating').removeAttribute('data-selected-rating');
            } else {
                document.getElementById(`${surveyCode}-liked`).value = '';
                document.getElementById(`${surveyCode}-better`).value = '';
                document.getElementById(`${surveyCode}-selected`).textContent = '';
                const buttons = document.querySelectorAll(`#${surveyCode}-rating .emoji-btn`);
                buttons.forEach(btn => btn.classList.remove('selected'));
                document.getElementById(`${surveyCode}-rating`).removeAttribute('data-selected-rating');
            }
            // Reload data to update progress
            loadAttendeeData(studentId);
        } else {
            throw new Error('Failed to submit feedback');
        }
    } catch (error) {
        console.error('Error submitting survey:', error);
        showError('Failed to submit feedback. Please try again.');
    }
}

function showSuccess(message) {
    // Simple success notification
    alert('✅ ' + message);
}

function showError(message) {
    // Simple error notification
    alert('❌ ' + message);
}
