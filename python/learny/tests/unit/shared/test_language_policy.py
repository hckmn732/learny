"""[SPEC-2003] Language policy: Python code is English, French lives in locale_fr (ADR-2011)."""

from pathlib import Path

import pytest

pytestmark = pytest.mark.spec("SPEC-2003")

ROOT = Path(__file__).resolve().parents[5]
SCANNED_TREES = ("python", "apps/api", "apps/worker")
EXEMPT_DIRECTORIES = ("locale_fr", "generated", ".venv", "__pycache__")
FRENCH_MARKERS = (" de la ", " introuvable", "Une erreur", " est ", " dans ", " pour ")


def python_files() -> list[Path]:
    files: list[Path] = []
    for tree in SCANNED_TREES:
        base = ROOT / tree
        if not base.exists():
            continue
        for file in base.rglob("*.py"):
            if any(part in EXEMPT_DIRECTORIES for part in file.parts):
                continue
            if file.name == "test_language_policy.py":
                continue
            files.append(file)
    return sorted(files)


def test_python_sources_outside_locale_fr_are_ascii_english() -> None:
    files = python_files()
    assert files, "no Python source found"
    offenders = []
    for file in files:
        text = file.read_text(encoding="utf-8")
        if any(ord(character) > 127 for character in text):
            offenders.append(f"{file.relative_to(ROOT)} (non-ASCII)")
            continue
        if any(marker in text for marker in FRENCH_MARKERS):
            offenders.append(f"{file.relative_to(ROOT)} (French marker)")
    assert offenders == []


def test_french_strings_are_isolated_in_locale_fr() -> None:
    locale = ROOT / "python" / "learny" / "src" / "learny" / "shared" / "locale_fr"
    files = sorted(locale.rglob("*.py"))
    assert files, "locale_fr must hold the user-facing strings"
    assert any(any(ord(character) > 127 for character in file.read_text("utf-8")) for file in files)
