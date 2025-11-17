# Workshop Survey System - Implementation Plan

## Phase 1: Project Setup ✅ COMPLETED
- ✅ Set up FastAPI backend with Oracle database integration
- ✅ Implemented YAML configuration with wallet authentication
- ✅ Created modern static HTML/JS frontend with login UI
- ✅ Established proper directory structure and dependencies
- ✅ Added comprehensive documentation and .gitignore
- ✅ Server running successfully with database connectivity

## Phase 2: Oracle Database Integration ✅ COMPLETED
- ✅ Oracle connection pool with wallet authentication
- ✅ Direct SQL query execution with parameterized statements
- ✅ Connection pooling and error handling
- ✅ Database health checks and monitoring

## Phase 3: Core APIs with Direct SQL ✅ COMPLETED
- ✅ Authentication system with email-based login
- ✅ Admin access hardcoded for ashish.ag.agarwal@oracle.com
- ✅ Attendee access for emails in STUDENTS table
- ✅ Email autocomplete from database
- ✅ Proper redirect logic (admin vs attendee portals)
- ✅ Fixed autocomplete positioning (below input field)
- ✅ Created placeholder HTML pages for all routes
- ✅ Tabbed interface for attendee and admin dashboards
- ✅ Database schema reconciliation (added missing columns)
- ✅ Attendee profile display with names and images
- ✅ User introduction form with onboarding comments
- ✅ API error resolution (500 errors fixed)

---

## Phase 3: Core APIs with Direct SQL

### Authentication & User Management
#### `POST /api/login`
- **Purpose**: Authenticate users by email
- **SQL**: `SELECT * FROM STUDENTS WHERE EMAIL_ADDRESS = ?`
- **Response**: Student details + is_admin flag
- **Logic**: Simple email lookup (no passwords per requirements)

#### `GET /api/attendees/autocomplete?q={query}`
- **Purpose**: Email autocomplete for login
- **SQL**: `SELECT EMAIL_ADDRESS FROM STUDENTS WHERE UPPER(EMAIL_ADDRESS) LIKE UPPER(? || '%') ORDER BY EMAIL_ADDRESS`
- **Response**: `{"emails": ["email1", "email2", ...]}`
- **Logic**: Case-insensitive prefix matching

#### `GET /api/attendees/{student_id}`
- **Purpose**: Get attendee details for profile display
- **SQL**: `SELECT * FROM STUDENTS WHERE STUDENT_ID = ?`
- **Response**: Full student record with progress calculation

#### `PUT /api/attendees/{student_id}`
- **Purpose**: Update attendee information (introduction, preferences)
- **SQL**: `UPDATE STUDENTS SET ... WHERE STUDENT_ID = ?`
- **Fields**: TEAM, INTRO, TL1, TL2, TL3, ACK, MAC_PC, ONBOARDING_COMMENTS

### Task Management
#### `GET /api/tasks/{student_id}`
- **Purpose**: Get all onboarding tasks for attendee
- **SQL**: `SELECT * FROM ONBOARDING_TASKS WHERE STUDENT_ID = ? ORDER BY TASK_CODE`
- **Response**: Task list with completion status

#### `POST /api/tasks/{student_id}`
- **Purpose**: Update task completion status
- **Body**: `{"task_code": "install_uv", "completed": true}`
- **SQL Operations**:
  - `INSERT OR REPLACE INTO ONBOARDING_TASKS ...`
  - Check if all tasks completed, then `UPDATE STUDENTS SET ON_BOARDED = 'Y'`

### Survey Management
#### `POST /api/surveys`
- **Purpose**: Submit session surveys
- **Body**: Survey data with STUDENT_ID, SURVEY_TYPE, RATING, etc.
- **SQL**: `INSERT INTO SURVEY_RESPONSES ...`

#### `POST /api/surveys/overall`
- **Purpose**: Submit workshop feedback
- **Body**: Overall rating, comments, future ideas
- **SQL**: `INSERT INTO WORKSHOP_FEEDBACK ...`

### Image Serving
#### `GET /api/attendees/{student_id}/image`
- **Purpose**: Serve profile images
- **Logic**: Check if `{student_id}.jpg/png` exists in `backend/static/images/`
- **Response**: Static file or default image

---

## Phase 4: Advanced Features 🚧 IN PROGRESS

### Task Management System
#### `ONBOARDING_TASKS Table Creation`
- **DDL**: Create table for tracking 11 onboarding tasks per attendee
- **Task Codes**: tenancy_access, install_uv, install_vscode, install_cline, install_aider, install_sqlcl, setup_oci, clone_repo, uv_sync, setup_env, run_code
- **API Endpoints**: GET/PUT task completion status

#### `Progress Calculation Enhancement`
- **Current Issue**: Progress calculation fails due to missing ONBOARDING_TASKS table
- **Solution**: Update progress calculation to work with/without tasks table
- **Logic**: ACK (25%) + INTRO/TEAM (25%) + ON_BOARDED (25%) + Surveys (25%)

### Natural Language to SQL
#### `POST /api/admin/query`
- **Purpose**: Convert natural language to SQL and execute
- **Libraries**: LangChain + OpenAI
- **Security**: Validate queries are read-only SELECT statements
- **Schema Context**: Provide table schemas to LLM

