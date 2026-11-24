"""[SPEC-2207] The question bank jobs against the local stack.

A generated course enqueues one job per notion and format under the key `(learner, notion, format,
course version)`, and the nightly batch drains at most fifty rows: the variants are validated,
deduplicated by fingerprint and inserted once. A provider failure marks the job failed without
inventing a question, and a replayed batch inserts nothing.
"""

import json
from collections.abc import Mapping, Sequence
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import FIXED, create_notion
from factories.tutor_support import tutor_deps
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.tutor.application.question_bank import (
    BankPorts,
    prepare_question_bank,
    process_question_bank_jobs,
    request_question_banks,
)
from learny.tutor.domain.question_bank import QUESTION_BANK_FORMATS
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

COUNT_JOBS = text(
    "select count(*)::int as count from public.question_bank_jobs where user_id = cast(:user as uuid)"
)
JOB_ROWS = text(
    "select format::text as format, status::text as status, requested_count, complete, error_code "
    "from public.question_bank_jobs where user_id = cast(:user as uuid) order by format"
)
COUNT_BRICKS = text(
    "select count(*)::int as count from public.bricks "
    "where owner_id = cast(:user as uuid) and purpose = 'bank'"
)
FINGERPRINTS = text(
    "select v.fingerprint from public.brick_versions v "
    "join public.bricks b on b.id = v.brick_id "
    "where b.owner_id = cast(:user as uuid) and b.purpose = 'bank' order by v.fingerprint"
)


class FakeEmbedder:
    """A deterministic embedding: the passages query returns nothing, the sections fall back."""

    async def embed(self, texts_to_embed: list[str]) -> list[list[float]]:
        assert texts_to_embed
        return [[0.1, 0.2, 0.3]]


def choice_payload(notion_id: str, index: int) -> dict[str, Any]:
    return {
        "stem": f"Which account increases on debit ({index})?",
        "mode": "single",
        "options": [
            {"id": "a", "text": "The bank account", "correct": True, "notionId": notion_id},
            {"id": "b", "text": "The capital account", "correct": False, "notionId": notion_id},
        ],
        "explanation": "The receipt increases the bank account on the debit side.",
        "objective": "Tell an asset account from a liability account",
        "sources": [],
    }


def generator_of(calls: list[int]) -> Any:
    async def generate(context: Mapping[str, Any], format_name: str) -> list[Mapping[str, Any]]:
        calls.append(1)
        notion_id = str(context["notion"]["id"])
        return [
            {
                "notionId": notion_id,
                "format": format_name,
                "payload": choice_payload(notion_id, index),
            }
            for index in range(int(context["count"]))
        ]

    return generate


async def seed(tx: Any, name: str, notions: int = 1) -> dict[str, Any]:
    from factories.course_support import create_course, seed_learner

    learner = await seed_learner(tx, name, modules=1, chapters=1)
    notion_ids = [
        await create_notion(
            tx.conn, learner["formation"], learner["module"], learner["chapter"], position=index + 1
        )
        for index in range(notions)
    ]
    course_id = await create_course(
        tx,
        owner_id=learner["user"],
        formation_id=learner["formation"],
        module_id=learner["module"],
    )
    return {
        "userId": learner["user"],
        "formationId": learner["formation"],
        "moduleId": learner["module"],
        "notions": notion_ids,
        "courseId": course_id,
    }


async def count(conn: Any, statement: Any, **parameters: Any) -> int:
    return int((await conn.execute(statement, parameters)).mappings().all()[0]["count"])


async def test_a_generated_course_enqueues_one_job_per_notion_and_format(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], dict[str, Any], int, list[Any]]:
        fixture = await seed(tx, "Anna", notions=2)
        deps = tutor_deps(tx, now=FIXED)
        first = await prepare_question_bank(deps, fixture["userId"], fixture["courseId"], fixture["moduleId"])
        replay = await prepare_question_bank(
            deps, fixture["userId"], fixture["courseId"], fixture["moduleId"]
        )
        rows = (await tx.conn.execute(JOB_ROWS, {"user": fixture["userId"]})).mappings().all()
        return first, replay, await count(tx.conn, COUNT_JOBS, user=fixture["userId"]), rows

    first, replay, total, rows = await rolled_back(database, run)

    assert len(first["jobs"]) == 2 * len(QUESTION_BANK_FORMATS)
    assert len(replay["jobs"]) == len(first["jobs"])
    assert total == 2 * len(QUESTION_BANK_FORMATS)
    assert {row["format"] for row in rows} == set(QUESTION_BANK_FORMATS)
    assert {row["status"] for row in rows} == {"queued"}
    assert {int(row["requested_count"]) for row in rows} == {4}


