"""Live adapter of `LlmGateway`: the learner's own provider and key (ADR-4005, BR-IA-01).

The port of `packages/llm/src/session.ts` (removed with the TypeScript backend by SPEC-2302). One
call is one HTTP request to the provider the learner assigned to the task, with the key decrypted
just before the call and never logged, and exactly one `ai_calls` row (BR-IA-08). Two wire formats
cover the six providers of the catalogue: the Anthropic Messages API, and the OpenAI chat
completions API spoken by OpenAI, Mistral, DeepSeek, compatible services and local servers.

The call loop, retries and corrections stay with the caller, as with the mock adapter: a provider
failure becomes one `AppError` of the catalogue (`AI_KEY_INVALID`, `AI_RATE_LIMITED`...), a refusal
`AI_REFUSED`, an output that does not match the schema `INVALID_OUTPUT`.
"""

import base64
import json
import os
import re
import time
from collections.abc import AsyncIterator, Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any

import httpx
import structlog
from pydantic import BaseModel, ValidationError
from sqlalchemy import text

from learny.platform.llm.caller import AiCaller, current_caller
from learny.platform.llm.credentials import Keyring, credential_aad, decrypt_secret, load_keyring
from learny.platform.llm.mock import RegisteredFixture, strip_mock_markers
from learny.platform.llm.resolve import ResolvedModel, resolve_task_model
from learny.platform.llm.tasks import TASK_CONFIG, AiTask
from learny.platform.llm.types import (
    CitationPart,
    StepFinishReason,
    StepInput,
    StepOutput,
    ToolCallOutput,
    Usage,
)
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr import ai as texts

ANTHROPIC_VERSION = "2023-06-01"
ANTHROPIC_FILES_BETA = "files-api-2025-04-14"
ANTHROPIC_WEB_SEARCH_TOOL = "web_search_20250305"
STRUCTURED_TOOL = "structured_output"
# Model-facing instructions (never shown to the learner): English, like the other prompts.
STRUCTURED_TOOL_DESCRIPTION = (
    "Return the complete answer through this tool, matching its input schema exactly."
)
JSON_INSTRUCTION = "Answer with one JSON object only, no prose, matching this JSON Schema:"

