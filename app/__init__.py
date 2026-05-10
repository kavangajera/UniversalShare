"""UniversalShare — Fast cross-platform file sharing via web."""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from app.config import settings


def create_app() -> FastAPI:
    """Application factory — creates and configures the FastAPI app."""
    application = FastAPI(
        title="UniversalShare",
        description="Share files instantly across any device via web browser",
        version="1.0.0",
    )

    # CORS — allow all origins for cross-device sharing
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Custom middleware
    from app.middleware.headers import add_permissions_policy_headers
    application.middleware("http")(add_permissions_policy_headers)

    # Ensure upload directory exists
    settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Register route modules FIRST (before static mounts which are catch-all)
    from app.routes import pages, upload, download, files, discovery, signaling
    application.include_router(signaling.router)  # WebSocket — must be before static mounts
    application.include_router(upload.router)
    application.include_router(download.router)
    application.include_router(files.router)
    application.include_router(discovery.router)
    application.include_router(pages.router)

    # Mount static files (CSS, JS, images)
    static_dir = Path(__file__).parent.parent / "static"
    static_dir.mkdir(parents=True, exist_ok=True)
    application.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    # Mount uploads directory for serving uploaded files
    application.mount(
        "/uploads",
        StaticFiles(directory=str(settings.UPLOAD_DIR)),
        name="uploads",
    )

    return application
