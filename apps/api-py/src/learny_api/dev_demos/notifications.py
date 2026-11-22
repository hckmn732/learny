"""Demonstrations of SPEC-209 (EF-8) and SPEC-706 (EF-8): the real producers and `notify`.

Port of `packages/services/src/dev/notifications.ts` and of the demonstration section of
`notifications-generation-des-rappels.ts`. The learner's stored settings and tone are temporarily
replaced and restored in a `finally`, so the demonstration never leaves the account altered.
"""

from dataclasses import replace
from datetime import datetime, timedelta
from typing import Any

from learny.engagement import public as engagement
from learny.shared.errors import AppError
from learny.shared.locale_fr import dev_notifications as fixture
from learny.shared.locale_fr import engagement as fr
from learny.shared.locale_fr.details import UNAUTHENTICATED
from learny.shared.time import add_civil_days, parse_iso, to_epoch_ms, to_iso, user_local_day
from sqlalchemy import text

from learny_api.pipeline import Call

SELECT_PROFILE = text(
    "select tutor_tone::text as tutor_tone, timezone from public.profiles where id = cast(:user_id as uuid)"
)
SELECT_SETTINGS = text("select * from public.notification_settings where user_id = cast(:user_id as uuid)")
SELECT_NOTIFICATION = text(
    "select id::text as id, type::text as type, icon, title, body, href, created_at "
    "from public.notifications where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)"
)
SELECT_DELIVERIES = text(
    "select channel::text as channel, status::text as status, scheduled_for, error "
    "from public.notification_deliveries where notification_id = cast(:notification_id as uuid) "
    "order by channel"
)
UPDATE_TONE = text(
    "update public.profiles set tutor_tone = cast(:tone as public.tutor_tone) "
    "where id = cast(:user_id as uuid)"
)
UPDATE_SETTINGS = text(
    "update public.notification_settings set "
    "channel_email = :channel_email, channel_push = :channel_push, "
    "type_revision = :type_revision, type_validation = :type_validation, "
    "type_course = :type_course, type_gap = :type_gap, type_planning = :type_planning, "
    "type_relaunch = :type_relaunch, quiet_start = :quiet_start, quiet_end = :quiet_end, "
    "weekend_quiet = :weekend_quiet, max_per_day = :max_per_day, updated_at = :updated_at "
    "where user_id = cast(:user_id as uuid)"
)

SETTINGS_COLUMNS = (
    "channelEmail",
    "channelPush",
    "typeRevision",
    "typeValidation",
    "typeCourse",
    "typeGap",
    "typePlanning",
    "typeRelaunch",
    "quietStart",
    "quietEnd",
    "weekendQuiet",
    "maxPerDay",
)


class _FixedClock:
    """`{ now: () => at }`: the demonstration replays the notification at the asked instant."""

    def __init__(self, instant: datetime) -> None:
        self._instant = instant

    def now(self) -> datetime:
        return self._instant


def _user_id(call: Call) -> str:
    if call.actor is None or call.user_id is None:
        raise AppError("UNAUTHENTICATED", UNAUTHENTICATED)
    return call.user_id


def _demo_data(body: Any) -> dict[str, Any]:
    """Sample data of the sixteen types; the type alone decides the rendered text (ET-2)."""
    return {
        "formationTitle": fixture.NOTIFY_FORMATION_TITLE,
        "moduleTitle": fixture.NOTIFY_MODULE_TITLE,
        "notionTitle": fixture.NOTIFY_NOTION_TITLE,
        "title": fixture.NOTIFY_TITLE,
        "when": body.at[:10],
        "minutes": 20,
        "notions": 14,
        "activityCount": 5,
        "plannedLabel": fixture.NOTIFY_PLANNED_LABEL,
        "studyLabel": fixture.NOTIFY_STUDY_LABEL,
        "percent": 85,
        "taskLabel": fixture.NOTIFY_TASK_LABEL,
        "groupTitle": fixture.NOTIFY_GROUP_TITLE,
        "href": "/aujourdhui",
    }


def _snake(name: str) -> str:
    return "".join(f"_{character.lower()}" if character.isupper() else character for character in name)


def _settings_values(settings: Any) -> dict[str, Any]:
    return {_snake(name): getattr(settings, name) for name in SETTINGS_COLUMNS}


