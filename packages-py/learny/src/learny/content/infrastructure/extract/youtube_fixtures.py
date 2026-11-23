"""Deterministic public-caption fixtures of the YouTube extractor (SPEC-510 EF-2, ET-5).

The values are identical and live in the JSON fixture, so the Python source stays ASCII and the
committed data is the single copy the mock provider reads. No test or demonstration ever calls
YouTube.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from learny.platform.llm.mock import fixtures_directory

NO_CAPTIONS_VIDEO_ID = "noCaptions1"


def youtube_fixtures_path() -> Path:
    """Committed captions fixture of the extractor."""
    return fixtures_directory() / "youtube" / "captions.json"


@lru_cache(maxsize=1)
def _fixtures() -> dict[str, Any]:
    payload: Any = json.loads(youtube_fixtures_path().read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def youtube_fixture(video_id: str) -> dict[str, Any] | None:
    """Mock provider: unknown videos behave like a video without public captions."""
    value = _fixtures().get(video_id)
    return value if isinstance(value, dict) else None


__all__ = ["NO_CAPTIONS_VIDEO_ID", "youtube_fixture", "youtube_fixtures_path"]
