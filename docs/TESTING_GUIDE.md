# AI Workshop Companion Testing Guide

## Environment Setup
- Activate the same virtual environment used for development.
- Ensure Oracle test DSN contains the seeded MDC cohort and three test attendees.

## Smoke Tests
1. **API Health**
   ```bash
   curl http://localhost:8000/api/health
   ```
   Expect JSON with `status: healthy` and `database: connected`.
2. **Admin Login**
   - Open `/admin.html`, log in with seeded admin email and shared password.
   - Verify cohorts load and test users are hidden with "Ignore test users" toggle on.
3. **Attendee Portal**
   - Log in via `/index.html` using `test1@test.org`.
   - Check checklist tasks load and can toggle between Pending/Completed.

## Functional Tests
- **Cohort Management**: Invite a new attendee via admin UI, confirm tasks generated in Oracle (`ATTENDEE_TASKS`).
- **Onboarding Tasks**: Mark tasks as completed and confirm `ATTENDEE_TASKS` rows update.
- **Surveys**: Submit Post-Workshop survey from attendee tab; verify new row in `SURVEY_SUBMISSIONS` and answers in `SURVEY_ANSWERS`.
- **NL Query**: Run sample prompt in admin NL SQL tab; ensure results return and `NL_QUERY_LOGS` captures entry.

## Regression Checks
- Restart API ensuring schema is not dropped (toggle remains false).
- Run `./scripts/migrate.sh` in a staging DB to validate rebuild path.
- Confirm static root `/` redirects to `index.html`.

## Automation Hooks
- Add future pytest or integration tests under `tests/` (not yet implemented).
- Consider Oracle containerized test instance or mocks for CI.
