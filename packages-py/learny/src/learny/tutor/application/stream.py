"""Reply stream of the tutor (SPEC-610 ET-2, ET-3, EF-8, ADR-0066).

Port of `packages/services/src/tutor-chat/stream.ts`: the reply follows the AI SDK UI message stream
protocol (SSE `data: {type,...}` chunks) framed by `learny.tutor.domain.events`, which is the module
validated against the TypeScript oracle. The learner message is committed before the model call, the
tutor message only after a complete stream, and no transaction is ever held across the model.
"""

from collections.abc import AsyncIterator, Mapping
from typing import Any

from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.ids import new_id
from learny.shared.locale_fr import tutor as texts
from learny.shared.time import to_iso
from learny.tutor.application.context import build_context
from learny.tutor.application.conversations import (
    ConversationRef,
    conversation_messages,
    conversation_ref,
    json_text,
    self_test_of,
)
from learny.tutor.application.llm import TUTOR_CHAT_PROMPT_ID, TUTOR_TASK, step_input
from learny.tutor.application.ports import TutorDeps
from learny.tutor.application.self_test import ask_self_test
from learny.tutor.domain.context import BuiltContext
from learny.tutor.domain.events import (
    DONE,
    data_follow_ups,
    data_self_test,
    data_sources,
    error,
    finish,
    frame,
    start,
    text_delta,
    text_end,
    text_start,
)
from learny.tutor.domain.follow_ups import build_follow_ups, follow_up_labels
from learny.tutor.domain.prompts import build_tutor_chat_prompt
from learny.tutor.domain.sources import (
    SourceContext,
    SourceMarkerFilter,
    resolve_sources,
    tutor_source,
)
from learny.tutor.domain.turn import asks_for_test, scenario_for, summary_of, text_chunks
from learny.tutor.infrastructure import queries

STREAMING: set[str] = set()
TUTOR_STEP_ID = "tutor"
SELF_TEST_STEP_ID = "self-test"


async def _save_learner_message(
    deps: TutorDeps,
    actor: Actor,
    conversation_id: str,
    text: str,
    input_context: Mapping[str, Any],
) -> str:
    """The learner message, the conversation title and the instant, in one short transaction."""
    payload: dict[str, Any] = {"include": input_context.get("include")}
    if input_context.get("passage") is not None:
        payload["passage"] = input_context["passage"]
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(
            tx,
            queries.INSERT_LEARNER_MESSAGE,
            {
                "conversation_id": conversation_id,
                "user_id": actor.user_id,
                "content": text,
                "context": json_text(payload),
            },
        )
        await queries.execute(
            tx,
            queries.UPDATE_CONVERSATION_TITLE,
            {
                "id": conversation_id,
                "user_id": actor.user_id,
                "title": text[:60],
                "now": to_iso(deps.clock.now()),
            },
        )
    if row is None:
        raise AppError("INTERNAL_ERROR", texts.MESSAGE_NOT_SAVED)
    return str(row["id"])


