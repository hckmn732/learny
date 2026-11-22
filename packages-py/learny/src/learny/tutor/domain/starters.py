"""Starter questions of the tutor card (SPEC-610 EF-2).

Port of `packages/services/src/tutor-chat/starters.ts`: the three questions are computed without AI
from the selected chapter. The primary notion is the most cited one in `course_sections.notion_ids`;
ties choose the weakest notion of the chapter (the followed gap when one exists). The label is used
as provided, without automatic agreement.
"""

import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from learny.shared.locale_fr import content as texts

DIGIT = re.compile(r"\d")
DE = re.compile(r"\s+de\s+", re.IGNORECASE)


def lower_initial(value: str) -> str:
    """`TITLE` -> `tITLE`: only the first character is lowered, like `charAt(0).toLowerCase()`."""
    return value[:1].lower() + value[1:] if value else value


def _object_text(value: Any) -> str | None:
    if isinstance(value, str) and value.strip() != "":
        return value.strip()
    return None


def confusion_of(sections: Sequence[Mapping[str, Any]]) -> dict[str, str] | None:
    """The first `dont_confuse` section that names both sides."""
    for section in sections:
        if section.get("kind") != "dont_confuse":
            continue
        data = section.get("data")
        if not isinstance(data, Mapping):
            continue
        left = data.get("left")
        right = data.get("right")
        left_title = _object_text(left.get("title")) if isinstance(left, Mapping) else None
        right_title = _object_text(right.get("title")) if isinstance(right, Mapping) else None
        if left_title is not None and right_title is not None:
            return {"left": left_title, "right": right_title}
    return None


def short_left(label: str) -> str:
    """The left label up to its first ` de `, like the TypeScript `shortLeft`."""
    parts = DE.split(label, maxsplit=1)
    return parts[0].strip() if parts and parts[0].strip() else label


def starters_of(
    sections: Sequence[Mapping[str, Any]],
    notions: Sequence[Mapping[str, Any]],
    gap_notion_id: str | None = None,
) -> list[dict[str, str]]:
    """SPEC-610 EF-2: at most three starter questions, never invented."""
    counts: dict[str, int] = {}
    for section in sections:
        for notion_id in section.get("notionIds") or []:
            counts[str(notion_id)] = counts.get(str(notion_id), 0) + 1
    maximum = max(counts.values(), default=0)
    tied = [notion for notion in notions if counts.get(str(notion["id"]), 0) == maximum]
    primary = next(
        (notion for notion in tied if str(notion["id"]) == gap_notion_id),
        None,
    )
    if primary is None and tied:
        primary = sorted(tied, key=lambda notion: float(notion.get("mastery", 101)))[0]
    if primary is None and notions:
        primary = notions[0]

    has_number = any(
        DIGIT.search(str(section.get("contentMd") or "")) is not None
        or DIGIT.search(json.dumps(section.get("data") or {}, ensure_ascii=False)) is not None
        for section in sections
    )
    confusion = confusion_of(sections)

    starters: list[dict[str, str]] = []
    if primary is not None:
        label = texts.STARTER_EXPLAIN.format(label=lower_initial(str(primary["label"])))
        starters.append({"label": label, "prompt": label})
    example = texts.STARTER_EXAMPLE_WITH_NUMBERS if has_number else texts.STARTER_EXAMPLE_CONCRETE
    starters.append({"label": example, "prompt": example})
    if confusion is not None:
        left = short_left(confusion["left"])
        right = confusion["right"]
        label = texts.STARTER_CONFUSION.format(left=left, right=lower_initial(right))
        starters.append({"label": label, "prompt": label})
    return starters[:3]
