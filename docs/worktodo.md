# Work TODO

## Pending Enhancements
1. **Admin Dashboard Restoration & Expansion**
   - Restore editing for intro/onboarding/survey questions (CRUD UI in admin.js/html, tied to backend routers/services).
   - Add game play UI for 2 Truths & a Lie (reveal lies, manage responses; reference legacy commits like 42694ba).
   - Implement bulk attendee operations and CSV export.

2. **Onboarding Checklist & Surveys Seeding/Fixing**
   - Seed default onboarding questions in backend/tasks.py (e.g., "Install VS Code", "Read guidelines") via database inserts or script.
   - Create and seed surveys as templates: Onboarding Survey (pre-workshop), Daily Modules (one per day, e.g., "Day 1 Feedback"), Overall Survey (post-workshop) in backend/surveys.py; use DAY field or CONFIG for structure (adapt old module-based templates).
   - Fix rendering/formatting UX in tasks/surveys tabs (apply larger boxes/CSS consistency from intros tab; ensure surveys show by type/module in attendee surveys tab).

3. **Full Testing & Polish**
   - Test admin editing/game on seeded data (including onboarding/overall/daily surveys); verify mobile responsiveness.
   - Update docs/architecture.md with new features (survey types: onboarding, daily, overall); run full migrations/tests.
   - Audit backend APIs for question editing support (e.g., /api/intros/admin, /api/tasks/templates, /api/surveys/modules).

## Blockers / Notes
- Use git history for old survey module logic if needed (e.g., template CONFIG for types/days).