async def run_notify(call: Call) -> dict[str, Any]:
    """EF-8 - simulated settings, clock and tone, then the real `notify` service."""
    user_id = _user_id(call)
    body: Any = call.body
    async with call.deps.db.service_tx() as tx:
        profile = (await tx.conn.execute(SELECT_PROFILE, {"user_id": user_id})).mappings().first()
        original = (await tx.conn.execute(SELECT_SETTINGS, {"user_id": user_id})).mappings().first()
    if profile is None:
        raise AppError("NOT_FOUND", fr.NOTIFY_PROFILE_NOT_FOUND)
    timezone = str(profile["timezone"])
    at = parse_iso(body.at)
    day = user_local_day(to_epoch_ms(at), timezone)
    try:
        async with call.deps.db.service_tx() as tx:
            await tx.conn.execute(UPDATE_TONE, {"user_id": user_id, "tone": str(body.tone)})
            if original is not None:
                await tx.conn.execute(
                    UPDATE_SETTINGS,
                    {
                        "user_id": user_id,
                        **_settings_values(body.settings),
                        "updated_at": call.deps.clock.now(),
                    },
                )
        result = await engagement.notify(
            replace(call.deps, clock=_FixedClock(at)),
            user_id=user_id,
            notification_type=str(body.type),
            data=_demo_data(body),
            dedupe_key=None if body.dedupeKey is None else str(body.dedupeKey),
        )
        async with call.deps.db.service_tx() as tx:
            row = (
                (
                    await tx.conn.execute(
                        SELECT_NOTIFICATION, {"id": result["notificationId"], "user_id": user_id}
                    )
                )
                .mappings()
                .first()
            )
        if row is None:
            raise AppError("NOT_FOUND", fr.INBOX_NOTIFICATION_NOT_FOUND)
        async with call.deps.db.service_tx() as tx:
            journal = (
                (await tx.conn.execute(SELECT_DELIVERIES, {"notification_id": result["notificationId"]}))
                .mappings()
                .all()
            )
        held = await engagement.held_block(
            call.deps,
            user_id=user_id,
            day=add_civil_days(day, 1),
            time_zone=timezone,
            max_per_day=int(body.settings.maxPerDay),
        )
    finally:
        async with call.deps.db.service_tx() as tx:
            await tx.conn.execute(UPDATE_TONE, {"user_id": user_id, "tone": str(profile["tutor_tone"])})
            if original is not None:
                await tx.conn.execute(
                    UPDATE_SETTINGS,
                    {
                        "user_id": user_id,
                        "channel_email": original["channel_email"],
                        "channel_push": original["channel_push"],
                        "type_revision": original["type_revision"],
                        "type_validation": original["type_validation"],
                        "type_course": original["type_course"],
                        "type_gap": original["type_gap"],
                        "type_planning": original["type_planning"],
                        "type_relaunch": original["type_relaunch"],
                        "quiet_start": original["quiet_start"],
                        "quiet_end": original["quiet_end"],
                        "weekend_quiet": original["weekend_quiet"],
                        "max_per_day": original["max_per_day"],
                        "updated_at": original["updated_at"],
                    },
                )
    return {
        "notification": {
            "id": str(row["id"]),
            "type": str(row["type"]),
            "icon": str(row["icon"]),
            "title": str(row["title"]),
            "body": str(row["body"]),
            "href": str(row["href"]),
            "createdAt": to_iso(row["created_at"]),
        },
        "created": bool(result["created"]),
        "deliveries": [
            {
                "channel": str(line["channel"]),
                "status": str(line["status"]),
                "scheduledFor": None if line["scheduled_for"] is None else to_iso(line["scheduled_for"]),
                "error": line["error"],
            }
            for line in journal
        ],
        "digest": {
            "heldCount": int(held["count"]),
            "heldMaxPerDay": int(held["maxPerDay"]),
            "heldTitles": list(held["titles"]),
        },
    }


def _course_href(formation_id: str | None, module_id: str | None) -> str:
    base = None if formation_id in (None, "") else f"/formations/{formation_id}"
    if base is not None and module_id not in (None, ""):
        return f"{base}/modules/{module_id}/cours"
    return "/aujourdhui" if base is None else f"{base}/programme"


def _programme_href(formation_id: str | None, last: bool) -> str:
    base = None if formation_id in (None, "") else f"/formations/{formation_id}"
    if base is None:
        return "/aujourdhui"
    return f"{base}/bilan" if last else f"{base}/programme"


