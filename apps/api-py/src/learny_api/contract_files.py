"""Location of the generated contract artefacts (SPEC-2003, SPEC-2207).

In a source checkout they live in `<repo>/api`. In the container the library is installed in
site-packages, so `PY_API_DIR=/app/api` names the directory explicitly. The facade reads the same
files at startup; the development coverage page reads them too, from the same rules.
"""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]


def api_dir() -> Path:
    """Directory holding the generated contract artefacts."""
    override = os.environ.get("PY_API_DIR")
    if override:
        return Path(override)
    for candidate in (ROOT / "api", Path.cwd() / "api"):
        if (candidate / "ownership.yaml").exists():
            return candidate
    return ROOT / "api"


def ownership_file() -> Path:
    return api_dir() / "ownership.yaml"


def inventory_file() -> Path:
    return api_dir() / "inventory.json"
