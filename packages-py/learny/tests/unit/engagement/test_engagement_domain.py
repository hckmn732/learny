"""[SPEC-2205] Pure rules of the engagement domain replayed against the TypeScript oracle.

The fixture `engagement_domain.json` is produced by `corepack pnpm exec tsx
tools/engagement/oracle.mjs`, which runs the TypeScript implementation on the same inputs: the
pytest assertions compare the Python port to the source of truth, never to a hand-written
expectation (ADR-2008, CA-3).
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from learny.engagement.domain.quiet import QuietHours, is_quiet_hours, next_outside_quiet_hours
from learny.engagement.domain.routing import DeliverySettings, decide_delivery
from learny.engagement.domain.templates import (
    NOTIFICATION_TEMPLATES,
    NOTIFICATION_TYPES,
    channels_of,
    clamp_body,
    clamp_title,
    render_notification,
)
from learny.shared.time import parse_iso, to_epoch_ms, to_iso, user_weekday

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures"
ORACLE: dict[str, Any] = json.loads((FIXTURES / "engagement_domain.json").read_text(encoding="utf-8"))

SETTINGS_FIELDS = {
    "channelEmail": "channel_email",
    "channelPush": "channel_push",
    "typeRevision": "type_revision",
    "typeValidation": "type_validation",
    "typeCourse": "type_course",
    "typeGap": "type_gap",
    "typePlanning": "type_planning",
    "typeRelaunch": "type_relaunch",
    "quietStart": "quiet_start",
    "quietEnd": "quiet_end",
    "weekendQuiet": "weekend_quiet",
    "maxPerDay": "max_per_day",
}


def to_settings(values: dict[str, Any]) -> DeliverySettings:
    """Maps the camelCase oracle settings onto the Python dataclass."""
    return DeliverySettings(**{SETTINGS_FIELDS[key]: value for key, value in values.items()})


BASE = to_settings(ORACLE["baseSettings"])
# The three injected instants of the oracle; the fixture keeps the name, not the instant.
NOWS = {
    "AT": "2026-11-11T12:20:00.000Z",
    "NIGHT": "2026-11-11T22:30:00.000Z",
    "SATURDAY": "2026-11-14T10:00:00.000Z",
}
VARIANTS = {name: to_settings(values) for name, values in ORACLE["variants"].items()}


def test_types_match_the_oracle() -> None:
    assert list(NOTIFICATION_TYPES) == ORACLE["types"]


@pytest.mark.parametrize("case", ORACLE["clamps"], ids=lambda case: f"{case['kind']}-{len(case['input'])}")
def test_clamp_matches_the_typescript_implementation(case: dict[str, Any]) -> None:
    clamped = clamp_title(case["input"]) if case["kind"] == "title" else clamp_body(case["input"])
    assert clamped == case["out"]


@pytest.mark.parametrize(
    "case",
    ORACLE["templates"],
    ids=lambda case: f"{case['type']}-{case['tone']}-{case['dataSet']}",
)
def test_template_rendering_matches_the_typescript_implementation(case: dict[str, Any]) -> None:
    data = TEMPLATE_DATA[case["dataSet"]]
    rendered = render_notification(case["type"], data, case["tone"])
    assert rendered["icon"] == case["icon"]
    assert rendered["title"] == case["title"]
    assert rendered["body"] == case["body"]
    assert rendered["href"] == case["href"]
    assert list(channels_of(case["type"])) == case["channels"]
    assert NOTIFICATION_TEMPLATES[case["type"]].email_template == case["emailTemplate"]


TEMPLATE_DATA: dict[str, dict[str, Any]] = {
    "empty": {},
    "full": {
        "moduleTitle": "Le module Photosynth\u00e8se",
        "modulePosition": 3,
        "score": 87.6,
        "nextModulePosition": 4,
        "nextModuleTitle": "Respiration cellulaire",
        "formationId": "0b6b6f0e-3f0c-4a1f-9f0e-1f2a3b4c5d6e",
        "formationTitle": "La biologie v\u00e9g\u00e9tale",
        "notionTitle": "La chlorophylle",
        "title": "S\u00e9ance de r\u00e9vision",
        "when": "demain \u00e0 09:00",
        "minutes": 25,
        "notions": 12,
        "percent": 82,
        "days": 5,
        "taskLabel": "La g\u00e9n\u00e9ration du cours",
        "groupTitle": "Les botanistes",
        "label": "100 notions retenues",
        "studyLabel": "3 h 15",
        "href": "/formations/0b6b6f0e-3f0c-4a1f-9f0e-1f2a3b4c5d6e/programme",
        "activityCount": 4,
        "plannedLabel": "1 h 30",
    },
    "overrides": {
        "titleOverride": "Titre impos\u00e9",
        "bodyOverride": "Corps impos\u00e9 par le producteur.",
        "summary": "R\u00e9sum\u00e9 impos\u00e9 " + "de la s\u00e9ance replac\u00e9e.",
        "isLastModule": True,
    },
    "hostile": {
        "href": "//evil.example/path",
        "formationId": "not-a-uuid",
        "moduleTitle": "   ",
        "score": 0,
        "minutes": "vingt",
        "activityCount": -3,
        "plannedLabel": "",
    },
}


@pytest.mark.parametrize(
    "case",
    ORACLE["routing"],
    ids=lambda case: f"{case['nowName']}-{case['channel']}-{case['type']}-{case['variant']}-{case['extra']}",
)
def test_delivery_decision_matches_the_typescript_implementation(case: dict[str, Any]) -> None:
    decision = decide_delivery(
        channel=case["channel"],
        notification_type=case["type"],
        settings=VARIANTS[case["variant"]],
        now=parse_iso(NOWS[case["nowName"]]),
        time_zone="Europe/Paris",
        sent_today=case["sentToday"],
        eligible_at=None if case["eligibleAt"] is None else parse_iso(case["eligibleAt"]),
        read=case["read"],
        stale_at=None if case["staleAt"] is None else parse_iso(case["staleAt"]),
    )
    assert decision.status == case["status"]
    assert decision.error == case["error"]
    expected = case["scheduledFor"]
    assert (None if decision.scheduled_for is None else to_iso(decision.scheduled_for)) == expected


@pytest.mark.parametrize(
    "case",
    ORACLE["quiet"],
    ids=lambda case: f"{case['window']['start']}-{case['window']['end']}-{case['instant']}",
)
def test_quiet_hours_match_the_typescript_implementation(case: dict[str, Any]) -> None:
    window = QuietHours(time_zone="Europe/Paris", start=case["window"]["start"], end=case["window"]["end"])
    instant = parse_iso(case["instant"])
    assert user_weekday(to_epoch_ms(instant), "Europe/Paris") == case["weekday"]
    assert is_quiet_hours(to_epoch_ms(instant), window) is case["quiet"]
    assert to_iso(instant_from_ms(next_outside_quiet_hours(to_epoch_ms(instant), window))) == case["next"]


def instant_from_ms(milliseconds: int) -> datetime:
    """Aware UTC datetime of epoch milliseconds, for the assertion only."""
    from learny.shared.time import from_epoch_ms

    return from_epoch_ms(milliseconds)


def test_every_type_has_a_template_and_a_tone_pair() -> None:
    assert len(NOTIFICATION_TEMPLATES) == 16
    for key, template in NOTIFICATION_TEMPLATES.items():
        assert template.icon
        assert template.href({}) == "/notifications" or template.href({}).startswith("/")
        assert template.title({}, "vous")
        assert template.title({}, "tu")
        assert template.body({}, "vous")
        assert template.body({}, "tu")
        assert key in NOTIFICATION_TYPES
