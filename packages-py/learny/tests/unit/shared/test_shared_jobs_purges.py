"""Bounds of the purge jobs, without any database (SPEC-2207, port of the TypeScript cutoffs).

Every retained instant is derived from the injected clock, so these tests freeze it and compare
the cutoffs with the exact boundaries of the source: strictly older is deleted, the boundary
itself is kept.
"""

from datetime import timedelta

import pytest
from learny.assessments.application.offline_purge import (
    OFFLINE_RECEIPT_RETENTION_DAYS,
)
from learny.assessments.application.offline_purge import (
    retention_limit as offline_limit,
)
from learny.identity.application.purge_security import (
    SECURITY_RETENTION,
)
from learny.identity.application.purge_security import (
    retention_limit as security_limit,
)
from learny.shared.outbox.purge import (
    OUTBOX_RETENTION_DAYS,
)
from learny.shared.outbox.purge import (
    retention_limit as outbox_limit,
)
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2207")

NOW = parse_iso("2026-11-11T12:20:00Z")


def test_outbox_retention_is_seven_days() -> None:
    assert OUTBOX_RETENTION_DAYS == 7
    assert outbox_limit(NOW) == parse_iso("2026-11-04T12:20:00Z")
    assert outbox_limit(NOW) == NOW - timedelta(days=7)


def test_security_retention_is_twenty_four_hours() -> None:
    assert timedelta(hours=24) == SECURITY_RETENTION
    assert security_limit(NOW) == parse_iso("2026-11-10T12:20:00Z")
    assert security_limit(NOW) == NOW - timedelta(hours=24)


def test_offline_receipt_retention_is_thirty_days() -> None:
    assert OFFLINE_RECEIPT_RETENTION_DAYS == 30
    assert offline_limit(NOW) == parse_iso("2026-10-12T12:20:00Z")
    assert offline_limit(NOW) == NOW - timedelta(days=30)


def test_a_security_row_of_twenty_three_hours_fifty_nine_is_kept() -> None:
    kept = NOW - timedelta(hours=23, minutes=59)
    deleted = NOW - timedelta(hours=24, seconds=1)
    assert kept > security_limit(NOW)
    assert deleted < security_limit(NOW)
