"""Final review and memory interview of a completed formation (SPEC-617, BR-FOR-12, BR-PRO-03).

The projection is pure, the reads run on the learner's RLS transaction, and the mode transition
locks the formation, cancels the future slots when the interview stops and writes one
`formation/maintenance-changed` event in the same commit.
"""

import math
import re
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from learny.identity.domain.actor import Actor
from learny.learning.application.ports import LearningDeps
from learny.learning.application.series import milestone_label
from learny.learning.domain.params import ENGINE
from learny.learning.domain.progress import calculate_progress
from learny.learning.domain.retention import calculate_retention
from learny.learning.domain.time import days_between, local_date_of
from learny.learning.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.locale_fr import learning as texts
from learny.shared.naming import formation_monogram
from learny.shared.prng import utf16_key
from learny.shared.time import parse_iso, to_iso

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
ACCENTS = ("indigo", "green", "orange", "violet", "teal")
FINAL_REVIEW_MODES = ("light", "stopped")
MAINTENANCE_EVENT = "formation/maintenance-changed"


def is_uuid(value: str) -> bool:
    """ET-3 \u2014 a malformed identifier never reaches SQL."""
    return UUID.match(value) is not None and len(value) == 36


def _iso(value: Any) -> str:
    """`toIso`: a database instant (datetime or string) as a canonical ISO string."""
    if isinstance(value, str):
        return to_iso(parse_iso(value))
    if isinstance(value, datetime):
        return to_iso(value)
    raise TypeError(f"not an instant: {value!r}")


def _instant_or_none(value: Any) -> str | None:
    return None if value is None else _iso(value)


def is_formation_complete(modules: Sequence[Mapping[str, Any]]) -> bool:
    """CA-1 \u2014 no module or at least one unvalidated module means the bilan cannot open."""
    return len(modules) > 0 and all(str(module["status"]) == "validated" for module in modules)


def assert_formation_complete(modules: Sequence[Mapping[str, Any]]) -> None:
    """ET-5 \u2014 a formation that is not finished answers 409 instead of an anticipated bilan."""
    if not is_formation_complete(modules):
        raise AppError("CONFLICT", texts.FINAL_REVIEW_NOT_COMPLETE)


def retention_display(rate: float | None) -> str:
    """CA-3, CL-5 \u2014 an unmeasured horizon is never printed as 0 %."""
    if rate is None:
        return texts.RETENTION_UNAVAILABLE
    return texts.RETENTION_PERCENT.format(rate=js_round(rate))


def maintenance_effects(mode: str | None) -> dict[str, Any]:
    """EF-2 \u2014 effects of one mode; the caller never guesses the five-minute bound."""
    return {
        "mode": mode,
        "dailyMinutes": int(ENGINE["globalQuiz"]["maintenanceMaxMinutes"]),
        "dueOnly": True,
        "reminders": mode == "light",
    }


def due_count_for(mode: str | None, light_due_count: int) -> int:
    """CA-2 \u2014 a stopped interview has no due notion left to schedule."""
    return max(0, light_due_count) if mode == "light" else 0


def completed_minutes_of(slots: Sequence[Mapping[str, Any]]) -> int:
    """CA-3 \u2014 only a `done` slot counts; a moved slot never doubles its predecessor."""
    progress = calculate_progress(
        [],
        [
            {
                "slotId": slot["id"],
                "kind": slot["kind"],
                "status": slot["status"],
                "startsAt": _iso(slot["starts_at"]),
                "endsAt": _iso(slot["ends_at"]),
                "movedFromId": slot["moved_from_id"],
            }
            for slot in slots
        ],
        [],
    )
    return max(0, js_round(progress.completed_minutes))


def _result_percent_of(modules: Sequence[Mapping[str, Any]]) -> int | None:
    scores = [
        float(module["best_score"])
        for module in modules
        if module["best_score"] is not None and math.isfinite(float(module["best_score"]))
    ]
    if not scores:
        return None
    return js_round(sum(scores) / len(scores))


def _nature_label(nature: str | None) -> str:
    return texts.GAP_NATURE_LABELS.get(nature or "", texts.GAP_DEFAULT_LABEL)


