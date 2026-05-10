"""Discovery route — server info for network discovery (local mode only)."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.config import settings
from app.services.network_service import get_local_ip

router = APIRouter()


@router.get("/discover")
async def discover():
    """Discovery endpoint — returns server info for network discovery."""
    ip = get_local_ip()
    return JSONResponse({
        "server_url": f"{settings.protocol}://{ip}:{settings.PORT}",
        "ip": ip,
        "port": settings.PORT,
        "protocol": settings.protocol,
        "is_cloud": settings.IS_CLOUD,
    })
