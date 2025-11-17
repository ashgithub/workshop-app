"""
Main FastAPI application for Workshop Survey system.
"""
import sys
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Add the parent directory to sys.path so we can import from backend
parent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(parent_dir))

from backend.config import config
from backend.database import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    # Startup
    print("Starting Workshop Survey API...")

    # Test database connection
    if db.test_connection():
        print("Database connection successful")
    else:
        print("Warning: Database connection failed - some features may not work")

    print("API ready!")

    yield

    # Shutdown
    print("Shutting down Workshop Survey API...")


# Create FastAPI app
app = FastAPI(
    title="Workshop Survey API",
    description="API for workshop attendee management system",
    version="1.0.0",
    debug=config.debug,
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

# Mount static files
static_path = Path(config.static_dir)
static_path.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=config.static_dir), name="static")

# Mount frontend files
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    db_status = "connected" if db.test_connection() else "disconnected"
    return {
        "status": "healthy",
        "database": db_status,
        "version": "1.0.0"
    }


# Export app for uvicorn
__all__ = ["app"]
