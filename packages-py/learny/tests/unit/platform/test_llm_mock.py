"""[SPEC-2201] The task table and the deterministic fixture selection of `learny.platform.llm`."""

from typing import Any

import pytest
from learny.platform.llm import (
    STREAMING_OUTPUT_THRESHOLD,
    TASK_CONFIG,
    MockGateway,
    StepInput,
    estimate_tokens,
    load_registry,
    marker_scenario,
    needs_provider_streaming,
    select_fixture,
    strip_mock_markers,
)
from learny.shared.errors import AppError
from pydantic import BaseModel, ConfigDict

pytestmark = pytest.mark.spec("SPEC-2201")

REGISTRY = load_registry()


class AnyObject(BaseModel):
    model_config = ConfigDict(extra="allow")


def test_the_task_table_is_the_typescript_one() -> None:
    budgets = {
        task: (config.effort, config.max_output_tokens, config.timeout_ms)
        for task, config in TASK_CONFIG.items()
    }

    assert budgets == {
        "programme": ("high", 32_000, 180_000),
        "course": ("medium", 64_000, 300_000),
        "gaps": ("medium", 16_000, 120_000),
        "tutor": ("low", 8_000, 60_000),
        "light": ("low", 4_000, 30_000),
    }
    assert TASK_CONFIG["programme"].capabilities == ("tools", "structured", "web_search")


def test_only_the_long_tasks_stream_on_the_provider_side() -> None:
    assert STREAMING_OUTPUT_THRESHOLD == 16_000
    assert needs_provider_streaming("programme")
    assert needs_provider_streaming("course")
    assert not needs_provider_streaming("gaps")
    assert not needs_provider_streaming("tutor")


def test_the_token_estimate_is_four_characters_per_token() -> None:
    assert estimate_tokens("") == 0
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("abcde") == 2


def test_a_marker_selects_the_scenario_of_the_message() -> None:
    messages = [{"role": "user", "content": "Explique-moi [[mock:demo-stream]] simplement"}]

    assert marker_scenario(messages) == "demo-stream"
    assert strip_mock_markers(messages) == [{"role": "user", "content": "Explique-moi  simplement"}]
    assert marker_scenario([{"role": "user", "content": "sans marqueur"}]) is None


def test_the_marker_is_read_in_text_parts_too() -> None:
    messages = [
        {
            "role": "user",
            "content": [{"type": "text", "text": "[[mock:demo-tool-call]]"}, {"type": "image"}],
        }
    ]

    assert marker_scenario(messages) == "demo-tool-call"
    stripped = strip_mock_markers(messages)
    assert stripped[0]["content"][0] == {"type": "text", "text": ""}


def test_an_explicit_scenario_wins_even_over_a_marker() -> None:
    fixture = select_fixture(
        REGISTRY,
        task="tutor",
        prompt_id="tutor.demo",
        messages=[{"role": "user", "content": "[[mock:demo-stream]]"}],
        explicit_scenario="demo-refusal",
    )

    assert fixture.scenario == "demo-refusal"


def test_a_marker_selects_the_matching_fixture() -> None:
    fixture = select_fixture(
        REGISTRY,
        task="tutor",
        prompt_id="tutor.demo",
        messages=[{"role": "user", "content": "[[mock:demo-stream]]"}],
    )

    assert fixture.scenario == "demo-stream"
    assert [step.type for step in fixture.steps] == ["stream"]


def test_the_default_file_of_a_prompt_is_the_fallback() -> None:
    fixture = select_fixture(
        REGISTRY,
        task="tutor",
        prompt_id="tutor.demo",
        messages=[{"role": "user", "content": "Bonjour"}],
    )

    assert fixture.scenario == "demo"


def test_a_match_contains_selects_the_fixture() -> None:
    fixture = select_fixture(
        REGISTRY,
        task="light",
        prompt_id="ingest-image",
        messages=[{"role": "user", "content": "[[mock:spec-510-image]]"}],
    )

    assert fixture.scenario == "spec-510-image"


