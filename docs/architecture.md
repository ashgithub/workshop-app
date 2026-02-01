# AI Workshop Companion Architecture Notes

## Database Schema Reference

### MDC_WORKSHOP Schema Tables

| Table | Purpose | Key Fields | Notes |
| --- | --- | --- | --- |
| `ADMIN_USERS` | System administrators | `EMAIL`, `FULL_NAME`, `IS_ACTIVE` | Users who can access admin dashboard |
| `COHORTS` | Workshop cohorts/sessions | `COHORT_CODE`, `TITLE`, `LOCATION_NAME`, `START_DATE`, `END_DATE` | Groups attendees by workshop instance |
| `ATTENDEES` | Workshop participants | `EMAIL`, `FULL_NAME`, `COHORT_ID`, `ACKNOWLEDGED` | Links to cohort, tracks acknowledgment status |
| `INTRO_QUESTIONS` | Introduction form questions | `CODE`, `PROMPT`, `QUESTION_TYPE`, `CONFIG` | Defines questions for attendee introductions |
| `ATTENDEE_INTRO_RESPONSES` | Introduction answers | `ATTENDEE_ID`, `QUESTION_ID`, `RESPONSE` | Stores attendee responses to intro questions |
| `ONBOARDING_QUESTIONS` | Pre-workshop checklist questions | `CODE`, `PROMPT`, `QUESTION_TYPE`, `CONFIG` | Defines onboarding preparation questions |
| `ATTENDEE_ONBOARDING_RESPONSES` | Onboarding answers | `ATTENDEE_ID`, `QUESTION_ID`, `RESPONSE` | Stores attendee responses to onboarding questions |
| `SURVEY_TEMPLATES` | Survey definitions | `NAME`, `SLUG`, `DESCRIPTION` | Defines different survey types (onboarding, daily, overall) |
| `SURVEY_QUESTIONS` | Survey questions | `TEMPLATE_ID`, `PROMPT`, `QUESTION_TYPE` | Questions within each survey |
| `SURVEY_SUBMISSIONS` | Survey completions | `ATTENDEE_ID`, `TEMPLATE_ID` | Tracks which surveys attendee has submitted |
| `SURVEY_ANSWERS` | Survey responses | `SUBMISSION_ID`, `QUESTION_ID`, `RESPONSE` | Individual answers to survey questions |
| `GAME_LOGS` | 2 Truths & a Lie game | `ATTENDEE_ID`, `STATUS`, `REVEALED_LIE` | Game participation and results |

### Key Relationships

- **Cohorts → Attendees**: One cohort can have many attendees
- **Attendees → Responses**: Attendees respond to both intro and onboarding questions
- **Questions → Responses**: Each question type has its own response table
- **Survey Templates → Questions → Submissions → Answers**: Hierarchical survey structure

## Introduction & Onboarding Questions
- Introductions are managed via the MDC_WORKSHOP tables `INTRO_QUESTIONS` and `ATTENDEE_INTRO_RESPONSES` (see `backend/database.py`).
- Onboarding questions follow the same pattern with `ONBOARDING_QUESTIONS` and `ATTENDEE_ONBOARDING_RESPONSES` tables.
- Seed defaults and test attendee responses during migrations for parity with the older experience.

### Introduction Prompts
Legacy prompts captured the following fields:
  | Code | Legacy Column | Type | Notes |
  | --- | --- | --- | --- |
  | `team_name` | `TEAM` | `text` | Short text input |
  | `intro` | `INTRO` | `textarea` | Multiline intro/bio |
  | `truth_1` / `truth_2` / `truth_3` | `TL1/TL2/TL3` | `text` | Separate short-text inputs |
  | `device_pref` | `MAC_PC` | `choice` | Radio buttons (Mac vs PC); CONFIG: {"options": [{"value":"M","label":"Mac"}, {"value":"P","label":"PC"}]} |
  | `tshirt_size` | `TSHIRT_SIZE` | `choice` | Radio buttons (S/M/L/XL); CONFIG: {"options": [{"value":"S","label":"Small"}, {"value":"M","label":"Medium"}, {"value":"L","label":"Large"}, {"value":"XL","label":"Extra Large"}]} |
  | `acknowledged` | `ACK` | `boolean` | Stored on attendee record (not in intro questions); separate checkbox in UI, tracked as ACKNOWLEDGED CHAR(1) DEFAULT 'N' |

### Onboarding Checklist
The onboarding system was redesigned from a simple task checklist to a question-based form similar to introductions:
- **11 baseline tasks** converted to Yes/No questions covering workshop preparation
- Uses same UI patterns as introductions (progress tracking, field status indicators, save functionality)
- Questions cover: tenancy access, UV installation, VS Code setup, Cline/Aider tools, SQLcl, OCI configuration, repo cloning, UV sync, environment variables, and code verification
- Managed via `backend/services/onboarding.py` and `backend/routers/v2/onboarding.py`
- Admin CRUD operations available via `backend/routers/admin.py`

### Question System Architecture
- Both `INTRO_QUESTIONS` and `ONBOARDING_QUESTIONS` tables support `QUESTION_TYPE` (text, textarea, choice, boolean, etc.) and optional JSON `CONFIG`
- Frontend renders appropriate inputs dynamically (radio buttons for choices, textareas for long responses, etc.)
- Progress calculation counts question responses rather than binary completion flags
- `ACK` remains a first-class flag on the attendee object for separate tracking in progress overview
- Commits `42694ba` (legacy UI) and `3a265c8` (t-shirt sizing) provide references for the original Redwood layout and completion indicators.
- Profile photos previously referenced `FACE_IMAGE` assets stored in `backend/static/images/cropped_images`. The rebuilt attendee service should surface a `profile_image` URL that points to the same directory (falling back to `default-avatar.svg`).

### Cohort Timing Metadata
- Extend the `COHORTS` table with `START_TIME` / `END_TIME` (TIMESTAMP) so daily agendas can surface on the attendee portal.
- When fetching an attendee (`backend/services/attendees.py`), include these columns and serialize them (ISO 8601) alongside `START_DATE` / `END_DATE`.
- Frontend helpers already pick up `cohort.start_time` / `cohort.end_time` and render ranges like `Mar 23 – Mar 27 2026 · 9:00 AM – 5:00 PM`.

## Tooling Notes
- Use `uv run` (or activate `.venv`) for any Python command that imports project modules; direct `python` misses dependencies like `envyaml` and `oracledb`.
- Migrations (`scripts/migrate.sh`) rely on the same `backend.database` module.
- **Database Naming**: Avoid using `desc` as a column name - it's a reserved SQL keyword. Use `description` instead.
- Legacy face images remain in `backend/static/images/cropped_images`; make sure `config.images_dir` points there when serving profile photos.

## Pending Work
See `docs/worktodo.md` for the current task list (admin intro management, Redwood UI revival, testing).