def _gap_nature_of(row: Mapping[str, Any]) -> str | None:
    nature = row["gap_nature"]
    if nature in ("forgetting", "confusion", "misunderstanding", "application"):
        return str(nature)
    return None


def evidence_of(nature: str, persisted: str | None) -> str:
    """`evidenceOf`: the persisted evidence, else the deterministic sentence of the nature."""
    text = (persisted or "").strip()
    if text != "":
        return text
    if nature == "confusion":
        return texts.GAP_EVIDENCE_CONFUSION
    if nature == "misunderstanding":
        return texts.GAP_EVIDENCE_MISUNDERSTANDING
    if nature == "application":
        return texts.GAP_EVIDENCE_APPLICATION
    return texts.GAP_EVIDENCE_FORGETTING


def completed_summary(start_date: str | None, completed_at: str, time_zone: str) -> dict[str, Any]:
    """`completedSummary`: the local completion day and the whole weeks since the start."""
    completed_on = local_date_of(completed_at, time_zone)
    weeks = None
    if start_date is not None:
        weeks = max(1, math.ceil(days_between(start_date, completed_on) / 7))
    return {"completedOn": completed_on, "weeks": weeks}


def _training_href(*, formation_id: str, module_id: str, notion_id: str, nature: str) -> str:
    from learny.learning.application.gaps import training_target

    return training_target(
        formation_id=formation_id, module_id=module_id, notion_id=notion_id, nature=nature
    )["href"]


def build_final_review(source: Mapping[str, Any]) -> dict[str, Any]:
    """EF-1 to EF-3 \u2014 one deterministic view model from the rows the service already read."""
    formation = source["formation"]
    modules = source["modules"]
    notions = source["notions"]
    slots = source["slots"]
    assert_formation_complete(modules)

    formation_id = str(formation["id"])
    thresholds = {str(module["id"]): int(module["threshold"]) for module in modules}
    default_threshold = int(formation["default_threshold"])
    mastered = [
        notion
        for notion in notions
        if notion["gap_nature"] is None
        and float(notion["mastery"]) >= thresholds.get(str(notion["module_id"]), default_threshold)
    ]
    fragile = sorted(
        [notion for notion in notions if notion["gap_nature"] is not None],
        key=lambda notion: (float(notion["mastery"]), utf16_key(str(notion["label"]))),
    )

    gaps = []
    for notion in fragile:
        nature = _gap_nature_of(notion) or "forgetting"
        gaps.append(
            {
                "notionId": notion["id"],
                "label": notion["label"],
                "nature": nature,
                "natureLabel": _nature_label(nature),
                "evidence": evidence_of(nature, notion["gap_evidence"]),
                "mastery": float(notion["mastery"]),
                "moduleId": notion["module_id"],
                "modulePosition": int(notion["module_position"]),
                "moduleTitle": notion["module_title"],
                "trainingHref": _training_href(
                    formation_id=formation_id,
                    module_id=str(notion["module_id"]),
                    notion_id=str(notion["id"]),
                    nature=nature,
                ),
            }
        )

    notion_map: dict[str, list[dict[str, Any]]] = {}
    for notion in notions:
        notion_map.setdefault(str(notion["module_id"]), []).append(
            {
                "notionId": notion["id"],
                "label": notion["label"],
                "modulePosition": int(notion["module_position"]),
                "mastery": float(notion["mastery"]),
                "gapNature": _gap_nature_of(notion),
            }
        )

    completed_at = _iso(formation["completed_at"] if formation["completed_at"] is not None else source["now"])
    summary = completed_summary(
        None if formation["start_date"] is None else str(formation["start_date"]),
        completed_at,
        str(source["timezone"]),
    )
    mode = None if formation["maintenance_mode"] is None else str(formation["maintenance_mode"])
    accent = str(formation["accent"])

    return {
        "formationId": formation["id"],
        "formationTitle": formation["title"],
        "monogram": formation_monogram(str(formation["title"]), formation["monogram"]),
        "accent": accent if accent in ACCENTS else "indigo",
        "status": "completed",
        "programVersion": source["programVersion"],
        "completedAt": completed_at,
        "completedOn": summary["completedOn"] or local_date_of(_iso(source["now"]), str(source["timezone"])),
        "weeks": summary["weeks"],
        "timezone": source["timezone"],
        "stats": {
            "masteredNotions": len(mastered),
            "fragileNotions": len(fragile),
            "totalNotions": len(notions),
            "completedMinutes": completed_minutes_of(slots),
            "resultPercent": _result_percent_of(modules),
        },
        "retention": source["retention"],
        "gaps": gaps,
        "modules": [
            {
                "moduleId": module["id"],
                "position": int(module["position"]),
                "title": module["title"],
                "threshold": int(module["threshold"]),
                "masteredCount": sum(1 for notion in mastered if notion["module_id"] == module["id"]),
                "notions": notion_map.get(str(module["id"]), []),
            }
            for module in modules
        ],
        "dueCount": due_count_for(mode, int(source["dueCount"])),
        "maintenance": maintenance_effects(mode),
        "milestones": [
            _milestone_view(milestone, str(source["timezone"])) for milestone in source["milestones"]
        ],
        "mapHref": f"/formations/{_encode(formation_id)}/carte",
        "updatedAt": _iso(formation["updated_at"]),
        "generatedAt": _iso(source["now"]),
    }


