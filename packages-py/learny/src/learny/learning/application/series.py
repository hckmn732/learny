"""Streak, regularity and milestones (SPEC-723 EF-1 to EF-4, BR-GAM-02, BR-GAM-03, ADR-0321).

Port of `packages/services/src/serie-regularite-et-jalons-interface.ts`: the engine of SPEC-409
computes the streak from the persisted `daily_activity`; this module only reads behind RLS, maps
the three engine states to the sidebar boxes and reconciles the milestones the learner reached.

Milestones are system-managed: after the RLS reads the missing rows are inserted with the service
role in one transaction, and a duplicate `(user, key, ref)` inserts nothing (CL-2, CL-5).
"""

from collections.abc import Mapping, Sequence
from typing import Any, cast

from learny.engagement import public as engagement
from learny.engagement.application.ports import EngagementDeps
from learny.identity.domain.actor import Actor
from learny.learning.application.ports import LearningDeps
from learny.learning.domain.params import ENGINE
from learny.learning.domain.streak import (
    MilestoneParams,
    StreakParams,
    calculate_streak,
    detect_milestones,
    module_milestone_key,
)
from learny.learning.domain.time import add_days, instant_at, local_date_of
from learny.learning.infrastructure import queries
from learny.shared.errors import AppError
from learny.shared.locale_fr import learning as texts
from learny.shared.time import parse_iso, to_iso

DEFAULT_STUDY_DAYS: tuple[int, ...] = (1, 2, 3, 4, 5)
MILESTONE_KEY_ORDER = {"module_validated": 0, "notions_100": 1, "streak_30": 2}
# SPEC-723: only these two milestones are announced outside the application.
NOTIFIED_MILESTONE_KEYS = ("notions_100", "streak_30")


def to_study_days(row: Mapping[str, Any] | None) -> list[int]:
    """`toStudyDays`: the stored days, the default week when nothing usable remains."""
    raw = DEFAULT_STUDY_DAYS if row is None or row.get("study_days") is None else row["study_days"]
    days = []
    for value in raw:
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if 1 <= number <= 7:
            days.append(number)
    if not days:
        return list(DEFAULT_STUDY_DAYS)
    return sorted(set(days))


def _instant(value: Any) -> str:
    """A database instant as a canonical ISO string."""
    return value if isinstance(value, str) else to_iso(value)


def to_daily_activity(rows: Sequence[Mapping[str, Any]], time_zone: str) -> list[dict[str, Any]]:
    """ET-4 \u2014 only a qualifying day becomes an entry, at local noon in the learner's zone."""
    return [
        {"at": instant_at(str(row["day"]), "12:00", time_zone), "kind": "quiz"}
        for row in rows
        if bool(row["qualifying"])
    ]


def to_regularity(calendar: Sequence[Any]) -> list[dict[str, str]]:
    """BR-GAM-02 \u2014 the engine's three states are exactly the three boxes of the sidebar."""
    return [
        {
            "date": day.date,
            "status": (
                "done" if day.status == "studied" else "neutral" if day.status == "neutral" else "none"
            ),
        }
        for day in calendar
    ]


def milestone_label(key: str, module_title: str | None = None) -> str:
    """BR-GAM-03 \u2014 sober label of one milestone; never a ranking or a speed reward."""
    if key == "notions_100":
        return texts.SERIES_MILESTONE_NOTIONS
    if key == "streak_30":
        return texts.SERIES_MILESTONE_STREAK
    if key.startswith("module_validated:"):
        if module_title is None:
            return texts.SERIES_MODULE_VALIDATED
        return texts.SERIES_MODULE_VALIDATED_LABEL.format(title=module_title)
    return texts.SERIES_MILESTONE_DEFAULT


