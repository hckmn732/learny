"""[SPEC-2003] JavaScript rounding and exponent rendering (ADR-2008)."""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.shared.jsmath import js_number, js_round

pytestmark = pytest.mark.spec("SPEC-2003")

ROOT = Path(__file__).resolve().parents[5]
VECTORS = json.loads((ROOT / "api" / "oracles" / "vectors" / "jsonx.json").read_text("utf-8"))


@pytest.mark.parametrize("case", VECTORS["round"])
def test_js_round_matches_math_round(case: dict[str, Any]) -> None:
    assert js_round(float(case["value"])) == case["js"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (1.0, "1"),
        (1e-7, "1e-7"),
        (1e21, "1e+21"),
        (1e300, "1e+300"),
        (0.0, "0"),
        (-0.0, "0"),
        (1 / 3, "0.3333333333333333"),
    ],
)
def test_js_number_rendering(value: float, expected: str) -> None:
    assert js_number(value) == expected


def test_js_number_rejects_non_finite() -> None:
    with pytest.raises(ValueError, match="non-finite"):
        js_number(float("nan"))
    with pytest.raises(ValueError, match="non-finite"):
        js_number(float("inf"))
