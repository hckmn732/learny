"""ISO-8601 handling shared by every context (00-conventions section 7).

Boundary values stay strings in the contract; they become `datetime` only inside use cases.
The time-zone helpers below are the port of `packages/core/src/time.ts` used by the learning
engine: every instant comes from the caller, nothing reads the process time zone.
"""

import re
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

MS_PER_MINUTE = 60_000
MS_PER_DAY = 86_400_000
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
_CIVIL_DAY = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_TZDB_NAME = re.compile(r"^[A-Z][a-z]+(?:/[A-Z][a-z]*(?:[_-](?:[A-Z][a-z]*|au|of|d|de))*)+$")
_DAYS_IN_MONTH = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def parse_iso(value: str) -> datetime:
    """Parses an ISO-8601 instant (`Z` or offset) into an aware UTC datetime."""
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        raise ValueError(f"instant without a timezone: {value}")
    return parsed.astimezone(UTC)


def to_iso(instant: datetime) -> str:
    """Renders an instant exactly like `Date.prototype.toISOString()`."""
    if instant.tzinfo is None:
        raise ValueError("an instant must be timezone-aware")
    return instant.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def from_epoch_ms(milliseconds: int) -> datetime:
    """Aware UTC datetime of epoch milliseconds, without any float rounding."""
    return _EPOCH + timedelta(milliseconds=milliseconds)


def to_epoch_ms(instant: datetime) -> int:
    """Epoch milliseconds of an aware datetime (`Date#getTime`)."""
    if instant.tzinfo is None:
        raise ValueError("an instant must be timezone-aware")
    return int(instant.timestamp() * 1000)


def read_civil_day(value: object) -> tuple[int, int, int] | None:
    """A strict `YYYY-MM-DD` that is a real calendar day, or None."""
    if not isinstance(value, str):
        return None
    match = _CIVIL_DAY.match(value)
    if match is None:
        return None
    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
    if month < 1 or month > 12 or day < 1:
        return None
    length = 29 if month == 2 and _is_leap_year(year) else _DAYS_IN_MONTH[month - 1]
    if day > length:
        return None
    return (year, month, day)


def _is_leap_year(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def civil_day_ms(value: str) -> int:
    """UTC milliseconds of a civil day read as if it were UTC: the wall clock of that day."""
    parsed = read_civil_day(value)
    if parsed is None:
        raise ValueError(f"invalid civil day: {value}")
    year, month, day = parsed
    return to_epoch_ms(datetime(year, month, day, tzinfo=UTC))


def offset_ms_at(time_zone: str, milliseconds: int) -> int:
    """UTC offset of the zone at that instant, in milliseconds (positive east of Greenwich)."""
    local = from_epoch_ms(milliseconds).astimezone(ZoneInfo(time_zone))
    offset = local.utcoffset()
    if offset is None:
        raise ValueError(f"no UTC offset for {time_zone}")
    return round(offset.total_seconds() * 1000)


def wall_ms_of(milliseconds: int, time_zone: str) -> int:
    """The local wall clock of an instant, expressed as the epoch milliseconds of those fields."""
    return milliseconds + offset_ms_at(time_zone, milliseconds)


def instants_at_wall(wall_ms: int, time_zone: str) -> list[int]:
    """Every real instant at which the zone's clock reads `wall_ms` (0, 1 or 2 readings)."""
    before = offset_ms_at(time_zone, wall_ms - MS_PER_DAY)
    after = offset_ms_at(time_zone, wall_ms + MS_PER_DAY)
    candidates = sorted({wall_ms - before, wall_ms - after})
    return [
        candidate for candidate in candidates if offset_ms_at(time_zone, candidate) == wall_ms - candidate
    ]


def _transition_instant(time_zone: str, start: int, end: int, offset: int) -> int:
    """First instant of the zone where the offset equals `offset`, between two instants."""
    low = start
    high = end
    while high - low > MS_PER_MINUTE:
        middle = low + ((high - low) // (2 * MS_PER_MINUTE)) * MS_PER_MINUTE
        if offset_ms_at(time_zone, middle) == offset:
            high = middle
        else:
            low = middle
    return high


def instants_from_wall(wall_ms: int, time_zone: str) -> list[int]:
    """Same as `instants_at_wall`, but a skipped reading resolves to the instant of the jump."""
    readings = instants_at_wall(wall_ms, time_zone)
    if readings:
        return readings
    after = offset_ms_at(time_zone, wall_ms + MS_PER_DAY)
    return [_transition_instant(time_zone, wall_ms - MS_PER_DAY, wall_ms + MS_PER_DAY, after)]


def is_supported_time_zone(value: object) -> bool:
    """A well-formed IANA zone name the runtime knows, plus the literal `UTC`."""
    if not isinstance(value, str) or value == "" or value.startswith(("+", "-")):
        return False
    if value == "UTC":
        return True
    if _TZDB_NAME.match(value) is None:
        return False
    try:
        ZoneInfo(value)
    except (KeyError, ValueError):
        return False
    return True


def user_local_day(instant_ms: int, time_zone: str) -> str:
    """Local civil day (`YYYY-MM-DD`) of an instant in the zone."""
    local = from_epoch_ms(wall_ms_of(instant_ms, time_zone))
    return f"{local.year:04d}-{local.month:02d}-{local.day:02d}"


def start_of_user_day(day: str, time_zone: str) -> int:
    """Instant at which the civil day starts in the zone (the jump when midnight is skipped)."""
    return instants_from_wall(civil_day_ms(day), time_zone)[0]


def local_time_ms(day: str, time: str) -> int:
    """Wall-clock milliseconds of a `HH:mm` reading on a civil day."""
    hours, minutes = int(time[0:2]), int(time[3:5])
    return civil_day_ms(day) + (hours * 60 + minutes) * MS_PER_MINUTE


def local_time_to_shifted_instant(day: str, time: str, time_zone: str) -> int:
    """Instant of a local reading, shifted by the jump when the clock skips it (ADR-0277)."""
    wall = local_time_ms(day, time)
    direct = instants_at_wall(wall, time_zone)
    if direct:
        return direct[0]
    before = offset_ms_at(time_zone, wall - MS_PER_DAY)
    after = offset_ms_at(time_zone, wall + MS_PER_DAY)
    gap = after - before
    if gap > 0:
        shifted = instants_at_wall(wall + gap, time_zone)
        if shifted:
            return shifted[0]
    return instants_from_wall(wall, time_zone)[0]