def next_milestone_of(
    *,
    streak_days: int,
    mastered_notions: int,
    open_module: Mapping[str, Any] | None = None,
    notions_goal: int | None = None,
    streak_goal: int | None = None,
) -> dict[str, Any] | None:
    """ET-3 \u2014 the closest remaining milestone, smallest remaining first, then the fixed order."""
    notions_goal = int(ENGINE["milestones"]["notionsRetained"]) if notions_goal is None else notions_goal
    streak_goal = int(ENGINE["milestones"]["streakDays"]) if streak_goal is None else streak_goal
    candidates: list[dict[str, Any]] = []

    if open_module is not None:
        candidates.append(
            {
                "kind": "module_validated",
                "key": module_milestone_key(str(open_module["id"])),
                "remaining": 1,
                "label": texts.SERIES_MODULE_TO_VALIDATE_LABEL.format(title=open_module["title"]),
            }
        )
    if mastered_notions < notions_goal:
        candidates.append(
            {
                "kind": "notions_100",
                "key": "notions_100",
                "remaining": notions_goal - mastered_notions,
                "label": texts.SERIES_MILESTONE_NOTIONS,
            }
        )
    if streak_days < streak_goal:
        candidates.append(
            {
                "kind": "streak_30",
                "key": "streak_30",
                "remaining": streak_goal - streak_days,
                "label": texts.SERIES_MILESTONE_STREAK,
            }
        )

    candidates.sort(
        key=lambda item: (
            int(item["remaining"]),
            MILESTONE_KEY_ORDER[str(item["kind"])],
            str(item["key"]),
        )
    )
    return candidates[0] if candidates else None


async def _read_series_context(deps: LearningDeps, actor: Actor) -> dict[str, Any]:
    """The persisted activity, the current streak and the milestone candidates, in one snapshot."""
    now = deps.clock.now()
    now_iso = to_iso(now)
    async with deps.db.user_tx(actor) as tx:
        profile = await queries.read_series_profile(tx, actor.user_id)
        if profile is None:
            raise AppError("NOT_FOUND", texts.SERIES_PROFILE_NOT_FOUND)
        timezone = str(profile["timezone"])
        today = local_date_of(now_iso, timezone)
        lookback_start = add_days(today, -int(ENGINE["streak"]["maxLookbackDays"]))

        preferences = await queries.read_series_preferences(tx, actor.user_id)
        pauses = await queries.read_series_pauses(tx, actor.user_id)
        activities = await queries.read_series_activities(tx, actor.user_id, lookback_start, today)
        validated_modules = await queries.read_series_validated_modules(tx, actor.user_id)
        mastered = await queries.read_series_mastered_notions(
            tx, actor.user_id, int(ENGINE["milestones"]["masteryThreshold"])
        )
        open_module = (
            None
            if profile["current_formation_id"] is None
            else await queries.read_series_open_module(
                tx, actor.user_id, str(profile["current_formation_id"])
            )
        )
        stored = await queries.read_series_milestones(tx, actor.user_id)

    streak = calculate_streak(
        to_daily_activity(activities, timezone),
        to_study_days(preferences),
        [{"startsOn": str(row["starts_on"]), "endsOn": str(row["ends_on"])} for row in pauses],
        now_iso,
        timezone,
        StreakParams(
            reading_min_seconds=int(ENGINE["streak"]["readingMinSeconds"]),
            regularity_days=int(ENGINE["streak"]["regularityDays"]),
            max_lookback_days=int(ENGINE["streak"]["maxLookbackDays"]),
        ),
    )

    return {
        "timezone": timezone,
        "today": today,
        "now": now_iso,
        "current_formation_id": profile["current_formation_id"],
        "streak": streak,
        "validated_modules": validated_modules,
        "mastered_notions": max(0, int(mastered.get("count") or 0)),
        "open_module": open_module,
        "previous_keys": [
            module_milestone_key(str(row["ref_id"]))
            if row["key"] == "module_validated" and row["ref_id"] is not None
            else str(row["key"])
            for row in stored
        ],
    }


def _build_streak_dto(context: Mapping[str, Any]) -> dict[str, Any]:
    """`buildStreakDto`: the streak, the strip and the closest remaining milestone."""
    open_module = context["open_module"]
    return {
        "days": context["streak"].days,
        "regularity": to_regularity(context["streak"].calendar),
        "timezone": context["timezone"],
        "computedOn": context["today"],
        "nextMilestone": next_milestone_of(
            streak_days=context["streak"].days,
            mastered_notions=context["mastered_notions"],
            open_module=None if open_module is None else dict(open_module),
        ),
    }


async def get_streak(deps: LearningDeps, actor: Actor) -> dict[str, Any]:
    """ET-3 \u2014 a pure read of the persisted activity and of the engine result."""
    return _build_streak_dto(await _read_series_context(deps, actor))


