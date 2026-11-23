"""Follow-ups of a tutor answer (SPEC-610 ET-6, EF-9).

Port of `packages/services/src/tutor-chat/follow-ups.ts`: the code computes the follow-ups, never
the model. `rephrase`, `example` and `test_me` are always proposed; `compare` only when a confusion
pair exists in the chapter. The follow-up just served is not proposed again (CL-3).
"""

import re
from collections.abc import Mapping, Sequence
from typing import Any

from learny.shared.locale_fr import tutor as texts

_DE = re.compile(r"\s+de\s+", re.IGNORECASE)


def short_notion(label: str) -> str:
    """`Cle de comptabilisation` -> `Cle`: only the first segment is kept for a short comparison."""
    parts = _DE.split(label, maxsplit=1)
    return parts[0].strip() if parts and parts[0].strip() else label


def compare_label(pair: Mapping[str, str]) -> str:
    right = pair["right"][:1].lower() + pair["right"][1:]
    label = texts.COMPARE_LABEL.format(left=short_notion(pair["left"]), right=right)
    return f"{label[:29]}\u2026" if len(label) > 32 else label


def build_follow_ups(confusion: Mapping[str, str] | None, served: str | None = None) -> list[dict[str, str]]:
    """ET-6 \u2014 at most four follow-ups, the served one removed."""
    entries: list[dict[str, str]] = [
        {"key": "rephrase", "label": texts.FOLLOW_UP_LABELS["rephrase"]},
        {"key": "example", "label": texts.FOLLOW_UP_LABELS["example"]},
    ]
    if confusion is not None:
        entries.append({"key": "compare", "label": compare_label(confusion)})
    entries.append({"key": "test_me", "label": texts.FOLLOW_UP_LABELS["test_me"]})
    return [entry for entry in entries if entry["key"] != served]


def follow_up_labels(follow_ups: Sequence[Mapping[str, Any]]) -> dict[str, str]:
    """The `followUpLabels` map stored in the message context."""
    return {str(entry["key"]): str(entry["label"]) for entry in follow_ups}
