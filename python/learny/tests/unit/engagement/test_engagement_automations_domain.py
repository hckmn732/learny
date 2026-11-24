"""[SPEC-2205] Pure rules of the automation engine replayed against the reference oracle."""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from learny.engagement.domain.automations import (
    ActionDraft,
    ActionView,
    AutomationDefinition,
    AutomationRegistry,
    DraftError,
    JournalEntry,
    ParamsError,
    decode_cursor,
    encode_cursor,
    format_weekly_study,
    is_action_kind,
    is_at_risk_notion,
    is_due_for_expiry,
    iso_week_key,
    normalize_summary,
    pause_end_date_in_zone,
    pause_summary,
    shift_day,
    sort_actions,
    sort_at_risk_notions,
    start_of_user_week,
    sum_plan_minutes,
    validate_draft,
    validate_params,
    validate_pause_end_date,
    week_journal,
    weekly_period_label,
    weekly_received_label,
    weekly_retention_label,
    weekly_review_week,
)
from learny.engagement.domain.automations.summary import SummaryError
from learny.shared.time import parse_iso, to_iso

pytestmark = pytest.mark.spec("SPEC-2205")

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
ORACLE: dict[str, Any] = json.loads((FIXTURES / "engagement_automations.json").read_text(encoding="utf-8"))
AT = "2026-11-11T12:20:00.000Z"


def now_of(instant: str) -> datetime:
    return parse_iso(instant)


def entries() -> list[JournalEntry]:
    return [
        JournalEntry(id=action["id"], automation=action["automation"], created_at=action["createdAt"])
        for action in ORACLE["selection"]["actions"]
    ]


# --- canonical parameter schemas ----------------------------------------------------------------


@pytest.mark.parametrize("case", ORACLE["params"], ids=lambda case: f"{case['key']}-{case['input']}")
def test_parameter_schema_matches_the_oracle(case: dict[str, Any]) -> None:
    if case["ok"]:
        assert validate_params(case["key"], case["input"]) == case["data"]
        return
    with pytest.raises(ParamsError) as caught:
        validate_params(case["key"], case["input"])
    assert caught.value.path == case["path"]
    assert caught.value.message == case["message"]


@pytest.mark.parametrize("case", ORACLE["summaries"], ids=lambda case: repr(case["value"])[:24])
def test_summary_rules_match_the_oracle(case: dict[str, Any]) -> None:
    if case["ok"]:
        assert normalize_summary(case["value"]) == case["data"]
        return
    with pytest.raises(SummaryError) as caught:
        normalize_summary(case["value"])
    assert caught.value.message == case["message"]


@pytest.mark.parametrize("case", ORACLE["kinds"], ids=lambda case: repr(case["value"])[:24])
def test_action_kind_rules_match_the_oracle(case: dict[str, Any]) -> None:
    assert is_action_kind(case["value"]) is case["ok"]


# --- stable journal order and cursor ------------------------------------------------------------


def test_journal_order_is_newest_first_then_identifier() -> None:
    assert [entry.id for entry in sort_actions(entries())] == ORACLE["selection"]["sorted"]


@pytest.mark.parametrize("case", ORACLE["selection"]["weeks"], ids=lambda case: f"week-{case['count']}")
def test_week_journal_is_the_prefix_of_the_stable_order(case: dict[str, Any]) -> None:
    assert [entry.id for entry in week_journal(entries(), case["count"])] == case["ids"]


@pytest.mark.parametrize("case", ORACLE["cursors"], ids=lambda case: case["encoded"][:16])
def test_cursor_encoding_matches_the_contract(case: dict[str, Any]) -> None:
    value = case["value"]
    encoded = encode_cursor(value["k"], value["id"])
    assert encoded == case["encoded"]
    assert decode_cursor(encoded) == (value["k"], value["id"])


@pytest.mark.parametrize("case", ORACLE["cursorGarbage"], ids=lambda case: repr(case["value"])[:24])
def test_a_forged_cursor_is_never_an_exception(case: dict[str, Any]) -> None:
    decoded = decode_cursor(case["value"])
    expected = case["decoded"]
    assert (None if decoded is None else {"k": decoded[0], "id": decoded[1]}) == expected


