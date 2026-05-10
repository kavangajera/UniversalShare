"""Page routes — serves the HTML frontend."""

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
from pathlib import Path
import jinja2

router = APIRouter()

# Setup Jinja2 environment
_template_dir = Path(__file__).parent.parent / "templates"
_jinja_env = jinja2.Environment(
    loader=jinja2.FileSystemLoader(str(_template_dir)),
    autoescape=True,
)


@router.get("/", response_class=HTMLResponse)
async def home():
    """Serve the main UniversalShare page."""
    template = _jinja_env.get_template("index.html")
    return template.render()
