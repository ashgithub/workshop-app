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

## Pending Enhancements
1. **Admin Dashboard Expansion**
   - Restore editing for intro/onboarding/survey questions (CRUD UI in admin.js/html, tied to backend routers/services).
   - Implement bulk attendee operations and CSV export.
   - Game functionality removed (was dependent on legacy STUDENTS table).

2. **Surveys Implementation**
   - Create and seed surveys as templates: Onboarding Survey (pre-workshop), Daily Modules (one per day, e.g., "Day 1 Feedback"), Overall Survey (post-workshop) in backend/surveys.py; use DAY field or CONFIG for structure (adapt old module-based templates).
   - Fix rendering/formatting UX in surveys tab (apply larger boxes/CSS consistency from intros tab; ensure surveys show by type/module in attendee surveys tab).

3. **UI/UX Improvements**
   - Move acknowledgment checkbox to user panel (more prominent placement)
   - Add descriptive tasks/examples for introduction questions (what to include in intro text)
   - Include links to details for intro & onboarding (link to canvas in slack)

4. **Full Testing & Polish**
   - Test admin editing on seeded data (onboarding/overall/daily surveys); verify mobile responsiveness.
   - Run full migrations/tests with updated onboarding system.
   - Audit backend APIs for question editing support (e.g., /api/intros/admin, /api/onboarding/admin, /api/surveys/modules).

## Blockers / Notes
- Use git history for old survey module logic if needed (e.g., template CONFIG for types/days).