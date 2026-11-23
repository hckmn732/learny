"""[SPEC-2205] Pure rules of the four job use cases, replayed against the reference oracle.

The assertions compare the Python port to the source of truth, never to a hand-written expectation.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from learny.engagement.domain.digest import (
    activity_time,
    date_label,
    duration_label,
    global_quiz_minutes,
    held_max_per_day,
    js_round,
    planned_label,
    previous_civil_day,
    slot_minutes,
)
from learny.engagement.domain.practice import (
    TITLE_MAX,
    criteria_total,
    generic_instruction,
    instruction_for,
    table_instruction,
)
from learny.engagement.domain.reminders import (
    REMINDER_DEFAULT_MINUTES,
    ReminderInputError,
    local_moment_label,
    parse_request,
    quiz_href,
    reminder_at,
    reminder_key,
    reminder_schedule,
    reminder_signature,
    reminder_window,
    validation_data,
)
from learny.engagement.domain.tick import (
    LocalTick,
    build_local_tick,
    digest_time_of,
    due_in_window,
    tick_instant,
    window_of_instant,
)
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement as fr
from learny.shared.locale_fr import engagement_exercises as exercise_fr
from learny.shared.time import parse_iso, to_iso

pytestmark = pytest.mark.spec("SPEC-2205")

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
ORACLE: dict[str, Any] = json.loads((FIXTURES / "engagement_jobs.json").read_text(encoding="utf-8"))
USER = "00000000-0000-4000-8000-000000000001"
SLOT = "00000000-0000-4000-8000-000000000002"
NOW = parse_iso("2026-11-11T12:20:00Z")
TABLE_LABEL = "\u00c9quilibre d\u2019une pi\u00e8ce"
GENERIC_LABEL = "La photosynth\u00e8se"


def test_the_tick_windows_and_due_instants_match_the_typescript_oracle() -> None:
    for case in ORACLE["windows"]:
        tick = parse_iso(case["tick"])
        assert to_iso(tick_instant(tick)) == case["truncated"]
        local = build_local_tick(USER, case["timezone"], tick)
        expected = case["local"]
        if expected is None:
            assert local is None
            continue
        assert local is not None
        assert to_iso(local.window_start) == expected["windowStart"]
        assert to_iso(local.window_end) == expected["windowEnd"]
        assert local.local_date == expected["localDate"]
        assert local.local_weekday == expected["localWeekday"]
        due = due_in_window(case["hhmm"], local)
        assert (None if due is None else to_iso(due)) == case["due"]


def test_an_empty_window_has_no_due_instant() -> None:
    start = parse_iso("2026-11-11T12:20:00Z")
    window = LocalTick(
        user_id=USER,
        timezone="Europe/Paris",
        window_start=start,
        window_end=start,
        local_date="2026-11-11",
        local_weekday=3,
    )
    assert due_in_window("13:00", window) is None


def test_an_invalid_local_time_is_refused() -> None:
    start, end = window_of_instant(NOW)
    window = LocalTick(USER, "Europe/Paris", start, end, "2026-11-11", 3)
    with pytest.raises(ValueError, match="invalid time of day"):
        due_in_window("25:00", window)


def test_the_reminder_schedule_matches_the_typescript_oracle() -> None:
    for case in ORACLE["reminders"]:
        starts_at = parse_iso(case["startsAt"])
        schedule = reminder_schedule(SLOT, starts_at, case["timezone"])
        assert schedule["eligibleAt"] == case["eligibleAt"]
        assert schedule["localTime"] == case["localTime"]
        assert schedule["localDay"] == case["localDay"]
        assert schedule["dedupeKey"] == case["dedupeKey"]
        assert to_iso(reminder_at(starts_at)) == case["reminderAt"]
        assert reminder_key(SLOT, starts_at) == case["keyOf"]
        assert local_moment_label(starts_at, case["timezone"], NOW) == case["when"]


def test_the_local_moment_labels_match_the_typescript_oracle() -> None:
    for case in ORACLE["labels"]:
        instant = parse_iso(case["instant"])
        assert local_moment_label(instant, case["timezone"], NOW) == case["label"]


def test_the_reminder_window_matches_the_typescript_oracle() -> None:
    start, end = reminder_window(NOW)
    assert to_iso(start) == ORACLE["window"]["from"]
    assert to_iso(end) == ORACLE["window"]["to"]


def test_a_reminder_signature_is_extracted_from_the_key() -> None:
    assert reminder_signature(f"validation_soon:{SLOT}:2026-11-11T14:00:00.000Z") == (
        f"{SLOT}:2026-11-11T14:00:00.000Z"
    )
    assert reminder_signature("other:key") is None
    assert reminder_signature("validation_soon:not-a-uuid:2026-11-11") is None


def request(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "userId": USER,
        "slotId": SLOT,
        "startsAt": "2026-11-11T14:00:00.000Z",
        "timezone": "Europe/Paris",
    }
    base.update(overrides)
    return base


def test_the_request_is_validated_like_the_contract() -> None:
    parsed = parse_request(request(moduleTitle="  Quiz  ", minutes=20, unknown=True))
    assert parsed.user_id == USER
    assert parsed.slot_id == SLOT
    assert parsed.module_title == "Quiz"
    assert parsed.minutes == 20
    assert to_iso(parsed.starts_at) == "2026-11-11T14:00:00.000Z"
    assert parse_request(request(minutes=None)).minutes is None


@pytest.mark.parametrize(
    ("overrides", "path"),
    [
        ({"userId": None}, "userId"),
        ({"userId": "not-a-uuid"}, "userId"),
        ({"slotId": 42}, "slotId"),
        ({"formationId": "nope"}, "formationId"),
        ({"moduleTitle": "   "}, "moduleTitle"),
        ({"startsAt": "2026-11-11"}, "startsAt"),
        ({"startsAt": 42}, "startsAt"),
        ({"timezone": ""}, "timezone"),
        ({"minutes": 0}, "minutes"),
        ({"minutes": 241}, "minutes"),
        ({"minutes": True}, "minutes"),
    ],
)
def test_an_invalid_request_is_refused(overrides: dict[str, Any], path: str) -> None:
    with pytest.raises(AppError) as error:
        parse_request(request(**overrides))
    assert error.value.code == "VALIDATION_FAILED"
    assert error.value.detail == fr.REMINDER_INVALID
    errors = error.value.extra["errors"]
    assert errors[0]["path"] == path


def test_a_non_object_request_is_refused() -> None:
    with pytest.raises(ReminderInputError) as error:
        parse_request([])
    assert error.value.detail == fr.REMINDER_INVALID


def test_the_validation_data_uses_the_locale_fallbacks() -> None:
    data = validation_data(
        starts_at=parse_iso("2026-11-11T14:00:00Z"),
        formation_id=None,
        module_id=None,
        module_title=None,
        minutes=None,
        time_zone="Europe/Paris",
        now=NOW,
    )
    assert data["moduleTitle"] == fr.NOTIFICATION_MODULE_FALLBACK
    assert data["minutes"] == REMINDER_DEFAULT_MINUTES
    assert data["href"] == "/agenda"
    assert data["when"] == ORACLE["reminders"][0]["when"]


def test_the_quiz_link_follows_the_product_routes() -> None:
    formation = "00000000-0000-4000-8000-000000000003"
    module = "00000000-0000-4000-8000-000000000004"
    assert quiz_href(None, module) == "/agenda"
    assert quiz_href(formation, None) == f"/formations/{formation}/programme"
    assert quiz_href(formation, module) == f"/formations/{formation}/modules/{module}/quiz"


def test_the_digest_labels_match_the_typescript_oracle() -> None:
    for case in ORACLE["digestDates"]:
        instant = parse_iso(case["instant"])
        assert date_label(instant, case["timezone"]) == case["dateLabel"]
        assert activity_time(instant, case["timezone"]) == case["time"]


def test_the_duration_labels_are_the_typescript_ones() -> None:
    assert duration_label(0) == fr.DIGEST_MINUTES.format(minutes=0)
    assert duration_label(45) == fr.DIGEST_MINUTES.format(minutes=45)
    assert duration_label(60) == fr.DIGEST_HOURS.format(hours=1)
    assert duration_label(75) == fr.DIGEST_HOURS_MINUTES.format(hours=1, minutes="15")
    assert duration_label(125) == fr.DIGEST_HOURS_MINUTES.format(hours=2, minutes="05")


def test_the_planned_label_summarises_the_hidden_activities() -> None:
    assert planned_label(90, 3) == duration_label(90)
    assert planned_label(90, 21) == fr.DIGEST_HELD_OTHERS.format(planned=duration_label(90), count=1)
    assert planned_label(60, 25) == fr.DIGEST_HELD_OTHERS.format(planned=duration_label(60), count=5)


def test_the_previous_civil_day_crosses_months_and_years() -> None:
    assert previous_civil_day("2026-11-11") == "2026-11-10"
    assert previous_civil_day("2026-03-01") == "2026-02-28"
    assert previous_civil_day("2026-01-01") == "2025-12-31"


def test_the_minutes_round_like_math_round() -> None:
    assert js_round(1.5) == 2
    assert js_round(1.4) == 1
    start = parse_iso("2026-11-11T12:00:00Z")
    assert slot_minutes(start, parse_iso("2026-11-11T12:01:29Z")) == 1
    assert slot_minutes(start, parse_iso("2026-11-11T12:01:30Z")) == 2
    assert global_quiz_minutes(start, parse_iso("2026-11-11T12:00:10Z")) == 1


def test_the_held_cap_falls_back_to_five() -> None:
    assert held_max_per_day(3) == 3
    assert held_max_per_day(8) == 8
    assert held_max_per_day(5) == 5
    assert held_max_per_day(None) == 5
    assert held_max_per_day("8") == 5


def test_the_digest_time_is_truncated_to_the_minute() -> None:
    assert digest_time_of("08:00:00") == "08:00"
    assert digest_time_of("18:45:00") == "18:45"


def test_the_table_instruction_is_selected_for_the_equilibrium_notion() -> None:
    instruction = instruction_for(TABLE_LABEL, "Une definition")
    assert instruction["production"]["kind"] == "table"
    assert instruction["title"] == exercise_fr.TABLE_INSTRUCTION["title"]
    assert criteria_total(list(instruction["criteria"])) == 10
    assert instruction["passPoints"] == 8


def test_the_generic_instruction_is_interpolated() -> None:
    instruction = instruction_for(GENERIC_LABEL, "Une definition")
    assert instruction["production"] == {"kind": "text", "minChars": 80, "maxChars": 2000}
    assert GENERIC_LABEL in instruction["title"]
    assert GENERIC_LABEL in instruction["taskMd"]
    assert instruction["data"] == [exercise_fr.GENERIC_DATA.format(label=GENERIC_LABEL)]
    assert criteria_total(list(instruction["criteria"])) == 10
    fallback = instruction_for(GENERIC_LABEL, None)
    assert exercise_fr.GENERIC_DEFINITION_FALLBACK in fallback["taskMd"]


def test_the_generic_title_is_truncated_to_the_contract_bound() -> None:
    instruction = generic_instruction("N" * 300, None)
    assert len(instruction["title"]) == TITLE_MAX


def test_the_table_fixture_is_never_mutated() -> None:
    first = table_instruction()
    first["title"] = "changed"
    second = instruction_for(TABLE_LABEL, None)
    assert second["title"] == exercise_fr.TABLE_INSTRUCTION["title"]
