"""[SPEC-4001] Simple mode end to end in mock: deposit, analysis, programme, diagnostic (CA-1..CA-7)."""

import json
from datetime import datetime
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.formation_support import formation_deps
from factories.identity_support import (
    actor_for,
    assign_task,
    create_credential,
    create_user,
    one,
)
from learny.assessments.application import quiz, quiz_submit
from learny.formation.application import cadrage as cadrage_service
from learny.formation.application import programme as programme_service
from learny.formation.application.simple import analysis as simple_analysis
from learny.formation.application.simple import create as simple_create
from learny.formation.application.simple import diagnostic as simple_diagnostic
from learny.formation.application.simple import sources as simple_sources
from learny.formation.application.simple import status as simple_status
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.outbox.events import Event
from learny_worker import consumers as worker_consumers
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-4001")

TASKS = ("simple_analysis", "programme", "course")
NOW = datetime.fromisoformat("2026-11-11T12:20:00+00:00")


def _event(user: str, formation_id: str) -> Event:
    return Event(
        event_id=f"simple-generation-requested:{formation_id}",
        name="simple.generation.requested",
        data={"userId": user, "formationId": formation_id},
        user_id=user,
        created_at=NOW,
    )


async def grant_models(conn: Any, user_id: str, tasks: tuple[str, ...] = TASKS) -> None:
    """BR-IA-06 - a personal model is chosen for every task the analysis needs."""
    credential = await create_credential(conn, user_id, ["gpt-test"])
    for task in tasks:
        await assign_task(conn, user_id, task, credential, "gpt-test")


async def seed_ready_document(
    conn: Any,
    formation_id: str,
    user_id: str,
    resource_id: str,
    *,
    role: str,
    pages: int,
    bookmarks: list[list[Any]] | None = None,
    chunks: list[tuple[int, str]] | None = None,
) -> None:
    """Simulates the ingestion of a deposited document: ready, pages, bookmarks and passages."""
    metadata = {"role": role, "pages": pages}
    if bookmarks is not None:
        metadata["bookmarks"] = bookmarks
    await conn.execute(
        text(
            "update public.resources set status = 'ready', metadata = cast(:metadata as jsonb), "
            "mime = 'application/pdf' where id = cast(:id as uuid)"
        ),
        {"id": resource_id, "metadata": json.dumps(metadata, ensure_ascii=False)},
    )
    for position, (page, body) in enumerate(chunks or []):
        await conn.execute(
            text(
                "insert into public.resource_chunks ("
                " resource_id, owner_id, formation_id, position, text, location"
                ") values (cast(:resource as uuid), cast(:user as uuid), cast(:formation as uuid),"
                " :position, :text, cast(:location as jsonb))"
            ),
            {
                "resource": resource_id,
                "user": user_id,
                "formation": formation_id,
                "position": position,
                "text": body,
                "location": json.dumps({"page": page, "charStart": 0, "charEnd": len(body)}),
            },
        )


COURSE_CHUNKS = [
    (1, "Introduction a la comptabilite generale."),
    (81, "Le plan comptable et les comptes generaux."),
    (161, "La saisie des pieces comptables et le journal universel."),
]
COURSE_BOOKMARKS = [
    (1, "Introduction"),
    (81, "Plan comptable"),
    (161, "Saisie des pieces"),
]
COURSE_PAGES = 240


async def open_formation(tx: Any, name: str = "Alice") -> tuple[Any, str, Any]:
    """A learner with the three models and a simple-mode formation."""
    user = await create_user(tx.conn, name)
    await grant_models(tx.conn, user)
    deps = formation_deps(tx)
    created = await simple_create.create_simple_formation(
        deps, actor_for(user), {"motivation": "Preparer l examen"}
    )
    return deps, user, created["formationId"]


async def deposit_two_documents(tx: Any, deps: Any, user: str, formation_id: str) -> None:
    """EF-2 - a course PDF and an exercises PDF, both ready."""
    course = await simple_sources.create_simple_upload(
        deps,
        actor_for(user),
        formation_id,
        {"fileName": "Comptabilite generale.pdf", "mime": "application/pdf", "sizeBytes": 2048},
        "key-course",
    )
    await seed_ready_document(
        tx.conn,
        formation_id,
        user,
        course["resourceId"],
        role="course",
        pages=COURSE_PAGES,
        bookmarks=COURSE_BOOKMARKS,
        chunks=COURSE_CHUNKS,
    )
    exercises = await simple_sources.create_simple_upload(
        deps,
        actor_for(user),
        formation_id,
        {"fileName": "TD corriges.pdf", "mime": "application/pdf", "sizeBytes": 1024},
        "key-exercises",
    )
    await seed_ready_document(tx.conn, formation_id, user, exercises["resourceId"], role="exercises", pages=2)


