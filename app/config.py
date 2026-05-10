"""Application configuration — environment-aware settings."""

import os
from pathlib import Path


class Settings:
    """Centralized settings with cloud/local auto-detection."""

    def __init__(self):
        # Cloud detection: Render sets RENDER=true automatically
        self.IS_CLOUD = os.environ.get("RENDER", "").lower() == "true"

        # Upload directory
        if self.IS_CLOUD:
            self.UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/tmp/uploads"))
        else:
            # Local mode: use project-local uploads/ directory
            self.UPLOAD_DIR = Path(
                os.environ.get("UPLOAD_DIR", str(Path(__file__).parent.parent / "uploads"))
            )

        # Server config
        self.HOST = os.environ.get("HOST", "0.0.0.0")
        self.PORT = int(os.environ.get("PORT", 8000))

        # File limits
        self.MAX_FILE_SIZE_MB = int(os.environ.get("MAX_FILE_SIZE_MB", "500"))
        self.MAX_FILE_SIZE_BYTES = self.MAX_FILE_SIZE_MB * 1024 * 1024

        # Chunk size for streaming file I/O (1MB)
        self.CHUNK_SIZE = 1024 * 1024

        # SSL (local mode only)
        self.SSL_CERTFILE = os.environ.get(
            "SSL_CERTFILE",
            str(Path(__file__).parent.parent / "certs" / "server.crt"),
        )
        self.SSL_KEYFILE = os.environ.get(
            "SSL_KEYFILE",
            str(Path(__file__).parent.parent / "certs" / "server.key"),
        )

    @property
    def use_ssl(self) -> bool:
        """Check if SSL certificates are available."""
        return (
            not self.IS_CLOUD
            and os.path.exists(self.SSL_CERTFILE)
            and os.path.exists(self.SSL_KEYFILE)
        )

    @property
    def protocol(self) -> str:
        return "https" if self.use_ssl else "http"


# Singleton instance
settings = Settings()
