"""File service — streaming I/O for fast, memory-efficient file operations."""

import os
import time
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import UploadFile

from app.config import settings


async def save_file(upload: UploadFile) -> tuple[str, int]:
    """
    Save an uploaded file using streaming chunks.

    Instead of loading the entire file into RAM (bad for GB files),
    this reads and writes in 1MB chunks — uses ~1MB RAM regardless of file size.

    Returns:
        Tuple of (filename, total_bytes_written)
    """
    filename = upload.filename or f"upload_{int(time.time())}"
    file_path = settings.UPLOAD_DIR / filename

    total_bytes = 0

    async with aiofiles.open(file_path, "wb") as f:
        while True:
            chunk = await upload.read(settings.CHUNK_SIZE)  # 1MB chunks
            if not chunk:
                break
            await f.write(chunk)
            total_bytes += len(chunk)

            # Check file size limit
            if total_bytes > settings.MAX_FILE_SIZE_BYTES:
                # Clean up the partial file
                await f.close()
                file_path.unlink(missing_ok=True)
                raise ValueError(
                    f"File exceeds maximum size of {settings.MAX_FILE_SIZE_MB}MB"
                )

    print(f"✅ File saved: {file_path} ({_format_size(total_bytes)})")
    return filename, total_bytes


def get_file_path(filename: str) -> Optional[Path]:
    """Get the full path to an uploaded file, or None if it doesn't exist."""
    file_path = settings.UPLOAD_DIR / filename
    if file_path.exists() and file_path.is_file():
        return file_path
    return None


def list_files() -> list[dict]:
    """List all uploaded files with metadata."""
    files = []
    if not settings.UPLOAD_DIR.exists():
        return files

    for entry in sorted(settings.UPLOAD_DIR.iterdir(), key=os.path.getmtime, reverse=True):
        if entry.is_file() and not entry.name.startswith("."):
            stat = entry.stat()
            files.append({
                "name": entry.name,
                "size": stat.st_size,
                "size_formatted": _format_size(stat.st_size),
                "modified": stat.st_mtime,
            })

    return files


def delete_file_by_name(filename: str) -> bool:
    """Delete an uploaded file. Returns True if deleted, False if not found."""
    file_path = settings.UPLOAD_DIR / filename
    if file_path.exists() and file_path.is_file():
        file_path.unlink()
        print(f"🗑️ File deleted: {filename}")
        return True
    return False


def _format_size(size_bytes: int) -> str:
    """Format bytes into human-readable string."""
    if size_bytes == 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    size = float(size_bytes)
    while size >= 1024 and i < len(units) - 1:
        size /= 1024
        i += 1
    return f"{size:.1f} {units[i]}"
