"""[SPEC-2202] Deterministic draw of one validation attempt (SPEC-405, BR-QUI-03, ADR-0170).

Ported from `packages/learning-engine/src/draw/draw-attempt.test.ts`. The expected questions,
quotas, exhaustion report and diagnostics are the recordings of the TypeScript engine taken on
2026-11-21 from the same inputs.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.draw import draw_attempt
from learny.learning.domain.errors import EngineError

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "learning_engine_draw.json").read_text(
        encoding="utf-8"
    )
)
INPUTS = FIXTURE["inputs"]
EXPECTED = FIXTURE["output"]


def _case_input(variant: dict[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = {
        "notions": variant.get("notions", INPUTS["notions"]),
        "bank": variant.get("bank", INPUTS["bank"]),
        "seen_fingerprints": variant.get("seen", INPUTS["seen"]),
        "gaps": variant.get("gaps", INPUTS["gaps"]),
        "params": variant["params"],
        "seed": variant.get("seed", INPUTS["seed"]),
        "target_count": variant["targetCount"],
    }
    if variant.get("reverse"):
        data["notions"] = list(reversed(INPUTS["notions"]))
        data["bank"] = list(reversed(INPUTS["bank"]))
        data["gaps"] = list(reversed(INPUTS["gaps"]))
    return data


@pytest.mark.parametrize("index", range(len(INPUTS["variants"])), ids=[v["name"] for v in INPUTS["variants"]])
def test_draw_attempt_matches_the_typescript_engine(index: int) -> None:
    variant = INPUTS["variants"][index]
    assert draw_attempt(**_case_input(variant)) == EXPECTED[index]["output"]


def test_the_draw_does_not_depend_on_the_input_order() -> None:
    straight = _case_input(INPUTS["variants"][0])
    reversed_input = _case_input({**INPUTS["variants"][0], "reverse": True})
    assert draw_attempt(**straight) == draw_attempt(**reversed_input)


def test_a_target_count_outside_the_bounds_is_refused() -> None:
    data = _case_input(INPUTS["variants"][0])
    data["target_count"] = 2
    data["params"] = INPUTS["params"]
    with pytest.raises(EngineError) as refused:
        draw_attempt(**data)
    assert refused.value.code == "INVALID_INPUT"
    assert refused.value.path == "targetCount"


def test_a_brick_without_fingerprint_is_ignored() -> None:
    data = _case_input(INPUTS["variants"][0])
    data["bank"] = [brick for brick in data["bank"] if brick["fingerprint"] is not None]
    result = draw_attempt(**data)
    assert all(question["fingerprint"] is not None for question in result["questions"])
