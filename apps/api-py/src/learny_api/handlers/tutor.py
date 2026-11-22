"""HTTP handlers of the tutor context (SPEC-2204).

One `@handler("<route id>")` per operation, no logic: the body is the generated contract model and
the use case lives in `learny.tutor`. `conversations.messages` answers a `text/event-stream` body,
so it returns a `StreamingResponse` and skips the JSON output contract (the route declares none).
"""

from typing import Any, cast

from learny.tutor import public as tutor

from learny_api.pipeline import Call, handler
from learny_api.sse import stream_response


def _actor(call: Call) -> Any:
    """The pipeline guarantees an actor on a `user` route; this is only a typing cast."""
    return cast(Any, call.actor)


def _body(call: Call) -> dict[str, Any]:
    """The validated body as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.body).model_dump(exclude_unset=True))


def _params(call: Call) -> dict[str, Any]:
    """The validated path parameters as a plain mapping."""
    return cast(dict[str, Any], cast(Any, call.params).model_dump())


@handler("conversations.get")
async def conversations_get(call: Call) -> Any:
    return await tutor.conversation_by_id(call.deps, _actor(call), _params(call)["id"])


@handler("conversations.messages")
async def conversations_messages(call: Call) -> Any:
    frames = await tutor.stream_reply(call.deps, _actor(call), _params(call)["id"], _body(call))
    return stream_response(frames, call.request_id)


@handler("conversations.self-test.answer")
async def conversations_self_test_answer(call: Call) -> Any:
    return await tutor.answer_self_test(call.deps, _actor(call), _params(call)["id"], _body(call)["text"])


@handler("courses.conversations.create")
async def courses_conversations_create(call: Call) -> Any:
    return await tutor.create_conversation(
        call.deps, _actor(call), _params(call)["cid"], _body(call)["chapterId"]
    )


@handler("courses.conversations.list")
async def courses_conversations_list(call: Call) -> Any:
    return await tutor.list_conversations(call.deps, _actor(call), _params(call)["cid"])
