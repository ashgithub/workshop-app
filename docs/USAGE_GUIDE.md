# AI Workshop Companion Usage Guide

## Prerequisites
- Python 3.11+
- Access to an Oracle database with credentials and wallet files
- OpenAI/Select AI credentials if natural-language querying is enabled

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
3. Copy `.env.example` to `.env` and fill in Oracle and AI keys.
4. Update `config.yaml` if overriding defaults (proxy, schema reset).

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
- `RESET_SCHEMA_ON_STARTUP=false` by default to preserve data.
- Use `config.yaml` or environment variables to supply Oracle wallet paths, proxy settings, and admin shared password.
- Admin dashboard ignores test seed accounts while `IGNORE_TEST_USERS=true`.

## Maintenance Workflow
- To refresh seeds manually, run `./scripts/migrate.sh`.
- To restore legacy AIWorkshopAdmin tables into your legacy schema, run `./scripts/restore_legacy.py` with Oracle credentials set in `config.yaml` or env vars.
- To temporarily rebuild on app start, export `RESET_SCHEMA_ON_STARTUP=true` and restart once.
- Monitor `backend/logs` (if configured) for Oracle connection issues.
