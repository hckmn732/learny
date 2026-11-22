"""[SPEC-2204] Reply stream of the tutor: SSH chunks, committed messages and Teste-moi.

Ported from `packages/services/src/tutor-chat/stream.test.ts` (SPEC-610 ET-2, ET-3, EF-8, ADR-0066):
the mock gateway and the seeded rows replace the fakes, and the assertions read the protocol order,
the committed rows and the queued event.
"""

import json
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import FIXED, actor_for
from factories.tutor_support import (
    RecordingGateway,
    UnavailableGateway,
    create_message,
    seed_tutor,
    tutor_deps,
)
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import tutor as texts
from learny.tutor.application.stream import STREAMING, stream_reply
from learny.tutor.domain.events import DONE
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2204")

CHAT_TYPES = [
    "start",
    "text-start",
    "text-delta",
    "text-end",
    "data-sources",
    "data-follow-ups",
    "finish",
]
SELF_TEST_TYPES = ["start", "text-start", "text-end", "data-self-test", "finish"]


async def drain(frames: Any) -> list[str]:
    return [frame async for frame in frames]


def body_of(payloads: list[str]) -> str:
    return "".join(payloads)


def parsed(frames: list[str]) -> tuple[list[dict[str, Any]], bool]:
    """The ordered `data:` payloads and whether the stream ended with `[DONE]`."""
    payloads = []
    done = False
    for frame in frames:
        if frame == DONE:
            done = True
            continue
        assert frame.startswith("data: "), frame
        payloads.append(json.loads(frame[len("data: ") :]))
    return payloads, done


def visible_text(payloads: list[dict[str, Any]], identifier: str) -> str:
    return "".join(
        str(payload["delta"])
        for payload in payloads
        if payload["type"] == "text-delta" and payload["id"] == identifier
    )


def message_body(text_value: str) -> dict[str, Any]:
    return {"text": text_value, "context": {"include": {}}}


async def test_the_answer_is_streamed_in_order_and_persisted_complete(database: Database) -> None:
    async def run(tx: Tx) -> tuple[list[str], list[dict[str, Any]], list[Any], dict[str, Any]]:
        seed = await seed_tutor(tx)
        frames = await drain(
            await stream_reply(
                tutor_deps(tx), actor_for(seed["user"]), seed["conversation"], message_body("Quelles dates ?")
            )
        )
        rows = await tx.conn.execute(
            text(
                "select role, content, sources, follow_ups from public.tutor_messages "
                "where conversation_id = cast(:id as uuid) order by created_at, id"
            ),
            {"id": seed["conversation"]},
        )
        events = await tx.conn.execute(
            text("select event_id, name, data from public.event_outbox where name = 'tutor/question-asked'")
        )
        return (
            frames,
            [dict(row) for row in rows.mappings().all()],
            [dict(e) for e in events.mappings().all()],
            seed,
        )

    frames, rows, events, seed = await rolled_back(database, run)
    payloads, done = parsed(frames)
    assert done is True
    assert [payload["type"] for payload in payloads] == CHAT_TYPES
    assert payloads[0]["messageId"]
    assert visible_text(payloads, "tutor").startswith("La date de pi")
    learners = [row for row in rows if row["role"] == "learner"]
    answers = [row for row in rows if row["role"] == "tutor" and row["content"] != "Bonjour."]
    assert len(learners) == 1
    assert learners[0]["content"] == "Quelles dates ?"
    assert len(answers) == 1
    assert answers[0]["content"] == visible_text(payloads, "tutor")
    sources = next(payload for payload in payloads if payload["type"] == "data-sources")
    assert sources["data"]["sources"] == answers[0]["sources"]
    follow_ups = next(payload for payload in payloads if payload["type"] == "data-follow-ups")
    assert [entry["key"] for entry in follow_ups["data"]["followUps"]] == answers[0]["follow_ups"]
    assert len(events) == 1
    assert events[0]["event_id"].startswith("tutor/question-asked:")
    assert events[0]["data"]["conversationId"] == seed["conversation"]
    assert events[0]["data"]["text"] == "Quelles dates ?"
    assert set() == STREAMING