async def state_of(tx: Any, user: str, formation_id: str) -> dict[str, Any]:
    return await simple_status.read_simple_state(tx, user, formation_id)


async def test_full_flow_mock(database: Database) -> None:
    """CA-1, CA-4 - deposit, analysis, proposed programme with page ranges, then generation."""

    async def run(tx: Any) -> dict[str, Any]:
        deps, user, formation_id = await open_formation(tx)
        created = await state_of(tx, user, formation_id)
        assert created["status"] == "collecting"
        assert created["title"] == "Nouvelle formation"
        assert [step["state"] for step in created["steps"]] == ["todo"] * 4
        await deposit_two_documents(tx, deps, user, formation_id)

        sources = (await state_of(tx, user, formation_id))["sources"]
        assert [source["role"] for source in sources] == ["course", "exercises"]

        launched = await simple_analysis.launch_analysis(deps, actor_for(user), formation_id)
        assert launched["status"] == "analysing"
        await simple_analysis.run_analysis(deps, user, formation_id)

        proposed = await state_of(tx, user, formation_id)
        assert proposed["status"] == "proposed"
        assert [step["state"] for step in proposed["steps"]] == ["done"] * 4
        assert proposed["chaptersFound"], "chaptersFound must not be empty"
        assert proposed["error"] is None
        assert proposed["proposalVersion"] == 1

        proposal = await one(
            tx.conn,
            "select payload, source::text as source from public.programme_proposals "
            "where formation_id = cast(:id as uuid) and version = 1",
            id=formation_id,
        )
        assert proposal["source"] == "document"
        payload = proposal["payload"]
        assert len(payload["modules"]) >= 3
        assert all(module.get("pageFrom") is not None for module in payload["modules"])
        assert all(module.get("pageTo") is not None for module in payload["modules"])

        formation = await one(
            tx.conn,
            "select status::text as status, objectives::text[] as objectives, title "
            "from public.formations where id = cast(:id as uuid)",
            id=formation_id,
        )
        assert formation["status"] == "programme_proposed"
        assert formation["objectives"] == ["operational"]
        profile = await one(
            tx.conn,
            "select cadrage_profile from public.formations where id = cast(:id as uuid)",
            id=formation_id,
        )
        assert all(entry["state"] == "done" for entry in profile["cadrage_profile"].values())

        await programme_service.validate_proposal(deps, actor_for(user), formation_id, {"expectedVersion": 1})
        chapters = await tx.conn.execute(
            text(
                "select count(*)::int as total from public.chapter_progress "
                "where user_id = cast(:user as uuid) and contributions_status = 'done'"
            ),
            {"user": user},
        )
        assert chapters.mappings().all()[0]["total"] >= 1
        bound = await tx.conn.execute(
            text(
                "select count(*)::int as total from public.chapter_sources "
                "where formation_id = cast(:id as uuid)"
            ),
            {"id": formation_id},
        )
        assert bound.mappings().all()[0]["total"] >= 1

        # EF-9, EF-12 - the first two modules are generated directly, the rest is queued.
        generated: list[str] = []

        class Recorder:
            async def generate_course(self, _deps: Any, _user: str, module_id: str, _event: str) -> None:
                generated.append(module_id)

        original = worker_consumers.tutor
        worker_consumers.tutor = Recorder()  # type: ignore[assignment]
        try:
            await worker_consumers.formation_simple_generation(deps, _event(user, formation_id))
        finally:
            worker_consumers.tutor = original
        return {"generated": generated, "formation_id": formation_id}

    result = await rolled_back(database, run)
    assert len(result["generated"]) == 2


async def prepare_active_formation(tx: Any) -> tuple[Any, str, str]:
    """A validated simple-mode formation with a proposed programme."""
    deps, user, formation_id = await open_formation(tx)
    await deposit_two_documents(tx, deps, user, formation_id)
    await simple_analysis.launch_analysis(deps, actor_for(user), formation_id)
    await simple_analysis.run_analysis(deps, user, formation_id)
    await programme_service.validate_proposal(deps, actor_for(user), formation_id, {"expectedVersion": 1})
    return deps, user, formation_id


