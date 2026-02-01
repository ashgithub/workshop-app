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
2. Optional: run `./scripts/migrate.sh` once to rebuild/seed the schema.
3. Start the API:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```
4. Visit:
   - `http://localhost:8000/index.html` for attendee login
   - `http://localhost:8000/admin.html` for admin dashboard

## Configuration Notes
- Database management modes:
  - `RESET_SCHEMA_ON_STARTUP=false` (default): Preserve existing data
  - `RESET_DATA_ON_STARTUP=true`: Truncate and reseed data (fast, keeps schema)
  - `RESET_SCHEMA_ON_STARTUP=true`: Rebuild entire schema (destructive, use with caution)
- Use `config.yaml` or environment variables to supply Oracle wallet paths, proxy settings, and admin shared password.
- Admin dashboard ignores test seed accounts while `IGNORE_TEST_USERS=true`.

## Maintenance Workflow
- **Normal operation**: Leave all reset flags `false` for production use
- **Development data reset**: Set `RESET_DATA_ON_STARTUP=true` for quick data cleanup
- **Schema migration**: Set `RESET_SCHEMA_ON_STARTUP=true` when deploying schema changes
- To refresh seeds manually, run `./scripts/migrate.sh`
- To restore legacy AIWorkshopAdmin tables, run `./scripts/restore_legacy.py`
- Monitor startup logs for detailed table drop/create/seed progress