_CHAT_ENDPOINTS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "mistral": "https://api.mistral.ai/v1",
    "deepseek": "https://api.deepseek.com",
}
_CONTEXT_TOO_LONG = re.compile(
    r"\bcontext[_ -]?length[_ -]?exceeded\b|\bmaximum context (?:length|window)\b"
    r"|\b(?:prompt|input) (?:is )?too long\b|\b(?:input|prompt).{0,40}\bmaximum (?:token|tokens|length)\b",
    re.IGNORECASE,
)
_REFUSAL = re.compile(r"refusal|refused|declined", re.IGNORECASE)
_SECRETS = re.compile(r"\b(?:sk|pk|rk)[-_][A-Za-z0-9_-]{8,}\b|Bearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
_PROVIDER_TEXT_MAX = 240

READ_CREDENTIAL_KEY = text(
    """
    select encrypted_key
      from public.ai_credentials
     where id = cast(:credential_id as uuid)
       and user_id = cast(:user_id as uuid)
     limit 1
    """
)
INSERT_AI_CALL = text(
    """
    insert into public.ai_calls (
      user_id, formation_id, task, provider, model, managed,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      cost_usd, latency_ms, status, error_code, batch
    ) values (
      cast(:user_id as uuid), cast(:formation_id as uuid), cast(:task as public.ai_task),
      cast(:provider as public.ai_provider), :model, false,
      :input_tokens, :output_tokens, :cache_read_tokens, :cache_write_tokens,
      0, :latency_ms, cast(:status as public.ai_call_status), :error_code, :batch
    )
    """
)

Transport = httpx.AsyncBaseTransport


# --- errors -------------------------------------------------------------------------------------


def sanitized(value: str) -> str:
    """A short provider diagnostic: keys, URLs and e-mail addresses never reach the logs."""
    cleaned = _SECRETS.sub("[redacted]", value)
    cleaned = re.sub(r"https?://[^\s\"'<>]+", "[url]", cleaned)
    cleaned = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[email]", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:_PROVIDER_TEXT_MAX]


def provider_error(status: int, body: str) -> AppError:
    """`mapProviderError`: an HTTP failure of the provider as a catalogue error."""
    if status in (401, 403):
        return AppError("AI_KEY_INVALID", texts.AI_KEY_REFUSED, status=422)
    if status == 429:
        return AppError("AI_RATE_LIMITED", texts.AI_RATE_LIMITED, status=429)
    if status in (408, 504):
        return AppError("AI_TIMEOUT", texts.AI_TIMEOUT, status=504)
    if status in (400, 413) and _CONTEXT_TOO_LONG.search(body):
        return AppError("AI_CONTEXT_TOO_LONG", texts.AI_CONTEXT_TOO_LONG, status=422)
    if _REFUSAL.search(body) and status < 500:
        return AppError("AI_REFUSED", texts.AI_REFUSED, status=422)
    return AppError("AI_PROVIDER_ERROR", texts.AI_PROVIDER_UNAVAILABLE, status=503)


def refused() -> AppError:
    return AppError("AI_REFUSED", texts.AI_REFUSED, status=422)


def invalid_output(message: str = "") -> AppError:
    return AppError(
        "INVALID_OUTPUT",
        texts.AI_INVALID_OUTPUT,
        status=502,
        errors=[{"path": "", "message": message or "sortie non conforme"}],
    )


# --- wire formats -------------------------------------------------------------------------------


def _base64(data: Any) -> str:
    if isinstance(data, (bytes, bytearray)):
        return base64.b64encode(bytes(data)).decode("ascii")
    return str(data)


def _parts(content: Any) -> list[Mapping[str, Any]]:
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    if isinstance(content, Sequence):
        return [part for part in content if isinstance(part, Mapping)]
    return []


def _anthropic_content(content: Any) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for part in _parts(content):
        kind = part.get("type")
        if kind == "text":
            blocks.append({"type": "text", "text": str(part.get("text", ""))})
        elif kind == "image":
            blocks.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": str(part.get("mediaType") or "image/png"),
                        "data": _base64(part.get("image")),
                    },
                }
            )
    return blocks


def _openai_content(content: Any) -> str | list[dict[str, Any]]:
    if isinstance(content, str):
        return content
    blocks: list[dict[str, Any]] = []
    for part in _parts(content):
        kind = part.get("type")
        if kind == "text":
            blocks.append({"type": "text", "text": str(part.get("text", ""))})
        elif kind == "image":
            media = str(part.get("mediaType") or "image/png")
            blocks.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{media};base64,{_base64(part.get('image'))}"},
                }
            )
    return blocks


def anthropic_request(
    model: str,
    input: StepInput,
    max_tokens: int,
    *,
    structured: dict[str, Any] | None = None,
    stream: bool = False,
) -> dict[str, Any]:
    """The Messages API body of one step (system cache, documents, tools, web search)."""
    messages: list[dict[str, Any]] = []
    for message in input.messages:
        role = "assistant" if message.get("role") == "assistant" else "user"
        blocks = _anthropic_content(message.get("content"))
        if blocks:
            messages.append({"role": role, "content": blocks})
    if input.documents:
        documents = [
            {
                "type": "document",
                "source": {"type": "file", "file_id": document.file_id},
                **({"title": document.title} if document.title else {}),
                **({"citations": {"enabled": True}} if input.citations else {}),
            }
            for document in input.documents
        ]
        first_user = next((m for m in messages if m["role"] == "user"), None)
        if first_user is None:
            messages.insert(0, {"role": "user", "content": documents})
        else:
            first_user["content"] = [*documents, *first_user["content"]]
    body: dict[str, Any] = {"model": model, "max_tokens": max_tokens, "messages": messages}
    if input.system:
        body["system"] = [
            {
                "type": "text",
                "text": part.text,
                **({"cache_control": {"type": "ephemeral"}} if part.cache else {}),
            }
            for part in input.system
        ]
    tools: list[dict[str, Any]] = []
    for name, declaration in (input.tools or {}).items():
        tools.append(
            {"name": name, "description": declaration.description, "input_schema": declaration.input_schema}
        )
    if input.web_search is not None:
        tools.append(
            {"type": ANTHROPIC_WEB_SEARCH_TOOL, "name": "web_search", "max_uses": input.web_search.max_uses}
        )
    if structured is not None:
        tools.append(
            {"name": STRUCTURED_TOOL, "description": STRUCTURED_TOOL_DESCRIPTION, "input_schema": structured}
        )
        body["tool_choice"] = {"type": "tool", "name": STRUCTURED_TOOL}
    if tools:
        body["tools"] = tools
    if stream:
        body["stream"] = True
    return body


