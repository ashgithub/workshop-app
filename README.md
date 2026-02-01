# AI Workshop Companion

A comprehensive workshop attendee management system with attendee progress tracking, survey collection, and admin dashboard.

## Features

- **Attendee Portal**: Progress tracking through workshop tasks and surveys
- **Admin Dashboard**: Attendee management and 2 Truths and a Lie game
- **Oracle Database Integration**: Direct SQL queries with connection pooling
- **Static Frontend**: Pure HTML/CSS/JavaScript served by FastAPI
- **Flexible Data Management**: Schema rebuild, data reset, or normal seeding modes

## Quick Start

### Prerequisites
- Python 3.11+
- Oracle Database access (with wallet configuration)

### Installation

1. **Clone and setup environment:**
```bash
git clone <repository-url>
cd workshop-survey
uv venv
source .venv/bin/activate
uv pip install -e .
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your Oracle and OpenAI credentials
```

3. **Configure database:**
Update `config.yaml` with your database settings.

4. **Run the application:**
```bash
uvicorn backend.main:app --reload
```

The application will be available at `http://localhost:8000`

## Project Structure

```
workshop-survey/
├── backend/
│   ├── main.py                # FastAPI application (uvicorn entrypoint)
│   ├── config.py              # YAML/env configuration loader
│   ├── database.py            # Oracle connection & schema helpers
│   ├── routers/
│   │   ├── auth.py            # Authentication endpoints
│   │   └── v2/                # Cohorts, attendees, tasks, surveys
│   └── services/              # Business logic for cohorts/surveys
├── frontend/                  # Static HTML/JS frontend
│   ├── index.html            # Login page
│   ├── attendee.html         # Attendee portal
│   ├── admin.html            # Admin dashboard
│   ├── css/styles.css        # Styles
│   └── js/                   # JavaScript files
├── config.yaml               # Application configuration
├── .env                      # Environment variables
└── pyproject.toml            # Dependencies
```

## Current Schema Overview

- **ADMIN_USERS**: Admin accounts with activation status
- **COHORTS**: Workshop cohort metadata (code, title, location)
- **ATTENDEES**: Participants linked to cohorts (`IS_TEST` marks seed data)
- **ONBOARDING_TASK_TEMPLATES / COHORT_TASK_TEMPLATES**: Checklist definitions per cohort
- **ATTENDEE_TASKS**: Per-attendee checklist assignments and status
- **SURVEY_TEMPLATES / SURVEY_QUESTIONS**: Dynamic survey catalog
- **SURVEY_SUBMISSIONS / SURVEY_ANSWERS**: Collected responses
- **NL_QUERY_LOGS**: Disabled - natural language query functionality removed

Updated API routes live under `/api/...` with versioned routers in `backend/routers/v2/` (cohorts, attendees, tasks, surveys) plus authentication endpoints.

## Configuration

### Environment Variables (.env)
```bash
# Oracle Database
ORACLE_USER=your_username
ORACLE_PASSWORD=your_password
ORACLE_DSN=your_dsn
ORACLE_WALLET=/path/to/wallet
ORACLE_WALLET_PASS=wallet_password

# Application
DEBUG=true
SECRET_KEY=your-secret-key
ADMIN_SHARED_PASSWORD=change-me-admin

# Reverse proxy
PROXY_ENABLED=false
PROXY_PREFIX=/workshop-app
PROXY_BEARER_TOKEN=replace-with-proxy-token
```

### YAML Configuration (config.yaml)
```yaml
database:
  user: $ORACLE_USER
  password: $ORACLE_PASSWORD
  dsn: $ORACLE_DSN
  wallet: $ORACLE_WALLET
  wallet_pass: $ORACLE_WALLET_PASS

app:
  debug: $DEBUG
  secret_key: $SECRET_KEY
  reset_schema_on_startup: $RESET_SCHEMA_ON_STARTUP:false
  reset_data_on_startup: $RESET_DATA_ON_STARTUP:false
```

### Database Startup Modes

The application supports three database initialization modes controlled by environment variables:

- **Normal Mode** (default): `RESET_SCHEMA_ON_STARTUP=false`, `RESET_DATA_ON_STARTUP=false`
  - Ensures default data exists but doesn't modify existing data
  - Safe for production use

- **Data Reset Mode**: `RESET_DATA_ON_STARTUP=true`
  - Truncates all tables and reseeds with default data
  - Keeps table schema intact, fast operation
  - Useful for development/testing

- **Schema Rebuild Mode**: `RESET_SCHEMA_ON_STARTUP=true`
  - Drops and recreates all tables, then seeds data
  - Destructive operation, use with caution
  - Required when schema changes are deployed

## Development

### Running in Development Mode
Use uvicorn so the FastAPI app stays responsive:
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Testing Database Connection
```bash
curl http://localhost:8000/api/health
```

### Building for Production
Run uvicorn/gunicorn pointing at `backend.main:app`; ensure `RESET_SCHEMA_ON_STARTUP` stays `false` so Oracle data persists.

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

[Add your license information here]
