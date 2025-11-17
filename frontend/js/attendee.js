/**
 * Attendee portal JavaScript
 */

document.addEventListener('DOMContentLoaded', function() {
    // Get student ID from localStorage
    const studentId = localStorage.getItem('student_id');
    if (studentId) {
        document.getElementById('student-id').textContent = studentId;
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