def strict_schema(schema: Any) -> Any:
    """The strict-mode form OpenAI requires: closed objects, every property required."""
    if isinstance(schema, dict):
        value = {key: strict_schema(item) for key, item in schema.items() if key != "default"}
        if value.get("type") == "object" or "properties" in value:
            properties = value.get("properties") or {}
            value["properties"] = properties
            value["required"] = list(properties.keys())
            value["additionalProperties"] = False
        return value
    if isinstance(schema, list):
        return [strict_schema(item) for item in schema]
    return schema


def openai_request(
    provider: str,
    model: str,
    input: StepInput,
    max_tokens: int,
    *,
    structured: dict[str, Any] | None = None,
    strict: bool = True,
    stream: bool = False,
) -> dict[str, Any]:
    """The chat completions body of one step; documents and web search are Anthropic-only."""
    messages: list[dict[str, Any]] = []
    system = "\n\n".join(part.text for part in input.system)
    if structured is not None and not (provider == "openai" and strict):
        schema_text = json.dumps(structured, ensure_ascii=False)
        system = f"{system}\n\n{JSON_INSTRUCTION}\n{schema_text}".strip()
    if system:
        messages.append({"role": "system", "content": system})
    for message in input.messages:
        role = "assistant" if message.get("role") == "assistant" else "user"
        messages.append({"role": role, "content": _openai_content(message.get("content"))})
    body: dict[str, Any] = {"model": model, "messages": messages}
    # OpenAI's current models refuse `max_tokens`; the other services still expect it.
    body["max_completion_tokens" if provider == "openai" else "max_tokens"] = max_tokens
    if input.tools:
        body["tools"] = [
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": declaration.description,
                    "parameters": declaration.input_schema,
                },
            }
            for name, declaration in input.tools.items()
        ]
    if structured is not None:
        if provider == "openai" and strict:
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": STRUCTURED_TOOL, "schema": strict_schema(structured), "strict": True},
            }
        else:
            body["response_format"] = {"type": "json_object"}
    if stream:
        body["stream"] = True
        if provider == "openai":
            body["stream_options"] = {"include_usage": True}
    return body


def _anthropic_finish(reason: str | None) -> StepFinishReason:
    if reason == "tool_use":
        return "tool-calls"
    if reason == "max_tokens":
        return "length"
    if reason == "refusal":
        return "refusal"
    return "stop"


def parse_anthropic(payload: Mapping[str, Any], model: str) -> StepOutput:
    texts_out: list[str] = []
    calls: list[ToolCallOutput] = []
    citations: list[CitationPart] = []
    for block in payload.get("content") or ():
        kind = block.get("type")
        if kind == "text":
            texts_out.append(str(block.get("text", "")))
            for citation in block.get("citations") or ():
                if isinstance(citation.get("cited_text"), str):
                    citations.append(
                        CitationPart(
                            cited_text=citation["cited_text"],
                            document_title=citation.get("document_title"),
                            document_index=citation.get("document_index"),
                        )
                    )
        elif kind == "tool_use" and block.get("name") != STRUCTURED_TOOL:
            calls.append(
                ToolCallOutput(str(block.get("id", "")), str(block.get("name", "")), block.get("input"))
            )
    usage = payload.get("usage") or {}
    return StepOutput(
        text="".join(texts_out),
        tool_calls=tuple(calls),
        finish_reason=_anthropic_finish(payload.get("stop_reason")),
        usage=Usage(
            input_tokens=int(usage.get("input_tokens") or 0),
            output_tokens=int(usage.get("output_tokens") or 0),
            cache_read_tokens=int(usage.get("cache_read_input_tokens") or 0),
            cache_write_tokens=int(usage.get("cache_creation_input_tokens") or 0),
        ),
        model_id=model,
        citations=tuple(citations) or None,
    )


