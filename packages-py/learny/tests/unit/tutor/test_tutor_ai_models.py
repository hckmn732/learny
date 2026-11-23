"""[SPEC-2204] BYOK projections, catalogue, discovery and compatibility probes (unit).

Ports of the pure helpers of `packages/services/src/ai/{credentials-service,qualify-model}.ts`,
`packages/services/src/parametres-modeles-d-ia.ts` and `packages/llm/src/{providers/catalog,
discover-models,qualification/compatibility}.ts`: the fakes are replaced by the committed mock
fixtures, and nothing here opens a socket (ADR-0048).
"""

import json
from datetime import datetime
from typing import Any

import pytest
from learny.platform.llm.catalog import AI_PROVIDERS, provider_region
from learny.platform.llm.credentials import MASK_BULLETS, mask_key
from learny.platform.llm.discovery import (
    chat_model_ids_of,
    discover_provider_models,
    endpoint_of,
    headers_of,
    llm_mode,
    mock_models,
)
from learny.platform.llm.gateway import MockGateway
from learny.platform.llm.mock import load_registry
from learny.platform.llm.qualification import (
    COMPATIBILITY_PROMPT_ID,
    COMPATIBILITY_TIMEOUT_MS,
    QUALIFICATION_PROMPT_ID,
    evaluate_task_compatibility,
    is_compatibility_scenario,
    is_qualification_scenario,
    parse_compatibility,
    parse_report,
    qualification_registry,
)
from learny.platform.llm.tasks import AiTask
from learny.shared.clock import FixedClock
from learny.shared.locale_fr import ai as texts
from learny.shared.time import parse_iso
from learny.tutor.domain.ai_credentials import (
    create_body_issues,
    credential_dto,
    discover_body_issues,
    iso_of,
    models_update_issues,
    record_of,
    string_list,
    trimmed,
)
from learny.tutor.domain.ai_models import (
    build_models_state,
    legacy_qualification_status,
    model_options_for_task,
    model_qualified_for_task,
    pending_compatibility,
    provider_card_of,
    provider_failure_of,
    qualification_report_of,
    task_capabilities,
    task_compatibility_state_of,
    task_state_of,
    unavailable_reason,
)

pytestmark = pytest.mark.spec("SPEC-2204")

FIXED = parse_iso("2026-11-11T12:20:00Z")
USER = "11111111-1111-4111-8111-111111111111"
CREDENTIAL = "22222222-2222-4222-8222-222222222222"
MODEL = "gpt-5-mini"
PROBE_MODEL_VERSION = "mock:compatibility-tutor-success"


def report_of(status: str = "qualified", capabilities: dict[str, bool] | None = None) -> dict[str, Any]:
    """A qualification report the contract accepts: four steps and thirteen bricks."""
    proven = {
        "tools": True,
        "structured": True,
        "web_search": True,
        "passage_refs": True,
        "vision": True,
    }
    if capabilities is not None:
        proven.update(capabilities)
    return {
        "id": "33333333-3333-4333-8333-333333333333",
        "credentialId": CREDENTIAL,
        "modelId": MODEL,
        "provider": "openai",
        "status": status,
        "startedAt": iso_of(FIXED),
        "finishedAt": iso_of(FIXED),
        "durationMs": 0,
        "modelVersion": "mock:qualification-success",
        "steps": [
            {"step": step, "status": "passed", "durationMs": 0, "errorCode": None, "modelVersion": "m"}
            for step in ("connection", "tools", "structured", "bricks")
        ],
        "bricks": [
            {"type": f"brick-{index}", "status": "passed", "durationMs": 0, "errorCode": None, "issues": []}
            for index in range(13)
        ],
        "capabilities": proven,
    }


