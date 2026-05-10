"""Entry point — starts the UniversalShare server with QR code display."""

import threading
import uvicorn

from app import create_app
from app.config import settings
from app.services.network_service import (
    get_local_ip,
    print_server_banner,
    start_udp_discovery_server,
)

# Create the FastAPI application
app = create_app()


def main():
    """Start the UniversalShare server."""
    ip = get_local_ip()

    # Start UDP discovery in local mode only
    if not settings.IS_CLOUD:
        discovery_thread = threading.Thread(
            target=start_udp_discovery_server, daemon=True
        )
        discovery_thread.start()

    # Print the server banner with QR code
    server_url = f"{settings.protocol}://{ip}:{settings.PORT}"
    print_server_banner(server_url, settings)

    # Start uvicorn
    uvicorn_kwargs = {
        "host": settings.HOST,
        "port": settings.PORT,
        "reload": not settings.IS_CLOUD,
        "log_level": "info",
    }

    if settings.use_ssl:
        uvicorn_kwargs["ssl_keyfile"] = settings.SSL_KEYFILE
        uvicorn_kwargs["ssl_certfile"] = settings.SSL_CERTFILE

    uvicorn.run("app.main:app", **uvicorn_kwargs)


if __name__ == "__main__":
    main()
