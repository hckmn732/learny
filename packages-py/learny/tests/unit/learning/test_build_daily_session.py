"""[SPEC-2202] Daily global quiz session, smoothing and format choice (SPEC-406, SPEC-716, SPEC-718).

Ported from `packages/learning-engine/src/global-quiz/build-daily-session.test.ts` and
`packages/learning-engine/src/session/format-choice.test.ts`. The expected values are the
recordings of the TypeScript engine taken on 2026-11-21 from the same inputs.
"""

import json
from itertools import pairwise
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.global_quiz import (
    build_daily_session,
    choose_gap_format,
    draw_smooth_quiz_session,
    interleave_by_module,
    reintroduce_deferred_notions,
    weighted_format_pick,
)

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "learning_engine_global_quiz.json").read_text(
        encoding="utf-8"
    )
)
INPUTS = FIXTURE["inputs"]
EXPECTED = FIXTURE["output"]
BASE = INPUTS["base"]


def _session(variant: dict[str, Any]) -> dict[str, Any]:
    merged = {**BASE, **variant["extra"]}
    return build_daily_session(
        formation_id=merged["formationId"],
        date=merged["date"],
        due_notions=merged["dueNotions"],
        gaps=merged["gaps"],
        bank=merged["bank"],
        last_formats=merged["lastFormats"],
        cap_minutes=merged["capMinutes"],
        mode=merged["mode"],
        seed=merged["seed"],
        params=INPUTS["params"],
        forced_formats=merged.get("forcedFormats"),
        preference=merged.get("preference"),
        target_retention=merged.get("targetRetention"),
    )


@pytest.mark.parametrize("index", range(len(INPUTS["variants"])), ids=[v["name"] for v in INPUTS["variants"]])
def test_daily_session_matches_the_typescript_engine(index: int) -> None:
    assert _session(INPUTS["variants"][index]) == EXPECTED["sessions"][index]["output"]


def test_smoothed_draw_matches_the_typescript_engine() -> None:
    smoothing = INPUTS["smoothing"]
    drawn = draw_smooth_quiz_session(
        max_minutes=smoothing["maxMinutes"],
        target_retention=smoothing["targetRetention"],
        formation_id=BASE["formationId"],
        date=BASE["date"],
        due_notions=BASE["dueNotions"],
        gaps=BASE["gaps"],
        bank=BASE["bank"],
        last_formats=BASE["lastFormats"],
        mode=BASE["mode"],
        seed=BASE["seed"],
        params=INPUTS["params"],
    )
    assert drawn == EXPECTED["smoothed"]


def test_interleaving_never_repeats_the_previous_module() -> None:
    interleaved = interleave_by_module(INPUTS["interleave"])
    assert [item["notionId"] for item in interleaved] == EXPECTED["interleaved"]
    modules = [item["moduleId"] for item in interleaved]
    assert all(left != right for left, right in pairwise(modules))


def test_reintroducing_deferred_notions_is_a_union() -> None:
    current = INPUTS["reintroduce"]["current"]
    deferred = INPUTS["reintroduce"]["deferred"]
    assert reintroduce_deferred_notions(current, deferred) == EXPECTED["reintroduced"]


@pytest.mark.parametrize("index", range(len(INPUTS["picks"])))
def test_weighted_format_pick_matches_the_typescript_engine(index: int) -> None:
    pick = INPUTS["picks"][index]
    assert (
        weighted_format_pick(pick["preference"], pick["available"], pick["seed"], pick["lastFormat"])
        == EXPECTED["picks"][index]
    )


@pytest.mark.parametrize("index", range(len(INPUTS["gapFormats"])))
def test_gap_format_choice_matches_the_typescript_engine(index: int) -> None:
    entry = INPUTS["gapFormats"][index]
    assert (
        choose_gap_format(entry["nature"], entry["available"], entry.get("lastPairFormat"))
        == EXPECTED["gapFormats"][index]
    )


def test_an_unknown_bank_format_is_refused() -> None:
    with pytest.raises(EngineError) as refused:
        build_daily_session(
            formation_id="f1",
            date="2026-11-11",
            due_notions=BASE["dueNotions"],
            gaps=[],
            bank=[{"notionId": "n1", "formats": ["unknown_format"]}],
            last_formats=[],
            cap_minutes=15,
            mode="full",
            seed="seed",
            params=INPUTS["params"],
        )
    assert refused.value.code == "INVALID_INPUT"
