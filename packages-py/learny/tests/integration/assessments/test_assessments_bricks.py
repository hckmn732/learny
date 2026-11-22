"""[SPEC-2202] Brick lifecycle: report, correction and owner isolation (SPEC-501 ET-8).

Port of `packages/services/test/integration/bricks.test.ts` for the two routes of the assessments
context. Reporting excludes the brick from every draw until the next immutable version resolves the
open reports; two learners never see each other's brick (RLS, CA-6).
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
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")


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


async def seed_brick(conn: Any, learner: dict[str, Any]) -> dict[str, Any]:
    """Version 1 of an active choice question, as the tutor service writes it."""
    brick_id = await one(
        conn,
        """
        insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
        values (
          cast(:user as uuid), cast(:formation as uuid), 'choice_question',
          array[cast(:notion as uuid)], 'bank', 'active'
        )
        returning id::text as id
        """,
        user=learner["userId"],
        formation=learner["formationId"],
        notion=learner["notionIds"][0],
    )
    version_id = await one(
        conn,
        """
        insert into public.brick_versions (brick_id, version, payload, origin, created_by)
        values (
          cast(:brick as uuid), 1, cast(:payload as jsonb), 'tutor', 'tutor'
        )
        returning id::text as id
        """,
        brick=str(brick_id["id"]),
        payload=json.dumps(choice_payload(learner["notionIds"])),
    )
    return {"brickId": str(brick_id["id"]), "versionId": str(version_id["id"])}


async def brick_status(conn: Any, brick_id: str) -> str:
    found = await one(
        conn,
        "select status::text as status from public.bricks where id = cast(:brick as uuid)",
        brick=brick_id,
    )
    return str(found["status"])


async def test_a_report_opens_and_excludes_the_brick_from_draws(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        brick = await seed_brick(tx.conn, alice)
        result = await brick_service.report_brick(
            assessment_deps(tx),
            actor_for(alice["userId"]),
            brick["brickId"],
            {"reason": "Ambiguous wording."},
        )
        report = await one(
            tx.conn,
            """
            select status::text as status, reason, brick_version_id::text as version_id
              from public.brick_reports where id = cast(:report as uuid)
            """,
            report=result["reportId"],
        )
        return result, dict(report), await brick_status(tx.conn, brick["brickId"]), brick

    result, report, status, brick = await rolled_back(database, run)
    assert result["created"] is True
    assert result["status"] == "open"
    assert report["status"] == "open"
    assert report["reason"] == "Ambiguous wording."
    assert report["version_id"] == brick["versionId"]
    assert status == "reported"


async def test_a_second_report_is_the_same_open_report(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        brick = await seed_brick(tx.conn, alice)
        first = await brick_service.report_brick(
            assessment_deps(tx),
            actor_for(alice["userId"]),
            brick["brickId"],
            {"reason": "Ambiguous wording."},
        )
        second = await brick_service.report_brick(
            assessment_deps(tx), actor_for(alice["userId"]), brick["brickId"], {"reason": "Again."}
        )
        count = await one(
            tx.conn,
            """
            select count(*)::int as total from public.brick_reports
             where brick_id = cast(:brick as uuid) and status = 'open'
            """,
            brick=brick["brickId"],
        )
        return first, second, int(count["total"])

    first, second, total = await rolled_back(database, run)
    assert first["created"] is True
    assert second["created"] is False
    assert second["reportId"] == first["reportId"]
    assert total == 1


async def test_a_correction_creates_the_next_version_and_resolves_the_reports(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        brick = await seed_brick(tx.conn, alice)
        report = await brick_service.report_brick(
            assessment_deps(tx),
            actor_for(alice["userId"]),
            brick["brickId"],
            {"reason": "Ambiguous wording."},
        )
        corrected = await brick_service.correct_brick(
            assessment_deps(tx),
            actor_for(alice["userId"]),
            brick["brickId"],
            {
                "payload": choice_payload(alice["notionIds"], "Statement corrected by the learner?"),
                "expectedVersion": 1,
            },
        )
        resolved = await one(
            tx.conn,
            """
            select status::text as status, resolution, resolved_at
              from public.brick_reports where id = cast(:report as uuid)
            """,
            report=report["reportId"],
        )
        version = await one(
            tx.conn,
            """
            select created_by::text as created_by from public.brick_versions
             where id = cast(:version as uuid)
            """,
            version=corrected["versionId"],
        )
        return corrected, dict(resolved), dict(version), await brick_status(tx.conn, brick["brickId"])

    corrected, resolved, version, status = await rolled_back(database, run)
    assert corrected["version"] == 2
    assert status == "active"
    assert resolved["status"] == "corrected"
    assert resolved["resolution"]["by"] == "learner"
    assert resolved["resolution"]["versionId"] == corrected["versionId"]
    assert resolved["resolved_at"] is not None
    assert version["created_by"] == "learner"


async def test_an_invalid_correction_changes_nothing(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        brick = await seed_brick(tx.conn, alice)
        await brick_service.report_brick(
            assessment_deps(tx), actor_for(alice["userId"]), brick["brickId"], {"reason": "To be corrected."}
        )
        invalid = choice_payload(alice["notionIds"])
        invalid["options"] = [invalid["options"][0]]
        with pytest.raises(AppError) as error:
            await brick_service.correct_brick(
                assessment_deps(tx),
                actor_for(alice["userId"]),
                brick["brickId"],
                {"payload": invalid, "expectedVersion": 1},
            )
        versions = await one(
            tx.conn,
            "select count(*)::int as total from public.brick_versions where brick_id = cast(:brick as uuid)",
            brick=brick["brickId"],
        )
        return error.value, await brick_status(tx.conn, brick["brickId"]), int(versions["total"])

    error, status, versions = await rolled_back(database, run)
    assert error.code == "BRICK_INVALID"
    assert error.extra["errors"][0]["code"] == "SCHEMA_INVALID"
    assert status == "reported"
    assert versions == 1


async def test_a_stale_correction_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        brick = await seed_brick(tx.conn, alice)
        await brick_service.correct_brick(
            assessment_deps(tx),
            actor_for(alice["userId"]),
            brick["brickId"],
            {"payload": choice_payload(alice["notionIds"], "First correction?"), "expectedVersion": 1},
        )
        with pytest.raises(AppError) as error:
            await brick_service.correct_brick(
                assessment_deps(tx),
                actor_for(alice["userId"]),
                brick["brickId"],
                {"payload": choice_payload(alice["notionIds"], "Second correction?"), "expectedVersion": 1},
            )
        versions = await tx.conn.execute(
            text(
                "select version from public.brick_versions"
                " where brick_id = cast(:brick as uuid) order by version"
            ),
            {"brick": brick["brickId"]},
        )
        return error.value, [int(row["version"]) for row in versions.mappings().all()]

    error, versions = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert versions == [1, 2]


async def test_a_retired_brick_cannot_be_reported(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        brick = await seed_brick(tx.conn, alice)
        await tx.conn.execute(
            text("update public.bricks set status = 'retired' where id = cast(:brick as uuid)"),
            {"brick": brick["brickId"]},
        )
        with pytest.raises(AppError) as error:
            await brick_service.report_brick(
                assessment_deps(tx), actor_for(alice["userId"]), brick["brickId"], {"reason": "Too late."}
            )
        return error.value

    error = await rolled_back(database, run)
    assert error.code == "BRICK_RETIRED"


async def test_another_learner_cannot_report_or_correct_the_brick(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await seed_learner(tx.conn, "Alice")
        bob = await seed_learner(tx.conn, "Bob")
        brick = await seed_brick(tx.conn, alice)
        with pytest.raises(AppError) as report_error:
            await brick_service.report_brick(
                assessment_deps(tx), actor_for(bob["userId"]), brick["brickId"], {"reason": "Not mine."}
            )
        with pytest.raises(AppError) as correct_error:
            await brick_service.correct_brick(
                assessment_deps(tx),
                actor_for(bob["userId"]),
                brick["brickId"],
                {"payload": choice_payload(bob["notionIds"]), "expectedVersion": 1},
            )
        return report_error.value, correct_error.value, await brick_status(tx.conn, brick["brickId"])

    report_error, correct_error, status = await rolled_back(database, run)
    assert report_error.code == "NOT_FOUND"
    assert correct_error.code == "NOT_FOUND"
    assert status == "active"
