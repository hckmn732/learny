"""Weekly review of the learner (SPEC-2205, SPEC-720 BR-AUT-09).

The four measures of the local week come from the learner's own rows under RLS (ET-4): done slot
minutes, the thirty-day retention, the notions due or carrying an open gap, and the planned slots of
the next week. A missing measure stays `None`, so the interface can say it is unavailable instead of
inventing a zero (CL-4). A foreign `actionId` is never disclosed: it is simply absent (CL-1).
"""

from collections.abc import Mapping
from typing import Any

from learny.engagement.application.ports import EngagementDeps
from learny.engagement.domain.automations import (
    ACTION_STATUSES,
    format_weekly_study,
    is_at_risk_notion,
    sort_at_risk_notions,
    sum_plan_minutes,
    weekly_period_label,
    weekly_received_label,
    weekly_retention_label,
    weekly_review_week,
)
from learny.engagement.domain.automations.weekly import AT_RISK_MASTERY
from learny.engagement.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.learning.domain.retention import calculate_retention
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as engagement_fr
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.product import RETENTION_HORIZONS_DAYS, RETENTION_TOLERANCE_DAYS
from learny.shared.time import (
    add_civil_days,
    end_of_user_day,
    from_epoch_ms,
    start_of_user_day,
    to_iso,
)

AUTOMATION = "bilan"
KIND = "weekly_review"
RETENTION_HORIZON_DAYS = 30
AVAILABILITY_HREF = "/parametres#rythme"
PAYLOAD_KEYS = (
    "dedupeKey",
    "weekKey",
    "weekStart",
    "weekEnd",
    "nextWeekStart",
    "reviewOn",
    "studyMinutes",
    "retention",
    "atRiskNotions",
    "atRiskCount",
    "plan",
    "planMinutes",
    "channel",
    "availabilityHref",
)


def _instant(value: Any) -> str:
    return to_iso(value) if hasattr(value, "tzinfo") else str(value)


def _retention_of(
    modules: list[Mapping[str, Any]], reviews: list[Mapping[str, Any]], now: Any, time_zone: str
) -> dict[str, Any]:
    """ET-4 - the thirty-day retention with its real numerator and denominator."""
    notion_ids = {str(notion) for module in modules for notion in module["notion_ids"]}
    horizons = calculate_retention(
        [
            {
                "moduleId": str(module["module_id"]),
                "validatedAt": _instant(module["validated_at"]),
                "notionIds": [str(notion) for notion in module["notion_ids"]],
            }
            for module in modules
        ],
        [
            {
                "reviewId": str(review["review_id"]),
                "notionId": str(review["notion_id"]),
                "reviewedAt": _instant(review["reviewed_at"]),
                "correct": bool(review["correct"]),
            }
            for review in reviews
            if str(review["notion_id"]) in notion_ids
        ],
        at=_instant(now),
        time_zone=time_zone,
        horizons_days=RETENTION_HORIZONS_DAYS,
        tolerance_days=RETENTION_TOLERANCE_DAYS,
    )
    horizon = next((entry for entry in horizons if entry.horizon_days == RETENTION_HORIZON_DAYS), None)
    return {
        "horizonDays": RETENTION_HORIZON_DAYS,
        "rate": None if horizon is None or horizon.rate is None else horizon.rate,
        "reviewed": 0 if horizon is None else horizon.reviewed,
        "successful": 0 if horizon is None else horizon.successful,
    }


async def collect_weekly_review_data(
    tx: Any, *, user_id: str, now: Any, time_zone: str, week: Any
) -> dict[str, Any]:
    """ET-4 - the four real measures of the week, read under the caller's scope."""
    start = from_epoch_ms(start_of_user_day(week.week_start, time_zone))
    end = from_epoch_ms(end_of_user_day(week.week_end, time_zone))
    plan_start = from_epoch_ms(start_of_user_day(week.next_week_start, time_zone))
    plan_end = from_epoch_ms(end_of_user_day(add_civil_days(week.next_week_start, 6), time_zone))
    study_minutes = await queries.weekly_study_minutes(tx, user_id=user_id, start=start, end=end)
    retention = _retention_of(
        await queries.retention_modules(tx, user_id),
        await queries.retention_reviews(tx, user_id),
        now,
        time_zone,
    )
    at_risk = await queries.at_risk_notions(tx, user_id=user_id, mastery_below=AT_RISK_MASTERY, now=now)
    candidates = [
        {
            "notionId": str(row["notion_id"]),
            "label": str(row["label"]),
            "mastery": float(row["mastery"]),
        }
        for row in at_risk
        if is_at_risk_notion(
            mastery=float(row["mastery"]),
            due_at=None if row["due_at"] is None else _instant(row["due_at"]),
            gap_nature=row["gap_nature"],
            gap_cleared_at=None if row["gap_cleared_at"] is None else _instant(row["gap_cleared_at"]),
            now=now,
        )
    ]
    plan = [
        {
            "date": str(row["day"]),
            "minutes": max(0, int(row["minutes"] or 0)),
            "slots": max(0, int(row["slots"] or 0)),
        }
        for row in await queries.next_week_plan(
            tx, user_id=user_id, time_zone=time_zone, start=plan_start, end=plan_end
        )
    ]
    return {
        "studyMinutes": study_minutes,
        "retention": retention,
        "atRiskNotions": sort_at_risk_notions(candidates),
        "plan": plan,
    }


