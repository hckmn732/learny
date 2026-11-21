"""Deterministic fixture selection (SPEC-2201, port of `mock/select.ts` and `mock/fixture-schema.ts`).

Selection order, identical to the TypeScript backend: explicit scenario, the first `[[mock:x]]`
marker in message order, the first fixture of the task whose `promptId` and `match.contains` all
match, then `<promptId>.default.json` and `<basename>.default.json`, then
`MOCK_FIXTURE_NOT_FOUND`. Selection never touches the network (ADR-0153).
"""

import json
import re
from collections.abc import Iterable, Mapping, Sequence
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from learny.platform.llm.tasks import TASK_CONFIG, AiTask
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import MOCK_FIXTURE_NOT_FOUND, MOCK_SCENARIO_TRIED

MOCK_MARKER_PATTERN = re.compile(r"\[\[mock:([a-z0-9]+(?:-[a-z0-9]+)*)\]\]")
SCENARIO_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

MockErrorKind = Literal["refusal", "rate_limit", "timeout", "auth", "server", "context_length", "overloaded"]


class FixtureUsage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    inputTokens: int = Field(default=0, ge=0)
    outputTokens: int = Field(default=0, ge=0)
    cacheReadTokens: int = Field(default=0, ge=0)
    cacheWriteTokens: int = Field(default=0, ge=0)


class FixtureToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid")
    toolCallId: str
    toolName: str
    input: Any = None


