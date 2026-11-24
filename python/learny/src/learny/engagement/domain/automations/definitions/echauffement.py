"""Warm-up before a session (SPEC-714, BR-AUT-01, ADR-0190).

The warm-up activity, its slot ten minutes before the upcoming session, the four journal statuses
(both tones) and the undo that archives an unanswered activity. The duration, the meta and the noun
come from the pure derivations, ported here without IO.
"""

from typing import Any, Final

from learny.engagement.domain.automations.definitions.labels import (
    clip,
    format_hour,
    format_warmup_day,
    number_or,
    string_of,
)
from learny.engagement.domain.automations.effects import (
    CancelSlot,
    InsertActivity,
    InsertSlot,
    UpdateActivityStatus,
)
from learny.engagement.domain.automations.model import (
    ActionView,
    AppliedEffect,
    AutomationDefinition,
    DraftError,
    EffectContext,
)
from learny.learning.application.warmups import warmup_consumed_summary
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import add_civil_days, from_epoch_ms, parse_iso, to_epoch_ms, to_iso, user_local_day

WARMUP_LEAD_MINUTES: Final = 10
SECONDS_PER_QUESTION: Final = 40
MS_PER_MINUTE: Final = 60_000
WARMUP_LEVELS: Final = (6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22)

KIND_LABELS: Final = {
    "validation_quiz": "quiz",
    "course": "cours",
    "exercise": "exercice",
    "mock_exam": "examen blanc",
    "contributions": "s\u00e9ance d\u2019apports",
}