def credential(**overrides: Any) -> dict[str, Any]:
    """One credential row as the queries return it."""
    row: dict[str, Any] = {
        "id": CREDENTIAL,
        "provider": "anthropic",
        "label": "Cle perso",
        "base_url": None,
        "model_ids": ["model-sonnet-4-5"],
        "key_last4": "abcd",
        "status": "qualified",
        "qualification": {"keyPrefix": "sk-ant"},
        "outside_eu": True,
        "qualified_at": datetime(2026, 11, 10, 10, 0, tzinfo=FIXED.tzinfo),
        "created_at": datetime(2026, 11, 9, 10, 0, tzinfo=FIXED.tzinfo),
    }
    row.update(overrides)
    return row


def test_the_provider_catalogue_projects_the_region_and_the_warning() -> None:
    assert set(AI_PROVIDERS) == {
        "anthropic",
        "openai",
        "mistral",
        "deepseek",
        "openai_compatible",
        "local",
    }
    assert provider_region("anthropic").outside_eu is True
    assert provider_region("mistral").outside_eu is False
    assert provider_region("local").data_note == texts.LOCAL_NOTE
    assert provider_region("openai_compatible").provider_label == texts.COMPATIBLE_LABEL
    assert provider_region("deepseek").default_label == texts.DEEPSEEK_LABEL
    with pytest.raises(KeyError):
        provider_region("unknown")


def test_the_public_dto_only_carries_the_mask_and_the_region() -> None:
    dto = credential_dto(credential())
    assert dto["keyMasked"] == f"sk-ant-{MASK_BULLETS}abcd"
    assert dto["providerLabel"] == texts.ANTHROPIC_LABEL
    assert dto["outsideEu"] is True
    assert dto["dataNote"] == texts.OUTSIDE_EU_NOTE
    assert dto["connectionStatus"] == "unknown"
    assert dto["qualifiedAt"] == "2026-11-10T10:00:00.000Z"
    assert dto["createdAt"] == "2026-11-09T10:00:00.000Z"
    assert "apiKey" not in json.dumps(dto)
    assert "encryptedKey" not in json.dumps(dto)


def test_a_key_without_an_alphabetic_prefix_is_masked_with_bullets_only() -> None:
    dto = credential_dto(credential(qualification={"connection": {"status": "connected"}}))
    assert dto["keyMasked"] == f"{MASK_BULLETS}abcd"
    assert dto["connectionStatus"] == "connected"


def test_a_local_key_has_no_mask_and_no_outside_eu_flag() -> None:
    dto = credential_dto(credential(provider="local", key_last4=None, qualification={}))
    assert dto["keyMasked"] is None
    assert dto["outsideEu"] is False
    assert dto["dataNote"] == texts.LOCAL_NOTE


def test_the_row_helpers_read_jsonb_and_text_arrays() -> None:
    assert record_of('{"a": 1}') == {"a": 1}
    assert record_of("not json") == {}
    assert record_of([1, 2]) == {}
    assert string_list("{a,b}") == ["a", "b"]
    assert string_list(["a", 2]) == ["a", "2"]
    assert trimmed("  value ") == "value"


def test_the_creation_refinements_are_the_zod_ones() -> None:
    assert create_body_issues({"provider": "openai", "modelIds": [MODEL], "apiKey": "k" * 8}) is None
    missing_key = create_body_issues({"provider": "openai", "modelIds": [MODEL]})
    assert missing_key == [{"path": "body.apiKey", "message": texts.API_KEY_REQUIRED}]
    duplicate = create_body_issues({"provider": "openai", "modelIds": [MODEL, MODEL], "apiKey": "k" * 8})
    assert duplicate == [{"path": "body.modelIds", "message": texts.MODEL_IDS_UNIQUE}]
    refused_url = create_body_issues(
        {"provider": "openai", "modelIds": [MODEL], "apiKey": "k" * 8, "baseUrl": "https://x.test"}
    )
    assert refused_url == [{"path": "body.baseUrl", "message": texts.BASE_URL_NOT_ALLOWED}]
    blank_label = create_body_issues(
        {"provider": "openai", "modelIds": [MODEL], "apiKey": "k" * 8, "label": "   "}
    )
    assert blank_label is not None
    assert blank_label[0]["path"] == "body.label"
    null_label = create_body_issues(
        {"provider": "openai", "modelIds": [MODEL], "apiKey": "k" * 8, "label": None}
    )
    assert null_label is not None
    assert null_label[0]["path"] == "body.label"