class FixtureError(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: MockErrorKind
    message: str


class _Step(BaseModel):
    model_config = ConfigDict(extra="forbid")
    usage: FixtureUsage = Field(default_factory=FixtureUsage)
    latencyMs: int = Field(default=0, ge=0)


class TextStep(_Step):
    type: Literal["text"]
    text: str
    finishReason: Literal["stop", "length", "refusal"] = "stop"


class ToolCallsStep(_Step):
    type: Literal["tool-calls"]
    toolCalls: list[FixtureToolCall] = Field(min_length=1)


class ObjectStep(_Step):
    type: Literal["object"]
    object: Any = None


class StreamStep(_Step):
    type: Literal["stream"]
    chunks: list[str] = Field(min_length=1)


class ErrorStep(_Step):
    type: Literal["error"]
    error: FixtureError


FixtureStep = Annotated[
    TextStep | ToolCallsStep | ObjectStep | StreamStep | ErrorStep,
    Field(discriminator="type"),
]


class FixtureMatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contains: list[str] = Field(min_length=1)


class FixtureFile(BaseModel):
    """One JSON file per task and scenario (ADR-0153 section 1)."""

    model_config = ConfigDict(extra="forbid")
    task: AiTask
    scenario: str
    promptId: str
    promptVersion: int = Field(ge=1)
    description: str
    match: FixtureMatch | None = None
    steps: list[FixtureStep] = Field(min_length=1)


def parse_fixture(value: Any, source: str = "fixture") -> FixtureFile:
    """Parses a fixture and prefixes a failure with its path, for an actionable message."""
    try:
        fixture = FixtureFile.model_validate(value)
    except Exception as error:  # pydantic's message already lists the offending fields
        raise ValueError(f"invalid fixture ({source}): {error}") from error
    if SCENARIO_PATTERN.match(fixture.scenario) is None:
        raise ValueError(f"invalid fixture ({source}): a kebab-case scenario is expected")
    return fixture


class RegisteredFixture(BaseModel):
    """A fixture and its repository path relative to the fixtures directory."""

    model_config = ConfigDict(frozen=True)
    path: str
    fixture: FixtureFile


def fixtures_directory() -> Path:
    """`LLM_FIXTURES_DIR` when set (container), else the checkout's `packages/llm/fixtures`."""
    import os

    override = os.environ.get("LLM_FIXTURES_DIR")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[6] / "packages" / "llm" / "fixtures"


def load_registry(directory: Path | None = None) -> tuple[RegisteredFixture, ...]:
    """Reads every fixture of the directory, sorted by path, like the static registry."""
    root = directory if directory is not None else fixtures_directory()
    entries: list[RegisteredFixture] = []
    # Only the model fixtures are registered (`search/` and `qualification/` have their own shapes).
    for task in TASK_CONFIG:
        for path in sorted((root / task).glob("*.json")):
            relative = path.relative_to(root).as_posix()
            entries.append(
                RegisteredFixture(
                    path=relative,
                    fixture=parse_fixture(json.loads(path.read_text("utf-8")), relative),
                )
            )
    return tuple(sorted(entries, key=lambda entry: entry.path))


def fixtures_for_task(registry: Sequence[RegisteredFixture], task: AiTask) -> tuple[RegisteredFixture, ...]:
    return tuple(entry for entry in registry if entry.fixture.task == task)


def canonical_json(value: Any) -> str:
    """Recursively sorts object keys so two equivalent inputs always serialise identically."""
    return json.dumps(_sorted(value), separators=(",", ":"), ensure_ascii=False)


def _sorted(value: Any) -> Any:
    if isinstance(value, list):
        return [_sorted(item) for item in value]
    if isinstance(value, Mapping):
        return {key: _sorted(value[key]) for key in sorted(value)}
    return value


def texts_of(message: Mapping[str, Any]) -> list[str]:
    content = message.get("content")
    if isinstance(content, str):
        return [content]
    if not isinstance(content, list):
        return []
    return [
        str(part["text"])
        for part in content
        if isinstance(part, Mapping) and part.get("type") == "text" and isinstance(part.get("text"), str)
    ]


def marker_scenario(messages: Iterable[Mapping[str, Any]]) -> str | None:
    """Scenario declared by the first `[[mock:x]]` marker, in message order."""
    for message in messages:
        for text in texts_of(message):
            match = MOCK_MARKER_PATTERN.search(text)
            if match is not None:
                return match.group(1)
    return None


def _replace_text(message: Mapping[str, Any], replace: Any) -> dict[str, Any]:
    content = message.get("content")
    if isinstance(content, str):
        return {**message, "content": replace(content)}
    if not isinstance(content, list):
        return dict(message)
    parts = [
        {**part, "text": replace(str(part["text"]))}
        if isinstance(part, Mapping) and part.get("type") == "text" and isinstance(part.get("text"), str)
        else part
        for part in content
    ]
    return {**message, "content": parts}


def strip_mock_markers(messages: Iterable[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Removes every marker from the prompt before it reaches a model, mock or live (ET-6)."""
    return [_replace_text(message, lambda text: MOCK_MARKER_PATTERN.sub("", text)) for message in messages]


def select_fixture(
    registry: Sequence[RegisteredFixture],
    *,
    task: AiTask,
    prompt_id: str,
    messages: Sequence[Mapping[str, Any]],
    explicit_scenario: str | None = None,
) -> FixtureFile:
    """The deterministic selection of ADR-0153 section 2; raises `MOCK_FIXTURE_NOT_FOUND` when none fits."""
    candidates = [entry for entry in fixtures_for_task(registry, task) if entry.fixture.task == task]
    tried: list[str] = []
    serialised = canonical_json(list(messages))
    scenario = explicit_scenario if explicit_scenario is not None else marker_scenario(messages)

    if scenario is not None:
        exact = next((entry for entry in candidates if entry.fixture.scenario == scenario), None)
        if exact is not None:
            return exact.fixture
        tried.append(MOCK_SCENARIO_TRIED.format(scenario=scenario))

    for entry in candidates:
        fixture = entry.fixture
        if fixture.promptId != prompt_id or fixture.match is None:
            continue
        if all(needle in serialised for needle in fixture.match.contains):
            return fixture

    basename = prompt_id.split(".")[-1]
    for name in (f"{prompt_id}.default.json", f"{basename}.default.json"):
        tried.append(f"{task}/{name}")
        default = next((candidate for candidate in candidates if candidate.path == f"{task}/{name}"), None)
        if default is not None and default.fixture.promptId == prompt_id:
            return default.fixture

    for entry in candidates:
        tried.append(entry.path)
        if entry.fixture.promptId == prompt_id:
            return entry.fixture
    raise AppError(
        "MOCK_FIXTURE_NOT_FOUND",
        MOCK_FIXTURE_NOT_FOUND.format(task=task, prompt_id=prompt_id, candidates=", ".join(tried)),
    )
