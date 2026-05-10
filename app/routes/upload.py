"""Upload route — streaming file upload with chunked I/O."""

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from app.services.file_service import save_file

router = APIRouter()


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload a file using streaming chunks (memory-efficient for large files)."""
    try:
        saved_name, file_size = await save_file(file)
        return JSONResponse({
            "message": f"✅ File '{saved_name}' uploaded successfully!",
            "filename": saved_name,
            "size": file_size,
        })
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")
