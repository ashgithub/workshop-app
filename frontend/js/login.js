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

            const response = await fetch('api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    is_admin: isAdmin
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Store session info (in a real app, use proper session management)
                localStorage.setItem('student_id', data.student_id);
                localStorage.setItem('is_admin', data.is_admin);

                // Redirect based on user type
                if (data.is_admin) {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'attendee.html';
                }
            } else {
                showMessage(data.detail || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            showMessage('Network error. Please try again.', 'error');
        } finally {
            loginBtn.disabled = false;
            adminBtn.disabled = false;
        }
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
