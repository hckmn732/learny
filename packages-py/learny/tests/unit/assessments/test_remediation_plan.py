"""[SPEC-2202] Prompt and mock fixture of the remediation plan (SPEC-612 ET-4, ADR-0048).

The structured plan is produced by `learny.platform.llm` with the same task, prompt identifier and
mock fixture as the TypeScript service; the simulated model cannot know the runtime notion
identifiers, so an unknown identifier is aligned on the input order. The selection of the questions
follows the nature of the gap and never replays a seen fingerprint.
"""

import json
from types import SimpleNamespace
from typing import Any, cast

import pytest
from learny.assessments.application import remediation as service
from learny.platform.llm.gateway import MockGateway
from learny.platform.llm.mock import fixtures_directory, load_registry
from learny.shared.locale_fr import assessments as texts
from pydantic import ValidationError

pytestmark = pytest.mark.spec("SPEC-2202")

FIXTURE = fixtures_directory() / "gaps" / "remediation-plan-sap-m3.json"

NOTION_A = "11111111-1111-4111-8111-111111111111"
NOTION_B = "22222222-2222-4222-8222-222222222222"
NOTION_C = "33333333-3333-4333-8333-333333333333"


def gaps() -> list[dict[str, Any]]:
    """Three open gaps, one per documented nature."""
    return [
        {
            "notionId": NOTION_A,
            "label": "Key <vs> piece type",
            "nature": "confusion",
            "natureLabel": "Confusion",
            "evidence": "Confused & mixed up",
        },
        {
            "notionId": NOTION_B,
            "label": "Parallel ledger",
            "nature": "misunderstanding",
            "natureLabel": "Misunderstanding",
            "evidence": "Incomplete answer",
        },
        {
            "notionId": NOTION_C,
            "label": "Entry practice",
            "nature": "application",
            "natureLabel": "Application",
            "evidence": "Right definition, failed exercise",
        },
    ]


def test_the_prompt_is_the_typescript_one_with_escaped_gap_data() -> None:
    step = service.plan_prompt(gaps())

    assert step.system[0].text == texts.REMEDIATION_SYSTEM_PROMPT
    assert step.system[0].cache is True
    content = step.messages[0]["content"]
    assert texts.REMEDIATION_USER_LINE in content
    assert (
        '<gap id="11111111-1111-4111-8111-111111111111" nature="confusion">'
        "Key &lt;vs&gt; piece type \u2014 Confused &amp; mixed up</gap>"
    ) in content
    assert content.count("<gap id=") == 3


async def test_the_mock_fixture_is_the_typescript_one_and_aligns_the_notions() -> None:
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    expected = fixture["steps"][0]["object"]["items"]
    deps = cast(Any, SimpleNamespace(llm=MockGateway(load_registry())))

    plan = await service.default_remediation_plan_generator(deps, gaps(), None)

    assert len(plan["items"]) == 3
    assert [item["notionId"] for item in plan["items"]] == [NOTION_A, NOTION_B, NOTION_C]
    assert [item["textMd"] for item in plan["items"]] == [item["textMd"] for item in expected]
    assert service.RemediationPlan.model_validate(plan)


def test_the_plan_is_bounded_like_the_contract() -> None:
    item = {
        "notionId": NOTION_A,
        "textMd": "A short explanation of the rule.",
        "proposal": "one question opposing the two notions.",
        "excerptCitationIds": [],
    }

    with pytest.raises(ValidationError):
        service.RemediationPlan.model_validate({"items": []})
    with pytest.raises(ValidationError):
        service.RemediationPlan.model_validate({"items": [item] * 4})
    with pytest.raises(ValidationError):
        service.RemediationPlan.model_validate({"items": [{**item, "textMd": "  "}]})
    with pytest.raises(ValidationError):
        service.RemediationPlan.model_validate({"items": [{**item, "extra": True}]})


def test_the_fallback_text_is_used_when_the_tutor_is_unavailable() -> None:
    rows = [
        {
            "notion_id": NOTION_A,
            "label": "Key vs piece type",
            "nature": "confusion",
            "confused_with": NOTION_B,
        }
    ]

    items = service.plan_items_of(rows, None)

    assert len(items) == 1
    assert "Key vs piece type" in items[0]["textMd"]
    assert texts.REMEDIATION_FALLBACK_NOTICE in items[0]["textMd"]
    assert items[0]["proposal"] == texts.GAP_PROPOSALS["confusion"]


def test_the_question_selection_follows_the_gap_nature_and_skips_seen_fingerprints() -> None:
    gap = {
        "notion_id": NOTION_A,
        "label": "Key vs piece type",
        "nature": "confusion",
        "confused_with": NOTION_B,
    }
    bank = [
        {
            "brick_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "version_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "type": "choice_question",
            "notion_ids": [NOTION_A],
            "payload": {"stem": "Which one?"},
            "fingerprint": "choice-fingerprint",
        },
        {
            "brick_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            "version_id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            "type": "matching",
            "notion_ids": [NOTION_A],
            "payload": {"stem": f"Match {NOTION_B}"},
            "fingerprint": "matching-fingerprint",
        },
        {
            "brick_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            "version_id": "ffffffff-ffff-4fff-8fff-ffffffffffff",
            "type": "cloze",
            "notion_ids": [NOTION_A],
            "payload": {"stem": "Fill the gap"},
            "fingerprint": "cloze-fingerprint",
        },
    ]

    selection = service.select_questions([gap], bank, set())
    assert [entry["question"]["type"] for entry in selection] == ["matching", "choice_question"]

    seen = service.select_questions([gap], bank, {"matching-fingerprint"})
    assert [entry["question"]["type"] for entry in seen] == ["choice_question", "cloze"]


def test_a_question_of_another_notion_is_never_selected() -> None:
    gap = {"notion_id": NOTION_C, "label": "Ledger", "nature": "application", "confused_with": None}
    bank = [
        {
            "brick_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "version_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "type": "choice_question",
            "notion_ids": [NOTION_A],
            "payload": {"stem": "Other notion"},
            "fingerprint": None,
        }
    ]

    assert service.select_questions([gap], bank, set()) == []
