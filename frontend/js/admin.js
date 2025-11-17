/**
 * Admin dashboard JavaScript
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin dashboard loaded');

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

    // Query functionality (placeholder)
    const queryBtn = document.getElementById('query-btn');
    const queryInput = document.getElementById('query-input');
    const queryResults = document.getElementById('query-results');

    if (queryBtn) {
        queryBtn.addEventListener('click', function() {
            const query = queryInput.value.trim();
            if (query) {
                queryResults.innerHTML = `<p>Query functionality will be implemented. You asked: "${query}"</p>`;
            }
        });
    }

    // Game functionality (placeholder)
    const startGameBtn = document.getElementById('start-game-btn');
    const locationSelect = document.getElementById('location-select');
    const gameDisplay = document.getElementById('game-display');

    if (startGameBtn) {
        startGameBtn.addEventListener('click', function() {
            const location = locationSelect.value;
            if (location) {
                gameDisplay.innerHTML = `<p>Game functionality will be implemented for location: ${location}</p>`;
            } else {
                gameDisplay.innerHTML = '<p>Please select a location first.</p>';
            }
        });
    }
});