async def test_the_nightly_batch_inserts_distinct_variants_once(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, int], int, list[str], Any, dict[str, int]]:
        fixture = await seed(tx, "Bastien")
        deps = tutor_deps(tx, now=FIXED)
        await request_question_banks(
            deps,
            fixture["userId"],
            fixture["courseId"],
            fixture["notions"],
            ["choice_question"],
            4,
            "course_generated",
        )
        calls: list[int] = []
        ports = BankPorts(embedder=FakeEmbedder(), generator=generator_of(calls))
        first = await process_question_bank_jobs(deps, limit=50, ports=ports)
        fingerprints = [
            str(row["fingerprint"])
            for row in (await tx.conn.execute(FINGERPRINTS, {"user": fixture["userId"]})).mappings().all()
        ]
        row = (await tx.conn.execute(JOB_ROWS, {"user": fixture["userId"]})).mappings().all()[0]
        replay = await process_question_bank_jobs(deps, limit=50, ports=ports)
        return first, await count(tx.conn, COUNT_BRICKS, user=fixture["userId"]), fingerprints, row, replay

    first, bricks, fingerprints, row, replay = await rolled_back(database, run)

    assert first["processed"] == 1
    assert first["inserted"] == 4
    assert first["failed"] == 0
    assert first["incomplete"] == 0
    assert bricks == 4
    assert len(set(fingerprints)) == 4
    assert row["status"] == "done"
    assert row["complete"] is True
    assert row["error_code"] is None
    assert replay == {"processed": 0, "inserted": 0, "failed": 0, "incomplete": 0}


async def test_an_unavailable_provider_marks_the_job_failed_without_inserting(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, int], Any, int]:
        fixture = await seed(tx, "Clara")
        deps = tutor_deps(tx, now=FIXED)
        await request_question_banks(
            deps,
            fixture["userId"],
            fixture["courseId"],
            fixture["notions"],
            ["choice_question"],
            4,
            "course_generated",
        )

        async def unavailable(context: Mapping[str, Any], format_name: str) -> list[Mapping[str, Any]]:
            del context, format_name
            raise AppError("AI_UNAVAILABLE")

        summary = await process_question_bank_jobs(
            deps, limit=50, ports=BankPorts(embedder=FakeEmbedder(), generator=unavailable)
        )
        row = (await tx.conn.execute(JOB_ROWS, {"user": fixture["userId"]})).mappings().all()[0]
        return summary, row, await count(tx.conn, COUNT_BRICKS, user=fixture["userId"])

    summary, row, bricks = await rolled_back(database, run)

    assert summary["failed"] == 1
    assert summary["processed"] == 0
    assert row["status"] == "failed"
    assert row["error_code"] == "AI_UNAVAILABLE"
    assert row["complete"] is False
    assert bricks == 0


async def test_the_batch_never_drains_more_than_its_limit(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, int], int]:
        fixture = await seed(tx, "Diane", notions=2)
        deps = tutor_deps(tx, now=FIXED)
        await request_question_banks(
            deps,
            fixture["userId"],
            fixture["courseId"],
            fixture["notions"],
            ["choice_question"],
            4,
            "course_generated",
        )
        calls: list[int] = []
        summary = await process_question_bank_jobs(
            deps, limit=1, ports=BankPorts(embedder=FakeEmbedder(), generator=generator_of(calls))
        )
        return summary, await count(tx.conn, COUNT_BRICKS, user=fixture["userId"])

    summary, bricks = await rolled_back(database, run)

    assert summary["processed"] == 1
    assert bricks == 4


async def test_a_course_without_notions_enqueues_nothing(database: Database) -> None:
    async def run(tx: Any) -> tuple[dict[str, Any], int]:
        fixture = await seed(tx, "Elise")
        deps = tutor_deps(tx, now=FIXED)
        await tx.conn.execute(
            text("delete from public.notions where formation_id = cast(:formation as uuid)"),
            {"formation": fixture["formationId"]},
        )
        result = await prepare_question_bank(
            deps, fixture["userId"], fixture["courseId"], fixture["moduleId"]
        )
        return result, await count(tx.conn, COUNT_JOBS, user=fixture["userId"])

    result, total = await rolled_back(database, run)

    assert result == {"jobs": []}
    assert total == 0


def test_the_requested_formats_are_the_bank_contract() -> None:
    assert len(QUESTION_BANK_FORMATS) == 4
    assert set(QUESTION_BANK_FORMATS) == {"choice_question", "open_question", "cloze", "matching"}
    assert json.dumps(list(QUESTION_BANK_FORMATS)) == (
        '["choice_question", "open_question", "cloze", "matching"]'
    )


def test_a_sequence_of_formats_is_ordered() -> None:
    formats: Sequence[str] = QUESTION_BANK_FORMATS
    assert list(formats) == sorted(formats, key=QUESTION_BANK_FORMATS.index)
