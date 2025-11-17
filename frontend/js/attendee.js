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
        const response = await fetch(`/api/attendees/${studentId}`);

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

    const introHtml = `
        <h2>Introduction</h2>
        <div class="introduction-form">
            <h3>Workshop Acknowledgment</h3>
            <div class="form-group">
                <label for="ack-checkbox">
                    <input type="checkbox" id="ack-checkbox" ${attendee.ack === 'Y' ? 'checked' : ''}>
                    I acknowledge participation in this workshop
                </label>
            </div>

            <h3>Introduction Details</h3>
            <div class="form-group">
                <label for="team-input">1. Team Name:</label>
                <input type="text" id="team-input" value="${attendee.team || ''}" placeholder="Enter your team name">
            </div>

            <div class="form-group">
                <label for="intro-textarea">2. Introduction:</label>
                <textarea id="intro-textarea" rows="4" placeholder="Tell us about yourself...">${attendee.intro || ''}</textarea>
            </div>

            <div class="form-group">
                <label>3. 2 Truths and a Lie:</label>
                <input type="text" id="tl1-input" value="${attendee.tl1 || ''}" placeholder="Truth or Lie #1">
                <input type="text" id="tl2-input" value="${attendee.tl2 || ''}" placeholder="Truth or Lie #2">
                <input type="text" id="tl3-input" value="${attendee.tl3 || ''}" placeholder="Truth or Lie #3">
            </div>

            <div class="form-group">
                <label>4. Device Preference:</label>
                <label><input type="radio" name="device" value="M" ${attendee.mac_pc === 'M' ? 'checked' : ''}> Mac</label>
                <label><input type="radio" name="device" value="P" ${attendee.mac_pc === 'P' ? 'checked' : ''}> PC</label>
            </div>

            <button id="save-intro-btn" class="btn-primary">Save Introduction</button>
        </div>
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
        const response = await fetch(`/api/attendees/${studentId}`, {
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
        const response = await fetch(`/api/tasks/${studentId}`);
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

    // Create task items HTML
    let tasksListHtml = '';
    const taskOrder = ['tenancy_access', 'install_uv', 'install_vscode', 'install_cline', 'install_aider', 'install_sqlcl', 'setup_oci', 'clone_repo', 'uv_sync', 'setup_env', 'run_code'];

    taskOrder.forEach((taskCode, index) => {
        const task = tasks.find(t => t.task_code === taskCode);
        const isCompleted = task ? task.completed === 'Y' : false;
        const taskName = taskNames[taskCode] || taskCode;
        const taskNumber = index + 1;

        tasksListHtml += `
            <div class="task-item">
                <input type="checkbox" id="task-${index + 1}" data-task="${taskCode}" ${isCompleted ? 'checked' : ''}>
                <label for="task-${index + 1}">${taskNumber}. ${taskName}</label>
            </div>
        `;
    });

    const tasksHtml = `
        <h2>Onboarding Tasks</h2>
        <p>Complete these tasks to finish your workshop onboarding:</p>
        <div class="tasks-list">
            ${tasksListHtml}
        </div>
        <div class="form-group">
            <label for="onboarding-comments-textarea">Onboarding Comments:</label>
            <textarea id="onboarding-comments-textarea" rows="3" placeholder="Any comments about the onboarding process...">${attendee.onboarding_comments || ''}</textarea>
        </div>
        <button id="save-comments-btn" class="btn-secondary">Save Comments</button>
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
        const response = await fetch(`/api/tasks/${studentId}`, {
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
            showSuccess('Task updated successfully!');
            // Reload attendee data to update progress
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
        const response = await fetch(`/api/attendees/${studentId}`, {
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

    // Create survey tab navigation
    let surveyTabsHtml = '<div class="survey-tabs"><div class="tab-buttons">';
    let surveyContentHtml = '<div class="tab-content-container">';

    sessionSurveys.forEach((survey, index) => {
        // Check if survey is completed (has been submitted) - this is a simplified check
        const isCompleted = false; // For now, we'll implement proper completion checking later

        const statusIcon = isCompleted ? '✅' : '⏳';

        surveyTabsHtml += `
            <button class="survey-tab-btn ${index === 0 ? 'active' : ''}" data-tab="${survey.code}">
                <span class="tab-status">${statusIcon}</span>
                <span class="tab-name">${survey.shortName}</span>
            </button>
        `;

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

                    <button class="submit-survey-btn" data-survey="${survey.code}">Submit Feedback</button>
                </div>
            </div>
        `;
    });

    // Add overall feedback as a separate tab
    const overallCompleted = attendee.progress.surveys_submitted; // Overall feedback submitted
    const overallTabClass = overallCompleted ? 'completed' : 'pending';
    const overallStatusIcon = overallCompleted ? '✅' : '⏳';

    surveyTabsHtml += `
        <button class="survey-tab-btn" data-tab="overall">
            <span class="tab-status">${overallStatusIcon}</span>
            <span class="tab-name">Overall</span>
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
                <button class="submit-survey-btn" data-survey="overall">Submit Overall Feedback</button>
            </div>
        </div>
    </div>`;

    const surveysHtml = `
        <h2>Workshop Surveys</h2>
        <p>Rate each workshop session individually:</p>
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
    const submitButtons = surveysTab.querySelectorAll('.submit-survey-btn');
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
                const response = await fetch('/api/surveys/', {
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
        const response = await fetch('/api/surveys/overall', {
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
            // Reload data to update progress
            loadAttendeeData(studentId);
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

    // Update profile image
    const imgElement = document.getElementById('profile-img');
    if (imgElement && attendee.image_filename) {
        // Use the image serving endpoint
        imgElement.src = `/api/attendees/${attendee.student_id}/image`;
        imgElement.style.display = 'block';
    } else {
        // Keep the default/fallback image - try SVG first
        imgElement.src = '/static/images/default-avatar.svg';
    }
}

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

            response = await fetch('/api/surveys/overall', {
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
            response = await fetch('/api/surveys/', {
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
