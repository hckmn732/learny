"""[SPEC-2301] The cutover tool produces overrides the facade and the worker really read.

The Node planner (`tools/deploy/cutover.mjs`) writes `OWNERSHIP_OVERRIDES`; this test runs it on the
real inventory and feeds its output to `learny.shared.ownership`, so a value the runtime would drop
(a percentage bucket, an unknown key) fails here instead of silently leaving the traffic on one
side (ADR-2005, CL-3).
"""

import json
import subprocess
from pathlib import Path
from typing import Any

import pytest
from learny.shared.ownership import (
    WILDCARD,
    Ownership,
    apply_overrides,
    load_ownership,
    load_ownership_for_worker,
    overrides_from_env,
    validate_completeness,
)

pytestmark = pytest.mark.spec("SPEC-2301")

ROOT = Path(__file__).resolve().parents[4]
CUTOVER = ROOT / "tools" / "deploy" / "cutover.mjs"
OWNERSHIP = ROOT / "api" / "ownership.yaml"


def run_cutover(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    """Runs the planner on the committed artefacts; stdout is the override, stderr the summary."""
    result = subprocess.run(  # noqa: S603 - les arguments sont des options litterales
        ["node", str(CUTOVER), *args],  # noqa: S607 - node is resolved through PATH
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if check and result.returncode != 0:
        raise AssertionError(f"cutover failed ({result.returncode}): {result.stderr}")
    return result


def ownership() -> Ownership:
    return load_ownership(OWNERSHIP)


def contract_entries() -> tuple[list[str], list[str]]:
    data: dict[str, Any] = json.loads((ROOT / "api" / "inventory.json").read_text("utf-8"))
    return (
        [str(item["id"]) for item in data["operations"]],
        [f"{item['method']} {item['path']}" for item in data["special"]],
    )


def context_operations(context: str) -> tuple[list[str], list[str]]:
    data: dict[str, Any] = json.loads((ROOT / "api" / "inventory.json").read_text("utf-8"))
    operations = [item for item in data["operations"] if item["context"] == context]
    reads = [str(item["id"]) for item in operations if item["method"] in ("GET", "HEAD")]
    writes = [str(item["id"]) for item in operations if item["method"] not in ("GET", "HEAD")]
    return reads, writes


def test_the_read_canary_is_accepted_and_moves_only_the_reads() -> None:
    result = run_cutover("--relay-only", "--context", "learning", "--stage", "reads")
    overrides = overrides_from_env(result.stdout.strip())
    # Nothing was dropped by the runtime: every key of the JSON is a real override.
    assert overrides == json.loads(result.stdout)
    assert overrides[WILDCARD] == "ts"

    applied = apply_overrides(ownership(), overrides)
    reads, writes = context_operations("learning")
    assert reads
    assert writes
    assert all(applied.operations[route] == "py" for route in reads)
    assert all(applied.operations[route] == "ts" for route in writes)
    # The rest of the contract stays on the relay: one writer per entry, no partial context.
    data: dict[str, Any] = json.loads((ROOT / "api" / "inventory.json").read_text("utf-8"))
    elsewhere = [str(item["id"]) for item in data["operations"] if item["context"] == "tutor"]
    assert elsewhere
    assert all(applied.operations[route] == "ts" for route in elsewhere)

    operation_ids, special_keys = contract_entries()
    validate_completeness(applied, operation_ids, special_keys)


def test_the_promotion_moves_every_mutation_of_the_context_at_once() -> None:
    canary = run_cutover("--relay-only", "--context", "learning", "--stage", "reads").stdout.strip()
    promoted = run_cutover("--context", "learning", "--stage", "writes", "--current", canary).stdout.strip()
    applied = apply_overrides(ownership(), overrides_from_env(promoted))
    reads, writes = context_operations("learning")
    assert all(applied.operations[route] == "py" for route in [*reads, *writes])


def test_the_total_rollback_forces_every_entry_back_to_the_relay() -> None:
    result = run_cutover("--all", "--stage", "rollback")
    overrides = overrides_from_env(result.stdout.strip())
    assert overrides == {WILDCARD: "ts"}
    applied = apply_overrides(ownership(), overrides)
    assert set(applied.operations.values()) == {"ts"}
    assert set(applied.special.values()) == {"ts"}
    assert set(applied.consumers.values()) == {"ts"}
    assert set(applied.crons.values()) == {"ts"}


def test_the_end_of_the_cutover_is_the_committed_table() -> None:
    result = run_cutover("--all", "--stage", "writes")
    assert overrides_from_env(result.stdout.strip()) == {}
    committed = ownership()
    assert apply_overrides(committed, {}) == committed


def test_the_planner_refuses_a_mutation_on_both_sides() -> None:
    result = run_cutover(
        "--context",
        "learning",
        "--stage",
        "writes",
        "--current",
        '{"*":"ts","slots.move":"py"}',
        check=False,
    )
    assert result.returncode == 2
    assert "TWO_WRITERS" in result.stderr
    assert not result.stdout.strip()


def test_the_planner_refuses_a_promotion_before_the_canary() -> None:
    result = run_cutover("--relay-only", "--context", "learning", "--stage", "writes", check=False)
    assert result.returncode == 2
    assert "READS_NOT_PROMOTED" in result.stderr


def test_the_planner_refuses_a_percentage_owner_the_runtime_would_ignore() -> None:
    result = run_cutover(
        "--context",
        "learning",
        "--stage",
        "writes",
        "--current",
        '{"*":"ts","agenda.get":"py@10"}',
        check=False,
    )
    assert result.returncode == 2
    assert "INVALID_OWNER" in result.stderr


def test_the_worker_reads_the_wildcard_of_its_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OWNERSHIP_OVERRIDES", '{"*":"ts"}')
    applied = load_ownership_for_worker(OWNERSHIP)
    assert set(applied.operations.values()) == {"ts"}
    assert set(applied.consumers.values()) == {"ts"}
    monkeypatch.setenv("OWNERSHIP_OVERRIDES", '{"*":"ts","agenda.get":"py"}')
    applied = load_ownership_for_worker(OWNERSHIP)
    assert applied.operations["agenda.get"] == "py"
    assert applied.operations["slots.move"] == "ts"
