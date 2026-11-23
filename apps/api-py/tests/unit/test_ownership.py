"""[SPEC-2003] Route ownership between the facade and Hono (ADR-2005)."""

import json
from pathlib import Path
from typing import Any

import pytest
from learny_api.ownership import (
    Ownership,
    OwnershipError,
    load_ownership,
    overrides_from_env,
    special_key,
    validate_completeness,
)

pytestmark = pytest.mark.spec("SPEC-2003")

ROOT = Path(__file__).resolve().parents[4]
OWNERSHIP = ROOT / "api" / "ownership.yaml"


def inventory() -> dict[str, Any]:
    data: dict[str, Any] = json.loads((ROOT / "api" / "inventory.json").read_text("utf-8"))
    return data


def contract_entries() -> tuple[list[str], list[str]]:
    data = inventory()
    operation_ids = [str(item["id"]) for item in data["operations"]]
    special_keys = [special_key(str(item["method"]), str(item["path"])) for item in data["special"]]
    return operation_ids, special_keys


def test_ownership_covers_every_operation_and_special_route() -> None:
    ownership = load_ownership(OWNERSHIP)
    operation_ids, special_keys = contract_entries()
    validate_completeness(ownership, operation_ids, special_keys)
    # ADR-2041: the SDD demonstration operations and routes are retired (217 -> 156, 32 -> 11).
    assert len(ownership.operations) == 156
    assert len(ownership.special) == 11
    assert set(ownership.operations.values()) <= {"ts", "py"}


def test_an_operation_without_owner_is_refused() -> None:
    ownership = load_ownership(OWNERSHIP)
    operation_ids, special_keys = contract_entries()
    incomplete = Ownership(
        operations={key: value for key, value in ownership.operations.items() if key != "health.get"},
        special=ownership.special,
        consumers={},
        crons={},
    )
    with pytest.raises(OwnershipError, match="without owner"):
        validate_completeness(incomplete, operation_ids, special_keys)


def test_an_unknown_operation_is_refused() -> None:
    ownership = load_ownership(OWNERSHIP)
    with pytest.raises(OwnershipError, match="not in the contract"):
        validate_completeness(
            Ownership(
                operations={**ownership.operations, "ghost.get": "ts"},
                special=ownership.special,
                consumers={},
                crons={},
            ),
            ["health.get"],
            [special_key("GET", "/api/v1/health")],
        )


def test_special_keys_are_canonical() -> None:
    assert special_key("get", "/api/v1/health") == "GET /api/v1/health"


def test_overrides_are_read_from_json() -> None:
    assert overrides_from_env('{"health.get": "py"}') == {"health.get": "py"}
    assert overrides_from_env(None) == {}
    assert overrides_from_env('{"x": "invalid"}') == {}


def test_an_invalid_owner_is_refused(tmp_path: Path) -> None:
    file = tmp_path / "ownership.yaml"
    file.write_text("operations:\n  health.get: rust\n", encoding="utf-8")
    with pytest.raises(OwnershipError, match="must be 'ts' or 'py'"):
        load_ownership(file)
