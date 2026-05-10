"""Files route — lists uploaded files (was missing in original app)."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from app.services.file_service import list_files, delete_file_by_name

router = APIRouter()


@router.get("/files")
async def get_files():
    """Return a JSON list of all uploaded files with metadata."""
    files = list_files()
    return JSONResponse({"files": files})


@router.delete("/files/{filename}")
async def remove_file(filename: str):
    """Delete an uploaded file."""
    success = delete_file_by_name(filename)
    if success:
        return JSONResponse({"message": f"Deleted '{filename}'"})
    return JSONResponse({"error": "File not found"}, status_code=404)