def _demo_facts(
    user_id: str, now: datetime, timezone: str, slot_id: str, starts_at: str
) -> list[dict[str, Any]]:
    """Deterministic demonstration facts: no AI, no private content, only shaped labels."""
    day = user_local_day(to_epoch_ms(now), timezone)
    start = parse_iso(starts_at)
    return [
        {
            "type": "course_ready",
            "kind": "course_ready",
            "data": {
                "moduleTitle": fixture.COURSE_READY_MODULE,
                "href": _course_href(None, None),
            },
            "dedupeKey": "course_ready:00000000-0000-4000-8000-000000000002",
        },
        {
            "type": "global_quiz_today",
            "kind": "global_quiz_today",
            "data": {"notions": 14, "minutes": 10, "href": "/aujourdhui"},
            "dedupeKey": f"global_quiz_today:{day}",
        },
        {
            "type": "new_gap",
            "kind": "new_gap",
            "data": {
                "notionTitle": fixture.NEW_GAP_NOTION,
                "formationTitle": fixture.NEW_GAP_FORMATION,
                "href": "/aujourdhui",
            },
            "dedupeKey": "new_gap:00000000-0000-4000-8000-000000000003",
        },
        {
            "type": "session_planned",
            "kind": "session_planned",
            "data": {
                "title": fixture.SESSION_PLANNED_TITLE,
                "when": engagement.local_moment_label(start, timezone, now),
                "href": "/agenda",
            },
            "dedupeKey": f"session_planned:{slot_id}",
        },
        {
            "type": "module_validated",
            "kind": "module_validated",
            "data": {
                "modulePosition": 2,
                "moduleTitle": fixture.MODULE_VALIDATED_TITLE,
                "score": 91,
                "nextModulePosition": 3,
                "nextModuleTitle": fixture.MODULE_VALIDATED_NEXT,
                "href": _programme_href(None, False),
            },
            "dedupeKey": "module_validated:00000000-0000-4000-8000-000000000005",
        },
        {
            "type": "session_to_reschedule",
            "kind": "session_to_reschedule",
            "data": {"title": fixture.SESSION_RESCHEDULE_TITLE, "href": "/agenda"},
            "dedupeKey": "session_to_reschedule:00000000-0000-4000-8000-000000000006",
        },
        {
            "type": "weekly_review",
            "kind": "weekly_review",
            "data": {"studyLabel": fixture.WEEKLY_STUDY_LABEL, "href": "/accueil#bilan"},
            "dedupeKey": f"weekly_review:{day}",
        },
        {
            "type": "milestone",
            "kind": "milestone",
            "data": {"label": fixture.MILESTONE_LABEL, "href": "/accueil"},
            "dedupeKey": "milestone:00000000-0000-4000-8000-000000000007",
        },
        {
            "type": "ai_cost_alert",
            "kind": "ai_cost_alert",
            "data": {"percent": 82, "href": "/parametres#modeles"},
            "dedupeKey": f"ai_cost_alert:{day}",
        },
        {
            "type": "ai_task_failed",
            "kind": "ai_task_failed",
            "data": {
                "taskLabel": fixture.AI_TASK_LABEL,
                "modelLabel": fixture.AI_MODEL_LABEL,
                "href": "/parametres#modeles",
            },
            "dedupeKey": "ai_task_failed:00000000-0000-4000-8000-000000000008",
        },
        {
            "type": "export_ready",
            "kind": "export_ready",
            "data": {"days": 7, "href": "/parametres#profil"},
            "dedupeKey": "export_ready:00000000-0000-4000-8000-000000000009",
        },
        {
            "type": "group_invitation",
            "kind": "group_invitation",
            "data": {"groupTitle": fixture.GROUP_INVITATION_TITLE, "href": "/accueil"},
            "dedupeKey": ("group_invitation:00000000-0000-4000-8000-000000000010:" + user_id),
        },
    ]


async def _produce_one(call: Call, user_id: str, fact: dict[str, Any], now: datetime) -> dict[str, Any]:
    result = await engagement.notify(
        call.deps,
        user_id=user_id,
        notification_type=str(fact["type"]),
        data=dict(fact["data"]),
        dedupe_key=str(fact["dedupeKey"]),
    )
    async with call.deps.db.service_tx() as tx:
        row = (
            (await tx.conn.execute(SELECT_NOTIFICATION, {"id": result["notificationId"], "user_id": user_id}))
            .mappings()
            .first()
        )
    if row is None:
        raise AppError("INTERNAL_ERROR", fr.INBOX_NOTIFICATION_NOT_FOUND)
    return {
        "type": str(fact["type"]),
        "kind": str(fact["kind"]),
        "dedupeKey": str(fact["dedupeKey"]),
        "notificationId": str(row["id"]),
        "created": bool(result["created"]),
        "href": str(row["href"]),
        "title": str(row["title"]),
        "icon": str(row["icon"]),
    }


async def generate(call: Call) -> dict[str, Any]:
    """EF-8 - the twelve producers and the optional reminder of the signed-in learner."""
    user_id = _user_id(call)
    body: Any = call.body
    now = call.deps.clock.now()
    timezone = await engagement.profile_timezone(call.deps, user_id)
    requested = None if body.types is None else {str(item) for item in body.types}
    quiz = body.quiz
    starts_at = (
        to_iso(now + timedelta(hours=1)) if quiz is None or quiz.startsAt is None else str(quiz.startsAt)
    )
    slot_id = (
        "00000000-0000-4000-8000-000000000001" if quiz is None or quiz.slotId is None else str(quiz.slotId)
    )
    facts = [
        fact
        for fact in _demo_facts(user_id, now, timezone, slot_id, starts_at)
        if requested is None or fact["type"] in requested
    ]
    produced = [await _produce_one(call, user_id, fact, now) for fact in facts]
    reminder: dict[str, Any] | None = None
    if requested is None or "validation_soon" in requested:
        outcome = await engagement.schedule_validation_quiz_reminder(
            call.deps,
            {
                "userId": user_id,
                "slotId": slot_id,
                "startsAt": starts_at,
                "timezone": timezone,
                **(
                    {} if quiz is None or quiz.moduleTitle is None else {"moduleTitle": str(quiz.moduleTitle)}
                ),
            },
        )
        reminder = {
            "notificationId": outcome["notificationId"],
            "created": bool(outcome["created"]),
            "schedule": dict(outcome["schedule"]),
            "cancelled": int(outcome["cancelled"]),
        }
    return {"notifications": produced, "reminder": reminder}
