# Work TODO

## Completed Work
1. **Onboarding Checklist Implementation** ✅
   - Converted baseline 11 tasks to question-based onboarding system similar to introductions
   - Added `ONBOARDING_QUESTIONS` and `ATTENDEE_ONBOARDING_RESPONSES` tables
   - Created `backend/services/onboarding.py` and `backend/routers/v2/onboarding.py`
   - Updated frontend to render onboarding questions with progress tracking
   - Added admin CRUD operations for onboarding questions
   - Updated progress calculation to count question responses
   - Migrated admin dashboard from legacy STUDENTS table to ATTENDEES table
   - Removed legacy task system (ONBOARDING_TASK_TEMPLATES, COHORT_TASK_TEMPLATES, ATTENDEE_TASKS tables)

2. **Surveys Implementation & Enhancement** ✅
   - Created 7 comprehensive survey templates: Onboarding (pre-workshop), Day 1-5 (daily feedback), Overall (post-workshop)
   - Updated database seeding in `backend/database.py` to create survey templates and 30+ questions
   - **Fixed Critical 404 Error**: Added missing `GET /api/surveys/templates/{template_id}` endpoint
   - **Enhanced UX**: Replaced modal-based forms with clean tabbed interface inspired by original design
   - **Simplified Forms**: Streamlined to 3 key fields per survey (rating + 2 feedback textareas)
   - **Visual Rating System**: 5-emoji rating buttons (😞🙁😐🙂😊) with immediate feedback
   - **Tabbed Navigation**: Clean horizontal tabs with completion status pills
   - Added survey progress counter to main dashboard ("X of 7 completed")
   - Standardized survey UI to match intro/onboarding styling with field groups and completion status
   - Integrated survey submissions with existing `SURVEY_TEMPLATES`, `SURVEY_QUESTIONS`, `SURVEY_SUBMISSIONS`, `SURVEY_ANSWERS` tables
   - Added responsive design and accessibility features for survey forms

3. **Theming Standardization** ✅
   - Unified color palette across all pages (replaced #667eea blue with --rw-accent red)
   - Standardized backgrounds (login/attendee pages now use consistent --rw-background)
   - Unified fonts (--rw-font) and typography across login, attendee, and admin pages
   - Consistent progress indicators, focus states, and interactive elements
   - Applied Oracle Redwood-inspired design theme consistently throughout

## Pending Enhancements
1. **Admin Dashboard Expansion**
   - Restore editing for intro/onboarding/survey questions (CRUD UI in admin.js/html, tied to backend routers/services).
   - Implement bulk attendee operations and CSV export.
   - Add survey management interface (create/edit/delete survey templates and questions).
   - shoudl we inave intro question tab like others 
   - Game functionality removed (was dependent on legacy STUDENTS table).

2. **UI/UX Improvements**
   - Add descriptive tasks/examples for introduction questions (what to include in intro text)
   - Include links to details for intro & onboarding (link to canvas in slack)
   - for intro have  default tyext in text area simiar to surveys 

3. **Full Testing & Polish**
   - Test admin editing on seeded data (onboarding/overall/daily surveys)
   - Run full migrations/tests with updated survey system
   - Audit backend APIs for question editing support (e.g., /api/intros/admin, /api/onboarding/admin, /api/surveys/admin)
   - Verify mobile responsiveness of enhanced survey interface

## Blockers / Notes
- Use git history for old survey module logic if needed (e.g., template CONFIG for types/days).