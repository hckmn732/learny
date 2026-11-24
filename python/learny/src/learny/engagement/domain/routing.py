"""Pure routing of one external delivery.

One function decides, for one channel and one notification type, whether the delivery is sent,
scheduled, deferred by the quiet hours or the weekend, capped by the daily limit or skipped by a
preference. It reads no clock and touches no database: `now`, `time_zone` and `sent_today` are
supplied by the caller, which makes the whole decision table testable (CA-1, CA-2).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from learny.engagement.domain.quiet import QuietHours, next_outside_quiet_hours
from learny.shared.time import (
    MS_PER_MINUTE,
    add_civil_days,
    civil_day_ms,
    from_epoch_ms,
    local_time_to_instant,
    to_epoch_ms,
    user_local_day,
    user_weekday,
)

DeliveryChannel = Literal["email", "push"]
DeliveryStatus = Literal["sent", "scheduled", "deferred_quiet", "capped", "skipped_pref"]

# EF-3 - the preference switch a type obeys; `None` means the type is always active.
TYPE_SWITCH: dict[str, str] = {
    "global_quiz_today": "type_revision",
    "validation_soon": "type_validation",
    "module_validated": "type_validation",
    "course_ready": "type_course",
    "new_gap": "type_gap",
    "session_planned": "type_planning",
    "session_to_reschedule": "type_planning",
    "planning_adjusted": "type_planning",
    "relaunch": "type_relaunch",
}


@dataclass(frozen=True, slots=True)
class DeliverySettings:
    """The eleven stored settings a decision reads (SPEC-102, SPEC-708)."""

    channel_email: bool = True
    channel_push: bool = True
    type_revision: bool = True
    type_validation: bool = True
    type_course: bool = True
    type_gap: bool = True
    type_planning: bool = True
    type_relaunch: bool = True
    quiet_start: str = "21:00"
    quiet_end: str = "08:00"
    weekend_quiet: bool = True
    max_per_day: int = 5


@dataclass(frozen=True, slots=True)
class DeliveryDecision:
    """The status of one external channel plus the instant of its next re-evaluation."""

    status: DeliveryStatus
    scheduled_for: datetime | None
    error: str | None = None


def type_switch_of(notification_type: str) -> str | None:
    """EF-3 - the preference switch of a type; `None` when the type is always active."""
    return TYPE_SWITCH.get(notification_type)


def _channel_enabled(settings: DeliverySettings, channel: DeliveryChannel) -> bool:
    return settings.channel_email if channel == "email" else settings.channel_push


def _type_enabled(settings: DeliverySettings, notification_type: str) -> bool:
    key = type_switch_of(notification_type)
    return True if key is None else bool(getattr(settings, key))


def _next_monday_quiet_end(now_ms: int, time_zone: str, quiet_start: str, quiet_end: str) -> int:
    """EF-4, CL-9 - Monday, end of the quiet hours, in the learner's zone.

    When the quiet range is empty (`start = end`, CL-10), the report is Monday at 00:00.
    """
    empty = quiet_start == quiet_end
    target_hour = "00:00" if empty else quiet_end
    day = user_local_day(now_ms, time_zone)
    for offset in range(8):
        candidate = civil_day_ms(day)
        weekday = ((from_epoch_ms(candidate).weekday()) % 7) + 1
        if weekday == 1 and offset > 0:
            return local_time_to_instant(day, target_hour, time_zone)
        day = add_civil_days(day, 1)
    return local_time_to_instant(day, target_hour, time_zone)


def decide_delivery(
    *,
    channel: DeliveryChannel,
    notification_type: str,
    settings: DeliverySettings,
    now: datetime,
    time_zone: str,
    sent_today: int,
    eligible_at: datetime | None = None,
    read: bool = False,
    stale_at: datetime | None = None,
) -> DeliveryDecision:
    """EF-2 to EF-5, CL-1, CL-2, CL-9, CL-10 - the single decision table of a delivery.

    Order: preference, eligibility, weekend, quiet hours, daily cap, send.
    """
    now_ms = to_epoch_ms(now)

    # 1. Channel and type preferences (BR-NOT-03).
    if not _channel_enabled(settings, channel) or not _type_enabled(settings, notification_type):
        return DeliveryDecision(status="skipped_pref", scheduled_for=None)

    # 2. A notification that is already obsolete never leaves the application.
    if read:
        return DeliveryDecision(status="skipped_pref", scheduled_for=None, error="stale")
    if stale_at is not None and to_epoch_ms(stale_at) <= now_ms:
        return DeliveryDecision(status="skipped_pref", scheduled_for=None, error="stale")

    # 3. A future eligibility instant is scheduled, not sent now.
    if eligible_at is not None and to_epoch_ms(eligible_at) > now_ms:
        return DeliveryDecision(status="scheduled", scheduled_for=eligible_at)

    # 4. Weekend: only the revisions due may leave the application (EF-4, CL-9).
    weekday = user_weekday(now_ms, time_zone)
    if settings.weekend_quiet and weekday >= 6 and notification_type != "global_quiz_today":
        return DeliveryDecision(
            status="deferred_quiet",
            scheduled_for=from_epoch_ms(
                _next_monday_quiet_end(now_ms, time_zone, settings.quiet_start, settings.quiet_end)
            ),
        )

    # 5. Quiet hours (BR-NOT-06, CL-1, CL-6, CL-10).
    quiet = QuietHours(time_zone=time_zone, start=settings.quiet_start, end=settings.quiet_end)
    from learny.engagement.domain.quiet import is_quiet_hours

    if is_quiet_hours(now_ms, quiet):
        return DeliveryDecision(
            status="deferred_quiet",
            scheduled_for=from_epoch_ms(next_outside_quiet_hours(now_ms, quiet)),
        )

    # 6. Daily cap: the programme du jour never counts nor is capped (EF-6, ADR-0214).
    if notification_type != "daily_digest" and sent_today >= settings.max_per_day:
        return DeliveryDecision(status="capped", scheduled_for=None)

    return DeliveryDecision(status="sent", scheduled_for=None)


_ = MS_PER_MINUTE
