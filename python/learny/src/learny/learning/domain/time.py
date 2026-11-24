"""Time adapter of the learning engine (SPEC-401 ET-3, ADR-0140).

This is the only module of the engine that converts between the serializable string types and
epoch milliseconds; every public function still reads its instant from an input, never from the
system clock (ADR-0047).
"""

import re
from datetime import UTC, datetime, timedelta

from learny.learning.domain.errors import EngineError, invalid_input
from learny.shared import time as shared_time
from learny.shared.jsmath import js_round

INSTANT_ISO = re.compile(
    r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$"
)
LOCAL_TIME = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
MS_PER_DAY = 86_400_000


def is_iso_date(value: object) -> bool:
    """A strict `YYYY-MM-DD` civil day that exists in the proleptic Gregorian calendar."""
    return shared_time.read_civil_day(value) is not None


def is_local_time(value: object) -> bool:
    """A strict `HH:mm` local time between 00:00 and 23:59."""
    return isinstance(value, str) and LOCAL_TIME.match(value) is not None


def is_time_zone(value: object) -> bool:
    """An IANA time zone name supported by the runtime, plus the literal `UTC`."""
    return shared_time.is_supported_time_zone(value)


def is_instant_iso(value: object) -> bool:
    """A canonical UTC instant `YYYY-MM-DDTHH:MM:SS.sssZ` whose civil fields exist."""
    if not isinstance(value, str) or INSTANT_ISO.match(value) is None:
        return False
    if not is_iso_date(value[0:10]):
        return False
    return shared_time.to_iso(shared_time.parse_iso(value)) == value


def parse_instant(iso: str) -> int:
    """Epoch milliseconds of a canonical instant; `INVALID_INSTANT` otherwise (CL-1)."""
    if not is_instant_iso(iso):
        raise EngineError("INVALID_INSTANT", f"Invalid ISO 8601 UTC instant: {iso}")
    return shared_time.to_epoch_ms(shared_time.parse_iso(iso))


def format_instant(milliseconds: float) -> str:
    """Canonical instant of epoch milliseconds; `INVALID_INSTANT` for a non-finite input."""
    if not _finite(milliseconds):
        raise EngineError("INVALID_INSTANT", f"Invalid milliseconds: {milliseconds}")
    value = int(milliseconds)
    return shared_time.to_iso(shared_time.from_epoch_ms(value))


def _finite(value: float) -> bool:
    return value == value and value not in (float("inf"), float("-inf"))


def _civil_ms(day: str) -> int:
    return shared_time.civil_day_ms(day)


def add_days(date: str, n: int) -> str:
    """Civil arithmetic on a UTC calendar: no time zone and no daylight-saving rule involved."""
    if not is_iso_date(date):
        raise invalid_input("date", f"Invalid civil day: {date}")
    if not isinstance(n, int) or isinstance(n, bool):
        raise invalid_input("n", f"Invalid number of days: {n}")
    shifted = shared_time.from_epoch_ms(_civil_ms(date) + n * MS_PER_DAY)
    return f"{shifted.year:04d}-{shifted.month:02d}-{shifted.day:02d}"


def days_between(a: str, b: str) -> int:
    """Signed number of civil days from `a` to `b` (`b - a`)."""
    if not is_iso_date(a):
        raise invalid_input("a", f"Invalid civil day: {a}")
    if not is_iso_date(b):
        raise invalid_input("b", f"Invalid civil day: {b}")
    return (_civil_ms(b) - _civil_ms(a)) // MS_PER_DAY


def iso_weekday(date: str) -> int:
    """ISO weekday of a civil day: 1 = Monday ... 7 = Sunday."""
    if not is_iso_date(date):
        raise invalid_input("date", f"Invalid civil day: {date}")
    weekday = shared_time.from_epoch_ms(_civil_ms(date)).isoweekday()
    return weekday


def compare_dates(a: str, b: str) -> int:
    """Lexicographic comparison of two valid civil days."""
    if not is_iso_date(a):
        raise invalid_input("a", f"Invalid civil day: {a}")
    if not is_iso_date(b):
        raise invalid_input("b", f"Invalid civil day: {b}")
    return 0 if a == b else (-1 if a < b else 1)


