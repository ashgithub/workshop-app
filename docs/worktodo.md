# Work TODO

## Pending Enhancements
1. **Extend MDC_WORKSHOP Schema**  
   - Add `INTRO_QUESTIONS` and `ATTENDEE_INTRO_RESPONSES` tables via `backend/database.py` so the new schema mirrors legacy introduction data.
   - Seed default prompts (Introduce Yourself, Fun Fact, Two Truths & a Lie) and sample responses for test1–test3.

2. **Admin Intro Management API/UI**  
   - Service layer methods to list/create/update intro questions.
   - Admin router endpoints (CRUD, ordering, activation).
   - Frontend admin tab for managing intro prompts (Redwood styling).

3. **Attendee Redwood Experience**  
   - Restore introduction panel, horizontal progress bar, and refined checklist in `frontend/attendee.html` with matching CSS. ✅
   - Update `frontend/js/attendee.js` to render intro responses, new progress visuals, and optional cohort time ranges. ✅

4. **Cohort Schedule Metadata**  
   - Ensure `COHORTS` includes `START_TIME` / `END_TIME` columns via migrations (`backend/database.py`, `scripts/migrate.sh`).
   - Confirm `backend/services/attendees.py` serializes the new fields so the attendee UI renders the full date+time range.

5. **Testing & Docs**  
   - Verify migrations via `uv run scripts/migrate.sh` once dependencies load.
   - Update tests/docs if needed after schema+UI changes. ✅

## Blockers / Notes
- Python dependencies (`envyaml`, `oracledb`) only load reliably when commands run inside the project venv with `uv run` (see docs/architecture.md).
- Awaiting environment fix so `uv run python -c "import backend.database"` succeeds before modifying schema.
