"""Network service — IP detection, QR code generation, UDP discovery."""

import socket
import io
import qrcode

from app.config import settings


def get_local_ip() -> str:
    """Return the local IP address of the machine on the current network."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def generate_qr_terminal(url: str) -> str:
    """Generate a QR code as ASCII art for terminal display."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=1,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)

    # Capture the ASCII QR code
    f = io.StringIO()
    qr.print_ascii(out=f, invert=True)
    return f.getvalue()


def generate_qr_svg(url: str) -> str:
    """Generate a QR code as SVG string for embedding in the web UI."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)

    factory = qrcode.image.svg.SvgPathImage
    img = qr.make_image(image_factory=factory)

    # Convert to string
    f = io.BytesIO()
    img.save(f)
    return f.getvalue().decode("utf-8")


def print_server_banner(server_url: str, cfg):
    """Print the startup banner with QR code to terminal."""
    qr_art = generate_qr_terminal(server_url)

    print()
    print("=" * 56)
    print("  🚀 UniversalShare is running!")
    print("=" * 56)
    print()
    print(f"  📱 Share with others on your network:")
    print(f"  🔗 {server_url}")
    print()
    print("  Scan this QR code with your phone camera:")
    print()
    # Indent the QR code
    for line in qr_art.strip().splitlines():
        print(f"    {line}")
    print()
    print(f"  📁 Files saved to: {cfg.UPLOAD_DIR.absolute()}")
    if cfg.use_ssl:
        print(f"  🔐 SSL enabled")
    if cfg.IS_CLOUD:
        print(f"  ☁️  Cloud mode (LAN discovery disabled)")
    print()
    print("=" * 56)
    print()


def start_udp_discovery_server():
    """UDP broadcast listener for LAN server discovery."""
    DISCOVERY_PORT = 8888
    DISCOVERY_MAGIC = b"UNIVERSALSHARE_DISCOVER"

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    try:
        sock.bind(("", DISCOVERY_PORT))
        print(f"🔍 Discovery server listening on UDP port {DISCOVERY_PORT}")

        while True:
            data, addr = sock.recvfrom(1024)
            if data == DISCOVERY_MAGIC:
                ip = get_local_ip()
                response = f"{settings.protocol}://{ip}:{settings.PORT}".encode()
                sock.sendto(response, addr)
                print(
                    f"📡 Discovery request from {addr[0]}, "
                    f"responded with {response.decode()}"
                )
    except Exception as e:
        print(f"❌ Discovery server error: {e}")
    finally:
        sock.close()
