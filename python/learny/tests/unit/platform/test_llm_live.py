"""[ADR-4005] The live LLM gateway: wire formats, errors, journal and caller binding."""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx
import pytest
import structlog
from learny.platform.llm.caller import AiCaller, ai_caller, current_caller
from learny.platform.llm.live import (
    LiveGateway,
    anthropic_request,
    call_url,
    openai_request,
    provider_error,
    strict_schema,
)
from learny.platform.llm.resolve import ResolvedModel
from learny.platform.llm.types import StepInput, SystemPart, ToolDeclaration, WebSearch
from learny.shared.errors import AppError
from pydantic import BaseModel

pytestmark = pytest.mark.spec("SPEC-2201")

USER = "00000000-0000-4000-8000-000000000001"
FORMATION = "00000000-0000-4000-8000-000000000002"


class Answer(BaseModel):
    title: str
    score: int


class FakeConn:
    def __init__(self, journal: list[dict[str, Any]]) -> None:
        self._journal = journal

    async def execute(self, statement: Any, params: dict[str, Any] | None = None) -> Any:
        if "insert into public.ai_calls" in str(statement):
            self._journal.append(dict(params or {}))
        return None


class FakeTx:
    def __init__(self, journal: list[dict[str, Any]]) -> None:
        self.conn = FakeConn(journal)


class FakeDb:
    def __init__(self) -> None:
        self.journal: list[dict[str, Any]] = []

    @asynccontextmanager
    async def service_tx(self) -> AsyncIterator[FakeTx]:
        yield FakeTx(self.journal)


def gateway(handler: Any) -> tuple[LiveGateway, FakeDb]:
    db = FakeDb()
    live = LiveGateway(db, transport=httpx.MockTransport(handler))  # type: ignore[arg-type]
    return live, db


def model(provider: str, model_id: str = "model-x", base_url: str | None = None) -> ResolvedModel:
    return ResolvedModel(provider, model_id, "", "light", base_url)


PROMPT = StepInput(
    system=(SystemPart("You are a tutor.", cache=True),),
    messages=({"role": "user", "content": "Hello"},),
)


def test_ai_caller_binds_and_restores() -> None:
    assert current_caller() is None
    with ai_caller(USER, FORMATION) as caller:
        assert caller == AiCaller(USER, FORMATION)
        assert current_caller() == caller
    assert current_caller() is None
    with ai_caller(None):
        assert current_caller() is None


def test_call_urls_per_provider() -> None:
    assert call_url(model("anthropic")) == "https://api.anthropic.com/v1/messages"
    assert call_url(model("openai")) == "https://api.openai.com/v1/chat/completions"
    assert call_url(model("mistral")) == "https://api.mistral.ai/v1/chat/completions"
    assert call_url(model("deepseek")) == "https://api.deepseek.com/chat/completions"
    assert call_url(model("openai_compatible", base_url="https://llm.example.org")) == (
        "https://llm.example.org/v1/chat/completions"
    )
    with pytest.raises(AppError):
        call_url(model("local"))


def test_anthropic_request_carries_cache_tools_and_web_search() -> None:
    body = anthropic_request(
        "claude-x",
        StepInput(
            system=PROMPT.system,
            messages=PROMPT.messages,
            tools={"lookup": ToolDeclaration("Look up", {"type": "object", "properties": {}})},
            web_search=WebSearch(max_uses=3),
        ),
        1000,
        structured={"type": "object", "properties": {"a": {"type": "string"}}},
    )
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    names = [tool["name"] for tool in body["tools"]]
    assert names == ["lookup", "web_search", "structured_output"]
    assert body["tool_choice"] == {"type": "tool", "name": "structured_output"}


def test_openai_request_uses_strict_schema_and_completion_budget() -> None:
    body = openai_request("openai", "gpt-x", PROMPT, 500, structured=Answer.model_json_schema())
    assert body["max_completion_tokens"] == 500
    schema = body["response_format"]["json_schema"]["schema"]
    assert schema["additionalProperties"] is False
    assert sorted(schema["required"]) == ["score", "title"]
    mistral = openai_request("mistral", "m", PROMPT, 500, structured=Answer.model_json_schema())
    assert mistral["max_tokens"] == 500
    assert mistral["response_format"] == {"type": "json_object"}
    assert "JSON Schema" in mistral["messages"][0]["content"]


def test_strict_schema_closes_nested_objects() -> None:
    schema = strict_schema(
        {
            "type": "object",
            "properties": {
                "inner": {"type": "object", "properties": {"x": {"type": "integer", "default": 1}}}
            },
        }
    )
    inner = schema["properties"]["inner"]
    assert inner["required"] == ["x"]
    assert inner["additionalProperties"] is False
    assert "default" not in inner["properties"]["x"]


@pytest.mark.parametrize(
    ("status", "body", "code"),
    [
        (401, "invalid x-api-key", "AI_KEY_INVALID"),
        (429, "rate limited", "AI_RATE_LIMITED"),
        (504, "", "AI_TIMEOUT"),
        (400, "prompt is too long: 300000 tokens", "AI_CONTEXT_TOO_LONG"),
        (400, "request refused by policy", "AI_REFUSED"),
        (529, "overloaded", "AI_PROVIDER_ERROR"),
    ],
)
def test_provider_errors_map_to_catalogue_codes(status: int, body: str, code: str) -> None:
    assert provider_error(status, body).code == code


