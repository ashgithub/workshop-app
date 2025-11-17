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
        await loadTasksData(studentId);

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
                    ${progress.intro_completed ? '✓ Completed' : '○ Pending'}
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
                    ${progress.surveys_submitted ? '✓ Submitted' : '○ Pending'}
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
            <div class="form-group">
                <label for="ack-checkbox">
                    <input type="checkbox" id="ack-checkbox" ${attendee.ack === 'Y' ? 'checked' : ''}>
                    I acknowledge participation in this workshop
                </label>
            </div>

            <div class="form-group">
                <label for="team-input">Team Name:</label>
                <input type="text" id="team-input" value="${attendee.team || ''}" placeholder="Enter your team name">
            </div>

            <div class="form-group">
                <label>2 Truths and a Lie:</label>
                <input type="text" id="tl1-input" value="${attendee.tl1 || ''}" placeholder="Truth or Lie #1">
                <input type="text" id="tl2-input" value="${attendee.tl2 || ''}" placeholder="Truth or Lie #2">
                <input type="text" id="tl3-input" value="${attendee.tl3 || ''}" placeholder="Truth or Lie #3">
            </div>

            <div class="form-group">
                <label for="intro-textarea">Introduction:</label>
                <textarea id="intro-textarea" rows="4" placeholder="Tell us about yourself...">${attendee.intro || ''}</textarea>
            </div>

            <div class="form-group">
                <label>Device Preference:</label>
                <label><input type="radio" name="device" value="M" ${attendee.mac_pc === 'M' ? 'checked' : ''}> Mac</label>
                <label><input type="radio" name="device" value="P" ${attendee.mac_pc === 'P' ? 'checked' : ''}> PC</label>
            </div>

            <div class="form-group">
                <label for="comments-textarea">Onboarding Comments:</label>
                <textarea id="comments-textarea" rows="3" placeholder="Any comments about the onboarding process...">${attendee.onboarding_comments || ''}</textarea>
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
        mac_pc: document.querySelector('input[name="device"]:checked')?.value,
        onboarding_comments: document.getElementById('comments-textarea').value.trim()
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

async function loadTasksData(studentId) {
    try {
        const response = await fetch(`/api/tasks/${studentId}`);
        if (response.ok) {
            const tasks = await response.json();
            updateTasksSection(tasks);
        } else {
            console.log('Tasks API not implemented yet, showing placeholder');
            updateTasksSection([]);
        }
    } catch (error) {
        console.error('Error loading tasks:', error);
        updateTasksSection([]);
    }
}

function updateTasksSection(tasks) {
    const tasksTab = document.getElementById('tasks-tab');

    const tasksHtml = `
        <h2>Onboarding Tasks</h2>
        <p>Complete these tasks to finish your workshop onboarding:</p>
        <div class="tasks-list">
            <div class="task-item">
                <input type="checkbox" id="task-1" data-task="tenancy_access">
                <label for="task-1">Access tenancy setup</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-2" data-task="install_uv">
                <label for="task-2">Install UV package manager</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-3" data-task="install_vscode">
                <label for="task-3">Install VS Code</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-4" data-task="install_cline">
                <label for="task-4">Install Cline extension</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-5" data-task="install_aider">
                <label for="task-5">Install Aider</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-6" data-task="install_sqlcl">
                <label for="task-6">Install SQLcl</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-7" data-task="setup_oci">
                <label for="task-7">Setup OCI configuration</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-8" data-task="clone_repo">
                <label for="task-8">Clone workshop repository</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-9" data-task="uv_sync">
                <label for="task-9">Run UV sync</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-10" data-task="setup_env">
                <label for="task-10">Setup environment</label>
            </div>
            <div class="task-item">
                <input type="checkbox" id="task-11" data-task="run_code">
                <label for="task-11">Run workshop code</label>
            </div>
        </div>
        <p><em>Note: Task completion tracking will be implemented in Phase 4</em></p>
    `;

    tasksTab.innerHTML = tasksHtml;
}

function updateSurveysSection(attendee) {
    const surveysTab = document.getElementById('surveys-tab');

    const surveysHtml = `
        <h2>Workshop Surveys</h2>
        <div class="survey-sections">
            <div class="survey-section">
                <h3>Session Surveys</h3>
                <p>Rate each workshop session:</p>
                <div class="session-surveys">
                    <div class="survey-item">
                        <h4>LLMs Session</h4>
                        <div class="rating">
                            <label>Rating: </label>
                            <select id="llms-rating">
                                <option value="">Select rating</option>
                                <option value="1">1 - Poor</option>
                                <option value="2">2 - Below Average</option>
                                <option value="3">3 - Average</option>
                                <option value="4">4 - Good</option>
                                <option value="5">5 - Excellent</option>
                            </select>
                        </div>
                    </div>
                    <!-- Add more session surveys as needed -->
                </div>
            </div>

            <div class="survey-section">
                <h3>Overall Workshop Feedback</h3>
                <div class="feedback-form">
                    <div class="rating">
                        <label for="overall-rating">Overall Rating:</label>
                        <select id="overall-rating">
                            <option value="">Select rating</option>
                            <option value="1">1 - Poor</option>
                            <option value="2">2 - Below Average</option>
                            <option value="3">3 - Average</option>
                            <option value="4">4 - Good</option>
                            <option value="5">5 - Excellent</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="overall-comments">Comments:</label>
                        <textarea id="overall-comments" rows="4" placeholder="Your overall feedback..."></textarea>
                    </div>
                    <div class="form-group">
                        <label for="future-ideas">Future Workshop Ideas:</label>
                        <textarea id="future-ideas" rows="3" placeholder="Suggestions for future workshops..."></textarea>
                    </div>
                    <button id="submit-feedback-btn" class="btn-primary">Submit Feedback</button>
                </div>
            </div>
        </div>
        <p><em>Note: Survey submission will be implemented in Phase 4</em></p>
    `;

    surveysTab.innerHTML = surveysHtml;
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

function showError(message) {
    // Simple error notification
    alert('❌ ' + message);
}
