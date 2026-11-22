"""The `LlmGateway` protocol and its deterministic mock adapter (SPEC-2201, port of `session.ts`).

The protocol mirrors `session.ts`: `step` returns text and tool calls, `object` returns a value
validated against the caller's schema, `stream` yields text deltas, and `session` opens a session
whose fixture cursor is shared across calls (the qualification probes of SPEC-2204 consume the
steps of one fixture in order, exactly like `LearnMockModel`). Live adapters (Anthropic,
OpenAI-compatible) implement the same four calls; this specification ships the protocol, the task
table, BYOK and the mock adapter, and later specs wire the live providers.
"""

import json
from collections.abc import AsyncIterator, Mapping, Sequence
from typing import Any, Protocol

from pydantic import BaseModel, ValidationError

from learny.platform.llm.mock import (
    ErrorStep,
    FixtureFile,
    ObjectStep,
    RegisteredFixture,
    StreamStep,
    TextStep,
    ToolCallsStep,
    select_fixture,
    strip_mock_markers,
)
from learny.platform.llm.tasks import AiTask
from learny.platform.llm.types import (
    StepInput,
    StepOutput,
    ToolCallOutput,
    Usage,
)
from learny.shared.errors import AppError

# The provider error a simulated error step stands for (mock error kinds -> catalog codes).
ERROR_CODES: dict[str, str] = {
    "refusal": "AI_REFUSED",
    "rate_limit": "AI_RATE_LIMITED",
    "timeout": "AI_TIMEOUT",
    "auth": "AI_KEY_INVALID",
    "server": "AI_PROVIDER_ERROR",
    "context_length": "AI_CONTEXT_TOO_LONG",
    "overloaded": "AI_PROVIDER_ERROR",
}


class LlmSession(Protocol):
    """One session on one prompt: the shape the qualification probes consume (`LlmSession`)."""

    async def step(self, input: StepInput) -> StepOutput: ...

    async def object(self, schema: type[BaseModel], input: StepInput) -> BaseModel: ...

    def stream(self, input: StepInput) -> AsyncIterator[str]: ...


class LlmGateway(Protocol):
    """What the use cases call; the call loop, retries and budgets belong to the caller."""

    async def step(
        self,
        task: AiTask,
        prompt_id: str,
        input: StepInput,
        *,
        scenario: str | None = None,
    ) -> StepOutput: ...

    async def object(
        self,
        task: AiTask,
        prompt_id: str,
        schema: type[BaseModel],
        input: StepInput,
        *,
        scenario: str | None = None,
    ) -> BaseModel: ...

    def stream(
        self,
        task: AiTask,
        prompt_id: str,
        input: StepInput,
        *,
        scenario: str | None = None,
    ) -> AsyncIterator[str]: ...

    def session(
        self,
        task: AiTask,
        prompt_id: str,
        *,
        scenario: str | None = None,
        fixtures: Sequence[RegisteredFixture] | None = None,
    ) -> LlmSession: ...


def messages_of(input: StepInput) -> list[dict[str, Any]]:
    """The fixture selection reads the messages only: system parts never carry a marker."""
    return [dict(message) for message in input.messages]


def fixture_messages(input: StepInput) -> list[dict[str, Any]]:
    """The messages of a session, with binary parts rendered for the fixture selection.

    `select_fixture` serialises the messages to JSON; an image part carries raw bytes (the
    qualification vision probe), which `JSON.stringify` would render as an indexed object.
    """
    return [_json_safe(dict(message)) for message in input.messages]


def _json_safe(value: Any) -> Any:
    if isinstance(value, (bytes, bytearray)):
        return value.hex()
    if isinstance(value, Mapping):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    return value


def step_output(step: Any, fixture: FixtureFile) -> StepOutput:
    """One fixture step as a `step()` answer, or the provider error it stands for."""
    if isinstance(step, TextStep):
        return StepOutput(
            text=step.text,
            finish_reason=step.finishReason,
            usage=_usage(step),
            model_id=f"mock:{fixture.scenario}",
        )
    if isinstance(step, ObjectStep):
        # `mock-model.ts` serialises a structured step as JSON text for `step()`.
        return StepOutput(
            text=json.dumps(step.object, ensure_ascii=False, separators=(",", ":")),
            finish_reason="stop",
            usage=_usage(step),
            model_id=f"mock:{fixture.scenario}",
        )
    if isinstance(step, ToolCallsStep):
        return StepOutput(
            tool_calls=tuple(
                ToolCallOutput(call.toolCallId, call.toolName, call.input) for call in step.toolCalls
            ),
            finish_reason="tool-calls",
            usage=_usage(step),
            model_id=f"mock:{fixture.scenario}",
        )
    if isinstance(step, ErrorStep):
        raise _error(step)
    raise AppError("MOCK_STEPS_EXHAUSTED")


def object_value(step: Any, schema: type[BaseModel]) -> BaseModel:
    """One fixture step as an `object()` answer, validated against the caller's schema."""
    if isinstance(step, ErrorStep):
        raise _error(step)
    if isinstance(step, ObjectStep):
        try:
            return schema.model_validate(step.object)
        except ValidationError as error:
            raise AppError("INVALID_OUTPUT") from error
    if isinstance(step, TextStep):
        try:
            return schema.model_validate_json(step.text)
        except ValidationError as error:
            raise AppError("INVALID_OUTPUT") from error
    raise AppError("INVALID_OUTPUT")


