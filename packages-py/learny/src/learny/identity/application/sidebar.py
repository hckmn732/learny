"""Sidebar of the application shell (SPEC-304 EF-1 to EF-5, ET-1 to ET-5; SPEC-2201).

Port of `packages/services/src/sidebar.ts`. Everything is read with the learner's own RLS
transaction: another learner's formations, module progress, counters or streak never reach the DTO.
The current formation is the active one stored in `profiles.current_formation_id`; when it is
missing, paused or inaccessible, the first active formation is used. Paused formations stay in the
switcher but are never rendered as the current formation (ET-1).
"""

from collections.abc import Mapping
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from learny.identity.application.ports import IdentityDeps
from learny.identity.domain.actor import Actor
from learny.identity.infrastructure import queries
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.jsmath import js_round
from learny.shared.locale_fr.details import FORMATION_NOT_FOUND, PROFILE_NOT_FOUND
from learny.shared.naming import accent_of as accent_of
from learny.shared.naming import formation_monogram as formation_monogram

STREAK_REGULARITY_DAYS = 14


def shift_civil_day(day: str, delta: int) -> str:
    """Civil day shifted by `delta` days without going through the process time zone."""
    year, month, date_of_month = (int(part) for part in day.split("-"))
    shifted = date(year, month, date_of_month) + timedelta(days=delta)
    return f"{shifted.year:04d}-{shifted.month:02d}-{shifted.day:02d}"


def last_civil_days(today: str, count: int = STREAK_REGULARITY_DAYS) -> list[str]:
    """The `count` civil days ending at `today`, oldest first (BR-GAM-02)."""
    return [shift_civil_day(today, index - count + 1) for index in range(count)]


def user_zone_date(instant: datetime, timezone: str) -> str:
    """`toUserZone(instant, timezone).date`: the local civil day of the learner."""
    return instant.astimezone(ZoneInfo(timezone)).date().isoformat()


def _to_formation(row: queries.SidebarFormationRow) -> dict[str, Any]:
    progress_percent = 0 if row.module_count == 0 else js_round(row.validated_count / row.module_count * 100)
    return {
        "id": row.id,
        "title": row.title,
        "monogram": formation_monogram(row.title, row.monogram),
        "accent": accent_of(row.accent_color),
        "status": row.status,
        "progressPercent": progress_percent,
        "currentModulePosition": row.open_position,
        "moduleCount": row.module_count,
    }


async def _read_streak(
    tx: Tx,
    user_id: str,
    profile: queries.SidebarProfileRow,
    now: datetime,
) -> dict[str, Any]:
    today = user_zone_date(now, profile.timezone)
    days = last_civil_days(today)
    first = days[0] if days else today
    rows = await queries.read_daily_activity(tx, user_id, first, today)
    activity = {row.day: row for row in rows}
    regularity = []
    for civil_day in days:
        entry = activity.get(civil_day)
        qualified = entry is not None and (entry.qualifying or entry.minutes > 0)
        regularity.append({"date": civil_day, "status": "done" if qualified else "none"})
    return {"days": max(0, profile.streak_days), "regularity": regularity}


async def read_sidebar(tx: Tx, user_id: str, now: datetime) -> dict[str, Any]:
    """`readSidebar`: the menu DTO of the learner, computed from one consistent read."""
    profile = await queries.read_sidebar_profile(tx, user_id)
    if profile is None:
        raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
    formations = [_to_formation(row) for row in await queries.read_sidebar_formations(tx, user_id)]
    active = [formation for formation in formations if formation["status"] == "active"]
    current = next(
        (formation for formation in active if formation["id"] == profile.current_formation_id),
        None,
    )
    if current is None and active:
        current = active[0]
    if current is None:
        counters = {"dueCount": 0, "gapCount": 0}
    else:
        counts = await queries.read_sidebar_counters(tx, user_id, str(current["id"]), now)
        counters = {"dueCount": counts.due_count, "gapCount": counts.gap_count}
    streak = await _read_streak(tx, user_id, profile, now)
    return {
        "collapsed": profile.sidebar_collapsed,
        "currentFormation": current,
        "formations": formations,
        "quizDueCount": counters["dueCount"],
        "gapCount": counters["gapCount"],
        "streak": streak,
    }


async def get_sidebar(deps: IdentityDeps, actor: Actor) -> dict[str, Any]:
    """`GET /api/v1/me/sidebar` - menu data of the authenticated learner (ET-1, ET-3)."""
    async with deps.db.user_tx(actor) as tx:
        return await read_sidebar(tx, actor.user_id, deps.clock.now())


async def update_sidebar(
    deps: IdentityDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`PATCH /api/v1/me/sidebar` - collapsed preference and/or current formation, then the DTO.

    A formation of another owner is a 404, never a 403 revealing it (ET-4).
    """
    collapsed = body.get("collapsed")
    async with deps.db.user_tx(actor) as tx:
        if collapsed is not None:
            await queries.update_sidebar_collapsed(tx, actor.user_id, bool(collapsed))
        if "currentFormationId" in body:
            formation_id = body["currentFormationId"]
            selected = await queries.read_selectable_formation(
                tx,
                actor.user_id,
                None if formation_id is None else str(formation_id),
            )
            if selected is None or formation_id is None:
                raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
            await queries.update_current_formation(tx, actor.user_id, str(formation_id))
        return await read_sidebar(tx, actor.user_id, deps.clock.now())