def warmup_duration_min(count: int) -> int:
    """`ceil(count x 40 s / 60)` minutes, at least 2."""
    return max(2, -(-(count * SECONDS_PER_QUESTION) // 60))


def warmup_meta(count: int, duration_min: int) -> str:
    return fr.WARMUP_META.format(count=count, duration=duration_min)


def session_kind_label(kind: str) -> str:
    return KIND_LABELS.get(kind, fr.WARMUP_KIND_DEFAULT)


def warmup_when(created_at: str, now: str, time_zone: str) -> str:
    """`warmupWhen`: this morning, this afternoon, yesterday or the warm-up day label."""
    created = parse_iso(created_at)
    current = parse_iso(now)
    created_day = user_local_day(to_epoch_ms(created), time_zone)
    current_day = user_local_day(to_epoch_ms(current), time_zone)
    if created_day == current_day:
        from learny.shared.time import local_hour

        return (
            fr.WARMUP_WHEN_MORNING
            if local_hour(to_epoch_ms(created), time_zone) < 12
            else fr.WARMUP_WHEN_AFTERNOON
        )
    if created_day == add_civil_days(current_day, -1):
        return fr.WARMUP_WHEN_YESTERDAY
    return fr.WARMUP_WHEN_DAY.format(day=format_warmup_day(created_day))


def _labels(payload: dict[str, Any], key: str) -> list[str]:
    raw = payload.get(key)
    return [value for value in raw if isinstance(value, str)] if isinstance(raw, list) else []


def _next_session(payload: dict[str, Any]) -> dict[str, Any]:
    raw = payload.get("nextSession")
    return raw if isinstance(raw, dict) else {}


def explain(action: ActionView, tone: str, time_zone: str) -> str:
    """EF-10 - one line, at most 160 characters, for every status of the journal."""
    payload = dict(action.payload)
    day = format_warmup_day(string_of(payload.get("date"), action.created_at[:10]))
    if action.status == "consumed":
        return clip(
            warmup_consumed_summary(
                knew_count=int(number_or(payload.get("knewCount"), 0)),
                count=int(number_or(payload.get("count"), 0)),
                review_labels=_labels(payload, "reviewNotionLabels"),
                next_quiz=payload.get("reviewRemaining") is True,
            )
        )
    if action.status == "expired":
        return clip(fr.WARMUP_EXPIRED.format(day=day))
    if action.status == "undone":
        return clip(fr.WARMUP_UNDONE.format(day=day))
    labels = _labels(payload, "notionLabels")
    count = int(number_or(payload.get("count"), len(labels)))
    if payload.get("lastAction") is True:
        when = warmup_when(
            action.created_at or to_iso(parse_iso(action.created_at or "1970-01-01T00:00:00Z")),
            action.created_at,
            time_zone,
        )
        return clip(fr.WARMUP_LAST_ACTION.format(when=when, count=count, notions=", ".join(labels)))
    next_session = _next_session(payload)
    key = "tu" if tone == "tu" else "vous"
    return clip(
        fr.WARMUP_ADDED[key].format(
            noun=session_kind_label(string_of(next_session.get("kind"))),
            hour=format_hour(string_of(next_session.get("startsAt"), "1970-01-01T00:00:00Z"), time_zone),
            count=count,
            suffix="" if count == 1 else "s",
            notions=", ".join(labels),
        )
    )


def apply(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Insert the warm-up activity and its slot, with the identifiers the undo needs."""
    payload = dict(action.payload)
    formation_id = string_of(payload.get("formationId"), action.formation_id or "")
    items = payload.get("items")
    next_session = _next_session(payload)
    if formation_id == "" or not isinstance(items, list) or len(items) == 0:
        raise DraftError("VALIDATION_FAILED", fr.WARMUP_NOT_FOUND)
    count = int(number_or(payload.get("count"), len(items)))
    duration = warmup_duration_min(count)
    module_id = string_of(next_session.get("moduleId"))
    session_start = to_epoch_ms(parse_iso(string_of(next_session.get("startsAt"), "1970-01-01T00:00:00Z")))
    starts_at = to_iso(from_epoch_ms(session_start - WARMUP_LEAD_MINUTES * MS_PER_MINUTE))
    ends_at = to_iso(
        from_epoch_ms(session_start - WARMUP_LEAD_MINUTES * MS_PER_MINUTE + duration * MS_PER_MINUTE)
    )
    config = {
        "durationSec": duration * 60,
        "questionCount": count,
        "scope": payload.get("scope"),
        "slotId": "",
        "nextSession": next_session,
        "items": [
            {
                "position": item.get("position"),
                "notionId": item.get("notionId"),
                "tag": item.get("tag"),
                "moduleNumber": item.get("moduleNumber"),
            }
            for item in items
            if isinstance(item, dict)
        ],
    }
    refs = tuple(
        {"brickId": item.get("brickId"), "brickVersionId": item.get("brickVersionId")}
        for item in items
        if isinstance(item, dict)
    )
    return AppliedEffect(
        changes={
            "payload": {
                **payload,
                "activityId": None,
                "slotId": None,
                "formationId": formation_id,
                "appliedAt": to_iso(ctx.now),
            },
            "undo_payload": {},
        },
        effects=(
            InsertActivity(
                formation_id=formation_id,
                module_id=module_id,
                kind="warmup",
                config=config,
                items=refs,
                for_date=string_of(payload.get("date"), user_local_day(to_epoch_ms(ctx.now), ctx.time_zone)),
                assign_payload="activityId",
                assign_undo="activityId",
            ),
            InsertSlot(
                formation_id=formation_id,
                module_id=module_id,
                kind="warmup",
                title=fr.WARMUP_SLOT_TITLE,
                starts_at=starts_at,
                ends_at=ends_at,
                meta=warmup_meta(count, duration),
                assign_payload="slotId",
                assign_undo="slotId",
            ),
        ),
    )


def undo(ctx: EffectContext, action: ActionView) -> AppliedEffect:
    """Archive an unanswered activity and cancel its planned slot."""
    undo_payload = dict(action.undo_payload or {})
    effects: list[Any] = []
    activity_id = string_of(undo_payload.get("activityId"))
    if activity_id != "":
        effects.append(
            UpdateActivityStatus(
                activity_id=activity_id, status="archived", only_status="ready", require_unanswered=True
            )
        )
    slot_id = string_of(undo_payload.get("slotId"))
    if slot_id != "":
        effects.append(CancelSlot(slot_id=slot_id))
    return AppliedEffect(effects=tuple(effects))


DEFINITION = AutomationDefinition(
    key="echauffement",
    triggers=(
        *({"type": "hourly", "localHour": hour} for hour in WARMUP_LEVELS),
        {"type": "direct"},
    ),
    explain=explain,
    apply=apply,
    undo=undo,
)


__all__ = [
    "DEFINITION",
    "explain",
    "session_kind_label",
    "warmup_duration_min",
    "warmup_meta",
    "warmup_when",
]
