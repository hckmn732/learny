"""[SPEC-2202] Deterministic selection of the warm-up notions (SPEC-410, BR-AUT-03, ADR-0148).

Ported from `packages/learning-engine/src/warmup/select.test.ts`. The expected choices and the
ranked candidate sets are the recordings of the TypeScript engine taken on 2026-11-21.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.warmup import WarmupParams, select_warmup, warmup_candidates

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[2] / "fixtures" / "learning_engine_warmup.json").read_text(
        encoding="utf-8"
    )
)
INPUTS = FIXTURE["inputs"]
EXPECTED = FIXTURE["output"]
BASE = INPUTS["base"]
PARAMS = WarmupParams(
    default_count=INPUTS["params"]["defaultCount"],
    allowed_counts=tuple(INPUTS["params"]["allowedCounts"]),
    default_scope=INPUTS["params"]["defaultScope"],
    lookback_days=INPUTS["params"]["lookbackDays"],
)


def _args(variant: dict[str, Any]) -> dict[str, Any]:
    merged = {**BASE, **variant}
    return {
        "formation_id": merged["formationId"],
        "seen_notions": merged["seenNotions"],
        "prerequisite_links": merged["prerequisiteLinks"],
        "next_chapter_id": merged["nextChapterId"],
        "accessible_chapter_ids": merged["accessibleChapterIds"],
        "local_date": merged["localDate"],
        "seed": merged["seed"],
        "scope": merged.get("scope"),
        "count": merged.get("count"),
        "params": PARAMS,
    }


@pytest.mark.parametrize("index", range(len(INPUTS["variants"])), ids=[v["name"] for v in INPUTS["variants"]])
def test_warmup_selection_matches_the_typescript_engine(index: int) -> None:
    variant = INPUTS["variants"][index]
    assert select_warmup(**_args(variant)) == EXPECTED[index]["choices"]


@pytest.mark.parametrize("index", range(len(INPUTS["variants"])), ids=[v["name"] for v in INPUTS["variants"]])
def test_warmup_candidates_match_the_typescript_engine(index: int) -> None:
    variant = INPUTS["variants"][index]
    assert warmup_candidates(**_args(variant)) == EXPECTED[index]["candidates"]


def test_the_upcoming_chapter_must_be_accessible() -> None:
    args = _args(INPUTS["variants"][0])
    args["accessible_chapter_ids"] = ["c1"]
    with pytest.raises(EngineError) as refused:
        select_warmup(**args)
    assert refused.value.code == "INVALID_INPUT"


def test_a_count_outside_the_allowed_sizes_is_refused() -> None:
    args = _args(INPUTS["variants"][0])
    args["count"] = 4
    with pytest.raises(EngineError) as refused:
        select_warmup(**args)
    assert refused.value.code == "INVALID_PARAM"


def test_a_duplicated_notion_is_refused() -> None:
    args = _args(INPUTS["variants"][0])
    args["seen_notions"] = [*BASE["seenNotions"], BASE["seenNotions"][0]]
    with pytest.raises(EngineError) as refused:
        select_warmup(**args)
    assert refused.value.code == "INVALID_INPUT"