async def test_analysis_refused_without_model(database: Database) -> None:
    """CA-2 - without a model for a required task, the analysis is refused and the sources stay."""

    async def run(tx: Any) -> AppError:
        user = await create_user(tx.conn, "Bob")
        deps = formation_deps(tx)
        created = await simple_create.create_simple_formation(deps, actor_for(user), {})
        formation_id = created["formationId"]
        upload = await simple_sources.create_simple_upload(
            deps,
            actor_for(user),
            formation_id,
            {"fileName": "Cours.pdf", "mime": "application/pdf", "sizeBytes": 100},
            "key-1",
        )
        await seed_ready_document(tx.conn, formation_id, user, upload["resourceId"], role="course", pages=2)
        with pytest.raises(AppError) as failure:
            await simple_analysis.launch_analysis(deps, actor_for(user), formation_id)
        state = await state_of(tx, user, formation_id)
        assert state["sources"], "the deposited documents stay"
        assert state["status"] == "collecting"
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "AI_NOT_CONFIGURED"
    assert error.status == 409
    assert error.extra["details"]["tasks"] == ["simple_analysis", "programme", "course"]


async def test_role_locked_once_the_analysis_started(database: Database) -> None:
    """CA-3 - the guessed role is corrected before the launch, refused after it."""

    async def run(tx: Any) -> tuple[dict[str, Any], AppError]:
        deps, user, formation_id = await open_formation(tx)
        upload = await simple_sources.create_simple_upload(
            deps,
            actor_for(user),
            formation_id,
            {"fileName": "Annales DCG 2023.pdf", "mime": "application/pdf", "sizeBytes": 100},
            "key-1",
        )
        assert upload["role"] == "exam_papers"
        corrected = await simple_sources.set_resource_role(
            deps, actor_for(user), upload["resourceId"], {"role": "course"}
        )
        assert corrected["role"] == "course"
        await seed_ready_document(tx.conn, formation_id, user, upload["resourceId"], role="course", pages=2)
        await simple_analysis.launch_analysis(deps, actor_for(user), formation_id)
        with pytest.raises(AppError) as failure:
            await simple_sources.set_resource_role(
                deps, actor_for(user), upload["resourceId"], {"role": "exercises"}
            )
        return corrected, failure.value

    corrected, error = await rolled_back(database, run)
    assert corrected == {"resourceId": corrected["resourceId"], "role": "course"}
    assert error.code == "SIMPLE_ANALYSIS_LOCKED"
    assert error.status == 409


async def test_a_tutor_formation_is_refused(database: Database) -> None:
    """ET-2 - a simple-mode operation never applies to a tutor-mode formation."""

    async def run(tx: Any) -> AppError:
        user = await create_user(tx.conn, "Carol")
        deps = formation_deps(tx)
        created = await cadrage_service.create_formation(deps, actor_for(user), {"title": "SAP"})
        formation_id = created["formation"]["id"]
        with pytest.raises(AppError) as failure:
            await state_of(tx, user, formation_id)
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "SIMPLE_NOT_SIMPLE"


async def test_rls_other_user(database: Database) -> None:
    """CA-7 - another learner can neither read nor modify the analysis and the sources."""

    async def run(tx: Any) -> tuple[AppError, AppError]:
        deps, user, formation_id = await open_formation(tx)
        await deposit_two_documents(tx, deps, user, formation_id)
        intruder = await create_user(tx.conn, "Mallory")
        with pytest.raises(AppError) as read_failure:
            await state_of(tx, intruder, formation_id)
        resource_id = await one(
            tx.conn,
            "select id::text as id from public.resources where formation_id = cast(:id as uuid) limit 1",
            id=formation_id,
        )
        with pytest.raises(AppError) as role_failure:
            await simple_sources.set_resource_role(
                deps, actor_for(intruder), resource_id["id"], {"role": "course"}
            )
        return read_failure.value, role_failure.value

    read_error, role_error = await rolled_back(database, run)
    assert read_error.code == "NOT_FOUND"
    assert role_error.code == "NOT_FOUND"


async def test_deadline_patch(database: Database) -> None:
    """CA-6 - a fixed deadline sets the exam objective and ends the plan fourteen days before."""

    async def run(tx: Any) -> tuple[Any, Any]:
        deps, user, formation_id = await prepare_active_formation(tx)
        await cadrage_service.update_formation_title(
            deps, actor_for(user), formation_id, {"endDate": "2026-12-31"}
        )
        with_deadline = await one(
            tx.conn,
            "select objectives::text[] as objectives, end_date::text as end_date "
            "from public.formations where id = cast(:id as uuid)",
            id=formation_id,
        )
        await cadrage_service.update_formation_title(deps, actor_for(user), formation_id, {"endDate": None})
        without = await one(
            tx.conn,
            "select objectives::text[] as objectives from public.formations where id = cast(:id as uuid)",
            id=formation_id,
        )
        return with_deadline, without

    with_deadline, without = await rolled_back(database, run)
    assert with_deadline["objectives"] == ["exam"]
    assert with_deadline["end_date"] == "2026-12-17"
    assert without["objectives"] == ["operational"]