class MockGateway:
    """Plays the committed fixtures: no network, no clock, deterministic selection."""

    def __init__(self, registry: Sequence[RegisteredFixture]) -> None:
        self._registry = tuple(registry)

    @property
    def registry(self) -> tuple[RegisteredFixture, ...]:
        """The fixtures this adapter resolves against, so a session can extend them."""
        return self._registry

    def fixture(
        self,
        task: AiTask,
        prompt_id: str,
        input: StepInput,
        scenario: str | None = None,
    ) -> FixtureFile:
        return select_fixture(
            self._registry,
            task=task,
            prompt_id=prompt_id,
            messages=messages_of(input),
            explicit_scenario=scenario,
        )

    async def step(
        self,
        task: AiTask,
        prompt_id: str,
        input: StepInput,
        *,
        scenario: str | None = None,
    ) -> StepOutput:
        fixture = self.fixture(task, prompt_id, input, scenario)
        for step in fixture.steps:
            if isinstance(step, (TextStep, ObjectStep, ToolCallsStep, ErrorStep)):
                return step_output(step, fixture)
        raise AppError("MOCK_STEPS_EXHAUSTED")

    async def object(
        self,
        task: AiTask,
        prompt_id: str,
        schema: type[BaseModel],
        input: StepInput,
        *,
        scenario: str | None = None,
    ) -> BaseModel:
        fixture = self.fixture(task, prompt_id, input, scenario)
        for step in fixture.steps:
            if isinstance(step, ErrorStep):
                raise _error(step)
            if isinstance(step, ObjectStep):
                return object_value(step, schema)
            if isinstance(step, TextStep):
                return object_value(step, schema)
        raise AppError("MOCK_STEPS_EXHAUSTED")

    async def stream(
        self,
        task: AiTask,
        prompt_id: str,
        input: StepInput,
        *,
        scenario: str | None = None,
    ) -> AsyncIterator[str]:
        fixture = self.fixture(task, prompt_id, input, scenario)
        for step in fixture.steps:
            if isinstance(step, ErrorStep):
                raise _error(step)
            if isinstance(step, StreamStep):
                for chunk in step.chunks:
                    yield chunk
                return
            if isinstance(step, TextStep):
                yield step.text
                return
        raise AppError("MOCK_STEPS_EXHAUSTED")

    def session(
        self,
        task: AiTask,
        prompt_id: str,
        *,
        scenario: str | None = None,
        fixtures: Sequence[RegisteredFixture] | None = None,
    ) -> LlmSession:
        """One session whose fixture steps are consumed in order (`createSession` in TypeScript)."""
        return MockSession(
            self,
            task,
            prompt_id,
            scenario=scenario,
            fixtures=fixtures,
        )


class MockSession:
    """A fixture cursor shared by every call of one session (`LearnMockModel` in TypeScript)."""

    def __init__(
        self,
        gateway: MockGateway,
        task: AiTask,
        prompt_id: str,
        *,
        scenario: str | None = None,
        fixtures: Sequence[RegisteredFixture] | None = None,
    ) -> None:
        self._gateway = gateway
        self._registry = gateway.registry if fixtures is None else tuple(fixtures)
        self._task = task
        self._prompt_id = prompt_id
        self._scenario = scenario
        self._cursors: dict[str, int] = {}

    def _select(self, input: StepInput) -> FixtureFile:
        return select_fixture(
            self._registry,
            task=self._task,
            prompt_id=self._prompt_id,
            messages=fixture_messages(input),
            explicit_scenario=self._scenario,
        )

    def _consume(self, fixture: FixtureFile) -> Any:
        key = f"{fixture.task}/{fixture.scenario}"
        index = self._cursors.get(key, 0)
        if index >= len(fixture.steps):
            raise AppError(
                "MOCK_STEPS_EXHAUSTED",
                f"the fixture {fixture.task}/{fixture.scenario} has no step left",
            )
        step = fixture.steps[index]
        # A provider error is retried by the AI SDK; the same step is served until a real outcome.
        if not (isinstance(step, ErrorStep) and step.error.kind != "refusal"):
            self._cursors[key] = index + 1
        return step

    async def step(self, input: StepInput) -> StepOutput:
        fixture = self._select(input)
        return step_output(self._consume(fixture), fixture)

    async def object(self, schema: type[BaseModel], input: StepInput) -> BaseModel:
        fixture = self._select(input)
        return object_value(self._consume(fixture), schema)

    async def stream(self, input: StepInput) -> AsyncIterator[str]:
        fixture = self._select(input)
        step = self._consume(fixture)
        if isinstance(step, ErrorStep):
            raise _error(step)
        if isinstance(step, StreamStep):
            for chunk in step.chunks:
                yield chunk
            return
        if isinstance(step, TextStep):
            yield step.text
            return
        raise AppError("MOCK_STEPS_EXHAUSTED")


def _usage(step: Any) -> Usage:
    usage = step.usage
    return Usage(
        input_tokens=usage.inputTokens,
        output_tokens=usage.outputTokens,
        cache_read_tokens=usage.cacheReadTokens,
        cache_write_tokens=usage.cacheWriteTokens,
    )


def _error(step: ErrorStep) -> AppError:
    return AppError(ERROR_CODES[step.error.kind], step.error.message)


def strip_markers(input: StepInput) -> StepInput:
    """The prompt a live provider receives: markers never leave the test environment (ET-6)."""
    replacement = strip_mock_markers(input.messages)
    return StepInput(
        system=input.system,
        messages=tuple(replacement),
        tools=input.tools,
        documents=input.documents,
        citations=input.citations,
        web_search=input.web_search,
    )
