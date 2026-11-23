"""Live `sum_equal` control of a structured table (SPEC-502 ET-4, ADR-0027, CA-4).

Rows are counted on the left or the right from their group value, amounts are compared at the cent,
and the three labels are exactly those of the Exercice mockup.
"""

import math
import re
from collections.abc import Mapping
from typing import Any

from learny.shared.jsmath import js_round
from learny.shared.locale_fr import assessments as texts

FRENCH_DECIMAL = re.compile(r"^[+-]?\d+(\.\d+)?$")
WHITESPACE = re.compile(r"[\s\u00a0\u202f]+")
GROUP_SEPARATOR = "\u202f"
"""The `fr-FR` group separator of `Intl.NumberFormat`."""


def _js_number(value: float) -> float | int:
    return int(value) if math.isfinite(value) and float(value).is_integer() else value


def parse_french_number(raw: str) -> float | None:
    """Parses a French or plain decimal number; `None` for anything that is not a number."""
    compact = WHITESPACE.sub("", raw)
    if compact == "":
        return None
    if "," in compact and "." in compact:
        decimal = "," if compact.rindex(",") > compact.rindex(".") else "."
        thousands = "." if decimal == "," else ","
        normalized = compact.replace(thousands, "").replace(decimal, ".")
    elif "," in compact:
        if compact.count(",") != 1:
            return None
        normalized = compact.replace(",", ".")
    else:
        if compact.count(".") > 1:
            return None
        normalized = compact
    if FRENCH_DECIMAL.match(normalized) is None:
        return None
    value = float(normalized)
    return value if math.isfinite(value) else None


def format_french_number(value: float) -> str:
    """French number used by the inline totals (EF-10), `maximumFractionDigits: 2`."""
    rounded = js_round(value * 100) / 100
    text = f"{rounded:,.2f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text.replace(",", GROUP_SEPARATOR).replace(".", ",")


def _to_cents(raw: str | None) -> int:
    value = parse_french_number("" if raw is None else raw)
    return 0 if value is None else js_round(value * 100)


def _format_euro(value: float) -> str:
    return texts.TABLE_CHECK_EURO.format(amount=format_french_number(value))


def evaluate_table_checks(production: Mapping[str, Any], values: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Evaluates every `sum_equal` check of a table production on the current values (CA-4)."""
    results: list[dict[str, Any]] = []
    for index, check in enumerate(production["checks"]):
        left_cents = 0
        right_cents = 0
        has_amount = False
        side_by_row: list[str | None] = []
        for row in values["rows"]:
            group = str(row.get(check["groupColumn"], "")).strip()
            if group in check["left"]:
                side = "left"
            elif group in check["right"]:
                side = "right"
            else:
                side = None
            if side == "left":
                side_by_row.append(check.get("leftLabel"))
            elif side == "right":
                side_by_row.append(check.get("rightLabel"))
            else:
                side_by_row.append(None)
            cents = _to_cents(row.get(check["numberColumn"]))
            if side == "left":
                left_cents += cents
            elif side == "right":
                right_cents += cents
            if side is not None and cents > 0:
                has_amount = True
        difference_cents = abs(left_cents - right_cents)
        if not has_amount:
            state = "empty"
        elif difference_cents == 0 and left_cents > 0:
            state = "balanced"
        else:
            state = "unbalanced"
        if state == "empty":
            label = texts.TABLE_CHECK_EMPTY
        elif state == "balanced":
            label = texts.TABLE_CHECK_BALANCED
        else:
            label = texts.TABLE_CHECK_DIFFERENCE.format(amount=_format_euro(difference_cents / 100))
        results.append(
            {
                "index": index,
                "leftSum": _js_number(left_cents / 100),
                "rightSum": _js_number(right_cents / 100),
                "difference": _js_number(difference_cents / 100),
                "state": state,
                "label": label,
                "sideByRow": side_by_row,
            }
        )
    return results


__all__ = ["evaluate_table_checks", "format_french_number", "parse_french_number"]
