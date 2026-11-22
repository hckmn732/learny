"""Inbox of the notification panel (SPEC-2205, ported from `packages/services/src/notifications/list.ts`).

Every read and every mutation runs with the learner's own RLS transaction: another learner's
notifications are neither listed, counted nor updated. The three groups of the mockup are resolved
here, in the profile's IANA zone, with the injected clock (ADR-0047): comparing UTC days naively
would put a 00:30 Paris notification in the previous day.
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from learny.engagement.application.ports import EngagementDeps
from learny.engagement.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr
from learny.shared.time import add_civil_days, to_epoch_ms, to_iso, user_local_day

INBOX_FILTERS: tuple[str, ...] = ("all", "unread")


def previous_civil_day(day: str) -> str:
    """Civil day before `day`, without going through the process time zone."""
    return add_civil_days(day, -1)


def notification_group(created_at: datetime, now: datetime, time_zone: str) -> str:
    """BR-NOT-01, ET-3 - group of one instant in the learner's zone, by civil days."""
    day = user_local_day(to_epoch_ms(created_at), time_zone)
    today = user_local_day(to_epoch_ms(now), time_zone)
    if day == today:
        return "today"
    if day == previous_civil_day(today):
        return "yesterday"
    return "earlier"


async def _time_zone(deps: EngagementDeps, actor: Actor, tx: Any) -> str:
    profile = await queries.read_profile(tx, actor.user_id)
    if profile is None:
        raise AppError("NOT_FOUND", fr.NOTIFY_PROFILE_NOT_FOUND)
    return str(profile["timezone"])


async def list_notifications(deps: EngagementDeps, actor: Actor, query: Mapping[str, Any]) -> dict[str, Any]:
    """ET-1, ET-3, EF-2 - one page of the authenticated learner's inbox, grouped in his zone."""
    name = str(query.get("filter") or "all")
    filter_name = name if name in INBOX_FILTERS else "all"
    limit = int(query.get("limit") or 20)
    offset = int(query.get("offset") or 0)
    async with deps.db.user_tx(actor) as tx:
        time_zone = await _time_zone(deps, actor, tx)
        now = deps.clock.now()
        rows = await queries.list_inbox_rows(
            tx,
            user_id=actor.user_id,
            unread_only=filter_name == "unread",
            limit=limit,
            offset=offset,
        )
        total = await queries.count_all(tx, actor.user_id)
        unread = await queries.count_unread(tx, actor.user_id)
    return {
        "items": [
            {
                "id": row.id,
                "type": row.type,
                "icon": row.icon,
                "title": row.title,
                "body": row.body,
                "href": row.href,
                "formationTitle": row.formation_title,
                "createdAt": to_iso(row.created_at),
                "readAt": None if row.read_at is None else to_iso(row.read_at),
                "group": notification_group(row.created_at, now, time_zone),
            }
            for row in rows
        ],
        "total": max(0, total),
        "unreadCount": max(0, unread),
        "timezone": time_zone,
    }


async def get_unread_notification_count(deps: EngagementDeps, actor: Actor) -> dict[str, int]:
    """ET-1 - the badge count of the authenticated learner, never negative."""
    async with deps.db.user_tx(actor) as tx:
        unread = await queries.count_unread(tx, actor.user_id)
    return {"count": max(0, unread)}


async def mark_notification_read(deps: EngagementDeps, actor: Actor, notification_id: str) -> dict[str, int]:
    """ET-2, CL-1, CA-4 - marks one notification read; a replay writes nothing and is idempotent."""
    async with deps.db.user_tx(actor) as tx:
        existing = await queries.find_notification(tx, user_id=actor.user_id, notification_id=notification_id)
        if existing is None:
            raise AppError("NOT_FOUND", fr.INBOX_NOTIFICATION_NOT_FOUND)
        if existing.read_at is None:
            await queries.mark_read(
                tx, user_id=actor.user_id, notification_id=notification_id, read_at=deps.clock.now()
            )
        unread = await queries.count_unread(tx, actor.user_id)
    return {"unreadCount": max(0, unread)}


async def mark_all_read(deps: EngagementDeps, actor: Actor) -> dict[str, int]:
    """ET-2, EF-3 - marks every unread notification read; a second call writes nothing."""
    async with deps.db.user_tx(actor) as tx:
        await queries.mark_all_read(tx, user_id=actor.user_id, read_at=deps.clock.now())
        unread = await queries.count_unread(tx, actor.user_id)
    return {"unreadCount": max(0, unread)}


__all__ = [
    "INBOX_FILTERS",
    "get_unread_notification_count",
    "list_notifications",
    "mark_all_read",
    "mark_notification_read",
    "notification_group",
    "previous_civil_day",
]
