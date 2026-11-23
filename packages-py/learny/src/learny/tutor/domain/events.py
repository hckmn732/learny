"""AI SDK UI message stream v1 chunks (SPEC-610 ET-2, ADR-0066, SPEC-2204).

The web client parses `data: {type,...}` chunks; the order, the payload keys and the framing are
part of the contract (`00-conventions` section 11). This module builds the chunks and their exact
`data:` framing; it performs no IO, so the sequence is reproducible from the TypeScript recording.
"""

from typing import Any

from learny.shared.jsonx import dumps

DONE = "data: [DONE]\n\n"


def start(message_id: str) -> dict[str, Any]:
    return {"type": "start", "messageId": message_id}


def text_start(identifier: str) -> dict[str, Any]:
    return {"type": "text-start", "id": identifier}


def text_delta(identifier: str, delta: str) -> dict[str, Any]:
    return {"type": "text-delta", "id": identifier, "delta": delta}


def text_end(identifier: str) -> dict[str, Any]:
    return {"type": "text-end", "id": identifier}


def data_sources(sources: list[dict[str, str]]) -> dict[str, Any]:
    return {"type": "data-sources", "data": {"sources": sources}}


def data_follow_ups(follow_ups: list[dict[str, str]]) -> dict[str, Any]:
    return {"type": "data-follow-ups", "data": {"followUps": follow_ups}}


def data_self_test(data: dict[str, Any]) -> dict[str, Any]:
    return {"type": "data-self-test", "data": data}


def finish() -> dict[str, Any]:
    return {"type": "finish"}


def error(error_text: str) -> dict[str, Any]:
    return {"type": "error", "errorText": error_text}


def frame(chunk: dict[str, Any]) -> str:
    """One server-sent event: `data: <json>\\n\\n`, exactly like the TypeScript `sse()`."""
    return f"data: {dumps(chunk).decode('utf-8')}\n\n"
