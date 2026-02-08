# AI Workshop Companion Usage Guide

## Prerequisites
- Python 3.11+
- Access to an Oracle database with credentials and wallet files

## Installation
1. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -e .
   ```
3. Copy `.env.example` to `.env` and fill in Oracle credentials.
4. Update `config.yaml` if overriding defaults (proxy, data management modes).

## Running the Application
1. Ensure the Oracle DSN is reachable from this host.
2. Optional: rebuild/seed the schema by temporarily setting `RESET_SCHEMA_ON_STARTUP=true` or running a one-off command:
   ```bash
   python -c "from backend.database import db; db.initialize_schema()"
   ```
3. Start the API:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```
4. Visit:
   - `http://localhost:8000/index.html` for attendee login
   - `http://localhost:8000/admin.html` for admin dashboard

## Seed Data Overview
When you initialize the schema (either by calling `DatabaseConnection.initialize_schema()` or by toggling the reset flags), the Oracle database is populated with representative data so local testing works immediately. The seeds include:

- **Admin user**: Merges a single administrator account (`ashish.ag.agarwal@oracle.com`, "Primary Admin"). If it already exists, no duplicate is created.
- **Cohort**: Adds the `MDC2026` cohort with location, agenda, and schedule metadata.
- **Intro questions**: Ensures seven onboarding prompts (team name, personal intro, three "Two truths and a lie" entries, device preference, T-shirt size) stay active and up to date.
- **Intro responses**: For three sample attendees (`test1@test.org`, `test2@test.org`, `test3@test.org`), merges canned answers that demonstrate how attendee intro data is stored.
- **Onboarding readiness questions**: Seeds seven checklist-style questions covering tool installation, AI Sandbox access, SQLcl MCP setup, and similar prerequisites.
- **Survey templates**: Creates seven survey shells (onboarding, Day 1–5, and overall) with display order, slugs, and descriptions.
- **Survey questions**: Populates each survey with its multiple-choice and free-form prompts so submissions can be recorded immediately.
- **Test attendees & submissions**: Inserts three test attendees for `MDC2026`, marks them as test accounts, and creates empty survey submissions for every template so the admin UI has data to render.
- **MDC CSV import**: Use `scripts/import_mdc_attendees.py` to load real attendee rosters from `data/mdc_attendees.csv`. The script sets `IS_TEST='N'`, updates the new `TITLE`/`MANAGER` fields on `ATTENDEES`, and seeds the existing `team_name` intro response using the CSV `team` column. Profile images should live under `static/images/mdc/` and match the filenames in the CSV.

You can rerun the seeding logic by calling `DatabaseConnection.seed_defaults()`, setting `RESET_DATA_ON_STARTUP=true`, or invoking `DatabaseConnection.reset_data()` to refresh the sample content without rebuilding tables.

## Configuration Notes
- Database management modes:
  - `RESET_SCHEMA_ON_STARTUP=false` (default): Preserve existing data
  - `RESET_DATA_ON_STARTUP=true`: Truncate and reseed data (fast, keeps schema)
  - `RESET_SCHEMA_ON_STARTUP=true`: Rebuild entire schema (destructive, use with caution)
- Use `config.yaml` or environment variables to supply Oracle wallet paths, proxy settings, and admin shared password.
- Admin dashboard ignores test seed accounts while `IGNORE_TEST_USERS=true`.

## Maintenance Workflow
- **Normal operation**: Leave all reset flags `false` for production use
- **Schema migration**: Set `RESET_SCHEMA_ON_STARTUP=true` when deploying schema changes
- **Schema migration**: Set `RESET_SCHEMA_ON_STARTUP=true` when deploying schema changes
- To refresh seeds manually, run the `DatabaseConnection.seed_defaults()` helper or toggle `RESET_DATA_ON_STARTUP`
- To load MDC-specific attendees, update `data/mdc_attendees.csv` and run `python scripts/import_mdc_attendees.py`
- To restore legacy AIWorkshopAdmin tables, run `./scripts/restore_legacy.py`
- Monitor startup logs for detailed table drop/create/seed progress
  - The attendee portal now surfaces the read-only Title and Manager metadata (populated by CSV import or admin edits) so participants can verify their roster information.