async def _save_tutor_message(
    deps: TutorDeps,
    actor: Actor,
    conversation_id: str,
    content: str,
    sources: list[dict[str, str]],
    follow_ups: list[dict[str, str]],
    self_test: Mapping[str, Any] | None = None,
) -> str:
    """The complete tutor answer, committed only once the stream finished."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(
            tx,
            queries.INSERT_TUTOR_MESSAGE,
            {
                "conversation_id": conversation_id,
                "user_id": actor.user_id,
                "content": content,
                "context": json_text({"followUpLabels": follow_up_labels(follow_ups)}),
                "sources": json_text(sources),
                "follow_ups": "{" + ",".join(entry["key"] for entry in follow_ups) + "}",
                "self_test": None if self_test is None else json_text(dict(self_test)),
            },
        )
    if row is None:
        raise AppError("INTERNAL_ERROR", texts.ANSWER_NOT_SAVED)
    return str(row["id"])


async def _emit_question(
    deps: TutorDeps,
    actor: Actor,
    ref: ConversationRef,
    context: BuiltContext,
    message_id: str,
    text: str,
) -> None:
    """`tutor/question-asked`, written in the transaction of the learner message."""
    async with deps.db.user_tx(actor) as tx:
        await tx.emit(
            "tutor/question-asked",
            {
                "userId": actor.user_id,
                "formationId": context.formation_id,
                "courseId": ref.courseId,
                "conversationId": ref.id,
                "messageId": message_id,
                "chapterId": ref.chapterId,
                "notionIds": context.notion_ids[:3],
                "text": text[:500],
            },
            event_id=f"tutor/question-asked:{message_id}",
        )


async def _module_of(deps: TutorDeps, actor: Actor, course_id: str) -> str:
    """`moduleOf`: the module of a course the caller owns, or a 404."""
    async with deps.db.user_tx(actor) as tx:
        row = await queries.one(tx, queries.COURSE_MODULE, {"course_id": course_id, "user_id": actor.user_id})
    if row is None:
        raise AppError("NOT_FOUND", texts.COURSE_NOT_FOUND)
    return str(row["module_id"])


async def _mark_failed(deps: TutorDeps, actor: Actor, learner_id: str, code: str) -> None:
    """`update tutor_messages set context = ... || {error}` after a failed stream."""
    async with deps.db.user_tx(actor) as tx:
        await queries.execute(
            tx,
            queries.MARK_MESSAGE_ERROR,
            {"id": learner_id, "user_id": actor.user_id, "payload": json_text({"error": code})},
        )


async def _deltas(first: str | None, iterator: Any) -> AsyncIterator[str]:
    """The primed first chunk, then the rest of the provider stream."""
    if first is not None:
        yield first
    async for chunk in iterator:
        yield chunk


async def _best_effort_mark(deps: TutorDeps, actor: Actor, learner_id: str, code: str) -> None:
    """The error flag of the learner message is best effort: the stream must still close cleanly."""
    try:
        await _mark_failed(deps, actor, learner_id, code)
    except Exception:  # a failed write never masks the stream error
        deps.logger.warn("tutor.stream.error_flag_failed", code="INTERNAL_ERROR")


async def _frames(
    deps: TutorDeps,
    actor: Actor,
    conversation_id: str,
    ref: ConversationRef,
    context: BuiltContext,
    body: Mapping[str, Any],
    message_id: str,
    test_me: bool,
    module_id: str,
    iterator: Any,
    first: str | None,
) -> AsyncIterator[str]:
    """The framed SSE body; every failure becomes an `error` chunk, never a broken response."""
    learner_id = str(body["learnerId"])
    try:
        yield frame(start(message_id))
        if test_me:
            asked = await ask_self_test(
                deps,
                actor,
                ref,
                {
                    "profile": context.profile,
                    "promptBlock": context.prompt_block,
                    "gapNotionId": context.gap_notion_id,
                    "notionIds": context.notion_ids,
                    "notionLabels": context.notion_labels,
                    "formationId": context.formation_id,
                },
                module_id,
            )
            content = texts.SELF_TEST_CONTENT.format(question=asked["question"])
            yield frame(text_start(SELF_TEST_STEP_ID))
            for chunk in text_chunks(content):
                yield frame(text_delta(SELF_TEST_STEP_ID, chunk))
            yield frame(text_end(SELF_TEST_STEP_ID))
            yield frame(data_self_test({"status": "pending"}))
            await _save_tutor_message(
                deps,
                actor,
                conversation_id,
                content,
                [],
                [],
                {"status": "pending", **asked["pending"]},
            )
            yield frame(finish())
            yield DONE
            return

        marker_filter = SourceMarkerFilter()
        visible = ""
        yield frame(text_start(TUTOR_STEP_ID))
        async for delta in _deltas(first, iterator):
            text = marker_filter.push(delta)
            if text != "":
                visible += text
                yield frame(text_delta(TUTOR_STEP_ID, text))
        finished_text, tokens = marker_filter.finish()
        if len(finished_text) > len(visible):
            yield frame(text_delta(TUTOR_STEP_ID, finished_text[len(visible) :]))
            visible = finished_text
        yield frame(text_end(TUTOR_STEP_ID))
        identifiers = tokens
        if not identifiers:
            identifiers = ["course"] if "chapter" in context.included_keys else ["tutor"]
        resolved = resolve_sources(
            identifiers,
            SourceContext(
                candidates=tuple(context.sources),
                chapter_position=context.chapter_position,
                primary_resource_title=context.primary_resource_title,
            ),
            lambda name, fields: deps.logger.warn(name, **dict(fields)),
        )
        sources = resolved.sources or [tutor_source(context.primary_resource_title)]
        follow_ups = build_follow_ups(context.confusion, body.get("followUp"))
        yield frame(data_sources(sources))
        yield frame(data_follow_ups(follow_ups))
        await _save_tutor_message(deps, actor, conversation_id, visible, sources, follow_ups)
        yield frame(finish())
        yield DONE
    except AppError as failure:
        deps.logger.warn("tutor.stream.failed", code=failure.code, error=repr(failure))
        await _best_effort_mark(deps, actor, learner_id, failure.code)
        yield frame(error(texts.STREAM_ANSWER_FAILED))
    except Exception as failure:
        deps.logger.warn("tutor.stream.failed", code="AI_TASK_FAILED", error=repr(failure))
        await _best_effort_mark(deps, actor, learner_id, "AI_TASK_FAILED")
        yield frame(error(texts.STREAM_ANSWER_FAILED))
    finally:
        STREAMING.discard(conversation_id)


async def stream_reply(
    deps: TutorDeps, actor: Actor, conversation_id: str, body: Mapping[str, Any]
) -> AsyncIterator[str]:
    """ET-3 - returns the SSE body; every error before the first byte is a typed `AppError`."""
    if conversation_id in STREAMING:
        raise AppError("CONFLICT", texts.STREAM_IN_PROGRESS)
    ref = await conversation_ref(deps, actor, conversation_id)
    messages = await conversation_messages(deps, actor, conversation_id)
    if any(
        row.get("role") == "tutor" and (self_test_of(row.get("self_test")) or {}).get("status") == "pending"
        for row in messages
    ):
        raise AppError("CONFLICT", texts.SELF_TEST_PENDING)
    text = str(body["text"])
    input_context = body.get("context") or {}
    follow_up = body.get("followUp")
    context = await build_context(deps, actor, ref, input_context, text)
    test_me = follow_up == "test_me" or asks_for_test(text)
    module_id = await _module_of(deps, actor, ref.courseId) if test_me else ""
    learner_id = await _save_learner_message(deps, actor, conversation_id, text, input_context)
    await _emit_question(deps, actor, ref, context, learner_id, text)

    history = [{"role": row["role"], "content": row["content"]} for row in messages]
    summary = summary_of(history)
    context_block = (
        context.prompt_block if summary == "" else f"{context.prompt_block}\n<summary>{summary}</summary>"
    )
    prompt = build_tutor_chat_prompt(
        context.profile,
        context.included_keys,
        context_block,
        history[-20:],
        text,
        context.gap_first,
    )
    iterator: Any = None
    first: str | None = None
    STREAMING.add(conversation_id)
    if not test_me:
        iterator = deps.llm.stream(
            TUTOR_TASK,
            TUTOR_CHAT_PROMPT_ID,
            step_input(prompt),
            scenario=scenario_for(text, follow_up, context.gap_first),
        ).__aiter__()
        try:
            first = await anext(iterator)
        except StopAsyncIteration:
            first = None
        except AppError:
            STREAMING.discard(conversation_id)
            raise

    return _frames(
        deps,
        actor,
        conversation_id,
        ref,
        context,
        {**body, "learnerId": learner_id},
        new_id(),
        test_me,
        module_id,
        iterator,
        first,
    )