### 2 Truths and a Lie Game
#### `GET /api/admin/locations`
- **Purpose**: Get unique location codes
- **SQL**: `SELECT DISTINCT LOCATION FROM STUDENTS ORDER BY LOCATION`

#### `GET /api/admin/game/next?location={code}`
- **Purpose**: Get random unplayed attendee from location
- **SQL**: `SELECT * FROM STUDENTS WHERE LOCATION = ? AND PLAYED_2T1L = 'N' ORDER BY DBMS_RANDOM.VALUE FETCH FIRST 1 ROW ONLY`
- **Response**: Student details + TL1, TL2, TL3

#### `PUT /api/admin/game/played/{student_id}`
- **Purpose**: Mark attendee as having played
- **SQL**: `UPDATE STUDENTS SET PLAYED_2T1L = 'Y' WHERE STUDENT_ID = ?`

### Admin Dashboard
#### `GET /api/admin/attendees`
- **Purpose**: Get all attendees with calculated progress
- **SQL**: Complex query joining STUDENTS + task counts + survey counts
- **Progress Calculation**: Enhanced with task completion tracking

---

## Phase 5: Frontend Development

### Attendee Portal (`attendee.html`)
- **Tab Navigation**: Progress, Introduction, Tasks, Surveys
- **Progress Overview**: Visual progress bars and completion status
- **Introduction Form**: Team name, 2T&L statements, preferences
- **Task Checklist**: 11 onboarding tasks with completion toggles
- **Survey Forms**: Session surveys + overall feedback

### Admin Dashboard (`admin.html`)
- **Attendee List**: Table with progress, export to CSV
- **NL Query Interface**: Text input with example queries
- **Game Interface**: Location selector, attendee display, controls

### JavaScript Architecture
- **API Client**: Centralized fetch functions with error handling
- **State Management**: Local storage for session data
- **Form Validation**: Client-side validation with server sync
- **Dynamic UI**: Show/hide elements based on state

---

## Phase 6: Integration & Testing

### API Testing
- Unit tests for each endpoint
- Integration tests with database
- Error handling validation
- Performance testing

### Frontend Testing
- Cross-browser compatibility
- Mobile responsiveness
- Accessibility compliance
- User experience testing

### End-to-End Testing
- Complete user workflows
- Data consistency validation
- Error recovery testing

---

## Database Schema Reference

### STUDENTS Table
```sql
STUDENT_ID VARCHAR2(50) PRIMARY KEY,
EMAIL_ADDRESS VARCHAR2(255) NOT NULL UNIQUE,
NAME VARCHAR2(100),
LOCATION VARCHAR2(3),
MANAGER VARCHAR2(100),
JOB_ID VARCHAR2(50),
INTRO VARCHAR2(1000),
TL1 VARCHAR2(500), TL2 VARCHAR2(500), TL3 VARCHAR2(500),
ACK CHAR(1), ON_BOARDED CHAR(1), TF CHAR(1),
TEAM VARCHAR2(100),
FACE_IMAGE VARCHAR2(500),
MAC_PC CHAR(1),
IMAGE_FILENAME VARCHAR2(255),
ONBOARDING_COMMENTS CLOB,
PLAYED_2T1L CHAR(1) DEFAULT 'N',
CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
```

### ONBOARDING_TASKS Table
```sql
TASK_ID NUMBER PRIMARY KEY,
STUDENT_ID VARCHAR2(50) REFERENCES STUDENTS,
TASK_CODE VARCHAR2(50),
COMPLETED CHAR(1) DEFAULT 'N',
COMPLETED_AT TIMESTAMP,
UNIQUE(STUDENT_ID, TASK_CODE)
```

### SURVEY_RESPONSES Table
```sql
RESPONSE_ID NUMBER PRIMARY KEY,
STUDENT_ID VARCHAR2(50) REFERENCES STUDENTS,
SURVEY_TYPE VARCHAR2(50),
RATING NUMBER(1),
WHAT_LIKED VARCHAR2(2000),
WHAT_BETTER VARCHAR2(2000),
COMMENTS CLOB,
CREATED_AT TIMESTAMP
```

### WORKSHOP_FEEDBACK Table
```sql
FEEDBACK_ID NUMBER PRIMARY KEY,
STUDENT_ID VARCHAR2(50) REFERENCES STUDENTS,
OVERALL_RATING NUMBER(1),
OVERALL_COMMENTS CLOB,
FUTURE_IDEAS CLOB,
CREATED_AT TIMESTAMP
```

---

## Task Codes Reference
- tenancy_access
- install_uv
- install_vscode
- install_cline
- install_aider
- install_sqlcl
- setup_oci
- clone_repo
- uv_sync
- setup_env
- run_code

## Survey Types Reference
- onboarding
- llms
- rag
- function_calling
- agents
- database
- speech
- vision
- demos
- dev_productivity

---

## Implementation Notes

### Security Considerations
- Email-only authentication (no passwords)
- Parameterized SQL queries prevent injection
- CORS configured for local development
- Input validation with Pydantic schemas

### Performance Optimizations
- Oracle connection pooling
- Efficient SQL queries with proper indexing
- Static file caching headers
- Minimal frontend JavaScript bundle

### Error Handling
- Database connection failures gracefully handled
- API validation errors return proper HTTP codes
- Frontend displays user-friendly error messages
- Comprehensive logging for debugging

### Deployment Considerations
- Environment-specific configuration
- Static file serving optimization
- Database connection limits
- Monitoring and health checks