# --- expiration of the pending actions ----------------------------------------------------------


@pytest.mark.parametrize("case", ORACLE["expiry"], ids=lambda case: f"{case['status']}-{case['payload']}")
def test_expiration_rule_matches_the_tick(case: dict[str, Any]) -> None:
    assert is_due_for_expiry(case["status"], case["payload"], now_of(AT)) is case["due"]


# --- local weeks --------------------------------------------------------------------------------


@pytest.mark.parametrize("case", ORACLE["weeks"], ids=lambda case: f"{case['instant']}-{case['timeZone']}")
def test_weekly_review_week_matches_the_contract(case: dict[str, Any]) -> None:
    instant = now_of(case["instant"])
    week = weekly_review_week(instant, case["timeZone"])
    assert {
        "weekKey": week.week_key,
        "weekStart": week.week_start,
        "weekEnd": week.week_end,
        "nextWeekStart": week.next_week_start,
        "localDay": week.local_day,
        "weekday": week.weekday,
    } == case["week"]
    assert to_iso(start_of_user_week(instant, case["timeZone"])) == case["startOfUserWeek"]


@pytest.mark.parametrize("case", ORACLE["weekKeys"], ids=lambda case: case["day"])
def test_iso_week_key_matches_the_contract(case: dict[str, Any]) -> None:
    assert iso_week_key(case["day"]) == case["weekKey"]


# --- labels of the weekly review -----------------------------------------------------------------


@pytest.mark.parametrize("case", ORACLE["studyLabels"], ids=lambda case: str(case["minutes"]))
def test_study_label_matches_the_contract(case: dict[str, Any]) -> None:
    assert format_weekly_study(case["minutes"]) == case["label"]


@pytest.mark.parametrize("case", ORACLE["retentionLabels"], ids=lambda case: str(case["rate"]))
def test_retention_label_matches_the_contract(case: dict[str, Any]) -> None:
    assert weekly_retention_label(case["rate"]) == case["label"]


@pytest.mark.parametrize("case", ORACLE["periodLabels"], ids=lambda case: case["start"])
def test_period_label_matches_the_contract(case: dict[str, Any]) -> None:
    assert weekly_period_label(case["start"], case["end"]) == case["label"]


@pytest.mark.parametrize("case", ORACLE["receivedLabels"], ids=lambda case: case["instant"])
def test_received_label_matches_the_contract(case: dict[str, Any]) -> None:
    assert weekly_received_label(case["instant"], case["timeZone"]) == case["label"]


@pytest.mark.parametrize("case", ORACLE["atRisk"], ids=lambda case: case["now"])
def test_at_risk_notions_match_the_contract(case: dict[str, Any]) -> None:
    instant = now_of(case["now"])
    flags = [
        is_at_risk_notion(
            mastery=notion["mastery"],
            due_at=notion["dueAt"],
            gap_nature=notion["gapNature"],
            gap_cleared_at=notion["gapClearedAt"],
            now=instant,
        )
        for notion in case["notions"]
    ]
    assert flags == case["atRisk"]
    candidates = [
        {"notionId": notion["notionId"], "label": notion["label"], "mastery": notion["mastery"]}
        for notion, flag in zip(case["notions"], flags, strict=True)
        if flag
    ]
    assert sort_at_risk_notions(candidates) == case["sorted"]


@pytest.mark.parametrize("case", ORACLE["planMinutes"], ids=lambda case: str(len(case["plan"])))
def test_plan_minutes_match_the_contract(case: dict[str, Any]) -> None:
    assert sum_plan_minutes(case["plan"]) == case["minutes"]


# --- registry and draft validation --------------------------------------------------------------


def _definition(key: str = "micro_seance") -> AutomationDefinition:
    def explain(action: ActionView, tone: str, time_zone: str) -> str:
        return f"Proposition \u00ab {action.kind} \u00bb ({tone}, {time_zone})."

    return AutomationDefinition(key=key, triggers=({"type": "direct"},), explain=explain)


