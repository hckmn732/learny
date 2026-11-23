"""[SPEC-2201] Pure derivations of the header and sidebar (port of header.test.ts, sidebar.test.ts)."""

from typing import Any

import pytest
from learny.identity.application.sidebar import (
    accent_of,
    formation_monogram,
    last_civil_days,
    shift_civil_day,
    user_zone_date,
)
from learny.shared.time import parse_iso
from learny.views.header import abbreviate_email, to_header

pytestmark = pytest.mark.spec("SPEC-2201")

FIXED = parse_iso("2026-11-11T12:20:00Z")


def test_abbreviate_email_never_exposes_the_local_part() -> None:
    assert abbreviate_email("alice@example.com") == "a***@example.com"
    assert abbreviate_email("  bob@learny.fr  ") == "b***@learny.fr"
    assert abbreviate_email("\u00e9lise@example.com") == "\u00e9***@example.com"
    assert abbreviate_email(None) is None
    assert abbreviate_email("") is None
    assert abbreviate_email("sans-arobase") is None
    assert abbreviate_email("@example.com") is None
    assert abbreviate_email("alice@") is None


def test_to_header_normalises_blank_names_and_negative_counters() -> None:
    row: dict[str, Any] = {
        "first_name": "   ",
        "last_name": None,
        "email": None,
        "active_count": -1,
        "unread_count": -4,
    }

    assert to_header(row) == {
        "firstName": None,
        "lastName": None,
        "emailLabel": None,
        "activeFormationCount": 0,
        "unreadNotificationCount": 0,
    }


def test_formation_monogram_falls_back_to_the_title() -> None:
    assert formation_monogram("SAP S/4HANA Finance", None) == "SA"
    assert formation_monogram("Gestion de projet agile", "") == "GE"
    assert formation_monogram("\u00c9co-conception", None) == "EC"
    assert formation_monogram("Python", None) == "PY"
    assert formation_monogram("", None) == "?"
    assert formation_monogram("\u00e9", None) == "E"
    assert formation_monogram("Python", "  ") == "PY"
    assert formation_monogram("Python", "PYS") == "PY"


def test_accent_falls_back_to_indigo() -> None:
    assert accent_of("green") == "green"
    assert accent_of("magenta") == "indigo"


def test_shift_civil_day_crosses_month_and_year_boundaries() -> None:
    assert shift_civil_day("2026-11-11", -1) == "2026-11-10"
    assert shift_civil_day("2026-11-01", -1) == "2026-10-31"
    assert shift_civil_day("2026-12-31", 1) == "2027-01-01"


def test_last_civil_days_returns_fourteen_sorted_days() -> None:
    days = last_civil_days("2026-11-11")

    assert len(days) == 14
    assert days[0] == "2026-10-29"
    assert days[13] == "2026-11-11"
    assert days == sorted(days)


def test_user_zone_date_uses_the_learner_zone() -> None:
    assert user_zone_date(FIXED, "Europe/Paris") == "2026-11-11"
    assert user_zone_date(FIXED, "UTC") == "2026-11-11"
    assert user_zone_date(FIXED, "Pacific/Auckland") == "2026-11-12"
