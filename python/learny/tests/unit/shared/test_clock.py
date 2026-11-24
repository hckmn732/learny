"""[SPEC-2003] Injectable clock and ISO rendering (ADR-0047)."""

from datetime import UTC, datetime

import pytest
from learny.shared.clock import FixedClock, SystemClock, from_env
from learny.shared.time import parse_iso, to_iso

pytestmark = pytest.mark.spec("SPEC-2003")

FIXED = "2026-11-11T12:20:00Z"


def test_parse_iso_accepts_z_and_offsets() -> None:
    assert parse_iso(FIXED) == datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
    assert parse_iso("2026-11-11T13:20:00+01:00") == datetime(2026, 11, 11, 12, 20, tzinfo=UTC)


def test_parse_iso_rejects_a_naive_instant() -> None:
    with pytest.raises(ValueError, match="timezone"):
        parse_iso("2026-11-11T12:20:00")


def test_to_iso_renders_like_javascript() -> None:
    assert to_iso(parse_iso(FIXED)) == "2026-11-11T12:20:00.000Z"


def test_fixed_clock_returns_the_injected_instant() -> None:
    clock = FixedClock(parse_iso(FIXED))
    assert clock.now() == clock.now() == parse_iso(FIXED)


def test_from_env_prefers_the_frozen_instant() -> None:
    clock = from_env({"CLOCK_FIXED_AT": FIXED})
    assert isinstance(clock, FixedClock)
    assert to_iso(clock.now()) == "2026-11-11T12:20:00.000Z"


def test_from_env_falls_back_to_the_system_clock() -> None:
    assert isinstance(from_env({}), SystemClock)


def test_fixed_clock_refuses_naive_datetimes() -> None:
    naive = datetime.fromisoformat("2026-11-11T12:20:00")
    with pytest.raises(ValueError, match="timezone-aware"):
        FixedClock(naive)
