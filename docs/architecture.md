# AI Workshop Companion Architecture Notes

## Dual-Schema Strategy
- **Legacy schema:** Holds restored `STUDENTS`, `ONBOARDING_TASKS`, and related tables for historical comparison (via `scripts/restore_legacy.py`).
- **MDC_WORKSHOP schema:** Primary home for the new AI Workshop Companion app; migrations live in `backend/database.py` and `scripts/migrate.sh`.

## Introduction Prompts & Cohort Scheduling
- Introductions are managed via the MDC_WORKSHOP tables `INTRO_QUESTIONS` and `ATTENDEE_INTRO_RESPONSES` (see `backend/database.py`).
- Seed defaults and test attendee responses during migrations for parity with the older experience.
- Legacy prompts captured the following fields:
  | Code | Legacy Column | Type | Notes |
  | --- | --- | --- | --- |
  | `team_name` | `TEAM` | `text` | Short text input |
  | `intro` | `INTRO` | `textarea` | Multiline intro/bio |
  | `truth_1` / `truth_2` / `truth_3` | `TL1/TL2/TL3` | `text` | Separate short-text inputs |
  | `device_pref` | `MAC_PC` | `choice` | Radio buttons (Mac vs PC); CONFIG: {"options": [{"value":"M","label":"Mac"}, {"value":"P","label":"PC"}]} |
  | `tshirt_size` | `TSHIRT_SIZE` | `choice` | Radio buttons (S/M/L/XL); CONFIG: {"options": [{"value":"S","label":"Small"}, {"value":"M","label":"Medium"}, {"value":"L","label":"Large"}, {"value":"XL","label":"Extra Large"}]} |
  | `acknowledged` | `ACK` | `boolean` | Stored on attendee record (not in intro questions); separate checkbox in UI, tracked as ACKNOWLEDGED CHAR(1) DEFAULT 'N' |

- When rebuilding the schema, extend `INTRO_QUESTIONS` with `QUESTION_TYPE` (text, textarea, choice, boolean, etc.) and optional JSON `CONFIG` so the frontend can render the appropriate input (e.g., radio for choice types).
- `ACK` should remain a first-class flag on the attendee object so the progress overview can track it separately while still rendering the acknowledgement card in the Introductions tab.
- Commits `42694ba` (legacy UI) and `3a265c8` (t-shirt sizing) provide references for the original Redwood layout and completion indicators.
- Profile photos previously referenced `FACE_IMAGE` assets stored in `backend/static/images/cropped_images`. The rebuilt attendee service should surface a `profile_image` URL that points to the same directory (falling back to `default-avatar.svg`).

### Cohort Timing Metadata
- Extend the `COHORTS` table with `START_TIME` / `END_TIME` (TIMESTAMP) so daily agendas can surface on the attendee portal.
- When fetching an attendee (`backend/services/attendees.py`), include these columns and serialize them (ISO 8601) alongside `START_DATE` / `END_DATE`.
- Frontend helpers already pick up `cohort.start_time` / `cohort.end_time` and render ranges like `Mar 23 – Mar 27 2026 · 9:00 AM – 5:00 PM`.

## Tooling Notes
- Use `uv run` (or activate `.venv`) for any Python command that imports project modules; direct `python` misses dependencies like `envyaml` and `oracledb`.
- Migrations (`scripts/migrate.sh`) rely on the same `backend.database` module.
- Legacy face images remain in `backend/static/images/cropped_images`; make sure `config.images_dir` points there when serving profile photos.

## Pending Work
See `docs/worktodo.md` for the current task list (admin intro management, Redwood UI revival, testing).
