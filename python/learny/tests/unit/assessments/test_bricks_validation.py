"""[SPEC-2202] Complete validation of a brick draft (SPEC-501 ET-5, BR-IA-11).

The expected bricks and issue lists are the reference recordings with the same in-memory resolver.
Messages are compared for every code except `SCHEMA_INVALID`, whose wording is written in English by
the Python validator (ADR-2011).
"""

import asyncio
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import pytest
from learny.assessments.domain.bricks.validate import BrickInvalid, validate_brick

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_validation.json").read_text(encoding="utf-8")
)
IDS = FIXTURE["ids"]
CASES = FIXTURE["drafts"]
CASE_BY_NAME = {case["name"]: case for case in CASES}


class MemoryResolver:
    """The in-memory resolver of `packages/bricks/test/helpers.ts`."""

    def __init__(self, options: dict[str, Any] | None = None) -> None:
        self.options = options or {}
        self.calls = 0

    async def existing_notion_ids(self, formation_id: str, ids: Sequence[str]) -> set[str]:
        self.calls += 1
        allowed = self.options.get("notions")
        return set(ids) if allowed is None else {item for item in ids if item in allowed}

    async def chunks(self, ids: Sequence[str]) -> dict[str, dict[str, str]]:
        self.calls += 1
        declared = self.options.get("chunks")
        found: dict[str, dict[str, str]] = {}
        for item in ids:
            if declared is None:
                found[item] = {"resourceId": IDS["resourceA"]}
            elif item in declared:
                found[item] = {"resourceId": declared[item]}
        return found

    async def resources(self, ids: Sequence[str]) -> dict[str, Any]:
        self.calls += 1
        declared = self.options.get("resources")
        found: dict[str, Any] = {}
        for item in ids:
            if declared is None:
                found[item] = {
                    "kind": "pdf",
                    "pages": 100,
                    "durationSec": None,
                    "deleted": False,
                }
            elif item in declared:
                entry = declared[item]
                found[item] = {
                    "kind": entry.get("kind", "pdf"),
                    "pages": entry.get("pages", 100),
                    "durationSec": entry.get("durationSec"),
                    "deleted": entry.get("deleted", False),
                }
        return found

    async def existing_brick_ids(self, formation_id: str, ids: Sequence[str]) -> set[str]:
        self.calls += 1
        allowed = self.options.get("bricks")
        return set(ids) if allowed is None else {item for item in ids if item in allowed}


def _normalized(issues: list[dict[str, str]]) -> list[tuple[str, str, str | None]]:
    return [
        (
            issue["code"],
            issue["path"],
            None if issue["code"] == "SCHEMA_INVALID" else issue["message"],
        )
        for issue in issues
    ]


def _validate(case: dict[str, Any]) -> tuple[Any, list[dict[str, str]]]:
    resolver = MemoryResolver(case["options"])
    try:
        return asyncio.run(validate_brick(case["draft"], resolver)), []
    except BrickInvalid as error:
        return None, error.issues


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_the_validation_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    brick, issues = _validate(case)
    if case["ok"]:
        assert issues == []
        assert brick == case["brick"]
        return
    assert brick is None
    assert _normalized(issues) == _normalized(case["issues"])


def test_a_valid_brick_carries_its_fingerprint() -> None:
    brick, _issues = _validate(CASE_BY_NAME["valid-choice_question"])
    assert brick is not None
    assert brick["fingerprint"] is not None
    assert len(brick["fingerprint"]) == 64


def test_a_non_question_brick_has_no_fingerprint() -> None:
    brick, _issues = _validate(CASE_BY_NAME["valid-text"])
    assert brick is not None
    assert brick["fingerprint"] is None


def test_an_unknown_field_of_the_payload_reports_its_exact_path() -> None:
    _brick, issues = _validate(CASE_BY_NAME["hint-on-instruction"])
    assert [(issue["code"], issue["path"]) for issue in issues] == [("SCHEMA_INVALID", "payload.hint")]


def test_a_schema_failure_never_calls_the_resolver() -> None:
    case = CASE_BY_NAME["empty-choice_question"]
    resolver = MemoryResolver(case["options"])
    with pytest.raises(BrickInvalid) as refused:
        asyncio.run(validate_brick(case["draft"], resolver))
    assert all(issue["code"] == "SCHEMA_INVALID" for issue in refused.value.issues)
    assert resolver.calls == 0


def test_every_issue_of_a_step_is_returned_together() -> None:
    _brick, issues = _validate(CASE_BY_NAME["two-distractors-without-notion"])
    distractors = [issue for issue in issues if issue["code"] == "DISTRACTOR_NOTION_MISSING"]
    assert len(distractors) == 2


def test_an_injection_is_treated_as_ordinary_data() -> None:
    brick, _issues = _validate(CASE_BY_NAME["injection"])
    assert brick is not None
    assert "</document>" in brick["payload"]["stem"]


def test_a_paused_formation_does_not_change_the_rules() -> None:
    case = CASE_BY_NAME["valid-choice_question"]
    draft = {**case["draft"], "purpose": "remediation"}
    resolver = MemoryResolver(case["options"])
    brick = asyncio.run(validate_brick(draft, resolver))
    assert brick["purpose"] == "remediation"


def test_the_origin_rules_are_enforced() -> None:
    for name in ("origin-resource-excerpt", "origin-timer", "origin-scoring"):
        _brick, issues = _validate(CASE_BY_NAME[name])
        assert any(issue["code"] == "ORIGIN_INVALID" for issue in issues), name


def test_a_resource_brick_must_cite_a_source() -> None:
    _brick, issues = _validate(CASE_BY_NAME["sources-required"])
    assert [issue["code"] for issue in issues] == ["SOURCES_REQUIRED"]


def test_a_timer_has_no_notion_requirement() -> None:
    brick, _issues = _validate(CASE_BY_NAME["notion-required-timer"])
    assert brick is not None


def test_a_pedagogical_brick_needs_a_notion() -> None:
    _brick, issues = _validate(CASE_BY_NAME["notion-required"])
    assert [issue["code"] for issue in issues] == ["NOTION_REQUIRED"]


def test_the_unknown_references_are_reported_per_path() -> None:
    _brick, issues = _validate(CASE_BY_NAME["resource-not-found"])
    paths = sorted(issue["path"] for issue in issues if issue["code"] == "RESOURCE_NOT_FOUND")
    assert paths == [
        "payload.chunkId",
        "payload.resourceId",
        "payload.sources.0.chunkId",
    ]


def test_a_deleted_resource_is_not_found() -> None:
    case = CASE_BY_NAME["resource-not-found"]
    resolver = MemoryResolver({"resources": {IDS["resourceA"]: {"kind": "pdf", "deleted": True}}})
    with pytest.raises(BrickInvalid) as refused:
        asyncio.run(validate_brick(case["draft"], resolver))
    assert any(issue["code"] == "RESOURCE_NOT_FOUND" for issue in refused.value.issues)


@pytest.mark.parametrize("name", ["location-page-beyond", "location-timed"])
def test_the_location_rules_are_enforced(name: str) -> None:
    _brick, issues = _validate(CASE_BY_NAME[name])
    assert [issue["code"] for issue in issues] == ["LOCATION_INVALID"]


def test_a_web_excerpt_accepts_a_character_range() -> None:
    brick, _issues = _validate(CASE_BY_NAME["location-web-anchor"])
    assert brick is not None