def _status_of(status: str) -> str:
    return status if status in ACTION_STATUSES else "applied"


def _view(
    *,
    action: queries.WeeklyReviewRow,
    week: Any,
    data: Mapping[str, Any],
    channel: str,
    availability_href: str,
    time_zone: str,
) -> dict[str, Any]:
    """EF-2 - the home card, every label ready to render."""
    at_risk = list(data["atRiskNotions"])
    plan = list(data["plan"])
    return {
        "actionId": action.id,
        "status": _status_of(action.status),
        "createdAt": to_iso(action.created_at),
        "weekKey": week.week_key,
        "weekStart": week.week_start,
        "weekEnd": week.week_end,
        "nextWeekStart": week.next_week_start,
        "periodLabel": weekly_period_label(week.week_start, week.week_end),
        "receivedLabel": weekly_received_label(to_iso(action.created_at), time_zone),
        "studyMinutes": int(data["studyMinutes"]),
        "studyLabel": format_weekly_study(int(data["studyMinutes"])),
        "retention": dict(data["retention"]),
        "retentionLabel": weekly_retention_label(data["retention"]["rate"]),
        "atRiskNotions": at_risk,
        "atRiskCount": len(at_risk),
        "plan": plan,
        "planMinutes": sum_plan_minutes(plan),
        "channel": channel,
        "availabilityQuestion": True,
        "availabilityHref": availability_href,
        "summary": action.summary,
    }


def _payload_view(action: queries.WeeklyReviewRow, time_zone: str) -> dict[str, Any] | None:
    """`viewFromPayload` - the frozen payload of the journal, when it is complete."""
    payload = action.payload
    if any(key not in payload for key in PAYLOAD_KEYS):
        return None
    retention = payload.get("retention")
    if not isinstance(retention, Mapping) or "rate" not in retention:
        return None
    return {
        "actionId": action.id,
        "status": _status_of(action.status),
        "createdAt": to_iso(action.created_at),
        "weekKey": payload["weekKey"],
        "weekStart": payload["weekStart"],
        "weekEnd": payload["weekEnd"],
        "nextWeekStart": payload["nextWeekStart"],
        "periodLabel": weekly_period_label(payload["weekStart"], payload["weekEnd"]),
        "receivedLabel": weekly_received_label(to_iso(action.created_at), time_zone),
        "studyMinutes": int(payload["studyMinutes"]),
        "studyLabel": format_weekly_study(int(payload["studyMinutes"])),
        "retention": dict(retention),
        "retentionLabel": weekly_retention_label(retention.get("rate")),
        "atRiskNotions": list(payload["atRiskNotions"]),
        "atRiskCount": int(payload["atRiskCount"]),
        "plan": list(payload["plan"]),
        "planMinutes": int(payload["planMinutes"]),
        "channel": payload["channel"],
        "availabilityQuestion": True,
        "availabilityHref": payload["availabilityHref"],
        "summary": action.summary,
    }


async def get_weekly_review(deps: EngagementDeps, actor: Actor, action_id: str | None) -> dict[str, Any]:
    """GET /api/v1/me/weekly-review - the review of the learner, or an explicit empty state."""
    async with deps.db.user_tx(actor) as tx:
        profile = await queries.read_profile(tx, actor.user_id)
        if profile is None:
            raise AppError("NOT_FOUND", engagement_fr.SETTINGS_PROFILE_NOT_FOUND)
        time_zone = str(profile["timezone"])
        action = await queries.latest_weekly_review_action(tx, user_id=actor.user_id, action_id=action_id)
        if action is None:
            if action_id is not None:
                raise AppError("NOT_FOUND", fr.WEEKLY_REVIEW_NOT_FOUND)
            return {"available": False, "review": None, "timezone": time_zone}
        frozen = _payload_view(action, time_zone)
        if frozen is not None:
            return {"available": True, "review": frozen, "timezone": time_zone}
        week = weekly_review_week(action.created_at, time_zone)
        data = await collect_weekly_review_data(
            tx, user_id=actor.user_id, now=action.created_at, time_zone=time_zone, week=week
        )
        review = _view(
            action=action,
            week=week,
            data=data,
            channel="app",
            availability_href=AVAILABILITY_HREF,
            time_zone=time_zone,
        )
        return {"available": True, "review": review, "timezone": time_zone}


__all__ = ["collect_weekly_review_data", "get_weekly_review"]