def test_the_discovery_and_models_refinements() -> None:
    assert discover_body_issues({"provider": "openai", "apiKey": "k" * 8}) is None
    missing = discover_body_issues({"provider": "openai"})
    assert missing == [{"path": "body.apiKey", "message": texts.API_KEY_REQUIRED}]
    missing_url = discover_body_issues({"provider": "local"})
    assert missing_url == [{"path": "body.baseUrl", "message": texts.BASE_URL_REQUIRED}]
    assert models_update_issues({"action": "clear", "task": "tutor"}) is None
    blank = models_update_issues({"action": "assign", "task": "tutor", "modelId": "  "})
    assert blank is not None
    assert blank[0]["path"] == "body.modelId"


async def test_the_simulated_discovery_never_opens_a_socket() -> None:
    async def impossible(url: str, headers: Any) -> tuple[int, Any]:
        raise AssertionError("the mock mode must not reach the network")

    for provider in AI_PROVIDERS:
        assert mock_models(provider)

    answer = await discover_provider_models("openai", api_key="k" * 8, fetcher=impossible)
    assert answer == mock_models("openai")
    assert llm_mode({"LLM_MODE": "live"}) == "live"
    assert llm_mode({"LLM_MODE": ""}) == "mock"


def test_the_provider_catalogue_answer_is_filtered_and_sorted() -> None:
    payload = {
        "data": [
            {"id": "gpt-5.5"},
            {"id": "gpt-5.5"},
            {"id": "text-embedding-3-small"},
            {"id": "whisper-1"},
            {"id": "gpt-4o", "modalities": ["audio"]},
            {"id": "gpt-5-mini", "capabilities": {"completionChat": True}},
            {"id": "babbage-002"},
            {"id": "bad id"},
            {"model": "named-model"},
            "raw-string",
            {"name": "another-model", "object": "model"},
        ]
    }
    assert chat_model_ids_of(payload) == [
        "another-model",
        "gpt-5-mini",
        "gpt-5.5",
        "named-model",
        "raw-string",
    ]
    assert chat_model_ids_of({"models": [{"id": "x", "endpoint": "/embeddings"}]}) == []
    assert chat_model_ids_of(None) == []


def test_the_endpoints_and_headers_match_the_typescript_backend() -> None:
    assert endpoint_of("anthropic") == "https://api.anthropic.com/v1/models"
    assert endpoint_of("deepseek") == "https://api.deepseek.com/models"
    assert endpoint_of("local", "http://localhost:11434/v1/") == "http://localhost:11434/v1/models"
    assert endpoint_of("openai_compatible", "https://x.test") == "https://x.test/v1/models"
    assert headers_of("anthropic", "k")["x-api-key"] == "k"
    assert headers_of("anthropic", "k")["anthropic-version"] == "2023-06-01"
    assert headers_of("openai", "k")["Authorization"] == "Bearer k"
    assert headers_of("local") == {"Accept": "application/json"}


async def test_the_live_discovery_branch_uses_the_injected_transport() -> None:
    seen: dict[str, Any] = {}

    async def fetcher(url: str, headers: Any) -> tuple[int, Any]:
        seen["url"] = url
        seen["headers"] = dict(headers)
        return 200, {"data": [{"id": "model-b"}, {"id": "model-a"}]}

    async def failing(url: str, headers: Any) -> tuple[int, Any]:
        return 401, {}

    ids = await discover_provider_models("openai", api_key="secret", mode="live", fetcher=fetcher)
    assert ids == ["model-a", "model-b"]
    assert seen["url"] == "https://api.openai.com/v1/models"
    assert seen["headers"]["Authorization"] == "Bearer secret"

    with pytest.raises(RuntimeError):
        await discover_provider_models("openai", mode="live", fetcher=failing)


