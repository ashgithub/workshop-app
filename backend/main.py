"""
Main FastAPI application for Workshop Survey system.
"""
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Add the parent directory to sys.path so we can import from backend
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from backend.config import config
from backend.database import db

try:
    from backend.routers.auth import router as auth_router
    print("Auth router imported successfully")
except ImportError as e:
    print(f"Failed to import auth router: {e}")
    auth_router = None

try:
    from backend.routers.attendees import router as attendees_router
    print("Attendees router imported successfully")
except ImportError as e:
    print(f"Failed to import attendees router: {e}")
    attendees_router = None

try:
    from backend.routers.tasks import router as tasks_router
    print("Tasks router imported successfully")
except ImportError as e:
    print(f"Failed to import tasks router: {e}")
    tasks_router = None

try:
    from backend.routers.surveys import router as surveys_router
    print("Surveys router imported successfully")
except ImportError as e:
    print(f"Failed to import surveys router: {e}")
    surveys_router = None

try:
    from backend.routers.admin import router as admin_router
    print("Admin router imported successfully")
except ImportError as e:
    print(f"Failed to import admin router: {e}")
    admin_router = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    # Startup
    print("Starting Workshop Survey API...")

    # Test database connection
    if db.test_connection():
        print("Database connection successful")

        # Initialize database schema if needed
        if db.initialize_schema():
            print("Database schema initialized successfully")
        else:
            print("Warning: Database schema initialization failed - some features may not work")
    else:
        print("Warning: Database connection failed - some features may not work")

    print("API ready!")

    yield

    # Shutdown
    print("Shutting down Workshop Survey API...")


# Create FastAPI app with conditional root_path for proxy support
app = FastAPI(
    title="Workshop Survey API",
    description="API for workshop attendee management system",
    version="1.0.0",
    debug=config.debug,
    root_path=config.proxy_prefix if config.proxy_enabled else "",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define API routes first (before static file mounts)
@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    db_status = "connected" if db.test_connection() else "disconnected"
    return {
        "status": "healthy",
        "database": db_status,
        "version": "1.0.0"
    }


# Include routers
if auth_router:
    app.include_router(auth_router, prefix="/api", tags=["authentication"])
    print("Auth router registered successfully")
else:
    print("Auth router not available")

if attendees_router:
    app.include_router(attendees_router, prefix="/api/attendees", tags=["attendees"])
    print("Attendees router registered successfully")
else:
    print("Attendees router not available")

if tasks_router:
    app.include_router(tasks_router, prefix="/api/tasks", tags=["tasks"])
    print("Tasks router registered successfully")
else:
    print("Tasks router not available")

if surveys_router:
    app.include_router(surveys_router, prefix="/api/surveys", tags=["surveys"])
    print("Surveys router registered successfully")
else:
    print("Surveys router not available")

if admin_router:
    app.include_router(admin_router, prefix="/api/admin", tags=["admin"])
    print("Admin router registered successfully")
else:
    print("Admin router not available")


# Mount static files (after API routes to avoid conflicts)
static_path = Path(config.static_dir)
static_path.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=config.static_dir), name="static")

# Mount frontend files (must be last) with conditional config injection
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    from fastapi.responses import HTMLResponse

    # Custom static files handler to inject proxy config
    class ConfigInjectingStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):
            response = await super().get_response(path, scope)
            if path.endswith('.html') and hasattr(response, 'body'):
                # Inject proxy config into HTML
                html_content = response.body.decode('utf-8')
                proxy_config_script = f"""
window.PROXY_CONFIG = {{
    enabled: {str(config.proxy_enabled).lower()},
    bearerToken: "{config.proxy_bearer_token}",
    basePath: "{config.proxy_prefix}"
}};
                """
                html_content = html_content.replace(
                    'window.PROXY_CONFIG = {',
                    proxy_config_script.strip()
                )
                response.body = html_content.encode('utf-8')
                response.headers['content-length'] = str(len(response.body))
            return response

    app.mount("/", ConfigInjectingStaticFiles(directory=str(frontend_path), html=True), name="frontend")

# Export app for uvicorn
__all__ = ["app"]