async def test_deadline_too_close_is_refused(database: Database) -> None:
    """CL-8 - a deadline closer than fifteen days is refused with the date label."""

    async def run(tx: Any) -> AppError:
        deps, user, formation_id = await prepare_active_formation(tx)
        with pytest.raises(AppError) as failure:
            await cadrage_service.update_formation_title(
                deps, actor_for(user), formation_id, {"endDate": "2026-11-20"}
            )
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "VALIDATION_FAILED"
    assert error.status == 422


async def test_diagnostic_acquires_the_right_module(database: Database) -> None:
    """CA-5 - a perfect first module validates it alone; check and a second diagnostic are refused."""

    async def run(tx: Any) -> dict[str, Any]:
        deps, user, formation_id = await prepare_active_formation(tx)
        created = await simple_diagnostic.create_diagnostic(deps, actor_for(user), formation_id)
        attempt_id = created["attemptId"]
        view = await quiz.get_attempt(deps, actor_for(user), attempt_id)
        activity = await one(
            tx.conn,
            "select items from public.activities where id = ("
            " select activity_id from public.attempts where id = cast(:id as uuid))",
            id=attempt_id,
        )
        items = activity["items"]
        first_module = str(items[0]["moduleId"])
        positions = [index + 1 for index, item in enumerate(items) if str(item["moduleId"]) == first_module]
        for position in range(1, len(view["questions"]) + 1):
            correct = position in positions
            await quiz.save_draft(
                deps,
                actor_for(user),
                attempt_id,
                position,
                {"response": {"optionIds": ["a" if correct else "b"]}, "timeMs": 1000},
            )
        with pytest.raises(AppError) as check_failure:
            await quiz.check_answer(deps, actor_for(user), attempt_id, 1, {"response": {"optionIds": ["a"]}})
        submitted = await quiz_submit.submit_attempt(deps, actor_for(user), attempt_id)
        diagnostic = submitted["_diagnostic"]
        await simple_diagnostic.apply_acquired_modules(
            deps, actor_for(user), formation_id, diagnostic["acquiredModuleIds"]
        )
        modules = await one(
            tx.conn,
            "select count(*)::int as total from public.modules "
            "where formation_id = cast(:id as uuid) and status = 'validated'",
            id=formation_id,
        )
        notions = await one(
            tx.conn,
            "select count(*)::int as total from public.notion_states where user_id = cast(:user as uuid)",
            user=user,
        )
        with pytest.raises(AppError) as again:
            await simple_diagnostic.create_diagnostic(deps, actor_for(user), formation_id)
        return {
            "check": check_failure.value,
            "again": again.value,
            "acquired": diagnostic["acquiredModuleIds"],
            "validated": modules["total"],
            "notions": notions["total"],
        }

    result = await rolled_back(database, run)
    assert result["check"].code == "DIAGNOSTIC_NO_CHECK"
    assert len(result["acquired"]) == 1
    assert result["validated"] == 1
    assert result["notions"] >= 1
    assert result["again"].code == "DIAGNOSTIC_ALREADY_DONE"


async def test_diagnostic_can_be_skipped(database: Database) -> None:
    """EF-11 - skip abandons the attempt without validating anything, and is final."""

    async def run(tx: Any) -> dict[str, Any]:
        deps, user, formation_id = await prepare_active_formation(tx)
        created = await simple_diagnostic.create_diagnostic(deps, actor_for(user), formation_id)
        await simple_diagnostic.skip_diagnostic(deps, actor_for(user), formation_id)
        status = await one(
            tx.conn,
            "select status::text as status from public.attempts where id = cast(:id as uuid)",
            id=created["attemptId"],
        )
        validated = await one(
            tx.conn,
            "select count(*)::int as total from public.modules "
            "where formation_id = cast(:id as uuid) and status = 'validated'",
            id=formation_id,
        )
        with pytest.raises(AppError) as again:
            await simple_diagnostic.create_diagnostic(deps, actor_for(user), formation_id)
        return {
            "attempt": status["status"],
            "validated": validated["total"],
            "error": again.value.code,
        }

    result = await rolled_back(database, run)
    assert result["attempt"] == "abandoned"
    assert result["validated"] == 0
    assert result["error"] == "DIAGNOSTIC_ALREADY_DONE"