def test_task_capabilities_come_from_the_single_task_table() -> None:
    assert task_capabilities("tutor") == ["tools", "structured"]
    assert task_capabilities("light") == ["structured", "vision"]
    row = {"model_ids": [MODEL], "status": "untested", "qualification": {}}
    assert model_qualified_for_task(row, MODEL, ["tools", "structured"]) is True
    assert model_qualified_for_task(row, "other", ["tools"]) is False
    assert unavailable_reason(None, MODEL, ["tools"]) == "credential_not_qualified"
    assert unavailable_reason(row, "other", ["tools"]) == "personal_model_missing"
    assert unavailable_reason(row, MODEL, ["tools"]) is None


def test_the_options_and_the_pills_follow_the_qualification_report() -> None:
    one = credential(model_ids=[MODEL])
    assert model_options_for_task("tutor", [one])[0]["label"] == texts.personal_label(
        texts.ANTHROPIC_LABEL, None
    )
    two = credential(model_ids=[MODEL, "other"])
    options = model_options_for_task("tutor", [two])
    assert [option["modelId"] for option in options] == [MODEL, "other"]
    assert options[1]["label"] == texts.personal_label(texts.ANTHROPIC_LABEL, "other")
    assert options[0]["qualificationStatus"] == "qualified"

    failed = credential(status="failed")
    assert legacy_qualification_status(failed, MODEL, ["tools"]) == "unqualified"
    unproven = credential(qualification={"models": {MODEL: report_of(capabilities={"structured": False})}})
    assert legacy_qualification_status(unproven, MODEL, ["tools", "structured"]) == "unqualified"
    legacy = credential(qualification={})
    assert legacy_qualification_status(legacy, MODEL, ["tools"]) == "qualified"


def test_the_task_row_reports_no_model_then_a_chosen_one() -> None:
    empty = task_state_of("tutor", None, [])
    assert empty["available"] is False
    assert empty["unavailableReason"] == "no_model_selected"
    assert empty["modelId"] is None

    deleted = task_state_of("tutor", {"task": "tutor", "credential_id": None, "model_id": MODEL}, [])
    assert deleted["unavailableReason"] == "credential_not_qualified"
    assert deleted["providerLabel"] == texts.PERSONAL_MODEL_LABEL

    assignment = {"task": "tutor", "credential_id": CREDENTIAL, "model_id": MODEL}
    chosen = task_state_of("tutor", assignment, [credential(model_ids=[MODEL])])
    assert chosen["available"] is True
    assert chosen["provider"] == "anthropic"
    assert chosen["compatibility"] == pending_compatibility(CREDENTIAL, MODEL, "tutor")
    assert chosen["compatibility"]["status"] == "pending"


def test_a_stored_compatibility_is_read_back_from_the_qualification_column() -> None:
    report = {
        "credentialId": CREDENTIAL,
        "modelId": MODEL,
        "task": "tutor",
        "status": "compatible",
        "checkedAt": iso_of(FIXED),
        "durationMs": 0,
        "requiredCapabilities": ["tools", "structured"],
        "reserveCodes": [],
        "reasons": [],
    }
    qualification = {"compatibilities": {f"{CREDENTIAL}:{MODEL}:tutor": report}}
    state = task_compatibility_state_of(qualification, CREDENTIAL, MODEL, "tutor")
    assert state["status"] == "compatible"
    assert parse_compatibility({"status": "pending"}) is None
    assert parse_compatibility(report) == report


