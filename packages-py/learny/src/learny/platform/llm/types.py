"""Public value types of `learny.platform.llm` (SPEC-2201, port of `packages/llm/src/types.ts`)."""

from dataclasses import dataclass, field
from typing import Any, Literal

StepFinishReason = Literal["stop", "tool-calls", "length", "refusal", "error"]


@dataclass(frozen=True, slots=True)
class SystemPart:
    """One system block; `cache` marks the stable part eligible for the provider cache."""

    text: str
    cache: bool = False


@dataclass(frozen=True, slots=True)
class DocumentRef:
    """An Anthropic Files API document (ignored by the other providers)."""

    file_id: str
    title: str | None = None
    mime_type: str | None = None


@dataclass(frozen=True, slots=True)
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0


@dataclass(frozen=True, slots=True)
class CitationPart:
    cited_text: str
    document_title: str | None = None
    document_index: int | None = None


@dataclass(frozen=True, slots=True)
class ToolDeclaration:
    """A tool declared to the model; the call loop belongs to the caller, never to this package."""

    description: str
    input_schema: dict[str, Any]


@dataclass(frozen=True, slots=True)
class WebSearch:
    """Provider-side web search, declared by the `programme` task only."""

    max_uses: int


@dataclass(frozen=True, slots=True)
class StepInput:
    """One step request, mirroring `session.ts`."""

    system: tuple[SystemPart, ...] = ()
    messages: tuple[dict[str, Any], ...] = ()
    tools: dict[str, ToolDeclaration] | None = None
    documents: tuple[DocumentRef, ...] | None = None
    citations: bool = False
    web_search: WebSearch | None = None


@dataclass(frozen=True, slots=True)
class ToolCallOutput:
    tool_call_id: str
    tool_name: str
    input: Any


@dataclass(frozen=True, slots=True)
class StepOutput:
    text: str = ""
    tool_calls: tuple[ToolCallOutput, ...] = ()
    finish_reason: StepFinishReason = "stop"
    usage: Usage = field(default_factory=Usage)
    response_messages: tuple[dict[str, Any], ...] = ()
    model_id: str = ""
    citations: tuple[CitationPart, ...] | None = None


def empty_usage() -> Usage:
    return Usage()


def estimate_tokens(text: str) -> int:
    """Rough estimate of `docs/architecture/ai.md` section 6: four characters per token."""
    return -(-len(text) // 4)
