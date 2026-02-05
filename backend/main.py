"""
Main FastAPI application for AI Workshop Companion system.
"""
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from typing import cast

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Add the parent directory to sys.path so we can import from backend
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from backend.config import config
from backend.database import db

from backend.routers import auth as auth_router_module
from backend.routers.v2 import attendees as attendees_router_module
from backend.routers.v2 import cohorts as cohorts_router_module
from backend.routers.v2 import intros as intros_router_module
from backend.routers.v2 import onboarding as onboarding_router_module
from backend.routers.v2 import surveys as surveys_router_module
# from backend.routers.v2 import tasks as tasks_router_module  # Removed - legacy task system


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    # Startup
    print("Starting AI Workshop Companion API...")

    # Test database connection
    if db.test_connection():
        print("Database connection successful")

        if config.reset_schema_on_startup:
            if db.initialize_schema():
                print("Database schema initialized successfully")
            else:
                print("Database schema initialization failed - exiting")
                sys.exit(1)
        elif config.reset_data_on_startup:
            if db.reset_data():
                print("Database data reset successfully")
            else:
                print("Database data reset failed - exiting")
                sys.exit(1)
        # Note: No automatic seeding on startup - use RESET_DATA_ON_STARTUP=true for data setup
    else:
        print("Warning: Database connection failed - some features may not work")

    print("API ready!")

    yield

    # Shutdown
    print("Shutting down AI Workshop Companion API...")


# Create FastAPI app with conditional root_path for proxy support
app = FastAPI(
    title="AI Workshop Companion API",
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

@app.get("/api/page-sections")
async def get_page_sections():
    """Get page section configuration."""
    return config.page_sections

@app.get("/", include_in_schema=False)
async def serve_root():
    return RedirectResponse(url="index.html")


# Include routers
app.include_router(auth_router_module.router, prefix="/api", tags=["authentication"])
app.include_router(attendees_router_module.router, prefix="/api")
app.include_router(cohorts_router_module.router, prefix="/api")
app.include_router(intros_router_module.router, prefix="/api")
app.include_router(onboarding_router_module.router, prefix="/api")
# app.include_router(tasks_router_module.router, prefix="/api")  # Removed - legacy task system
app.include_router(surveys_router_module.router, prefix="/api")


# Mount static files (after API routes to avoid conflicts)
static_path = Path(config.static_dir)
static_path.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=config.static_dir), name="static")

# Mount frontend files (must be last) with conditional config injection
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    # Custom static files handler to inject proxy config
    class ConfigInjectingStaticFiles(StaticFiles):
        async def get_response(self, path: str, scope):
            response = await super().get_response(path, scope)
            if path.endswith('.html') and hasattr(response, 'body'):
                # Inject proxy config into HTML
                # Handle both bytes and memoryview
                if isinstance(response.body, memoryview):
                    body_bytes = response.body.tobytes()
                else:
                    body_bytes = response.body

                html_content = body_bytes.decode('utf-8')
                proxy_config_script = f"""
<script>
window.PROXY_CONFIG = {{
    enabled: {str(config.proxy_enabled).lower()},
    bearerToken: "{config.proxy_bearer_token}",
    basePath: "{config.proxy_prefix}"
}};
</script>
                """
                # Inject before closing </head> tag
                if '</head>' in html_content:
                    html_content = html_content.replace('</head>', proxy_config_script + '</head>')
                else:
                    # Fallback: prepend to body content
                    html_content = proxy_config_script + html_content

                response.body = html_content.encode('utf-8')
                response.headers['content-length'] = str(len(response.body))
            return response

    app.mount("/", ConfigInjectingStaticFiles(directory=str(frontend_path), html=True), name="frontend")

# Export app for uvicorn
__all__ = ["app"]