def local_date_of(instant: str, tz: str) -> str:
    """Local civil day of an instant in the given IANA zone."""
    at = parse_instant(instant)
    if not is_time_zone(tz):
        raise invalid_input("tz", f"Unknown time zone: {tz}")
    return shared_time.user_local_day(at, tz)


def local_minutes_of(instant: str, tz: str) -> int:
    """Minutes since local midnight (0..1439) of an instant in the given zone."""
    at = parse_instant(instant)
    if not is_time_zone(tz):
        raise invalid_input("tz", f"Unknown time zone: {tz}")
    local = shared_time.from_epoch_ms(shared_time.wall_ms_of(at, tz))
    return local.hour * 60 + local.minute


def instant_at(date: str, time: str, tz: str) -> str:
    """UTC instant of a local date and time; a skipped reading is shifted by the jump (CL-3)."""
    if not is_iso_date(date):
        raise invalid_input("date", f"Invalid civil day: {date}")
    if not is_local_time(time):
        raise invalid_input("time", f"Invalid local time: {time}")
    if not is_time_zone(tz):
        raise invalid_input("tz", f"Unknown time zone: {tz}")
    return format_instant(shared_time.local_time_to_shifted_instant(date, time, tz))


def start_of_local_day(date: str, tz: str) -> str:
    """First instant of the local civil day in the zone."""
    if not is_iso_date(date):
        raise invalid_input("date", f"Invalid civil day: {date}")
    if not is_time_zone(tz):
        raise invalid_input("tz", f"Unknown time zone: {tz}")
    return format_instant(shared_time.start_of_user_day(date, tz))


def parse_local_time(value: str) -> int:
    """Minutes since midnight of a `HH:mm` local time."""
    if not is_local_time(value):
        raise invalid_input("time", f"Invalid local time: {value}")
    return int(value[0:2]) * 60 + int(value[3:5])


def format_local_time(minutes: int) -> str:
    """`HH:mm` local time of a number of minutes since midnight."""
    if not isinstance(minutes, int) or isinstance(minutes, bool) or minutes < 0 or minutes > 1439:
        raise invalid_input("minutes", f"Minutes outside 0..1439: {minutes}")
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def epoch_ms_to_utc(milliseconds: int) -> datetime:
    """Aware UTC datetime of an instant, for the callers that need calendar fields."""
    return shared_time.from_epoch_ms(milliseconds)


def ms_of_utc_day(date: str) -> int:
    """Epoch milliseconds of the civil day read as UTC (the engine's wall-clock convention)."""
    return _civil_ms(date)


def days_apart_ms(milliseconds: int) -> int:
    """Whole UTC days of an interval, as `Math.floor(diff / 86_400_000)`."""
    return milliseconds // MS_PER_DAY


def rounded_days(days: float) -> int:
    """`Math.round` on a day count, kept here so callers never import `math`."""
    return js_round(days)


def utc_day_start(milliseconds: int) -> int:
    """Epoch milliseconds of the UTC midnight of the instant's UTC day."""
    moment = shared_time.from_epoch_ms(milliseconds).astimezone(UTC)
    return shared_time.to_epoch_ms(datetime(moment.year, moment.month, moment.day, tzinfo=UTC))


def plus_days_ms(milliseconds: int, days: int) -> int:
    """Epoch milliseconds shifted by a whole number of 24-hour days."""
    return milliseconds + days * MS_PER_DAY


def plus_minutes_ms(milliseconds: int, minutes: int) -> int:
    """Epoch milliseconds shifted by a whole number of minutes."""
    return milliseconds + minutes * 60_000


def iso_weekday_of_ms(milliseconds: int) -> int:
    """ISO weekday (1 = Monday ... 7 = Sunday) of an instant's UTC day."""
    return shared_time.from_epoch_ms(milliseconds).isoweekday()


def add_timedelta(milliseconds: int, delta: timedelta) -> int:
    """Epoch milliseconds shifted by a duration, without float rounding."""
    return shared_time.to_epoch_ms(shared_time.from_epoch_ms(milliseconds) + delta)