async def _insert_milestones(
    deps: LearningDeps,
    user_id: str,
    now: str,
    current_formation_id: str | None,
    validated_modules: Sequence[Mapping[str, Any]],
    milestones: Sequence[Any],
) -> list[Mapping[str, Any]]:
    """Stores the detected milestones with the service role; a replay inserts nothing."""
    if not milestones:
        return []
    formation_of_module = {str(row["id"]): row["formation_id"] for row in validated_modules}
    inserted: list[Mapping[str, Any]] = []
    async with deps.db.service_tx() as tx:
        for milestone in milestones:
            formation_id = current_formation_id
            if milestone.kind == "module_validated" and milestone.module_id is not None:
                formation_id = formation_of_module.get(str(milestone.module_id)) or current_formation_id
            row = await queries.insert_series_milestone(
                tx, user_id, formation_id, milestone.kind, milestone.module_id, now
            )
            if row is not None:
                inserted.append(row)
    # SPEC-723 - the announcement is produced after the commit of the milestone, for the rows this
    # call actually created: a replay inserts nothing and therefore announces nothing.
    await _notify_milestones(deps, user_id, inserted)
    return inserted


async def _notify_milestones(deps: LearningDeps, user_id: str, inserted: Sequence[Mapping[str, Any]]) -> None:
    """SPEC-723 - announces a new hundred notions or a thirty-day streak through `notify`.

    Exactly like `sendMilestoneNotification`: the notification is produced after the commit of the
    milestone, keyed by the milestone so a replay never creates a second one, and a failure of the
    channel never fails the read of the milestones.
    """
    for row in inserted:
        key = str(row["key"])
        if key not in NOTIFIED_MILESTONE_KEYS:
            continue
        formation_id = row["formation_id"]
        try:
            await engagement.notify(
                cast(EngagementDeps, deps),
                user_id=user_id,
                notification_type="milestone",
                data={"label": milestone_label(key), "href": "/accueil"},
                formation_id=None if formation_id is None else str(formation_id),
                dedupe_key=f"milestone:{key}",
            )
        except Exception:  # the notification channel never breaks the milestone read
            deps.logger.warn("milestones.notify.failed", outcome="notification_failed")


async def reconcile_milestones(deps: LearningDeps, actor: Actor) -> list[Mapping[str, Any]]:
    """ET-2, ET-5 \u2014 detects and persists the milestones the learner has actually reached."""
    context = await _read_series_context(deps, actor)
    detected = detect_milestones(
        context["previous_keys"],
        [str(row["id"]) for row in context["validated_modules"]],
        context["mastered_notions"],
        context["streak"].days,
        MilestoneParams(
            notions_retained=int(ENGINE["milestones"]["notionsRetained"]),
            streak_days=int(ENGINE["milestones"]["streakDays"]),
        ),
    )
    return await _insert_milestones(
        deps,
        actor.user_id,
        context["now"],
        context["current_formation_id"],
        context["validated_modules"],
        detected,
    )


async def _assert_formation_access(deps: LearningDeps, actor: Actor, formation_id: str) -> None:
    """A foreign or unknown formation is a 404 and never reveals its existence."""
    async with deps.db.user_tx(actor) as tx:
        if not await queries.read_series_formation_access(tx, actor.user_id, formation_id):
            raise AppError("NOT_FOUND", texts.SERIES_FORMATION_NOT_FOUND)


async def _read_milestone_items(
    deps: LearningDeps, actor: Actor, timezone: str, formation_id: str | None
) -> list[dict[str, Any]]:
    """The milestone cards, newest first, with their local achievement date."""
    async with deps.db.user_tx(actor) as tx:
        rows = await queries.read_series_milestone_items(tx, actor.user_id, formation_id)
    items: list[dict[str, Any]] = []
    for row in rows:
        key = (
            module_milestone_key(str(row["ref_id"]))
            if row["key"] == "module_validated" and row["ref_id"] is not None
            else str(row["key"])
        )
        achieved_at = _instant(row["achieved_at"])
        items.append(
            {
                "id": row["id"],
                "key": key,
                "kind": row["key"],
                "label": milestone_label(key, row["module_title"]),
                "formationId": row["formation_id"],
                "formationTitle": row["formation_title"],
                "achievedAt": to_iso(parse_iso(achieved_at)),
                "achievedOn": local_date_of(achieved_at, timezone),
            }
        )
    return items


async def get_milestones(deps: LearningDeps, actor: Actor, formation_id: str | None = None) -> dict[str, Any]:
    """ET-3, CA-3 \u2014 the milestone list, newest first, with the closest remaining milestone."""
    if formation_id is not None:
        await _assert_formation_access(deps, actor, formation_id)
    await reconcile_milestones(deps, actor)
    context = await _read_series_context(deps, actor)
    items = await _read_milestone_items(deps, actor, context["timezone"], formation_id)
    return {
        "items": items,
        "nextMilestone": _build_streak_dto(context)["nextMilestone"],
        "timezone": context["timezone"],
    }
