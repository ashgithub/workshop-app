# Workshop Survey System

A comprehensive workshop attendee management system with attendee progress tracking, survey collection, and admin dashboard with natural language querying capabilities.

## Features

- **Attendee Portal**: Progress tracking through workshop tasks and surveys
- **Admin Dashboard**: Attendee management, natural language queries, and 2 Truths and a Lie game
- **Oracle Database Integration**: Direct SQL queries with connection pooling
- **Static Frontend**: Pure HTML/CSS/JavaScript served by FastAPI
- **AI-Powered Queries**: LangChain + OpenAI for natural language to SQL conversion

## Quick Start

### Prerequisites
- Python 3.11+
- Oracle Database access (with wallet configuration)
- OpenAI API key (or compatible endpoint)

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
python backend/main.py
```

The application will be available at `http://localhost:8000`

## Project Structure

```
workshop-survey/
├── backend/                    # FastAPI backend
│   ├── main.py                # FastAPI application
│   ├── config.py              # Configuration management
│   ├── database.py            # Oracle connection management
│   ├── schemas.py             # Pydantic models
│   ├── crud.py                # Direct SQL operations
│   ├── routers/               # API endpoints
│   │   ├── auth.py           # Authentication
│   │   ├── attendees.py      # Attendee management
│   │   ├── tasks.py          # Task tracking
│   │   ├── surveys.py        # Survey handling
│   │   └── admin.py          # Admin features
│   └── utils/                 # Utilities
│       ├── nl_query.py       # NL to SQL logic
│       └── progress.py       # Progress calculations
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

## Database Schema

The system uses three main tables:

- **STUDENTS**: Attendee information and progress
- **ONBOARDING_TASKS**: Task completion tracking
- **SURVEY_RESPONSES**: Survey and feedback data
- **WORKSHOP_FEEDBACK**: Overall workshop feedback

## API Endpoints

### Authentication
- `POST /api/login` - User authentication
- `GET /api/attendees/autocomplete` - Email autocomplete

### Attendee Management
- `GET /api/attendees/{id}` - Get attendee details
- `PUT /api/attendees/{id}` - Update attendee info
- `GET /api/attendees/{id}/image` - Serve profile image

### Task Management
- `GET /api/tasks/{student_id}` - Get tasks
- `POST /api/tasks/{student_id}` - Update task completion

### Surveys
- `POST /api/surveys` - Submit session surveys
- `POST /api/surveys/overall` - Submit workshop feedback

### Admin Features
- `GET /api/admin/attendees` - List all attendees
- `POST /api/admin/query` - Natural language queries
- `GET /api/admin/game/next` - Get next game attendee
- `PUT /api/admin/game/played` - Mark attendee as played

## Configuration

### Environment Variables (.env)
```bash
# Oracle Database
ORACLE_USER=your_username
ORACLE_PASSWORD=your_password
ORACLE_DSN=your_dsn
ORACLE_WALLET=/path/to/wallet
ORACLE_WALLET_PASS=wallet_password

# OpenAI
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1

# Application
DEBUG=true
SECRET_KEY=your-secret-key
```

### YAML Configuration (config.yaml)
```yaml
database:
  user: $ORACLE_USER
  password: $ORACLE_PASSWORD
  dsn: $ORACLE_DSN
  wallet: $ORACLE_WALLET
  wallet_pass: $ORACLE_WALLET_PASS

openai:
  api_key: $OPENAI_API_KEY
  base_url: $OPENAI_BASE_URL

app:
  debug: $DEBUG
  secret_key: $SECRET_KEY
```

## Development

### Running in Development Mode
```bash
python backend/main.py
```
The server will auto-reload on code changes.

### Testing Database Connection
```bash
curl http://localhost:8000/api/health
```

### Building for Production
```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

[Add your license information here]
