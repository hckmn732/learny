"""Gap read model and link derivation (SPEC-615 EF-1 to EF-5, BR-LAC-04, BR-LAC-05).

Everything is read with the learner's RLS transaction, so a formation of another learner is a 404
and never an empty page revealing it.
"""

from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

from learny.identity.domain.actor import Actor
from learny.learning.application.ports import LearningDeps
from learny.learning.domain.gaps import RECOMMENDED_ACTION_BY_NATURE
from learny.learning.domain.types import GAP_NATURES
from learny.learning.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.locale_fr import learning as texts
from learny.shared.time import parse_iso, to_iso


def _encode(value: object) -> str:
    """`encodeURIComponent`: the unreserved marks of JavaScript stay unescaped."""
    return quote(str(value), safe="!'()*-._~")


def training_target(*, formation_id: str, module_id: str, notion_id: str, nature: str) -> dict[str, str]:
    """BR-LAC-04 \u2014 forgetting, confusion and misunderstanding open the targeted global quiz."""
    action = RECOMMENDED_ACTION_BY_NATURE[nature]
    if action == "practice_exercise":
        return {
            "kind": "exercise",
            "href": f"/formations/{_encode(formation_id)}/modules/{_encode(module_id)}"
            f"/exercices?notion={_encode(notion_id)}",
        }
    return {
        "kind": "quiz",
        "href": f"/formations/{_encode(formation_id)}/quiz-global?cible={_encode(notion_id)}",
    }


def course_target(
    *, formation_id: str, module_id: str, chapter_id: str, section: Mapping[str, Any] | None
) -> dict[str, str] | None:
    """ET-5 \u2014 the course action points to the exact section, or disappears when it is broken."""
    if section is None:
        return None
    anchor = str(section["anchor"] or "").strip()
    if anchor == "":
        return None
    href = (
        f"/formations/{_encode(formation_id)}/modules/{_encode(module_id)}"
        f"/cours?chapitre={_encode(chapter_id)}#{_encode(anchor)}"
    )
    return {"sectionId": section["sectionId"], "anchor": anchor, "href": href}


def _instant(value: Any, now: str) -> str:
    """`new Date(row.detected_at).toISOString()`: the driver returns a datetime, a text is parsed."""
    if value is None:
        return now
    return to_iso(parse_iso(value) if isinstance(value, str) else value)


def _iso_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) else to_iso(value)


def _card(row: Mapping[str, Any], formation_id: str, now: str) -> dict[str, Any]:
    nature = str(row["nature"])
    section = (
        None
        if row["section_id"] is None or row["section_anchor"] is None
        else {"sectionId": row["section_id"], "anchor": row["section_anchor"]}
    )
    course = course_target(
        formation_id=formation_id,
        module_id=str(row["module_id"]),
        chapter_id=str(row["chapter_id"]),
        section=section,
    )
    return {
        "notionId": row["notion_id"],
        "notionLabel": row["notion_label"],
        "nature": nature,
        "recommendedAction": RECOMMENDED_ACTION_BY_NATURE[nature],
        "confusedWithLabel": row["confused_with_label"],
        "moduleId": row["module_id"],
        "modulePosition": int(row["module_position"]),
        "moduleTitle": row["module_title"],
        "chapterId": row["chapter_id"],
        "chapterTitle": row["chapter_title"],
        "revealedBy": row["revealed_by"],
        "detectedAt": _instant(row["detected_at"], now),
        "mastery": float(row["mastery"]),
        "threshold": int(row["threshold"]),
        "training": training_target(
            formation_id=formation_id,
            module_id=str(row["module_id"]),
            notion_id=str(row["notion_id"]),
            nature=nature,
        ),
        "course": course,
    }


async def list_gaps(
    deps: LearningDeps, actor: Actor, formation_id: str, nature: str | None
) -> dict[str, Any]:
    """ET-3, CL-1, CL-3 \u2014 one snapshot of the formation: summary, counters, cards, next review."""
    if nature is not None and nature not in GAP_NATURES:
        raise AppError(
            "VALIDATION_FAILED",
            texts.GAPS_NATURE_UNKNOWN,
            errors=[{"path": texts.GAPS_NATURE_PATH, "message": texts.GAPS_NATURE_EXPECTED}],
        )
    now = deps.clock.now()
    now_iso = to_iso(now)

    async with deps.db.user_tx(actor) as tx:
        formation = await queries.read_gaps_formation(tx, actor.user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", texts.GAPS_FORMATION_NOT_FOUND)
        summary = await queries.read_gaps_summary(tx, actor.user_id, formation_id)
        counts = await queries.read_gaps_counts(tx, actor.user_id, formation_id)
        rows = await queries.read_gaps_rows(tx, actor.user_id, formation_id, nature)
        next_review_at = await queries.read_gaps_next_review(tx, actor.user_id, formation_id, now_iso)
        return {
            "formationId": formation["id"],
            "formationTitle": formation["title"],
            "nature": nature,
            "summary": {
                "openGaps": max(0, int(summary["open_gaps"])),
                "masteredNotions": max(0, int(summary["mastered_notions"])),
                "gapModules": [int(item) for item in summary["gap_modules"] or []],
                "masteredModules": [int(item) for item in summary["mastered_modules"] or []],
            },
            "countsByNature": {
                "forgetting": max(0, int(counts.get("forgetting") or 0)),
                "confusion": max(0, int(counts.get("confusion") or 0)),
                "misunderstanding": max(0, int(counts.get("misunderstanding") or 0)),
                "application": max(0, int(counts.get("application") or 0)),
            },
            "items": [_card(row, str(formation["id"]), now_iso) for row in rows],
            "nextReviewAt": _iso_or_none(next_review_at),
            "timezone": formation["timezone"],
            "generatedAt": now_iso,
        }
