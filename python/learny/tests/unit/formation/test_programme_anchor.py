"""Anchoring of a proposed programme on its start (hotfix QA, ADR-2038)."""

from typing import Any

import pytest
from learny.formation.domain.programme import anchor_programme_dates

pytestmark = pytest.mark.spec("SPEC-2201")


def payload(*ranges: tuple[str, str]) -> dict[str, Any]:
    return {
        "summary": "s",
        "modules": [
            {"position": index + 1, "plannedStart": start, "plannedEnd": end}
            for index, (start, end) in enumerate(ranges)
        ],
    }


def test_a_programme_starting_on_or_after_the_reference_is_unchanged() -> None:
    proposal = payload(("2026-11-11", "2026-11-20"))
    assert anchor_programme_dates(proposal, "2026-11-11") is proposal
    assert anchor_programme_dates(payload(), "2026-11-11") == payload()


def test_a_past_programme_moves_by_whole_weeks_keeping_durations_and_gaps() -> None:
    proposal = payload(("2024-03-04", "2024-03-15"), ("2024-03-18", "2024-03-29"))

    anchored = anchor_programme_dates(proposal, "2026-11-11")

    first, second = anchored["modules"]
    assert first["plannedStart"] >= "2026-11-11"
    assert first["plannedStart"] == "2026-11-16"
    assert first["plannedEnd"] == "2026-11-27"
    assert second["plannedStart"] == "2026-11-30"
    assert second["plannedEnd"] == "2026-12-11"
    assert anchored["summary"] == "s"
    assert proposal["modules"][0]["plannedStart"] == "2024-03-04"


def test_a_start_exactly_one_week_late_moves_by_one_week() -> None:
    anchored = anchor_programme_dates(payload(("2026-11-04", "2026-11-06")), "2026-11-11")
    assert anchored["modules"][0]["plannedStart"] == "2026-11-11"
    assert anchored["modules"][0]["plannedEnd"] == "2026-11-13"