def test_the_provider_card_exposes_the_failure_without_prompt_or_key() -> None:
    failed = report_of(status="failed")
    failed["steps"][1]["status"] = "failed"
    failed["bricks"][2]["status"] = "failed"
    qualification = {
        "lastRunId": failed["id"],
        "models": {MODEL: failed},
        "keyPrefix": "sk",
    }
    card = provider_card_of(credential(qualification=qualification, status="failed"))
    assert card["failure"] == {"step": "tools", "brickType": None}
    assert card["status"] == "unqualified"
    assert card["qualifiedAt"] == "2026-11-10T10:00:00.000Z"
    assert card["models"] == ["model-sonnet-4-5"]
    assert qualification_report_of(qualification, MODEL) is not None
    assert qualification_report_of(qualification, "absent") is None

    failed["steps"][1]["status"] = "passed"
    failed["steps"][3]["status"] = "failed"
    assert provider_failure_of({"models": {MODEL: failed}}) == {
        "step": "bricks",
        "brickType": "brick-2",
    }
    assert provider_failure_of({}) is None


def test_the_whole_tab_is_built_in_the_mockup_order() -> None:
    state = build_models_state([credential(model_ids=[MODEL])], [], FIXED)
    assert [task["task"] for task in state["tasks"]] == [
        "programme",
        "course",
        "gaps",
        "tutor",
        "light",
    ]
    assert len(state["providers"]) == 1
    assert state["updatedAt"] == iso_of(FIXED)
    assert all(task["available"] is False for task in state["tasks"])


def test_parse_report_rejects_a_truncated_report() -> None:
    assert parse_report(report_of()) is not None
    broken = report_of()
    broken["bricks"] = broken["bricks"][:-1]
    assert parse_report(broken) is None
    assert parse_report(None) is None


def _probe_session(task: AiTask, scenario: str) -> Any:
    """A session over the qualification fixtures, like the one the use case opens."""
    return MockGateway(load_registry()).session(
        task,
        COMPATIBILITY_PROMPT_ID,
        scenario=scenario,
        fixtures=qualification_registry(),
    )


async def test_a_compatible_task_proves_every_required_capability() -> None:
    report = await evaluate_task_compatibility(
        credential_id=CREDENTIAL,
        model_id=MODEL,
        task="tutor",
        clock=FixedClock(FIXED),
        session=_probe_session("tutor", "compatibility-tutor-success"),
        timeout_ms=COMPATIBILITY_TIMEOUT_MS,
    )
    assert report["status"] == "compatible"
    assert report["requiredCapabilities"] == ["tools", "structured"]
    assert report["reserveCodes"] == []
    assert report["reasons"] == []
    assert report["checkedAt"] == iso_of(FIXED)
    assert report["durationMs"] == 0


async def test_the_light_task_consumes_its_two_steps_in_order() -> None:
    report = await evaluate_task_compatibility(
        credential_id=CREDENTIAL,
        model_id=MODEL,
        task="light",
        clock=FixedClock(FIXED),
        session=_probe_session("light", "compatibility-light-success"),
    )
    assert report["status"] == "compatible"
    assert report["requiredCapabilities"] == ["structured", "vision"]


async def test_an_unreliable_structured_output_is_a_reserve() -> None:
    report = await evaluate_task_compatibility(
        credential_id=CREDENTIAL,
        model_id=MODEL,
        task="tutor",
        clock=FixedClock(FIXED),
        session=_probe_session("tutor", "compatibility-tutor-reserve"),
    )
    assert report["status"] == "reserve"
    assert report["reserveCodes"] == ["STRUCTURED_UNRELIABLE"]
    assert report["reasons"] == [
        {"code": "STRUCTURED_UNRELIABLE", "message": texts.RESERVE_STRUCTURED_UNRELIABLE}
    ]


def test_the_scenario_helpers_recognise_the_committed_fixtures() -> None:
    assert is_qualification_scenario("qualification-success") is True
    assert is_qualification_scenario("compatibility-tutor-success") is False
    assert is_compatibility_scenario("compatibility-light-success") is True
    assert any(entry.fixture.promptId == QUALIFICATION_PROMPT_ID for entry in qualification_registry())
    assert any(entry.fixture.task == "tutor" for entry in qualification_registry())
    assert mask_key("abcd", "sk") == f"sk-{MASK_BULLETS}abcd"