def anthropic_structured(payload: Mapping[str, Any]) -> Any:
    for block in payload.get("content") or ():
        if block.get("type") == "tool_use" and block.get("name") == STRUCTURED_TOOL:
            return block.get("input")
    raise invalid_output("no structured output")


def parse_openai(payload: Mapping[str, Any], model: str) -> StepOutput:
    choice = (payload.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    if message.get("refusal"):
        raise refused()
    calls = []
    for call in message.get("tool_calls") or ():
        function = call.get("function") or {}
        try:
            arguments = json.loads(function.get("arguments") or "{}")
        except json.JSONDecodeError:
            arguments = function.get("arguments")
        calls.append(ToolCallOutput(str(call.get("id", "")), str(function.get("name", "")), arguments))
    reason = choice.get("finish_reason")
    finish: StepFinishReason = (
        "tool-calls"
        if reason == "tool_calls"
        else "length"
        if reason == "length"
        else "refusal"
        if reason == "content_filter"
        else "stop"
    )
    usage = payload.get("usage") or {}
    details = usage.get("prompt_tokens_details") or {}
    content = message.get("content")
    return StepOutput(
        text=content if isinstance(content, str) else "",
        tool_calls=tuple(calls),
        finish_reason=finish,
        usage=Usage(
            input_tokens=int(usage.get("prompt_tokens") or 0),
            output_tokens=int(usage.get("completion_tokens") or 0),
            cache_read_tokens=int(details.get("cached_tokens") or 0),
        ),
        model_id=model,
    )


def parse_json_text(value: str) -> Any:
    """A JSON answer, tolerating the Markdown fence some models add."""
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", value.strip(), flags=re.IGNORECASE)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as error:
        raise invalid_output("not JSON") from error


# --- gateway ------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _Target:
    """One resolved call: the model, its key and the journal identity."""

    resolved: ResolvedModel
    api_key: str | None
    caller: AiCaller


def chat_url(resolved: ResolvedModel) -> str:
    base = (resolved.base_url or "").strip() or _CHAT_ENDPOINTS.get(resolved.provider, "")
    if not base:
        raise AppError("AI_PROVIDER_ERROR", texts.AI_PROVIDER_MISCONFIGURED, status=503)
    base = base.rstrip("/")
    if resolved.provider in ("openai_compatible", "local") and not base.endswith("/v1"):
        base = f"{base}/v1"
    return f"{base}/chat/completions"


def call_url(resolved: ResolvedModel) -> str:
    """The Messages endpoint for Anthropic, the chat completions endpoint everywhere else."""
    if resolved.provider == "anthropic":
        base = (resolved.base_url or "").strip().rstrip("/") or "https://api.anthropic.com"
        return f"{base}/v1/messages"
    return chat_url(resolved)


class LiveGateway:
    """Calls the provider the learner assigned to the task, with the learner's own key."""

    def __init__(
        self,
        db: Database,
        *,
        keyring: Callable[[], Keyring] | None = None,
        transport: Transport | None = None,
    ) -> None:
        self._db = db
        self._keyring = keyring or (lambda: load_keyring(os.environ))
        self._transport = transport
        self._logger = structlog.get_logger("learny.llm")

    # Protocol -----------------------------------------------------------------------------------

    async def step(
        self,
        task: AiTask,
        prompt_id: str,
        input: StepInput,
        *,
        scenario: str | None = None,
        caller: AiCaller | None = None,
    ) -> StepOutput:
        target = await self._target(task, caller, None, None)
        return await self._step(task, target, input)

    async def object(
        self,
        task: AiTask,
        prompt_id: str,
        schema: type[BaseModel],
        input: StepInput,
        *,
        scenario: str | None = None,
        caller: AiCaller | None = None,
    ) -> BaseModel:
        target = await self._target(task, caller, None, None)
        return await self._object(task, target, schema, input)

    def stream(
        self,
        task: AiTask,
        prompt_id: str,
        input: StepInput,
        *,
        scenario: str | None = None,
        caller: AiCaller | None = None,
    ) -> AsyncIterator[str]:
        # The caller is captured now: a streamed body is iterated after the request scope ends.
        bound = caller or current_caller()
        return self._stream_lazily(task, bound, input)

    def session(
        self,
        task: AiTask,
        prompt_id: str,
        *,
        scenario: str | None = None,
        fixtures: Sequence[RegisteredFixture] | None = None,
        caller: AiCaller | None = None,
        model: ResolvedModel | None = None,
        api_key: str | None = None,
    ) -> "LiveSession":
        return LiveSession(self, task, caller or current_caller(), model, api_key)

    # Resolution ---------------------------------------------------------------------------------

    async def _target(
        self,
        task: AiTask,
        caller: AiCaller | None,
        model: ResolvedModel | None,
        api_key: str | None,
    ) -> _Target:
        bound = caller or current_caller()
        if bound is None:
            raise AppError("AI_UNAVAILABLE", texts.AI_UNAVAILABLE_MODEL, status=422, reason="no_caller")
        async with self._db.service_tx() as tx:
            resolved = model or await resolve_task_model(tx, bound.user_id, task)
            key = api_key
            if key is None and resolved.credential_id:
                row = (
                    await tx.conn.execute(
                        READ_CREDENTIAL_KEY,
                        {"credential_id": resolved.credential_id, "user_id": bound.user_id},
                    )
                ).first()
                blob = None if row is None else row[0]
                if blob is not None:
                    key, _ = decrypt_secret(
                        bytes(blob), credential_aad(resolved.credential_id, bound.user_id), self._keyring()
                    )
        if key is None and resolved.provider != "local":
            raise AppError("AI_KEY_INVALID", texts.AI_KEY_MISSING, status=422)
        return _Target(resolved=resolved, api_key=key, caller=bound)

    # Calls --------------------------------------------------------------------------------------

    def _headers(self, target: _Target, input: StepInput) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if target.resolved.provider == "anthropic":
            headers["x-api-key"] = target.api_key or ""
            headers["anthropic-version"] = ANTHROPIC_VERSION
            if input.documents:
                headers["anthropic-beta"] = ANTHROPIC_FILES_BETA
        elif target.api_key:
            headers["Authorization"] = f"Bearer {target.api_key}"
        return headers

    def _client(self, task: AiTask) -> httpx.AsyncClient:
        timeout = TASK_CONFIG[task].timeout_ms / 1000
        return httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=10.0), transport=self._transport)

    def _rejected(self, task: AiTask, target: _Target, status: int, body: str) -> AppError:
        """The catalogue error of an HTTP refusal, logged with the provider's own diagnostic.

        The learner sees the catalogue message only; the operator needs the provider's reason
        (an exhausted balance answers 402 and was indistinguishable from an outage).
        """
        error = provider_error(status, body)
        self._logger.warning(
            "provider refused the call",
            component="llm",
            task=task,
            provider=target.resolved.provider,
            providerStatus=status,
            providerMessage=sanitized(body),
            code=error.code,
        )
        return error

    async def _post(self, task: AiTask, target: _Target, input: StepInput, body: dict[str, Any]) -> Any:
        async with self._client(task) as client:
            try:
                response = await client.post(
                    call_url(target.resolved), headers=self._headers(target, input), json=body
                )
            except httpx.TimeoutException as error:
                raise AppError("AI_TIMEOUT", texts.AI_TIMEOUT, status=504) from error
            except httpx.HTTPError as error:
                raise AppError("AI_PROVIDER_ERROR", texts.AI_PROVIDER_UNAVAILABLE, status=503) from error
        if response.status_code >= 400:
            raise self._rejected(task, target, response.status_code, response.text[:2000])
        try:
            return response.json()
        except ValueError as error:
            raise AppError("AI_PROVIDER_ERROR", texts.AI_PROVIDER_UNAVAILABLE, status=503) from error

    async def _step(self, task: AiTask, target: _Target, input: StepInput) -> StepOutput:
        clean = _strip(input)
        started = time.monotonic()
        try:
            payload = await self._post(task, target, clean, self._body(task, target, clean, None))
            output = (
                parse_anthropic(payload, target.resolved.model_id)
                if target.resolved.provider == "anthropic"
                else parse_openai(payload, target.resolved.model_id)
            )
            if output.finish_reason == "refusal":
                raise refused()
        except AppError as error:
            await self._journal(task, target, started, Usage(), error)
            raise
        await self._journal(task, target, started, output.usage, None)
        return output

    async def _object(
        self, task: AiTask, target: _Target, schema: type[BaseModel], input: StepInput
    ) -> BaseModel:
        clean = _strip(input)
        structured = schema.model_json_schema()
        started = time.monotonic()
        usage = Usage()
        try:
            if target.resolved.provider == "anthropic":
                payload = await self._post(task, target, clean, self._body(task, target, clean, structured))
                usage = parse_anthropic(payload, target.resolved.model_id).usage
                raw = anthropic_structured(payload)
            else:
                payload = await self._structured_openai(task, target, clean, structured)
                output = parse_openai(payload, target.resolved.model_id)
                usage = output.usage
                raw = parse_json_text(output.text)
            try:
                value = schema.model_validate(raw)
            except ValidationError as error:
                raise invalid_output(str(error.errors()[:3])) from error
        except AppError as error:
            await self._journal(task, target, started, usage, error)
            raise
        await self._journal(task, target, started, usage, None)
        return value

    async def _structured_openai(
        self, task: AiTask, target: _Target, input: StepInput, structured: dict[str, Any]
    ) -> Any:
        body = self._body(task, target, input, structured)
        try:
            return await self._post(task, target, input, body)
        except AppError as error:
            # A schema the strict mode cannot express falls back to the JSON mode once.
            if target.resolved.provider != "openai" or error.code != "AI_PROVIDER_ERROR":
                raise
            body = self._body(task, target, input, structured, strict=False)
            return await self._post(task, target, input, body)

    def _body(
        self,
        task: AiTask,
        target: _Target,
        input: StepInput,
        structured: dict[str, Any] | None,
        *,
        strict: bool = True,
        stream: bool = False,
    ) -> dict[str, Any]:
        max_tokens = TASK_CONFIG[task].max_output_tokens
        if target.resolved.provider == "anthropic":
            return anthropic_request(
                target.resolved.model_id, input, max_tokens, structured=structured, stream=stream
            )
        return openai_request(
            target.resolved.provider,
            target.resolved.model_id,
            input,
            max_tokens,
            structured=structured,
            strict=strict,
            stream=stream,
        )

    async def _stream_lazily(
        self, task: AiTask, caller: AiCaller | None, input: StepInput
    ) -> AsyncIterator[str]:
        target = await self._target(task, caller, None, None)
        async for chunk in self._stream(task, target, input):
            yield chunk

    async def _stream(self, task: AiTask, target: _Target, input: StepInput) -> AsyncIterator[str]:
        clean = _strip(input)
        anthropic = target.resolved.provider == "anthropic"
        url = call_url(target.resolved)
        body = self._body(task, target, clean, None, stream=True)
        started = time.monotonic()
        usage = {"input": 0, "output": 0, "read": 0, "write": 0}
        try:
            async with self._client(task) as client:
                try:
                    async with client.stream(
                        "POST", url, headers=self._headers(target, clean), json=body
                    ) as response:
                        if response.status_code >= 400:
                            raise self._rejected(
                                task,
                                target,
                                response.status_code,
                                (await response.aread()).decode("utf-8", "replace")[:2000],
                            )
                        async for line in response.aiter_lines():
                            if not line.startswith("data:"):
                                continue
                            data = line[5:].strip()
                            if data == "[DONE]":
                                break
                            try:
                                event = json.loads(data)
                            except json.JSONDecodeError:
                                continue
                            chunk = _stream_chunk(event, anthropic, usage)
                            if chunk:
                                yield chunk
                except httpx.TimeoutException as error:
                    raise AppError("AI_TIMEOUT", texts.AI_TIMEOUT, status=504) from error
                except httpx.HTTPError as error:
                    raise AppError("AI_PROVIDER_ERROR", texts.AI_PROVIDER_UNAVAILABLE, status=503) from error
        except AppError as error:
            await self._journal(task, target, started, _usage_of(usage), error)
            raise
        await self._journal(task, target, started, _usage_of(usage), None)

    # Journal ------------------------------------------------------------------------------------

    async def _journal(
        self,
        task: AiTask,
        target: _Target,
        started: float,
        usage: Usage,
        error: AppError | None,
    ) -> None:
        """Exactly one `ai_calls` row per call (BR-IA-08); the journal never fails the call."""
        status = "ok"
        if error is not None:
            status = {"AI_REFUSED": "refused", "INVALID_OUTPUT": "invalid_output"}.get(error.code, "error")
        latency = int((time.monotonic() - started) * 1000)
        try:
            async with self._db.service_tx() as tx:
                await tx.conn.execute(
                    INSERT_AI_CALL,
                    {
                        "user_id": target.caller.user_id,
                        "formation_id": target.caller.formation_id,
                        "task": task,
                        "provider": target.resolved.provider,
                        "model": target.resolved.model_id,
                        "input_tokens": usage.input_tokens,
                        "output_tokens": usage.output_tokens,
                        "cache_read_tokens": usage.cache_read_tokens,
                        "cache_write_tokens": usage.cache_write_tokens,
                        "latency_ms": latency,
                        "status": status,
                        "error_code": None if error is None else error.code,
                        "batch": False,
                    },
                )
        except Exception as failure:
            self._logger.warning("ai call journal failed", task=task, outcome=type(failure).__name__)
        if error is not None:
            self._logger.warning(
                "provider call failed",
                component="llm",
                task=task,
                provider=target.resolved.provider,
                code=error.code,
                latencyMs=latency,
            )