def _milestone_view(milestone: Mapping[str, Any], time_zone: str) -> dict[str, Any]:
    """SPEC-723 EF-3 \u2014 one milestone card, with its stable key and local achievement date."""
    key = (
        f"module_validated:{milestone['ref_id']}"
        if milestone["key"] == "module_validated" and milestone["ref_id"] is not None
        else str(milestone["key"])
    )
    achieved_at = _iso(milestone["achieved_at"])
    return {
        "id": milestone["id"],
        "key": key,
        "kind": milestone["key"],
        "label": milestone_label(key, milestone["module_title"]),
        "formationId": milestone["formation_id"],
        "formationTitle": milestone["formation_title"],
        "achievedAt": achieved_at,
        "achievedOn": local_date_of(achieved_at, time_zone),
    }


def _encode(value: str) -> str:
    from urllib.parse import quote

    return quote(value, safe="!'()*-._~")


def _retention_bounds(rate: float | None) -> int | None:
    return None if rate is None else js_round(rate)


def _read_retention(
    modules: Sequence[Mapping[str, Any]],
    reviews: Sequence[Mapping[str, Any]],
    now: str,
    time_zone: str,
) -> dict[str, int | None]:
    """BR-MEM-06 \u2014 the one- and two-month rates, rounded, null when not measurable (CA-3)."""
    horizons = calculate_retention(
        [
            {
                "moduleId": module["module_id"],
                "validatedAt": _instant_or_none(module["validated_at"]),
                "notionIds": [str(notion) for notion in module["notion_ids"] or []],
            }
            for module in modules
        ],
        [
            {
                "reviewId": review["review_id"],
                "notionId": review["notion_id"],
                "reviewedAt": _iso(review["reviewed_at"]),
                "correct": bool(review["correct"]),
            }
            for review in reviews
        ],
        now,
        time_zone,
        [int(day) for day in ENGINE["retention"]["horizonsDays"]],
        int(ENGINE["retention"]["toleranceDays"]),
    )
    one = next((item.rate for item in horizons if item.horizon_days == 30), None)
    two = next((item.rate for item in horizons if item.horizon_days == 60), None)
    return {
        "oneMonth": _retention_bounds(one),
        "twoMonths": _retention_bounds(two),
    }


