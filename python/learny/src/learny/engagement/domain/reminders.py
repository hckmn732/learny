"""Pure rules of the validation-quiz reminders.

A reminder is requested forty minutes before the planned quiz, with the zone of the profile, and is
transmitted to `notify` as `eligibleAt`; the dedupe key contains the slot and its exact start, so a
move changes the key and the old unsent reminder is cancelled. Nothing here reimplements the
preferences, the quiet hours or the daily cap: `notify` stays the only writer (BR-NOT-07).
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr
from learny.shared.time import (
    add_civil_days,
    format_user_date,
    from_epoch_ms,
    parse_iso,
    to_epoch_ms,
    to_iso,
    user_local_day,
    wall_ms_of,
)

VALIDATION_QUIZ_REMINDER_MINUTES = 40
REMINDER_BATCH_MAX = 200
REMINDER_DEFAULT_MINUTES = 20
REMINDER_KEY_PATTERN = re.compile(r"^validation_soon:([0-9a-f-]{36}):(.+)$")
_UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$")


@dataclass(frozen=True, slots=True)
class ReminderRequest:
    """A validated `ValidationQuizReminderRequest`."""

    user_id: str
    formation_id: str | None
    slot_id: str
    module_id: str | None
    module_title: str | None
    starts_at: datetime
    timezone: str
    minutes: int | None


class ReminderInputError(AppError):
    """A request that does not satisfy the contract; the code and the detail are the SPEC-706 ones."""

    def __init__(self, issues: list[dict[str, str]]) -> None:
        super().__init__("VALIDATION_FAILED", fr.REMINDER_INVALID, errors=issues)


def _invalid(path: str, message: str) -> ReminderInputError:
    return ReminderInputError([{"path": path, "message": message}])


def _uuid_of(value: object, path: str, *, optional: bool) -> str | None:
    if value is None and optional:
        return None
    if not isinstance(value, str) or _UUID.match(value) is None:
        raise _invalid(path, "Invalid UUID.")
    return value


def _required_text(value: object, path: str, *, maximum: int) -> str:
    if not isinstance(value, str):
        raise _invalid(path, "Invalid input.")
    text = value.strip()
    if text == "" or len(text) > maximum:
        raise _invalid(path, "Invalid input.")
    return text


def parse_request(value: object) -> ReminderRequest:
    """`ValidationQuizReminderRequest.parse`: the contract of one reminder request."""
    if not isinstance(value, Mapping):
        raise _invalid("", "Invalid input.")
    raw: Mapping[str, Any] = value
    user_id = _uuid_of(raw.get("userId"), "userId", optional=False)
    slot_id = _uuid_of(raw.get("slotId"), "slotId", optional=False)
    formation_id = _uuid_of(raw.get("formationId"), "formationId", optional=True)
    module_id = _uuid_of(raw.get("moduleId"), "moduleId", optional=True)
    module_title: str | None = None
    if raw.get("moduleTitle") is not None:
        module_title = _required_text(raw.get("moduleTitle"), "moduleTitle", maximum=120)
    timezone = _required_text(raw.get("timezone"), "timezone", maximum=64)
    starts_raw = raw.get("startsAt")
    if not isinstance(starts_raw, str) or _ISO.match(starts_raw) is None:
        raise _invalid("startsAt", "Invalid ISO instant.")
    try:
        starts_at = parse_iso(starts_raw)
    except ValueError as error:
        raise _invalid("startsAt", "Invalid ISO instant.") from error
    minutes_raw = raw.get("minutes")
    minutes: int | None = None
    if minutes_raw is not None:
        if isinstance(minutes_raw, bool) or not isinstance(minutes_raw, int):
            raise _invalid("minutes", "Invalid integer.")
        if minutes_raw < 1 or minutes_raw > 240:
            raise _invalid("minutes", "Invalid integer.")
        minutes = minutes_raw
    assert user_id is not None
    assert slot_id is not None
    return ReminderRequest(
        user_id=user_id,
        formation_id=formation_id,
        slot_id=slot_id,
        module_id=module_id,
        module_title=module_title,
        starts_at=starts_at,
        timezone=timezone,
        minutes=minutes,
    )


def reminder_at(starts_at: datetime) -> datetime:
    """`validationQuizReminderAt`: the planned start minus forty minutes."""
    return starts_at - timedelta(minutes=VALIDATION_QUIZ_REMINDER_MINUTES)


def reminder_key(slot_id: str, starts_at: datetime) -> str:
    """`validationQuizReminderKey`: the slot and its exact start, ISO 8601 UTC."""
    return f"validation_soon:{slot_id}:{to_iso(starts_at)}"


def reminder_window(now: datetime) -> tuple[datetime, datetime]:
    """`reminderWindow`: the quiz starts covered by one hourly tick."""
    start = now + timedelta(minutes=VALIDATION_QUIZ_REMINDER_MINUTES)
    return start, start + timedelta(minutes=60)


def local_parts(instant: datetime, time_zone: str) -> tuple[str, str]:
    """`toUserZone`: the local civil day and `HH:mm` of an instant."""
    local = from_epoch_ms(wall_ms_of(to_epoch_ms(instant), time_zone))
    return (
        f"{local.year:04d}-{local.month:02d}-{local.day:02d}",
        f"{local.hour:02d}:{local.minute:02d}",
    )


def reminder_schedule(slot_id: str, starts_at: datetime, time_zone: str) -> dict[str, str]:
    """`validationQuizReminderSchedule`: the eligibility instant and the local readings."""
    eligible = reminder_at(starts_at)
    local_day, local_time = local_parts(starts_at, time_zone)
    return {
        "eligibleAt": to_iso(eligible),
        "localTime": local_time,
        "localDay": local_day,
        "dedupeKey": reminder_key(slot_id, starts_at),
    }


def local_moment_label(instant: datetime, time_zone: str, now: datetime) -> str:
    """The local moment label: today or tomorrow at HH:MM, otherwise the weekday label."""
    date, time = local_parts(instant, time_zone)
    today = user_local_day(to_epoch_ms(now), time_zone)
    if date == today:
        return fr.REMINDER_TODAY.format(time=time)
    if date == add_civil_days(today, 1):
        return fr.REMINDER_TOMORROW.format(time=time)
    return fr.REMINDER_OTHER.format(date=format_user_date(instant, time_zone))


def quiz_href(formation_id: str | None, module_id: str | None) -> str:
    """`quizHref`: the deep link of the quiz, from the routes of the product screens."""
    if formation_id is None or formation_id == "":
        return "/agenda"
    base = f"/formations/{formation_id}"
    if module_id is None or module_id == "":
        return f"{base}/programme"
    return f"{base}/modules/{module_id}/quiz"


def validation_data(
    *,
    starts_at: datetime,
    formation_id: str | None,
    module_id: str | None,
    module_title: str | None,
    minutes: int | None,
    time_zone: str,
    now: datetime,
) -> dict[str, Any]:
    """The template data of `validation_soon`, identical to `produceNotificationInput`."""
    return {
        "moduleTitle": module_title if module_title is not None else fr.NOTIFICATION_MODULE_FALLBACK,
        "when": local_moment_label(starts_at, time_zone, now),
        "minutes": minutes if minutes is not None else REMINDER_DEFAULT_MINUTES,
        "href": quiz_href(formation_id, module_id),
    }


def reminder_signature(dedupe_key: str) -> str | None:
    """The `slot:start` signature of a reminder key, or `None` for a foreign key."""
    match = REMINDER_KEY_PATTERN.match(dedupe_key)
    if match is None:
        return None
    return f"{match.group(1)}:{match.group(2)}"


__all__ = [
    "REMINDER_BATCH_MAX",
    "REMINDER_DEFAULT_MINUTES",
    "VALIDATION_QUIZ_REMINDER_MINUTES",
    "ReminderInputError",
    "ReminderRequest",
    "local_moment_label",
    "local_parts",
    "parse_request",
    "quiz_href",
    "reminder_at",
    "reminder_key",
    "reminder_schedule",
    "reminder_signature",
    "reminder_window",
    "validation_data",
]
