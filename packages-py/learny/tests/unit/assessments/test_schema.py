"""[SPEC-2202] Payload schemas of the thirteen brick types (SPEC-501 ET-2/ET-3).

Ported from `packages/bricks/src/types/<type>/schema.test.ts` and `validate.test.ts`. The expected
values are the recordings of the Zod schemas taken on 2026-11-21: same bounds, same defaults, same
trimming, same strictness. The message of a `SCHEMA_INVALID` issue is written in English here, so
only its code and its path are compared with TypeScript (ADR-2011).
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.assessments.domain.bricks.schema import PARSERS
from learny.assessments.domain.bricks.validate import (
    BrickInvalid,
    control_character_issues,
    parse_brick_payload,
    trim_deep,
)

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "bricks_validation.json").read_text(encoding="utf-8")
)
CASES = FIXTURE["payloads"]
PAYLOADS = {case["name"]: case for case in CASES}


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_the_payload_parse_matches_the_typescript_engine(case: dict[str, Any]) -> None:
    if case["ok"]:
        assert parse_brick_payload(case["type"], case["input"]) == case["value"]
        return
    with pytest.raises(BrickInvalid) as refused:
        parse_brick_payload(case["type"], case["input"])
    expected = [(issue["code"], issue["path"]) for issue in case["issues"]]
    assert [(issue["code"], issue["path"]) for issue in refused.value.issues] == expected


def test_every_type_has_a_reader() -> None:
    assert sorted(PARSERS) == sorted(
        [
            "text",
            "resource_excerpt",
            "choice_question",
            "open_question",
            "cloze",
            "matching",
            "ordering",
            "categorization",
            "recall_card",
            "instruction",
            "scripted_dialogue",
            "timer",
            "scoring",
        ]
    )


@pytest.mark.parametrize(
    ("name", "field", "expected"),
    [
        ("timer-defaults", "warnAtSec", 300),
        ("open_question-defaults", "answerMaxChars", 1500),
        ("matching-defaults", "extraRights", []),
        ("scripted_dialogue-defaults", "maxTurns", 12),
        ("instruction-defaults", "passPoints", 8),
    ],
)
def test_the_defaults_are_applied(name: str, field: str, expected: Any) -> None:
    payload = parse_brick_payload(PAYLOADS[name]["type"], PAYLOADS[name]["input"])
    assert payload[field] == expected


def test_the_timer_warning_point_is_capped_at_three_hundred_seconds() -> None:
    payload = parse_brick_payload("timer", {"durationSec": 900, "scope": "activity", "sources": []})
    assert payload["warnAtSec"] == 300


def test_an_unknown_field_reports_its_exact_path() -> None:
    with pytest.raises(BrickInvalid) as refused:
        parse_brick_payload("text", {"bodyMd": "Corps", "sources": [], "hint": "x"})
    assert [(issue["code"], issue["path"]) for issue in refused.value.issues] == [
        ("SCHEMA_INVALID", "payload.hint")
    ]


def test_every_invalid_field_is_reported_together() -> None:
    with pytest.raises(BrickInvalid) as refused:
        parse_brick_payload("text", {"title": 3, "bodyMd": "", "extra": True})
    paths = [issue["path"] for issue in refused.value.issues]
    assert "payload.title" in paths
    assert "payload.bodyMd" in paths
    assert "payload.extra" in paths


def test_an_unknown_type_is_refused_on_its_type_path() -> None:
    with pytest.raises(BrickInvalid) as refused:
        parse_brick_payload("poster", {})
    assert refused.value.issues == [
        {
            "code": "SCHEMA_INVALID",
            "path": "type",
            "message": 'Unknown brick type "poster".',
        }
    ]


def test_the_strings_are_trimmed_before_validation() -> None:
    payload = parse_brick_payload("text", {"bodyMd": "   Un corps.   ", "sources": [], "title": "  Titre  "})
    assert payload["bodyMd"] == "Un corps."
    assert payload["title"] == "Titre"


def test_a_control_character_is_refused_on_the_raw_draft() -> None:
    issues = control_character_issues({"bodyMd": "Texte\u0000piege"}, "payload")
    assert issues == [
        {
            "code": "SCHEMA_INVALID",
            "path": "payload.bodyMd",
            "message": "Control character U+0000 is not allowed.",
        }
    ]
    assert control_character_issues("Texte\u0000piege") == [
        {
            "code": "SCHEMA_INVALID",
            "path": "(root)",
            "message": "Control character U+0000 is not allowed.",
        }
    ]


def test_a_newline_and_a_tab_are_allowed() -> None:
    assert control_character_issues({"bodyMd": "a\nb\tc"}) == []


def test_trim_deep_walks_arrays_and_objects() -> None:
    assert trim_deep({"a": " x ", "b": [" y ", {"c": " z "}]}) == {
        "a": "x",
        "b": ["y", {"c": "z"}],
    }
    assert trim_deep(3) == 3
    assert trim_deep(None) is None


def test_a_uuid_outside_the_rfc_9562_shape_is_refused() -> None:
    with pytest.raises(BrickInvalid) as refused:
        parse_brick_payload(
            "text",
            {
                "bodyMd": "Corps",
                "sources": [{"chunkId": "pas-un-uuid"}],
            },
        )
    assert refused.value.issues[0]["path"] == "payload.sources.0.chunkId"


def test_the_resource_location_refinements_are_enforced() -> None:
    with pytest.raises(BrickInvalid):
        parse_brick_payload(
            "resource_excerpt",
            {
                "resourceId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "chunkId": None,
                "location": {"charStart": 10, "charEnd": 5},
                "quote": "Extrait",
                "label": "Etiquette",
                "sources": [],
            },
        )


def test_the_instruction_production_bounds_are_enforced() -> None:
    with pytest.raises(BrickInvalid) as refused:
        parse_brick_payload(
            "instruction",
            {
                "title": "Exercice",
                "taskMd": "Un exercice long.",
                "data": [],
                "deliverable": "Une table",
                "production": {
                    "kind": "table",
                    "fields": [],
                    "columns": [{"key": "a", "label": "A", "type": "text"}],
                    "minRows": 5,
                    "maxRows": 2,
                    "initialRows": 3,
                    "checks": [],
                },
                "explanationPrompt": None,
                "hints": [],
                "criteria": [{"key": "c1", "label": "C1", "points": 10, "description": "Bien"}],
                "estimatedMinutes": 20,
                "passPoints": 8,
                "sources": [],
            },
        )
    paths = [issue["path"] for issue in refused.value.issues]
    assert "payload.production.maxRows" in paths
    assert "payload.production.initialRows" in paths
