from fastapi import FastAPI, File, UploadFile, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
import socket
import ssl

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create upload directory if not exists
UPLOAD_DIR = "/Users/kavan/Documents/GitHub/UniversalShare/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Mount uploads directory as static files
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def get_local_ip():
    """Return the local IP address of the machine."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "localhost"
    finally:
        s.close()
    return ip


@app.middleware("http")
async def add_permissions_policy_headers(request, call_next):
    response = await call_next(request)
    # Allow motion sensors for all origins (adjust to specific origins if needed)
    response.headers["Permissions-Policy"] = "accelerometer=*, gyroscope=*"
    # Older header (deprecated), harmless if present
    response.headers["Feature-Policy"] = "accelerometer 'self'; gyroscope 'self'"
    return response


@app.get("/", response_class=HTMLResponse)
async def home():
    with open("templates/index.html", "r") as f:
        return f.read()


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        
        # Read file content and write to disk
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        
        print(f"✅ File saved: {file_path}")
        return {"message": f"✅ File '{file.filename}' uploaded successfully!", "filename": file.filename}
    except Exception as e:
        print(f"❌ Error uploading file: {str(e)}")
        return {"error": str(e)}, 500


@app.get("/download/{filename}")
async def download_file(filename: str):
    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, filename=filename)
    return {"error": "File not found"}, 404


if __name__ == "__main__":
    ip = get_local_ip()
    cert_path = os.environ.get("SSL_CERTFILE", os.path.abspath("certs/server.crt"))
    key_path = os.environ.get("SSL_KEYFILE", os.path.abspath("certs/server.key"))

    use_ssl = os.path.exists(cert_path) and os.path.exists(key_path)

    print(f"📁 Upload directory: {os.path.abspath(UPLOAD_DIR)}")
    if use_ssl:
        print(f"🔐 Using SSL cert: {cert_path}")
        print(f"🔑 Using SSL key : {key_path}")
        print(f"🚀 Server running at: https://{ip}:8000")
        os.system(
            f"uvicorn app:app --host 0.0.0.0 --port 8000 --reload --ssl-keyfile {key_path} --ssl-certfile {cert_path}"
        )
    else:
        print("⚠️  SSL cert/key not found. Running over HTTP. To enable HTTPS, place files at:")
        print(f"    cert: {cert_path}")
        print(f"    key : {key_path}")
        print(f"🚀 Server running at: http://{ip}:8000")
        os.system(f"uvicorn app:app --host 0.0.0.0 --port 8000 --reload")