async def test_the_conversation_title_starts_with_the_first_question(database: Database) -> None:
    async def run(tx: Tx) -> tuple[str, str]:
        seed = await seed_tutor(tx)
        await drain(
            await stream_reply(
                tutor_deps(tx),
                actor_for(seed["user"]),
                seed["conversation"],
                message_body("Une question longue"),
            )
        )
        row = await tx.conn.execute(
            text("select title from public.tutor_conversations where id = cast(:id as uuid)"),
            {"id": seed["conversation"]},
        )
        updated = await tx.conn.execute(
            text("select updated_at from public.tutor_conversations where id = cast(:id as uuid)"),
            {"id": seed["conversation"]},
        )
        return str(row.scalar_one()), str(updated.scalar_one())

    title, updated = await rolled_back(database, run)
    assert title == "Une question longue"
    assert updated


async def test_a_pending_self_test_blocks_a_new_question(database: Database) -> None:
    async def run(tx: Tx) -> str:
        seed = await seed_tutor(tx)
        await create_message(
            tx,
            conversation_id=seed["conversation"],
            user_id=seed["user"],
            role="tutor",
            content="Une question en attente.",
            self_test={"status": "pending"},
        )
        with pytest.raises(AppError) as error:
            await stream_reply(
                tutor_deps(tx), actor_for(seed["user"]), seed["conversation"], message_body("Bonjour")
            )
        return error.value.code

    assert await rolled_back(database, run) == "CONFLICT"


async def test_a_second_reply_on_the_same_conversation_is_refused(database: Database) -> None:
    async def run(tx: Tx) -> tuple[str, str, list[str]]:
        seed = await seed_tutor(tx)
        deps = tutor_deps(tx)
        actor = actor_for(seed["user"])
        first = await stream_reply(deps, actor, seed["conversation"], message_body("Bonjour"))
        assert seed["conversation"] in STREAMING
        started = await first.__anext__()
        with pytest.raises(AppError) as error:
            await stream_reply(deps, actor, seed["conversation"], message_body("Encore"))
        rest = await drain(first)
        return started, error.value.code, rest

    started, code, rest = await rolled_back(database, run)
    assert started.startswith("data: ")
    assert code == "CONFLICT"
    assert rest[-1] == DONE
    assert set() == STREAMING


async def test_the_self_test_branch_asks_without_a_model_stream(database: Database) -> None:
    async def run(tx: Tx) -> tuple[list[dict[str, Any]], Any, list[dict[str, Any]], dict[str, Any]]:
        seed = await seed_tutor(tx)
        gateway = RecordingGateway()
        frames = await drain(
            await stream_reply(
                tutor_deps(tx, llm=gateway),
                actor_for(seed["user"]),
                seed["conversation"],
                {"text": "Teste-moi", "context": {"include": {}}, "followUp": "test_me"},
            )
        )
        rows = await tx.conn.execute(
            text(
                "select role, content, self_test from public.tutor_messages "
                "where conversation_id = cast(:id as uuid) order by created_at, id"
            ),
            {"id": seed["conversation"]},
        )
        payloads, done = parsed(frames)
        assert done is True
        return payloads, gateway.calls, [dict(row) for row in rows.mappings().all()], seed

    payloads, calls, rows, seed = await rolled_back(database, run)
    assert [payload["type"] for payload in payloads if payload["type"] != "text-delta"] == SELF_TEST_TYPES
    assert [call["scenario"] for call in calls] == ["self-test-q1"]
    pending = next(row["self_test"] for row in rows if row["self_test"] is not None)
    content = visible_text(payloads, "self-test")
    assert content == texts.SELF_TEST_CONTENT.format(question=pending["question"])
    assert self_test_deltas(payloads) == [content[index : index + 60] for index in range(0, len(content), 60)]
    assert payloads[-2]["data"] == {"status": "pending"}
    assert [row for row in rows if row["role"] == "learner"]
    assert [row for row in rows if row["content"] == content]
    assert pending["status"] == "pending"
    assert pending["notionId"] == seed["notion"]
    assert pending["question"]
    assert pending["activityId"]
    assert pending["brickId"]
    assert pending["brickVersionId"]
    assert pending["attemptId"]