class LiveSession:
    """Several calls on one resolved model: resolution and key decryption happen once."""

    def __init__(
        self,
        gateway: LiveGateway,
        task: AiTask,
        caller: AiCaller | None,
        model: ResolvedModel | None,
        api_key: str | None,
    ) -> None:
        self._gateway = gateway
        self._task = task
        self._caller = caller
        self._model = model
        self._api_key = api_key
        self._target: _Target | None = None

    async def _resolved(self) -> _Target:
        if self._target is None:
            self._target = await self._gateway._target(self._task, self._caller, self._model, self._api_key)
        return self._target

    async def step(self, input: StepInput) -> StepOutput:
        return await self._gateway._step(self._task, await self._resolved(), input)

    async def object(self, schema: type[BaseModel], input: StepInput) -> BaseModel:
        return await self._gateway._object(self._task, await self._resolved(), schema, input)

    async def stream(self, input: StepInput) -> AsyncIterator[str]:
        async for chunk in self._gateway._stream(self._task, await self._resolved(), input):
            yield chunk


def _strip(input: StepInput) -> StepInput:
    """The prompt a live provider receives: mock markers never leave the test environment."""
    return replace(input, messages=tuple(strip_mock_markers(input.messages)))


def _usage_of(counts: Mapping[str, int]) -> Usage:
    return Usage(
        input_tokens=counts["input"],
        output_tokens=counts["output"],
        cache_read_tokens=counts["read"],
        cache_write_tokens=counts["write"],
    )