async def get_final_review(deps: LearningDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """GET /formations/:fid/final-review \u2014 the bilan, through one RLS-scoped snapshot."""
    if not is_uuid(formation_id):
        raise AppError("VALIDATION_FAILED", texts.FINAL_REVIEW_INVALID_FORMATION_ID)
    now = deps.clock.now()
    now_iso = to_iso(now)
    async with deps.db.user_tx(actor) as tx:
        formation = await queries.read_final_review_formation(tx, actor.user_id, formation_id)
        if formation is None or formation["status"] == "archived":
            raise AppError("NOT_FOUND", texts.FINAL_REVIEW_FORMATION_NOT_FOUND)
        modules = await queries.read_final_review_modules(tx, actor.user_id, formation_id)
        notions = await queries.read_final_review_notions(tx, actor.user_id, formation_id)
        slots = await queries.read_final_review_slots(tx, actor.user_id, formation_id)
        milestones = await queries.read_final_review_milestones(tx, actor.user_id, formation_id)
        timezone = await queries.read_final_review_timezone(tx, actor.user_id)
        if formation["status"] != "completed" and not is_formation_complete(modules):
            raise AppError("CONFLICT", texts.FINAL_REVIEW_NOT_COMPLETE)
        retention_modules = await queries.read_final_review_retention_modules(tx, actor.user_id, formation_id)
        reviews = await queries.read_final_review_reviews(tx, actor.user_id, formation_id)
        due_count = await queries.read_final_review_due_count(tx, actor.user_id, formation_id, now_iso)
        program_version = await queries.read_final_review_program_version(tx, actor.user_id, formation_id)
        return build_final_review(
            {
                "formation": formation,
                "modules": modules,
                "notions": notions,
                "slots": slots,
                "milestones": milestones,
                "retention": _read_retention(retention_modules, reviews, now_iso, timezone),
                "programVersion": program_version,
                "dueCount": due_count,
                "now": now_iso,
                "timezone": timezone,
            }
        )


def _assert_completed(formation: Mapping[str, Any]) -> None:
    if (
        str(formation["status"]) != "completed"
        or int(formation["module_count"]) == 0
        or int(formation["validated_count"]) < int(formation["module_count"])
    ):
        raise AppError("CONFLICT", texts.MAINTENANCE_NOT_COMPLETE)


def _assert_version(formation: Mapping[str, Any], expected_updated_at: str | None) -> None:
    if expected_updated_at is None:
        return
    try:
        expected = to_iso(parse_iso(expected_updated_at))
    except ValueError as error:
        raise AppError("VALIDATION_FAILED", texts.MAINTENANCE_INVALID_VERSION) from error
    current = _iso(formation["updated_at"])
    if current != expected:
        raise AppError(
            "CONFLICT",
            texts.MAINTENANCE_CONFLICT,
            errors=[
                {
                    "path": "expectedUpdatedAt",
                    "message": texts.MAINTENANCE_VERSION_LABEL.format(version=current),
                }
            ],
        )


def _parse_mode(value: Any) -> str:
    mode = str(getattr(value, "value", value))
    if mode not in FINAL_REVIEW_MODES:
        raise AppError("VALIDATION_FAILED", texts.MAINTENANCE_UNKNOWN_MODE)
    return mode


async def set_maintenance(
    deps: LearningDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-2, ET-3 \u2014 sets `light` or `stopped`; the returned DTO is the exact screen state."""
    if not is_uuid(formation_id):
        raise AppError("VALIDATION_FAILED", texts.FINAL_REVIEW_INVALID_FORMATION_ID)
    mode = _parse_mode(body["mode"])
    now = deps.clock.now()
    now_iso = to_iso(now)
    changed = False
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_maintenance(tx, formation_id)
        formation = await queries.read_maintenance_formation(tx, actor.user_id, formation_id)
        if formation is None:
            raise AppError("NOT_FOUND", texts.FINAL_REVIEW_FORMATION_NOT_FOUND)
        _assert_completed(formation)
        _assert_version(formation, body.get("expectedUpdatedAt"))
        if str(formation["maintenance_mode"]) != mode:
            await queries.update_maintenance_mode(tx, actor.user_id, formation_id, mode, now_iso)
            if mode == "stopped":
                await queries.cancel_future_slots(tx, actor.user_id, formation_id, now_iso)
            await tx.emit(
                MAINTENANCE_EVENT,
                {
                    "userId": actor.user_id,
                    "formationId": formation_id,
                    "mode": mode,
                    "changedAt": now_iso,
                },
                event_id=f"formation-maintenance:{formation_id}:{now_iso}:{mode}",
            )
            changed = True
    if changed and mode == "stopped":
        async with deps.db.service_tx() as tx:
            await queries.skip_scheduled_reminders(tx, actor.user_id, formation_id)
    return await get_final_review(deps, actor, formation_id)


__all__ = [
    "ACCENTS",
    "assert_formation_complete",
    "build_final_review",
    "completed_minutes_of",
    "completed_summary",
    "due_count_for",
    "evidence_of",
    "get_final_review",
    "is_formation_complete",
    "is_uuid",
    "maintenance_effects",
    "retention_display",
    "set_maintenance",
]
