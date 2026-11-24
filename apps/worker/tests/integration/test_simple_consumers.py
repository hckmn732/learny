"""[SPEC-4001] Simple-mode consumers: single analysis event, resume after a failure (CL-3, CL-4)."""

import json
from datetime import datetime
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.formation_support import formation_deps
from factories.identity_support import actor_for, assign_task, create_credential, create_user, one
from learny.formation.application.simple import analysis as simple_analysis
from learny.formation.application.simple import create as simple_create
from learny.formation.application.simple import sources as simple_sources
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import SIMPLE_STEP_FAILED
from learny.shared.outbox.events import Event
from learny_worker import consumers as worker_consumers
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-4001")

TASKS = ("simple_analysis", "programme", "course")
NOW = datetime.fromisoformat("2026-11-11T12:20:00+00:00")
CHUNKS = [(1, "Introduction au document de cours."), (81, "Deuxieme partie du document.")]
BOOKMARKS = [[1, "Introduction"], [81, "Deuxieme partie"]]


class FailingLlm:
    """A model whose structured output is unusable after every correction (CL-3)."""

    def __init__(self) -> None:
        self.calls = 0

    async def step(self, *args: Any, **kwargs: Any) -> Any:
        self.calls += 1
        raise AppError("INVALID_OUTPUT", SIMPLE_STEP_FAILED)


def analysis_event(user: str, formation_id: str) -> Event:
    return Event(
        event_id=f"simple-analysis-requested:{formation_id}",
        name="simple.analysis.requested",
        data={"userId": user, "formationId": formation_id},
        user_id=user,
        created_at=NOW,
    )


async def ready_formation(tx: Any) -> tuple[Any, str, str]:
    """A learner with the three models and a ready course document."""
    user = await create_user(tx.conn, "Alice")
    credential = await create_credential(tx.conn, user, ["gpt-test"])
    for task in TASKS:
        await assign_task(tx.conn, user, task, credential, "gpt-test")
    deps = formation_deps(tx)
    created = await simple_create.create_simple_formation(deps, actor_for(user), {})
    formation_id = created["formationId"]
    upload = await simple_sources.create_simple_upload(
        deps,
        actor_for(user),
        formation_id,
        {"fileName": "Cours complet.pdf", "mime": "application/pdf", "sizeBytes": 2048},
        "key-course",
    )
    await tx.conn.execute(
        text(
            "update public.resources set status = 'ready', metadata = cast(:metadata as jsonb) "
            "where id = cast(:id as uuid)"
        ),
        {
            "id": upload["resourceId"],
            "metadata": json.dumps(
                {"role": "course", "pages": 160, "bookmarks": BOOKMARKS}, ensure_ascii=False
            ),
        },
    )
    for position, (page, body) in enumerate(CHUNKS):
        await tx.conn.execute(
            text(
                "insert into public.resource_chunks ("
                " resource_id, owner_id, formation_id, position, text, location"
                ") values (cast(:resource as uuid), cast(:user as uuid), cast(:formation as uuid),"
                " :position, :text, cast(:location as jsonb))"
            ),
            {
                "resource": upload["resourceId"],
                "user": user,
                "formation": formation_id,
                "position": position,
                "text": body,
                "location": json.dumps({"page": page, "charStart": 0, "charEnd": len(body)}),
            },
        )
    return deps, user, formation_id


async def test_double_launch_emits_one_event(database: Database) -> None:
    """CL-4 - the second launch returns the same state and creates no second event."""

    async def run(tx: Any) -> dict[str, Any]:
        deps, user, formation_id = await ready_formation(tx)
        first = await simple_analysis.launch_analysis(deps, actor_for(user), formation_id)
        second = await simple_analysis.launch_analysis(deps, actor_for(user), formation_id)
        events = await one(
            tx.conn,
            "select count(*)::int as total from public.event_outbox where name = 'simple.analysis.requested'",
        )
        return {"first": first["status"], "second": second["status"], "events": events["total"]}

    result = await rolled_back(database, run)
    assert result["first"] == "analysing"
    assert result["second"] == "analysing"
    assert result["events"] == 1


async def test_a_failed_analysis_is_resumed_from_the_first_unfinished_step(database: Database) -> None:
    """CL-3 - an invalid output fails the analysis, and a relaunch resumes the remaining steps."""

    async def run(tx: Any) -> dict[str, Any]:
        deps, user, formation_id = await ready_formation(tx)
        await simple_analysis.launch_analysis(deps, actor_for(user), formation_id)
        failing = FailingLlm()
        deps.llm = failing
        with pytest.raises(AppError):
            await simple_analysis.run_analysis(deps, user, formation_id)
        failed = await one(
            tx.conn,
            "select status::text as status, error_code, steps from public.simple_analyses "
            "where formation_id = cast(:id as uuid)",
            id=formation_id,
        )
        assert failed["status"] == "failed"
        assert failed["error_code"] == "AI_TASK_FAILED"
        steps = failed["steps"]
        assert steps[0]["key"] == "read"
        assert steps[0]["state"] == "done"

        # Relaunch: the steps already done are kept, the analysis resumes at the structure step.
        relaunched = await simple_analysis.launch_analysis(deps, actor_for(user), formation_id)
        assert relaunched["status"] == "analysing"
        assert relaunched["steps"][0]["state"] == "done"
        assert relaunched["steps"][1]["state"] == "todo"
        assert relaunched["error"] is None

        deps.llm = worker_consumers.formation_deps if False else deps.llm
        return {"failed": failed["status"], "relaunched": relaunched["status"]}

    result = await rolled_back(database, run)
    assert result == {"failed": "failed", "relaunched": "analysing"}


async def test_the_analysis_consumer_is_idempotent(database: Database) -> None:
    """CL-4 - replaying `simple.analysis.requested` on a finished analysis changes nothing."""

    async def run(tx: Any) -> dict[str, Any]:
        deps, user, formation_id = await ready_formation(tx)
        await simple_analysis.launch_analysis(deps, actor_for(user), formation_id)
        await worker_consumers.formation_simple_analysis(deps, analysis_event(user, formation_id))
        first = await one(
            tx.conn,
            "select status::text as status from public.simple_analyses "
            "where formation_id = cast(:id as uuid)",
            id=formation_id,
        )
        await worker_consumers.formation_simple_analysis(deps, analysis_event(user, formation_id))
        second = await one(
            tx.conn,
            "select status::text as status from public.simple_analyses "
            "where formation_id = cast(:id as uuid)",
            id=formation_id,
        )
        proposals = await one(
            tx.conn,
            "select count(*)::int as total from public.programme_proposals "
            "where formation_id = cast(:id as uuid)",
            id=formation_id,
        )
        return {
            "first": first["status"],
            "second": second["status"],
            "proposals": proposals["total"],
        }

    result = await rolled_back(database, run)
    assert result["first"] == "proposed"
    assert result["second"] == "proposed"
    assert result["proposals"] == 1
