"""[SPEC-2202] Canonical instants, civil days and local times (SPEC-401 ET-3, CL-1 to CL-3).

Ported from `packages/learning-engine/src/time.test.ts`.
"""

import pytest
from learny.learning.domain.errors import EngineError
from learny.learning.domain.time import (
    add_days,
    compare_dates,
    days_between,
    format_instant,
    format_local_time,
    instant_at,
    is_instant_iso,
    is_iso_date,
    is_local_time,
    iso_weekday,
    local_date_of,
    local_minutes_of,
    parse_instant,
    parse_local_time,
    start_of_local_day,
)

pytestmark = pytest.mark.spec("SPEC-2202")


def test_an_impossible_civil_day_is_not_an_instant() -> None:
    assert is_instant_iso("2026-11-11T12:20:00.000Z") is True
    assert is_instant_iso("2026-02-30T00:00:00.000Z") is False
    assert is_instant_iso("2026-11-11T12:20:00Z") is False
    with pytest.raises(EngineError) as refused:
        parse_instant("2026-02-30T00:00:00.000Z")
    assert refused.value.code == "INVALID_INSTANT"


def test_civil_day_helpers() -> None:
    assert is_iso_date("2026-11-11") is True
    assert is_iso_date("2026-2-11") is False
    assert add_days("2026-11-11", -1) == "2026-11-10"
    assert add_days("2026-02-28", 1) == "2026-03-01"
    assert days_between("2026-11-01", "2026-11-11") == 10
    assert iso_weekday("2026-11-11") == 3
    assert compare_dates("2026-11-11", "2026-11-12") == -1


def test_local_time_helpers() -> None:
    assert is_local_time("23:59") is True
    assert is_local_time("24:00") is False
    assert parse_local_time("08:30") == 510
    assert format_local_time(510) == "08:30"


def test_the_local_day_follows_the_zone() -> None:
    assert local_date_of("2026-11-11T23:30:00.000Z", "Europe/Paris") == "2026-11-12"
    assert local_date_of("2026-11-11T23:30:00.000Z", "UTC") == "2026-11-11"
    assert local_minutes_of("2026-11-11T12:20:00.000Z", "Europe/Paris") == 13 * 60 + 20


def test_a_skipped_reading_is_shifted_by_the_jump() -> None:
    assert instant_at("2026-03-29", "02:30", "Europe/Paris") == "2026-03-29T01:30:00.000Z"
    assert start_of_local_day("2026-03-29", "Europe/Paris") == "2026-03-28T23:00:00.000Z"
    assert format_instant(parse_instant("2026-11-11T12:20:00.000Z")) == "2026-11-11T12:20:00.000Z"
