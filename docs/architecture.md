# AI Workshop Companion Architecture Notes

## Dual-Schema Strategy
- **Legacy schema:** Holds restored `STUDENTS`, `ONBOARDING_TASKS`, and related tables for historical comparison (via `scripts/restore_legacy.py`).
- **MDC_WORKSHOP schema:** Primary home for the new AI Workshop Companion app; migrations live in `backend/database.py` and `scripts/migrate.sh`.

## Introduction Prompts & Cohort Scheduling
- Introductions are managed via the MDC_WORKSHOP tables `INTRO_QUESTIONS` and `ATTENDEE_INTRO_RESPONSES` (see `backend/database.py`).
- Seed defaults and test attendee responses during migrations for parity with the older experience.

### Cohort Timing Metadata
- Extend the `COHORTS` table with `START_TIME` / `END_TIME` (TIMESTAMP) so daily agendas can surface on the attendee portal.
- When fetching an attendee (`backend/services/attendees.py`), include these columns and serialize them (ISO 8601) alongside `START_DATE` / `END_DATE`.
- Frontend helpers already pick up `cohort.start_time` / `cohort.end_time` and render ranges like `Mar 23 – Mar 27 2026 · 9:00 AM – 5:00 PM`.

## Tooling Notes
- Use `uv run` (or activate `.venv`) for any Python command that imports project modules; direct `python` misses dependencies like `envyaml` and `oracledb`.
- Migrations (`scripts/migrate.sh`) rely on the same `backend.database` module.

## Pending Work
See `docs/worktodo.md` for the current task list (admin intro management, Redwood UI revival, testing).