def _draft(**overrides: Any) -> ActionDraft:
    values: dict[str, Any] = {
        "kind": "micro_session_proposed",
        "formation_id": None,
        "requires_consent": True,
        "payload": {"hour": 20},
        "dedupe_key": "micro:2026-11-11",
    }
    values.update(overrides)
    return ActionDraft(**values)


def test_registry_refuses_a_duplicate_and_an_unknown_key() -> None:
    registry = AutomationRegistry()
    registry.register(_definition())
    with pytest.raises(DraftError) as duplicate:
        registry.register(_definition())
    assert duplicate.value.code == "CONFLICT"
    with pytest.raises(DraftError) as unknown:
        registry.register(_definition("inconnu"))
    assert unknown.value.code == "VALIDATION_FAILED"
    with pytest.raises(DraftError) as missing:
        registry.require("bilan")
    assert missing.value.code == "NOT_FOUND"
    assert registry.keys() == ["micro_seance"]
    assert registry.size == 1


def test_validate_draft_keeps_the_dedupe_key_in_the_payload() -> None:
    decision = validate_draft(_definition(), _draft(), "vous", "Europe/Paris")
    assert decision.summary == "Proposition \u00ab micro_session_proposed \u00bb (vous, Europe/Paris)."
    assert decision.payload == {"hour": 20, "dedupeKey": "micro:2026-11-11"}


@pytest.mark.parametrize(
    ("draft", "path"),
    [
        (_draft(dedupe_key=""), "dedupeKey"),
        (_draft(dedupe_key="x" * 201), "dedupeKey"),
        (_draft(kind="Micro"), "kind"),
        (_draft(expires_at="demain"), "expiresAt"),
    ],
    ids=["empty-dedupe", "long-dedupe", "bad-kind", "bad-expiry"],
)
def test_validate_draft_refuses_before_any_write(draft: ActionDraft, path: str) -> None:
    with pytest.raises(DraftError) as caught:
        validate_draft(_definition(), draft, "tu", "Europe/Paris")
    assert caught.value.code == "VALIDATION_FAILED"
    assert caught.value.errors[0]["path"] == path


def test_validate_draft_normalises_the_expiration() -> None:
    decision = validate_draft(
        _definition(), _draft(expires_at="2026-11-12T10:00:00+01:00"), "tu", "Europe/Paris"
    )
    assert decision.payload["expiresAt"] == "2026-11-12T09:00:00.000Z"


def test_the_href_of_a_notification_must_be_an_internal_path() -> None:
    from learny.engagement.domain.automations import NotificationDraft

    draft = _draft(notification=NotificationDraft(type="new_gap", href="evil.example"))
    with pytest.raises(DraftError) as caught:
        validate_draft(_definition(), draft, "tu", "Europe/Paris")
    assert caught.value.errors[0]["path"] == "notification.href"


# --- global pause -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "case", ORACLE["pause"]["summaries"], ids=lambda case: f"{case['kind']}-{case['tone']}-{case['enabled']}"
)
def test_pause_summary_is_the_journal_line(case: dict[str, Any]) -> None:
    assert pause_summary(case["kind"], "2026-11-20", case["enabled"], case["tone"]) == case["text"]


@pytest.mark.parametrize("case", ORACLE["pause"]["endDates"], ids=lambda case: case["endDate"])
def test_pause_end_date_is_a_civil_day_not_before_today(case: dict[str, Any]) -> None:
    result = validate_pause_end_date(case["endDate"], case["localDay"])
    assert result == (None if case["result"]["ok"] else case["result"]["message"])


@pytest.mark.parametrize(
    "case", ORACLE["pause"]["endDateInZone"], ids=lambda case: f"{case['instant']}-{case['timeZone']}"
)
def test_pause_end_date_in_zone_uses_the_profile_zone(case: dict[str, Any]) -> None:
    now = now_of(case["instant"])
    assert pause_end_date_in_zone(now, case["timeZone"], case["days"]) == case["endDate"]


def test_shift_day_crosses_the_year_boundary() -> None:
    assert shift_day("2026-12-31", 1) == "2027-01-01"
