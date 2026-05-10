"""Download route — serves files for download."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.services.file_service import get_file_path

router = APIRouter()


@router.get("/download/{filename}")
async def download_file(filename: str):
    """Download a previously uploaded file."""
    file_path = get_file_path(filename)

    if file_path is None:
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        str(file_path),
        filename=filename,
        media_type="application/octet-stream",
    )