def _stream_chunk(event: Mapping[str, Any], anthropic: bool, usage: dict[str, int]) -> str:
    """The text delta of one server-sent event, accumulating the usage it reports."""
    if anthropic:
        kind = event.get("type")
        if kind == "message_start":
            start = (event.get("message") or {}).get("usage") or {}
            usage["input"] = int(start.get("input_tokens") or 0)
            usage["read"] = int(start.get("cache_read_input_tokens") or 0)
            usage["write"] = int(start.get("cache_creation_input_tokens") or 0)
        elif kind == "message_delta":
            usage["output"] = int(((event.get("usage") or {}).get("output_tokens")) or usage["output"])
        elif kind == "content_block_delta":
            delta = event.get("delta") or {}
            if delta.get("type") == "text_delta":
                return str(delta.get("text", ""))
        elif kind == "error":
            raise AppError("AI_PROVIDER_ERROR", texts.AI_PROVIDER_UNAVAILABLE, status=503)
        return ""
    counts = event.get("usage") or {}
    if counts:
        usage["input"] = int(counts.get("prompt_tokens") or usage["input"])
        usage["output"] = int(counts.get("completion_tokens") or usage["output"])
    choices = event.get("choices") or []
    if not choices:
        return ""
    delta = choices[0].get("delta") or {}
    content = delta.get("content")
    return content if isinstance(content, str) else ""
