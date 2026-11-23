"""[SPEC-2302] Brick creation and public payload (SPEC-501 EF-1, EF-6).

Port of the `createBrick` and `getPublicBrick` cases of `packages/services/src/bricks/
brick-service.test.ts`, run on the real database: a valid draft creates the brick and its
version 1 in one transaction, an unknown formation or an invalid payload is refused, and the
public payload of a version is only served to its owner, without the correct answers.
"""

import json
from typing import Any

import pytest
from factories.assessments_deps import assessment_deps
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    one,
)
from learny.assessments.application import bricks as brick_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError

pytestmark = pytest.mark.spec("SPEC-2302")


def choice_payload(notion_ids: list[str], stem: str = "Which account increases on debit?") -> dict[str, Any]:
    """A valid single-choice payload, exactly the shape of the TypeScript fixture."""
    return {
        "stem": stem,
        "mode": "single",
        "options": [
            {"id": "a", "text": "The bank account", "correct": True, "notionId": notion_ids[0]},
            {"id": "b", "text": "The capital account", "correct": False, "notionId": notion_ids[1]},
        ],
        "explanation": "The receipt increases the bank account on the debit side.",
        "objective": "Tell an asset account from a liability account",
        "sources": [],
    }


async def seed_learner(conn: Any, name: str) -> dict[str, Any]:
    """One learner with a formation, a module and two notions."""
    user_id = await create_user(conn, name, timezone="Europe/Paris")
    formation_id = await create_formation(conn, user_id, title="Accounting")
    module_id = await create_module(conn, formation_id, 1, title="Partie double")
    chapter_id = await create_chapter(conn, formation_id, module_id)
    notion_ids = [
        await create_notion(conn, formation_id, module_id, chapter_id, position=position)
        for position in (1, 2)
    ]
    return {"userId": user_id, "formationId": formation_id, "notionIds": notion_ids}


MISSING = "99999999-9999-4999-8999-999999999999"


def choice_draft(learner: dict[str, Any], **override: Any) -> dict[str, Any]:
    return {
        "type": "choice_question",
        "formationId": learner["formationId"],
        "purpose": "bank",
        "notionIds": [learner["notionIds"][0]],
        "origin": "tutor",
        "payload": choice_payload(learner["notionIds"]),
        "createdBy": "tutor",
        **override,
    }


async def test_a_valid_draft_creates_the_brick_and_its_version_one(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        created = await brick_service.create_brick(
            assessment_deps(tx), actor_for(alice["userId"]), choice_draft(alice)
        )
        stored = await one(
            tx.conn,
            """
            select b.type::text as type, b.purpose::text as purpose, b.status::text as status,
                   b.current_version, b.notion_ids::text[] as notion_ids,
                   v.version, v.fingerprint, v.origin::text as origin,
                   v.created_by::text as created_by
              from public.bricks b
              join public.brick_versions v on v.brick_id = b.id
             where b.id = cast(:brick as uuid) and v.id = cast(:version as uuid)
            """,
            brick=created["brickId"],
            version=created["versionId"],
        )
        return created, dict(stored), alice

    created, stored, alice = await rolled_back(database, run)
    assert created["version"] == 1
    assert created["fingerprint"] == stored["fingerprint"]
    assert stored == {
        "type": "choice_question",
        "purpose": "bank",
        "status": "active",
        "current_version": 1,
        "notion_ids": [alice["notionIds"][0]],
        "version": 1,
        "fingerprint": created["fingerprint"],
        "origin": "tutor",
        "created_by": "tutor",
    }


async def test_an_unknown_formation_and_an_invalid_payload_are_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        deps, actor = assessment_deps(tx), actor_for(alice["userId"])
        errors: list[AppError] = []
        for draft in (
            choice_draft(alice, formationId=MISSING),
            choice_draft(alice, payload={**choice_payload(alice["notionIds"]), "options": []}),
            choice_draft(alice, createdBy="robot"),
        ):
            with pytest.raises(AppError) as caught:
                await brick_service.create_brick(deps, actor, draft)
            errors.append(caught.value)
        count = await one(
            tx.conn,
            "select count(*)::int as n from public.bricks where owner_id = cast(:user as uuid)",
            user=alice["userId"],
        )
        return errors, int(count["n"])

    errors, count = await rolled_back(database, run)
    assert [error.code for error in errors] == ["NOT_FOUND", "BRICK_INVALID", "VALIDATION_FAILED"]
    assert errors[0].detail == "Formation introuvable."
    assert errors[1].extra["errors"]
    assert count == 0


async def test_the_public_payload_is_served_to_its_owner_only(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        bob = await seed_learner(tx.conn, "Bob")
        deps = assessment_deps(tx)
        created = await brick_service.create_brick(deps, actor_for(alice["userId"]), choice_draft(alice))
        public = await brick_service.get_public_brick(deps, actor_for(alice["userId"]), created["versionId"])
        refused: list[AppError] = []
        for actor, version_id in (
            (actor_for(bob["userId"]), created["versionId"]),
            (actor_for(alice["userId"]), MISSING),
            (actor_for(alice["userId"]), "not-a-uuid"),
        ):
            with pytest.raises(AppError) as caught:
                await brick_service.get_public_brick(deps, actor, version_id)
            refused.append(caught.value)
        return created, public, refused

    created, public, refused = await rolled_back(database, run)
    assert public["brickId"] == created["brickId"]
    assert public["versionId"] == created["versionId"]
    serialized = json.dumps(public)
    assert '"correct"' not in serialized
    assert "The bank account" in serialized
    assert [error.code for error in refused] == ["NOT_FOUND", "NOT_FOUND", "VALIDATION_FAILED"]
    assert refused[0].detail == "Version de brique introuvable."
