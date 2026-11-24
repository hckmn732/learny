"""Bounds of the initial planning (SPEC-2207)."""

from typing import Any

import pytest
from learny.learning.application.plan_programme import (
    FALLBACK_HORIZON_DAYS,
    end_date_of,
    module_hours,
    planner_modules,
)
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2207")

NOW = parse_iso("2026-11-11T12:20:00Z")


def test_the_volume_is_split_into_whole_hours_per_module() -> None:
    assert module_hours(12, 3) == 4
    assert module_hours(10, 3) == 3
    assert module_hours(None, 4) == 2
    assert module_hours(0, 3) == 1
    assert module_hours(1.5, 3) == 1
    assert module_hours(8, 0) == 1


def test_the_end_date_falls_back_on_the_last_module_then_on_forty_two_days() -> None:
    formation: dict[str, Any] = {"end_date": "2026-12-24"}
    assert end_date_of(formation, [], NOW) == "2026-12-24"
    assert end_date_of({"end_date": None}, [{"planned_end": "2026-12-01"}], NOW) == "2026-12-01"
    assert end_date_of({"end_date": None}, [], NOW) == "2026-12-23"
    assert FALLBACK_HORIZON_DAYS == 42


def test_every_module_carries_its_chapters_and_its_deadline() -> None:
    modules = [
        {"id": "m1", "position": 1, "title": "First", "planned_end": "2026-12-01"},
        {"id": "m2", "position": 2, "title": "Second", "planned_end": None},
    ]
    chapters = [
        {"id": "c2", "module_id": "m2", "position": 2},
        {"id": "c1", "module_id": "m1", "position": 1},
    ]

    built = planner_modules(modules, chapters, 4)

    assert [entry["moduleId"] for entry in built] == ["m1", "m2"]
    assert [entry["hours"] for entry in built] == [4, 4]
    assert built[0]["deadline"] == "2026-12-01"
    assert "deadline" not in built[1]
    assert built[0]["chapters"] == [{"chapterId": "c1", "position": 1}]
    assert built[1]["chapters"] == [{"chapterId": "c2", "position": 2}]
    assert built[0]["hasExercise"] is True


def test_the_lesson_slots_carry_the_chapter_title_when_it_is_known() -> None:
    modules = [{"id": "m1", "position": 1, "title": "First", "planned_end": None}]
    chapters = [
        {"id": "c1", "module_id": "m1", "position": 1, "title": "Les bases"},
        {"id": "c2", "module_id": "m1", "position": 2, "title": None},
    ]

    built = planner_modules(modules, chapters, 4)

    assert built[0]["chapters"] == [
        {"chapterId": "c1", "position": 1, "title": "Les bases"},
        {"chapterId": "c2", "position": 2},
    ]