def self_test_deltas(payloads: list[dict[str, Any]]) -> list[str]:
    return [str(payload["delta"]) for payload in payloads if payload["type"] == "text-delta"]


async def test_a_failure_of_the_stream_is_an_error_chunk_and_a_flag(database: Database) -> None:
    class FailingGateway(RecordingGateway):
        async def stream(self, *args: Any, **kwargs: Any) -> Any:
            yield "debut"
            raise AppError("AI_TASK_FAILED")

    async def run(tx: Tx) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        seed = await seed_tutor(tx)
        frames = await drain(
            await stream_reply(
                tutor_deps(tx, llm=FailingGateway()),
                actor_for(seed["user"]),
                seed["conversation"],
                message_body("Bonjour"),
            )
        )
        rows = await tx.conn.execute(
            text(
                "select role, context from public.tutor_messages "
                "where conversation_id = cast(:id as uuid) order by created_at, id"
            ),
            {"id": seed["conversation"]},
        )
        payloads, _ = parsed(frames)
        return payloads, [dict(row) for row in rows.mappings().all()]

    payloads, rows = await rolled_back(database, run)
    assert [payload["type"] for payload in payloads] == [
        "start",
        "text-start",
        "text-delta",
        "error",
    ]
    assert payloads[-1]["errorText"] == texts.STREAM_ANSWER_FAILED
    assert [row["role"] for row in rows] == ["tutor", "learner"]
    assert rows[1]["context"]["error"] == "AI_TASK_FAILED"
    assert set() == STREAMING


async def test_a_model_that_is_down_fails_before_the_first_byte(database: Database) -> None:
    async def run(tx: Tx) -> tuple[str, int]:
        seed = await seed_tutor(tx)
        with pytest.raises(AppError) as error:
            await stream_reply(
                tutor_deps(tx, llm=UnavailableGateway()),
                actor_for(seed["user"]),
                seed["conversation"],
                message_body("Bonjour"),
            )
        rows = await tx.conn.execute(
            text(
                "select count(*)::int as total from public.tutor_messages "
                "where conversation_id = cast(:id as uuid)"
            ),
            {"id": seed["conversation"]},
        )
        return error.value.code, int(rows.scalar_one())

    code, total = await rolled_back(database, run)
    assert code == "AI_UNAVAILABLE"
    assert total == 2


async def test_the_history_is_summarised_beyond_twenty_messages(database: Database) -> None:
    async def run(tx: Tx) -> list[dict[str, Any]]:
        seed = await seed_tutor(tx)
        for index in range(22):
            await create_message(
                tx,
                conversation_id=seed["conversation"],
                user_id=seed["user"],
                role="learner" if index % 2 == 0 else "tutor",
                content=f"message {index}",
                created_at=FIXED.replace(minute=index % 60, second=index % 60),
            )
        gateway = RecordingGateway()
        await drain(
            await stream_reply(
                tutor_deps(tx, llm=gateway),
                actor_for(seed["user"]),
                seed["conversation"],
                message_body("Bonjour"),
            )
        )
        return gateway.calls

    calls = await rolled_back(database, run)
    chat = [call for call in calls if call["promptId"] == "tutor-chat.tutor-chat"]
    assert len(chat) == 1
    last = chat[0]["input"].messages[-1]
    assert "<summary>" in last["content"]
    assert len(chat[0]["input"].messages) == 21
