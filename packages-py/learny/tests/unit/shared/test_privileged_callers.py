"""[SPEC-2101] The service role is usable only by the closed list (CA-3, EF-4)."""

from pathlib import Path

import pytest
from learny.shared.db.privileged import PRIVILEGED_CALLERS

pytestmark = pytest.mark.spec("SPEC-2101")

ROOT = Path(__file__).resolve().parents[5]
SOURCE_ROOTS = (
    ROOT / "packages-py" / "learny" / "src",
    ROOT / "apps" / "api-py" / "src",
    ROOT / "apps" / "worker-py" / "src",
)
# The attribute form is the call; the bare name is the definition in the unit of work.
CALL = ".service_tx("


def modules_calling_service_tx() -> dict[str, list[str]]:
    """Module name -> the lines that open a service transaction, for every Python source tree."""
    found: dict[str, list[str]] = {}
    for source in SOURCE_ROOTS:
        if not source.exists():
            continue
        for file in sorted(source.rglob("*.py")):
            text = file.read_text(encoding="utf-8")
            lines = [line.strip() for line in text.splitlines() if CALL in line]
            if not lines:
                continue
            module = ".".join(file.relative_to(source).with_suffix("").parts)
            found[module] = lines
    return found


def test_every_service_transaction_caller_is_declared() -> None:
    callers = modules_calling_service_tx()
    assert callers, "no service transaction call found: the scan is broken"
    undeclared = sorted(set(callers) - set(PRIVILEGED_CALLERS))
    assert undeclared == [], (
        "modules opening a service transaction outside the closed list: "
        f"{undeclared} (add a line to learny/shared/db/privileged.py with a reason)"
    )


def test_every_declared_caller_has_a_reason() -> None:
    for module, reason in PRIVILEGED_CALLERS.items():
        assert module.startswith(("learny.", "learny_api.", "learny_worker.")), module
        assert len(reason) > 10, module


def test_the_declared_modules_exist() -> None:
    existing = {
        ".".join(file.relative_to(source).with_suffix("").parts)
        for source in SOURCE_ROOTS
        if source.exists()
        for file in source.rglob("*.py")
    }
    missing = sorted(set(PRIVILEGED_CALLERS) - existing)
    assert missing == [], f"declared modules that do not exist: {missing}"


def test_the_unit_of_work_is_the_only_place_defining_the_service_role() -> None:
    definitions = []
    for source in SOURCE_ROOTS:
        if not source.exists():
            continue
        for file in source.rglob("*.py"):
            text = file.read_text(encoding="utf-8")
            if "async def service_tx(" in text:
                definitions.append(".".join(file.relative_to(source).with_suffix("").parts))
    assert definitions == ["learny.shared.db.uow"]
