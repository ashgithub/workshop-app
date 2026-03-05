/**
 * Login page JavaScript
 */

document.addEventListener('DOMContentLoaded', function() {
    const emailInput = document.getElementById('email');
    const loginBtn = document.getElementById('login-btn');
    const adminBtn = document.getElementById('admin-btn');
    const autocompleteResults = document.getElementById('autocomplete-results');
    const messageDiv = document.getElementById('message');

    let autocompleteTimeout;

    // Email input handler with autocomplete
    emailInput.addEventListener('input', function() {
        const query = this.value.trim();

        // Clear previous timeout
        clearTimeout(autocompleteTimeout);

        if (query.length >= 2) {
            // Debounce autocomplete requests
            autocompleteTimeout = setTimeout(() => {
                fetchAutocomplete(query);
            }, 300);
        } else {
            hideAutocomplete();
        }
    });

    // Login button handler
    loginBtn.addEventListener('click', function() {
        const email = emailInput.value.trim();
        if (email) {
            login(email, false);
        } else {
            showMessage('Please enter your email address', 'error');
        }
    });

    // Admin button handler
    adminBtn.addEventListener('click', function() {
        const email = emailInput.value.trim();
        if (email) {
            login(email, true);
        } else {
            showMessage('Please enter your email address', 'error');
        }
    });

    // Handle enter key
    emailInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            loginBtn.click();
        }
    });

    // Autocomplete result selection
    autocompleteResults.addEventListener('click', function(e) {
        if (e.target.classList.contains('autocomplete-item')) {
            emailInput.value = e.target.textContent;
            hideAutocomplete();
            emailInput.focus();
        }
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', function(e) {
        if (!emailInput.contains(e.target) && !autocompleteResults.contains(e.target)) {
            hideAutocomplete();
        }
    });

    async function fetchAutocomplete(query) {
        try {
            const response = await fetch(`api/attendees/autocomplete?q=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                showAutocomplete(data.emails);
            }
        } catch (error) {
            console.error('Autocomplete error:', error);
        }
    }

    function showAutocomplete(emails) {
        autocompleteResults.innerHTML = '';

        if (emails.length > 0) {
            emails.forEach(email => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.textContent = email;
                autocompleteResults.appendChild(div);
            });
            autocompleteResults.style.display = 'block';
        } else {
            hideAutocomplete();
        }
    }

    function hideAutocomplete() {
        autocompleteResults.style.display = 'none';
    }

    async function login(email, isAdmin) {
        try {
            showMessage('Logging in...', 'success');
            loginBtn.disabled = true;
            adminBtn.disabled = true;

            let adminPassword = null;
            if (isAdmin) {
                adminPassword = prompt('Enter admin password');
                if (!adminPassword) {
                    showMessage('Admin password is required', 'error');
                    return;
                }
            }

            const response = await fetch('api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    is_admin: isAdmin,
                    admin_password: adminPassword
                })
            });

            let data = null;
            try {
                data = await response.json();
            } catch (parseError) {
                // Non-JSON response fallback
            }

            if (response.ok) {
                // Store session info (in a real app, use proper session management)
                localStorage.setItem('user_id', data.user_id);
                localStorage.setItem('is_admin', data.is_admin);
                if (data.cohort_id) {
                    localStorage.setItem('cohort_id', data.cohort_id);
                }

                // Unified auth session (single source of truth for frontend auth state)
                const authSession = {
                    user_id: data.user_id,
                    role: data.is_admin ? 'admin' : 'attendee',
                    admin_token: data.is_admin ? adminPassword : null,
                    issued_at: Date.now(),
                };
                localStorage.setItem('auth_session', JSON.stringify(authSession));

                // Store/clear admin auth token used by protected admin APIs
                if (data.is_admin) {
                    localStorage.setItem('ADMIN_AUTH', JSON.stringify(adminPassword));
                } else {
                    localStorage.removeItem('ADMIN_AUTH');
                }

                // Redirect based on user type
                if (data.is_admin) {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'attendee.html';
                }
            } else {
                const details = extractErrorMessage(data);
                const defaultText = response.status === 422
                    ? 'Please enter a valid email address.'
                    : (response.statusText || 'Login failed');
                showMessage(details || defaultText, 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showMessage('Network error. Please try again.', 'error');
        } finally {
            loginBtn.disabled = false;
            adminBtn.disabled = false;
        }
    }

    function extractErrorMessage(payload) {
        if (!payload) {
            return '';
        }

        if (typeof payload === 'string') {
            return payload;
        }

        if (Array.isArray(payload.detail)) {
            const first = payload.detail[0];
            if (first && typeof first === 'object') {
                if (first.msg) {
                    return first.msg;
                }
                if (first.detail) {
                    return first.detail;
                }
            }
            return payload.detail.map(item => item.msg || item.detail || '').filter(Boolean).join(', ');
        }

        if (typeof payload.detail === 'string') {
            return payload.detail;
        }

        if (payload.detail && typeof payload.detail === 'object') {
            const nested = extractErrorMessage(payload.detail);
            if (nested) {
                return nested;
            }
        }

        return '';
    }

    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';

        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 3000);
        }
    }
});
