"""Custom headers middleware — Permissions-Policy for motion sensors."""


async def add_permissions_policy_headers(request, call_next):
    """Add Permissions-Policy headers for motion sensor access (shake-to-upload)."""
    response = await call_next(request)
    # Allow motion sensors for all origins (needed for shake-to-upload on mobile)
    response.headers["Permissions-Policy"] = "accelerometer=*, gyroscope=*"
    # Older header (deprecated but harmless)
    response.headers["Feature-Policy"] = "accelerometer 'self'; gyroscope 'self'"
    return response
