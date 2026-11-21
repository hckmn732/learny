"""The `LlmGateway` protocol and its deterministic mock adapter (SPEC-2201, port of `session.ts`).

The protocol mirrors `session.ts`: `step` returns text and tool calls, `object` returns a value
validated against the caller's schema, `stream` yields text deltas. Live adapters (Anthropic,
OpenAI-compatible) implement the same three calls; this spec ships the protocol, the task table,
BYOK and the mock adapter, and later specs wire the live providers.
"""

from collections.abc import AsyncIterator, Sequence
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


def messages_of(input: StepInput) -> list[dict[str, Any]]:
    """The fixture selection reads the messages only: system parts never carry a marker."""
    return [dict(message) for message in input.messages]


class MockGateway:
    """Plays the committed fixtures: no network, no clock, deterministic selection."""

    def __init__(self, registry: Sequence[RegisteredFixture]) -> None:
        self._registry = tuple(registry)

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
            if isinstance(step, TextStep):
                return StepOutput(
                    text=step.text,
                    finish_reason=step.finishReason,
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
                try:
                    return schema.model_validate(step.object)
                except ValidationError as error:
                    raise AppError("INVALID_OUTPUT") from error
            if isinstance(step, TextStep):
                try:
                    return schema.model_validate_json(step.text)
                except ValidationError as error:
                    raise AppError("INVALID_OUTPUT") from error
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