def test_an_unknown_prompt_is_reported_with_the_candidates() -> None:
    with pytest.raises(AppError) as raised:
        select_fixture(
            REGISTRY,
            task="tutor",
            prompt_id="inconnu.consigne",
            messages=[{"role": "user", "content": "Bonjour"}],
        )

    assert raised.value.code == "MOCK_FIXTURE_NOT_FOUND"
    assert "inconnu.consigne" in (raised.value.detail or "")


async def test_the_mock_gateway_plays_a_text_step() -> None:
    gateway = MockGateway(REGISTRY)
    output = await gateway.step(
        "tutor", "tutor.demo", StepInput(messages=({"role": "user", "content": "Bonjour"},))
    )

    assert output.text
    assert output.finish_reason == "stop"
    assert output.model_id.startswith("mock:")


async def test_the_mock_gateway_streams_the_declared_chunks() -> None:
    gateway = MockGateway(REGISTRY)
    input = StepInput(messages=({"role": "user", "content": "[[mock:demo-stream]]"},))
    chunks: list[str] = [chunk async for chunk in gateway.stream("tutor", "tutor.demo", input)]

    assert len(chunks) > 1
    assert "".join(chunks)


async def test_the_mock_gateway_plays_a_tool_call() -> None:
    gateway = MockGateway(REGISTRY)
    input = StepInput(messages=({"role": "user", "content": "[[mock:demo-tool-call]]"},))
    output = await gateway.step("tutor", "tutor.demo", input)

    assert output.finish_reason == "tool-calls"
    assert output.tool_calls


async def test_the_mock_gateway_turns_an_error_step_into_a_catalogue_error() -> None:
    gateway = MockGateway(REGISTRY)
    input = StepInput(messages=({"role": "user", "content": "[[mock:demo-refusal]]"},))

    with pytest.raises(AppError) as raised:
        await gateway.step("tutor", "tutor.demo", input)

    assert raised.value.code == "AI_REFUSED"


async def test_the_mock_gateway_validates_an_object_step_against_the_schema() -> None:
    gateway = MockGateway(REGISTRY)
    value = await gateway.object(
        "tutor",
        "cadrage.cadrage",
        AnyObject,
        StepInput(messages=({"role": "user", "content": "Bonjour"},)),
        scenario="cadrage-sap-q1",
    )

    assert isinstance(value, AnyObject)
    assert value.model_dump()


async def test_the_mock_gateway_reports_an_incompatible_object() -> None:
    class Strict(BaseModel):
        model_config = ConfigDict(extra="forbid")
        impossible: int

    gateway = MockGateway(REGISTRY)
    with pytest.raises(AppError) as raised:
        await gateway.object(
            "tutor",
            "cadrage.cadrage",
            Strict,
            StepInput(messages=({"role": "user", "content": "Bonjour"},)),
            scenario="cadrage-sap-q1",
        )

    assert raised.value.code == "INVALID_OUTPUT"


def test_the_registry_holds_only_model_fixtures() -> None:
    tasks: dict[str, Any] = {}
    for entry in REGISTRY:
        tasks.setdefault(entry.fixture.task, 0)
        tasks[entry.fixture.task] += 1

    assert set(tasks) == set(TASK_CONFIG)
    assert all(entry.path.split("/")[0] == entry.fixture.task for entry in REGISTRY)


def test_a_binary_part_serialises_like_a_typescript_uint8array() -> None:
    # SPEC-510: the image sent to the vision model is a Uint8Array in TypeScript; JSON.stringify
    # writes it as an object of index keys in numeric order, and the selection never fails on it.
    from learny.platform.llm.mock import canonical_json

    serialised = canonical_json([{"b": 1, "a": bytes(range(12))}])

    assert serialised == (
        '[{"a":{"0":0,"1":1,"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"11":11},"b":1}]'
    )