async def test_anthropic_step_returns_text_and_journals_the_call() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["key"] = request.headers.get("x-api-key")
        seen["body"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "content": [{"type": "text", "text": "Bonjour"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 12, "output_tokens": 3, "cache_read_input_tokens": 5},
            },
        )

    live, db = gateway(handler)
    with ai_caller(USER, FORMATION):
        session = live.session("light", "probe", model=model("anthropic", "claude-x"), api_key="sk-ant-test")
        output = await session.step(PROMPT)
    assert output.text == "Bonjour"
    assert output.usage.input_tokens == 12
    assert output.usage.cache_read_tokens == 5
    assert seen["key"] == "sk-ant-test"
    assert seen["body"]["model"] == "claude-x"
    [row] = db.journal
    assert row["user_id"] == USER
    assert row["formation_id"] == FORMATION
    assert row["status"] == "ok"
    assert row["provider"] == "anthropic"
    assert row["input_tokens"] == 12


async def test_anthropic_object_reads_the_structured_tool() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "content": [
                    {
                        "type": "tool_use",
                        "id": "t1",
                        "name": "structured_output",
                        "input": {"title": "A", "score": 3},
                    }
                ],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )

    live, _ = gateway(handler)
    session = live.session("light", "p", caller=AiCaller(USER), model=model("anthropic"), api_key="k")
    value = await session.object(Answer, PROMPT)
    assert value == Answer(title="A", score=3)


async def test_openai_object_validates_and_reports_invalid_output() -> None:
    answers = iter(['{"title": "B", "score": 7}', '{"title": "C"}'])

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer sk-test"
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": next(answers)}, "finish_reason": "stop"}], "usage": {}},
        )

    live, db = gateway(handler)
    session = live.session("light", "p", caller=AiCaller(USER), model=model("openai"), api_key="sk-test")
    assert await session.object(Answer, PROMPT) == Answer(title="B", score=7)
    with pytest.raises(AppError) as error:
        await session.object(Answer, PROMPT)
    assert error.value.code == "INVALID_OUTPUT"
    assert [row["status"] for row in db.journal] == ["ok", "invalid_output"]


async def test_openai_refusal_is_ai_refused() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"choices": [{"message": {"refusal": "no"}, "finish_reason": "stop"}]}
        )

    live, db = gateway(handler)
    session = live.session("light", "p", caller=AiCaller(USER), model=model("openai"), api_key="k")
    with pytest.raises(AppError) as error:
        await session.step(PROMPT)
    assert error.value.code == "AI_REFUSED"
    assert db.journal[0]["status"] == "refused"


async def test_provider_failure_is_journaled_as_error() -> None:
    live, db = gateway(lambda request: httpx.Response(401, text="invalid api key"))
    session = live.session("light", "p", caller=AiCaller(USER), model=model("mistral"), api_key="bad")
    with pytest.raises(AppError) as error:
        await session.step(PROMPT)
    assert error.value.code == "AI_KEY_INVALID"
    assert db.journal[0]["status"] == "error"
    assert db.journal[0]["error_code"] == "AI_KEY_INVALID"


async def test_provider_refusal_logs_the_sanitized_provider_reason() -> None:
    body = '{"error":{"message":"Insufficient Balance","type":"insufficient_balance_error"}} sk-abcdef123456'
    live, _ = gateway(lambda request: httpx.Response(402, text=body))
    session = live.session("light", "p", caller=AiCaller(USER), model=model("deepseek"), api_key="k")
    with structlog.testing.capture_logs() as logs, pytest.raises(AppError) as error:
        await session.step(PROMPT)
    assert error.value.code == "AI_PROVIDER_ERROR"
    refusal = next(entry for entry in logs if entry["event"] == "provider refused the call")
    assert refusal["providerStatus"] == 402
    assert "Insufficient Balance" in refusal["providerMessage"]
    assert "sk-abcdef123456" not in refusal["providerMessage"]


async def test_streams_text_deltas_from_both_wire_formats() -> None:
    anthropic_events = [
        {"type": "message_start", "message": {"usage": {"input_tokens": 4}}},
        {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Bon"}},
        {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "jour"}},
        {"type": "message_delta", "usage": {"output_tokens": 2}},
    ]
    openai_events = [
        {"choices": [{"delta": {"content": "Sa"}}]},
        {"choices": [{"delta": {"content": "lut"}}]},
        {"choices": [], "usage": {"prompt_tokens": 3, "completion_tokens": 2}},
    ]

    def sse(events: list[dict[str, Any]]) -> bytes:
        return ("".join(f"data: {json.dumps(event)}\n\n" for event in events) + "data: [DONE]\n\n").encode()

    for provider, events, expected in (
        ("anthropic", anthropic_events, "Bonjour"),
        ("openai", openai_events, "Salut"),
    ):
        live, db = gateway(lambda request, events=events: httpx.Response(200, content=sse(events)))
        session = live.session("light", "p", caller=AiCaller(USER), model=model(provider), api_key="k")
        chunks = [chunk async for chunk in session.stream(PROMPT)]
        assert "".join(chunks) == expected
        assert db.journal[0]["output_tokens"] == 2


async def test_a_call_without_a_caller_is_unavailable() -> None:
    live, db = gateway(lambda request: httpx.Response(200, json={}))
    with pytest.raises(AppError) as error:
        await live.step("light", "p", PROMPT)
    assert error.value.code == "AI_UNAVAILABLE"
    assert db.journal == []
