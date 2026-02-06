"""
Main FastAPI application for AI Workshop Companion system.
"""
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from typing import cast

from fastapi import FastAPI, Request
from fastapi.responses import RedirectResponse
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


# Debug middleware to log all requests
@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"🔍 REQUEST: {request.method} {request.url.path}")
    print(f"   Root path: {request.scope.get('root_path', 'NONE')}")
    print(f"   Full URL: {request.url}")
    response = await call_next(request)
    print(f"   ✓ RESPONSE: {response.status_code}")
    return response


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


@app.get("/api/runtime-config")
async def get_runtime_config():
    """Expose runtime settings needed by the frontend."""
    enabled = bool(config.proxy_enabled)
    base_path = config.proxy_prefix if enabled and config.proxy_prefix else ""
    bearer_token = config.proxy_bearer_token if enabled and config.proxy_bearer_token else ""

    return {
        "enabled": enabled,
        "basePath": base_path,
        "bearerToken": bearer_token,
    }


@app.get("/api/debug/static-info")
async def debug_static_info():
    """Debug endpoint to check static file configuration."""
    static_path = Path(config.static_dir)
    avatar_path = static_path / "images" / "default-avatar.svg"
    
    static_files = []
    if static_path.exists():
        static_files = [str(f.relative_to(static_path)) for f in static_path.glob("**/*") if f.is_file()]
    
    return {
        "static_dir": str(static_path.absolute()),
        "static_dir_exists": static_path.exists(),
        "avatar_path": str(avatar_path.absolute()),
        "avatar_exists": avatar_path.exists(),
        "files_in_static": static_files[:20],
        "proxy_enabled": config.proxy_enabled,
        "proxy_prefix": config.proxy_prefix,
        "app_root_path": app.root_path
    }


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

# Log static directory info at startup
print("\n" + "="*60)
print("📁 STATIC FILES CONFIGURATION")
print("="*60)
print(f"Static directory: {static_path.absolute()}")
print(f"Directory exists: {static_path.exists()}")

if static_path.exists():
    files = list(static_path.glob("**/*"))
    print(f"Total items found: {len(files)}")
    
    # Check specifically for default-avatar.svg
    avatar_path = static_path / "images" / "default-avatar.svg"
    print(f"\nDefault avatar check:")
    print(f"  Expected path: {avatar_path}")
    print(f"  Exists: {avatar_path.exists()}")
    
    if avatar_path.exists():
        print(f"  Size: {avatar_path.stat().st_size} bytes")
        print(f"  ✓ Avatar file found!")
    else:
        print(f"  ✗ Avatar file NOT found!")
    
    # List some files
    print(f"\nSample files in static directory:")
    for i, f in enumerate(files[:10]):
        if f.is_file():
            print(f"  - {f.relative_to(static_path)}")
else:
    print("⚠️  Static directory does not exist!")

print(f"\nMounting /static → {static_path}")
print("="*60 + "\n")

app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Mount frontend files (must be last)
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    print(f"📁 Frontend directory: {frontend_path.absolute()}")
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")

# Export app for uvicorn
__all__ = ["app"]