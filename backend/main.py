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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# DETAILED DEBUG MIDDLEWARE
@app.middleware("http")
async def detailed_log_requests(request: Request, call_next):
    print("\n" + "="*80)
    print(f"🔍 INCOMING REQUEST")
    print("="*80)
    print(f"Method: {request.method}")
    print(f"request.url: {request.url}")
    print(f"request.url.path: {request.url.path}")
    print(f"request.scope['path']: {request.scope.get('path', 'NOT SET')}")
    print(f"request.scope['root_path']: {request.scope.get('root_path', 'NOT SET')}")
    print(f"request.scope['scheme']: {request.scope.get('scheme', 'NOT SET')}")
    print(f"request.scope['server']: {request.scope.get('server', 'NOT SET')}")
    print(f"app.root_path: {app.root_path}")
    
    # Check what routes exist
    print(f"\nMounted routes:")
    for route in app.routes:
        print(f"  - {route}")
    
    print("="*80)
    
    response = await call_next(request)
    
    print(f"✓ RESPONSE: {response.status_code}")
    print("="*80 + "\n")
    
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


@app.get("/", include_in_schema=False)
async def serve_root():
    return RedirectResponse(url="index.html")


# Include routers
app.include_router(auth_router_module.router, prefix="/api", tags=["authentication"])
app.include_router(attendees_router_module.router, prefix="/api")
app.include_router(cohorts_router_module.router, prefix="/api")
app.include_router(intros_router_module.router, prefix="/api")
app.include_router(onboarding_router_module.router, prefix="/api")
app.include_router(surveys_router_module.router, prefix="/api")


# Mount static files (after API routes to avoid conflicts)
static_path = Path(config.static_dir)
static_path.mkdir(exist_ok=True)

print(f"\n📁 MOUNTING STATIC FILES:")
print(f"   Mount point: /static")
print(f"   Directory: {static_path.absolute()}")
print(f"   Directory exists: {static_path.exists()}")

# Check for the avatar file
avatar_path = static_path / "images" / "default-avatar.svg"
print(f"   Avatar at {avatar_path}: {avatar_path.exists()}")

app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

# Mount frontend files (must be last)
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    print(f"\n📁 MOUNTING FRONTEND:")
    print(f"   Mount point: /")
    print(f"   Directory: {frontend_path.absolute()}")
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")

print(f"\n🔧 APP CONFIGURATION:")
print(f"   app.root_path: {app.root_path}")
print(f"   Proxy enabled: {config.proxy_enabled}")
print(f"   Proxy prefix: {config.proxy_prefix}")
print("")

# Export app for uvicorn
__all__ = ["app"]