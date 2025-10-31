UniversalShare
================

Instant, local-network file sharing with a modern UI and optional "Shake to Upload" on mobile.

Features
- Drag & drop or click to upload files (up to ~100 MB per file by default)
- Direct download endpoint: `/download/<filename>`
- Optional: "Shake to Upload" on mobile (requires HTTPS/secure context)
- Simple FastAPI backend, static hosting for uploaded files

Requirements
- Python 3.10+ (tested with 3.12)
- pip
- OpenSSL or mkcert (for local HTTPS)
- Same Wi‑Fi/LAN for all devices involved
- Optional (Android CLI): Termux from the Play Store/App Store alternative

Network requirements (important)
- Devices must be on the same local network: either the same Wi‑Fi, or one device’s Mobile Hotspot with the other device connected to it.
- On some Android phones, turning Mobile Data ON is required to enable Hotspot/routing (OEM policy). This is mostly a formality: file transfers happen over local network and should not consume mobile data.
- Avoid “AP/client isolation” if your router/hotspot exposes such a setting, as it blocks device‑to‑device communication.

Quick Start (HTTP)
1) Clone and install
```bash
git clone https://github.com/<your-username>/UniversalShare.git
cd UniversalShare
python3 -m venv shareENV
source shareENV/bin/activate   # Windows: shareENV\Scripts\activate
pip install -r requirements.txt
```
2) Run the server (HTTP)
```bash
python app.py
# Server prints your LAN URL, e.g. http://192.168.1.50:8000
```
3) Open the URL on your desktop browser. From your phone, open the same URL using your Mac/PC IP (same network).

Enable HTTPS (recommended for "Shake to Upload")
Why: Mobile browsers often require a secure context (HTTPS) to expose motion sensors reliably. UniversalShare will automatically use HTTPS if it finds `./certs/server.crt` and `./certs/server.key` (or ENV paths).

Option A: mkcert (trusted local HTTPS) – Recommended
1) Install mkcert
```bash
brew install mkcert nss   # macOS; Windows: choco install mkcert
mkcert -install
```
2) Create certificate(s)
```bash
mkdir -p certs
mkcert <your-mac-ip> localhost 127.0.0.1 ::1
cp <your-mac-ip>+*.pem certs/
cp certs/<your-mac-ip>+*-key.pem certs/server.key
cp certs/<your-mac-ip>+*.pem    certs/server.crt
```
3) Start server
```bash
python app.py
# Should print: https://<your-mac-ip>:8000
```
4) Trust on Android (for fully trusted HTTPS)
- Find mkcert CA root: `mkcert -CAROOT`
- Copy `rootCA.pem` to your phone as `rootCA.crt`
- On Android: Settings > Security > Encryption & credentials > Install a certificate > CA certificate

Option B: OpenSSL (self‑signed)
1) Generate certs to `./certs`
```bash
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/server.key -out certs/server.crt \
  -subj "/CN=<your-mac-ip>" \
  -addext "subjectAltName=DNS:localhost,IP:<your-mac-ip>,IP:127.0.0.1"
```
If your OpenSSL lacks `-addext`, use a config file (see the repo docs or use mkcert).

2) Start server
```bash
python app.py
# https://<your-mac-ip>:8000 (browser may warn unless you trust the cert)
```
3) Trust on Android (optional)
- Copy `certs/server.crt` to your phone and install as a CA/User certificate under Security settings.

ENV Overrides (custom cert paths)
```bash
SSL_CERTFILE=/abs/path/to/cert.pem \
SSL_KEYFILE=/abs/path/to/key.pem \
python app.py
```

Using UniversalShare
Open the app in a browser at `http(s)://<your-mac-ip>:8000`.

- Upload
  - Click the upload zone or drop files
  - Progress and success are shown inline
  - Files are saved into the `uploads/` directory on the server machine

- Download
  - Direct endpoint: `http(s)://<your-mac-ip>:8000/download/<filename>`
  - If you just uploaded on a device, you can immediately download from that device’s UI. On another device, use the direct `/download/<filename>` link or access the `uploads/` folder on the server machine.

Shake to Upload (Mobile)
- Requirements: HTTPS (secure context) and user gesture to enable motion sensors (tap the 📳 button)
- Steps on Android/iOS
  1) Open `https://<your-mac-ip>:8000` on your phone
  2) Tap the 📳 button to enable motion sensors when prompted
  3) Select one or more files
  4) Shake the phone – upload starts automatically

Mac/Windows → Android Sharing
- On your desktop (Mac/Windows), open `http(s)://<your-mac-ip>:8000`
- Upload a file from the desktop
- On Android, either:
  - Open `http(s)://<your-mac-ip>:8000/download/<filename>` in the browser, or
  - Use Termux to download via CLI (see below)

Android (Termux) – Download via CLI
1) Install Termux (Play Store or official distribution)
2) Inside Termux, install curl/wget
```bash
pkg update && pkg install -y curl wget
```
3) Download a file
```bash
curl -L "https://<your-mac-ip>:8000/download/<filename>" -o <filename>
# or
wget "https://<your-mac-ip>:8000/download/<filename>" -O <filename>
```

Troubleshooting
- Motion/shake not detected
  - Ensure HTTPS (check address bar lock icon); `window.isSecureContext` must be true
  - Tap the 📳 button to request motion permission (iOS requires user gesture)
  - Try a lower shake threshold or a slightly stronger shake

- Certificate warnings on Android
  - Use mkcert for trusted local certs, or install your self‑signed cert/CA as trusted

- Can’t reach the server from phone
  - Make sure phone and computer are on the same network
  - Use the computer’s LAN IP (e.g., 192.168.x.x), not `localhost`
  - Check firewall settings on Mac/Windows

Project Structure
```
UniversalShare/
├─ app.py                # FastAPI app
├─ templates/index.html  # Frontend UI
├─ uploads/              # Uploaded files (auto-created)
├─ certs/                # Place server.crt and server.key here for HTTPS
└─ requirements.txt
```

License
MIT (see LICENSE if provided). Use at your own risk on untrusted networks.


