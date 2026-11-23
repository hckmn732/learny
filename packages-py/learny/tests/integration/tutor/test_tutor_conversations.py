"""[SPEC-2204] Conversations of the tutor: private reads under RLS, greeting and message mapping.

Ported from `packages/services/src/tutor-chat/conversations.test.ts` (SPEC-610 ET-3, BR-TUT-07,
ADR-0040): the seeded rows replace the fake client, and every read runs as the authenticated
learner, so a foreign conversation is a real 404 instead of a stub.
"""

from typing import Any

import pytest
from factories.course_support import create_course
from factories.db_support import rolled_back
from factories.identity_support import FIXED, actor_for
from factories.tutor_support import (
    create_conversation_row,
    create_message,
    seed_tutor,
    tutor_deps,
)
from learny.shared.db.uow import Database, Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import tutor as texts
from learny.tutor.application.conversations import (
    ALL_KEYS_INCLUDED,
    conversation_by_course,
    conversation_by_id,
    conversation_messages,
    conversation_ref,
    create_conversation,
    last_context_of,
    list_conversations,
    message_dto,
    self_test_of,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2204")

GREETING_OF_ONE_RESOURCE = (
    texts.GREETING_RESOURCES.format(resources=texts.RESOURCE_SINGULAR, titles="support de cours")
    + " "
    + texts.GREETING_QUESTION
)


async def test_the_first_open_writes_the_code_composed_greeting(database: Database) -> None:
    async def run(tx: Tx) -> tuple[dict[str, Any], list[Any], dict[str, Any]]:
        seed = await seed_tutor(tx, with_conversation=False)
        view = await create_conversation(
            tutor_deps(tx), actor_for(seed["user"]), seed["course"], seed["chapter"]
        )
        rows = await tx.conn.execute(
            text(
                "select context from public.tutor_messages "
                "where conversation_id = cast(:id as uuid) and role = 'tutor'"
            ),
            {"id": view["id"]},
        )
        return view, [dict(row) for row in rows.mappings().all()], seed

    view, rows, seed = await rolled_back(database, run)
    assert view["courseId"] == seed["course"]
    assert view["chapterId"] == seed["chapter"]
    assert view["title"] is None
    assert view["pendingSelfTest"] is False
    assert [entry["key"] for entry in view["contextItems"]] == [
        "formation",
        "chapter",
        "resources",
        "profile",
    ]
    assert len(view["messages"]) == 1
    greeting = view["messages"][0]
    assert greeting["role"] == "tutor"
    assert greeting["content"] == GREETING_OF_ONE_RESOURCE
    assert [entry["key"] for entry in greeting["followUps"]] == ["rephrase", "example", "test_me"]
    assert greeting["sources"] == []
    assert greeting["selfTest"] is None
    assert rows[0]["context"]["chapterId"] == seed["chapter"]
    assert rows[0]["context"]["followUpLabels"] == texts.FOLLOW_UP_LABELS


async def test_a_course_of_another_owner_is_not_found(database: Database) -> None:
    async def run(tx: Tx) -> str:
        owner = await seed_tutor(tx, "Proprietaire", with_conversation=False)
        intruder = await seed_tutor(tx, "Intrus", with_conversation=False)
        with pytest.raises(AppError) as error:
            await create_conversation(
                tutor_deps(tx), actor_for(intruder["user"]), owner["course"], owner["chapter"]
            )
        return error.value.code

    assert await rolled_back(database, run) == "NOT_FOUND"


async def test_a_conversation_of_another_owner_is_a_404_and_its_messages_are_invisible(
    database: Database,
) -> None:
    async def run(tx: Tx) -> tuple[str, list[Any]]:
        owner = await seed_tutor(tx, "Proprietaire")
        intruder = await seed_tutor(tx, "Intrus", with_conversation=False)
        deps = tutor_deps(tx)
        actor = actor_for(intruder["user"])
        with pytest.raises(AppError) as error:
            await conversation_ref(deps, actor, owner["conversation"])
        messages = await conversation_messages(deps, actor, owner["conversation"])
        with pytest.raises(AppError) as by_id:
            await conversation_by_id(deps, actor, owner["conversation"])
        assert by_id.value.code == error.value.code == "NOT_FOUND"
        return error.value.code, messages

    code, messages = await rolled_back(database, run)
    assert code == "NOT_FOUND"
    assert messages == []


async def test_conversations_are_listed_by_last_activity(database: Database) -> None:
    async def run(tx: Tx) -> tuple[dict[str, Any], dict[str, Any]]:
        seed = await seed_tutor(tx)
        older = await create_conversation_row(
            tx, user_id=seed["user"], course_id=seed["course"], title="Ancienne"
        )
        await create_message(
            tx,
            conversation_id=older,
            user_id=seed["user"],
            role="learner",
            content="Question ancienne.",
            created_at=FIXED.replace(hour=11),
        )
        newer = await create_conversation_row(
            tx, user_id=seed["user"], course_id=seed["course"], title="Recente"
        )
        await create_message(
            tx,
            conversation_id=newer,
            user_id=seed["user"],
            role="tutor",
            content="Reponse recente.",
            created_at=FIXED.replace(hour=13),
        )
        listed = await list_conversations(tutor_deps(tx), actor_for(seed["user"]), seed["course"])
        return listed, {"older": older, "newer": newer, "seeded": seed["conversation"]}

    listed, ids = await rolled_back(database, run)
    assert [item["id"] for item in listed["items"]] == [
        ids["newer"],
        ids["seeded"],
        ids["older"],
    ]
    first = listed["items"][0]
    assert first["title"] == "Recente"
    assert first["createdAt"] == "2026-11-11T12:20:00.000Z"
    assert first["lastMessageAt"] == "2026-11-11T13:20:00.000Z"


async def test_messages_carry_their_sources_follow_ups_and_self_test(database: Database) -> None:
    async def run(tx: Tx) -> dict[str, Any]:
        seed = await seed_tutor(tx)
        conversation = seed["conversation"]
        await create_message(
            tx,
            conversation_id=conversation,
            user_id=seed["user"],
            role="learner",
            content="Question du jour.",
            context={
                "include": {"gap": False},
                "passage": {"text": "Un passage assez long."},
            },
            created_at=FIXED.replace(minute=21),
        )
        await create_message(
            tx,
            conversation_id=conversation,
            user_id=seed["user"],
            role="tutor",
            content="Reponse du jour.",
            sources=[{"label": "Guide FI, p. 4"}, {"label": 42}, None],
            follow_ups=["rephrase", "inconnu", "compare"],
            self_test={
                "status": "answered",
                "correct": True,
                "masteryBefore": 35,
                "masteryAfter": 52,
            },
            context={"followUpLabels": {"rephrase": "Dit autrement", "compare": "La difference"}},
            created_at=FIXED.replace(minute=22),
        )
        await create_message(
            tx,
            conversation_id=conversation,
            user_id=seed["user"],
            role="tutor",
            content="Une question en attente ?",
            self_test={"status": "pending"},
            created_at=FIXED.replace(minute=23),
        )
        return await conversation_by_id(tutor_deps(tx), actor_for(seed["user"]), conversation)

    view = await rolled_back(database, run)
    assert view["pendingSelfTest"] is True
    assert [entry["role"] for entry in view["messages"]] == ["tutor", "learner", "tutor", "tutor"]
    answer = view["messages"][2]
    assert answer["sources"] == [{"label": "Guide FI, p. 4"}]
    assert answer["followUps"] == [
        {"key": "rephrase", "label": "Dit autrement"},
        {"key": "compare", "label": "La difference"},
    ]
    assert answer["selfTest"] == {
        "status": "answered",
        "correct": True,
        "masteryBefore": 35,
        "masteryAfter": 52,
    }
    assert view["messages"][3]["selfTest"] == {"status": "pending"}


def test_the_last_learner_context_is_replayed_and_falls_back_to_every_key() -> None:
    rows = [
        {
            "role": "learner",
            "context": {"include": {"gap": False}, "passage": {"text": "Un passage assez long."}},
        },
        {"role": "tutor", "context": {"include": {"formation": False}}},
    ]
    assert last_context_of(rows) == {
        "include": {"gap": False},
        "passage": {"text": "Un passage assez long."},
    }
    assert last_context_of([]) == ALL_KEYS_INCLUDED
    assert last_context_of([{"role": "learner", "context": "pas du json"}]) == ALL_KEYS_INCLUDED
    assert last_context_of([{"role": "learner", "context": None}]) == ALL_KEYS_INCLUDED


def test_a_message_row_tolerates_postgres_text_columns_and_invalid_values() -> None:
    dto = message_dto(
        {
            "id": "44444444-4444-4444-8444-444444444444",
            "role": "learner",
            "content": "Question",
            "sources": "pas un tableau",
            "follow_ups": '{rephrase,"compare"}',
            "self_test": '{"status":"pending"}',
            "context": '{"followUpLabels":{"test_me":"Teste-moi"}}',
            "created_at": "2026-11-11T12:20:00Z",
        }
    )
    assert dto["sources"] == []
    assert dto["followUps"] == [
        {"key": "rephrase", "label": "rephrase"},
        {"key": "compare", "label": "compare"},
    ]
    assert dto["selfTest"] == {"status": "pending"}
    assert dto["createdAt"] == "2026-11-11T12:20:00.000Z"
    assert self_test_of({"status": "inconnu"}) is None
    assert self_test_of(None) is None


async def test_a_conversation_is_found_by_id_and_by_course(database: Database) -> None:
    async def run(tx: Tx) -> tuple[Any, Any, Any]:
        seed = await seed_tutor(tx)
        deps = tutor_deps(tx)
        actor = actor_for(seed["user"])
        by_id = await conversation_ref(deps, actor, seed["conversation"])
        by_course = await conversation_by_course(deps, actor, seed["course"], seed["chapter"])
        other_course = await create_course(
            tx,
            owner_id=seed["user"],
            formation_id=seed["formation"],
            module_id=seed["module"],
            version=2,
            is_current=False,
        )
        missing = await conversation_by_course(deps, actor, other_course, seed["chapter"])
        return (by_id, by_course, missing)

    by_id, by_course, missing = await rolled_back(database, run)
    assert by_id.chapterId == by_course.chapterId
    assert missing is None
