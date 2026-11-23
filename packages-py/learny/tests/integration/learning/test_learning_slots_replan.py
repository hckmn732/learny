"""[SPEC-2202] Agenda move and BR-FOR-14 replanning (SPEC-705, ADR-0029, ADR-0326).

The planner of SPEC-407 supplies every compatible window; the service persists one committed
transition (old slot `moved`, learner successor, replay-safe automation action) and emits its
events after the commit. A stale version, a duration change, an overlap or an unknown choice is
refused without any write.
"""

import hashlib
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
)
from factories.learning_deps import learning_deps
from learny.learning.application import planning as planning_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import (
    FormationsReplanOptionsOutput,
    FormationsReplanOutput,
    SlotsAlternativesOutput,
    SlotsMoveOutput,
)
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")

NOW = "2026-11-11T12:20:00Z"


async def seed_formation(conn: Any, user_id: str, *, end_date: str = "2026-11-20") -> dict[str, Any]:
    """An active formation with one open module and a planned course slot on 12 November."""
    formation_id = await create_formation(conn, user_id, title="SAP", status="active")
    await conn.execute(
        text(
            """
            update public.formations
            set monogram = 'SA', start_date = '2026-11-02', end_date = cast(:end_date as date),
                volume_hours = 20, default_threshold = 80
            where id = cast(:formation as uuid)
            """
        ),
        {"formation": formation_id, "end_date": end_date},
    )
    module_id = await create_module(conn, formation_id, 1, title="Reseaux")
    await conn.execute(
        text(
            "update public.modules set status = 'open', planned_end = '2026-11-01' "
            "where id = cast(:module as uuid)"
        ),
        {"module": module_id},
    )
    chapter_id = await create_chapter(conn, formation_id, module_id)
    await create_notion(conn, formation_id, module_id, chapter_id)
    slot_id = (
        (
            await conn.execute(
                text(
                    """
                    insert into public.schedule_slots (
                      user_id, formation_id, module_id, kind, title, starts_at, ends_at,
                      status, created_by
                    ) values (
                      cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
                      'course', 'Cours', '2026-11-12T09:00:00Z'::timestamptz,
                      '2026-11-12T10:00:00Z'::timestamptz, 'planned', 'planner'
                    )
                    returning id::text as id
                    """
                ),
                {"user": user_id, "formation": formation_id, "module": module_id},
            )
        )
        .mappings()
        .all()[0]["id"]
    )
    return {"formationId": formation_id, "moduleId": module_id, "slotId": slot_id}


async def one(conn: Any, statement: str, **parameters: Any) -> Any:
    result = await conn.execute(text(statement), parameters)
    found = result.mappings().all()
    if not found:
        raise AssertionError(f"no row returned by: {statement.strip()[:80]}")
    return found[0]


async def test_alternatives_come_from_the_planner(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_formation(tx.conn, alice)
        return await planning_service.get_slot_alternatives(
            learning_deps(tx), actor_for(alice), seed["slotId"]
        )

    response = await rolled_back(database, run)
    parsed = SlotsAlternativesOutput.model_validate(response)
    assert parsed.day == "2026-11-12"
    assert parsed.durationMinutes == 60
    assert parsed.version.startswith("slot-")
    assert parsed.timezone == "Europe/Paris"
    assert len(parsed.alternatives) == 3
    assert all(alternative.startsAt > NOW for alternative in parsed.alternatives)
    assert all(alternative.reasons[0] == "Jour d\u2019\u00e9tude" for alternative in parsed.alternatives)
    minutes = [(alternative.startMinutes, alternative.endMinutes) for alternative in parsed.alternatives]
    assert all(end - start == 60 for start, end in minutes)


async def test_a_move_is_replayable_and_emits_one_event(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_formation(tx.conn, alice)
        deps = learning_deps(tx)
        actor = actor_for(alice)
        alternatives = await planning_service.get_slot_alternatives(deps, actor, seed["slotId"])
        target = alternatives["alternatives"][0]
        body = {
            "expectedVersion": alternatives["version"],
            "startsAt": target["startsAt"],
            "endsAt": target["endsAt"],
        }
        first = await planning_service.move_slot(deps, actor, seed["slotId"], body)
        replay = await planning_service.move_slot(deps, actor, seed["slotId"], body)
        event = await one(
            tx.conn,
            "select count(*)::int as count from public.event_outbox "
            "where name = 'agenda/slot-moved' and event_id = :event_id",
            event_id=f"agenda-move:{seed['slotId']}",
        )
        old = await one(
            tx.conn,
            "select status::text as status from public.schedule_slots where id = cast(:slot as uuid)",
            slot=seed["slotId"],
        )
        successor = await one(
            tx.conn,
            "select status::text as status, created_by::text as created_by, "
            "moved_from_id::text as moved_from_id from public.schedule_slots "
            "where id = cast(:slot as uuid)",
            slot=first["movedSlot"]["id"],
        )
        return first, replay, event, old, successor

    first, replay, event, old, successor = await rolled_back(database, run)
    parsed = SlotsMoveOutput.model_validate(first)
    assert parsed.replacedSlotId
    assert parsed.explanation.startswith("Activit\u00e9 d\u00e9plac\u00e9e au ")
    assert parsed.movedSlot.status == "planned"
    assert parsed.version.startswith("slot-")
    assert any(slot.id == parsed.movedSlot.id for slot in parsed.agenda.slots)
    assert int(event["count"]) == 1
    assert old["status"] == "moved"
    assert successor["created_by"] == "learner"
    assert successor["moved_from_id"] == parsed.replacedSlotId
    assert SlotsMoveOutput.model_validate(replay).movedSlot.id == parsed.movedSlot.id


async def test_a_move_refuses_an_overlap_and_a_duration_change(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_formation(tx.conn, alice)
        deps = learning_deps(tx)
        actor = actor_for(alice)
        alternatives = await planning_service.get_slot_alternatives(deps, actor, seed["slotId"])
        with pytest.raises(AppError) as duration:
            await planning_service.move_slot(
                deps,
                actor,
                seed["slotId"],
                {
                    "expectedVersion": alternatives["version"],
                    "startsAt": "2026-11-13T09:00:00Z",
                    "endsAt": "2026-11-13T09:30:00Z",
                },
            )
        await tx.conn.execute(
            text(
                """
                insert into public.schedule_slots (
                  user_id, formation_id, kind, title, starts_at, ends_at, status, created_by
                ) values (
                  cast(:user as uuid), cast(:formation as uuid), 'revision', 'Revision',
                  '2026-11-13T09:00:00Z'::timestamptz, '2026-11-13T10:00:00Z'::timestamptz,
                  'planned', 'learner'
                )
                """
            ),
            {"user": alice, "formation": seed["formationId"]},
        )
        with pytest.raises(AppError) as overlap:
            await planning_service.move_slot(
                deps,
                actor,
                seed["slotId"],
                {
                    "expectedVersion": alternatives["version"],
                    "startsAt": "2026-11-13T09:00:00Z",
                    "endsAt": "2026-11-13T10:00:00Z",
                },
            )
        return duration.value, overlap.value

    duration, overlap = await rolled_back(database, run)
    assert duration.code == "VALIDATION_FAILED"
    assert overlap.code == "CONFLICT"


async def test_replan_options_expose_the_blocked_module(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_formation(tx.conn, alice)
        return await planning_service.get_replan_options(
            learning_deps(tx), actor_for(alice), seed["formationId"]
        )

    response = await rolled_back(database, run)
    parsed = FormationsReplanOptionsOutput.model_validate(response)
    assert parsed.planVersion.startswith("plan-")
    assert parsed.blocked is not None
    assert parsed.blocked.moduleId
    assert parsed.currentEndDate == "2026-11-20"
    assert len(parsed.options) == 3
    assert [option.kind for option in parsed.options] == [
        "shift_end",
        "increase_volume",
        "lighten",
    ]


async def test_replan_applies_the_choice_and_records_the_lightening(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_formation(tx.conn, alice)
        deps = learning_deps(tx)
        actor = actor_for(alice)
        options = await planning_service.get_replan_options(deps, actor, seed["formationId"])
        lighten = await planning_service.apply_replan(
            deps,
            actor,
            seed["formationId"],
            {"choice": "lighten", "expectedPlanVersion": options["planVersion"]},
        )
        replay = await planning_service.apply_replan(
            deps,
            actor,
            seed["formationId"],
            {"choice": "lighten", "expectedPlanVersion": options["planVersion"]},
        )
        shift = await planning_service.apply_replan(
            deps,
            actor,
            seed["formationId"],
            {"choice": "shift_end", "expectedPlanVersion": options["planVersion"]},
        )
        actions = (
            (
                await tx.conn.execute(
                    text(
                        "select count(*)::int as count from public.automation_actions "
                        "where formation_id = cast(:formation as uuid)"
                    ),
                    {"formation": seed["formationId"]},
                )
            )
            .mappings()
            .all()
        )
        events = (
            (
                await tx.conn.execute(
                    text(
                        "select name, count(*)::int as count from public.event_outbox "
                        "where name in ('automation/action-proposed', 'plan/replanned') "
                        "group by name order by name"
                    )
                )
            )
            .mappings()
            .all()
        )
        return lighten, replay, shift, actions, events

    lighten, replay, shift, actions, events = await rolled_back(database, run)
    parsed = FormationsReplanOutput.model_validate(lighten)
    assert parsed.outcome == "consent_required"
    assert parsed.consentActionId
    assert "votre accord" in parsed.explanation
    replay_parsed = FormationsReplanOutput.model_validate(replay)
    assert replay_parsed.consentActionId == parsed.consentActionId
    assert int(actions[0]["count"]) == 1
    shift_parsed = FormationsReplanOutput.model_validate(shift)
    assert shift_parsed.outcome in ("applied", "unchanged")
    assert shift_parsed.planVersion.startswith("plan-")
    names = {row["name"]: int(row["count"]) for row in events}
    assert names.get("automation/action-proposed") == 1
    if shift_parsed.outcome == "applied":
        assert names.get("plan/replanned") == 1


async def test_a_stale_plan_version_writes_nothing(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_formation(tx.conn, alice)
        with pytest.raises(AppError) as failure:
            await planning_service.apply_replan(
                learning_deps(tx),
                actor_for(alice),
                seed["formationId"],
                {"choice": "shift_end", "expectedPlanVersion": "plan-\u2026"},
            )
        events = await one(
            tx.conn,
            "select count(*)::int as count from public.event_outbox where name = 'plan/replanned'",
        )
        return failure.value, events

    error, events = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert int(events["count"]) == 0


def test_plan_version_is_a_content_hash() -> None:
    """ET-4 \u2014 the version depends on the content, not on a clock, so a replay is stable."""
    parts = {
        "formation": {"id": "f", "end_date": "2026-11-20", "volume_hours": 20},
        "modules": [{"module_id": "m", "status": "open", "planned_end": "2026-11-01"}],
        "slots": [
            {
                "id": "s",
                "starts_at": "2026-11-12T09:00:00Z",
                "ends_at": "2026-11-12T10:00:00Z",
                "status": "planned",
            }
        ],
        "hoursPerDay": 2,
        "studyDays": [1, 2, 3, 4, 5],
    }
    version = planning_service.plan_version_of(parts)
    assert version.startswith("plan-")
    assert len(version) == len("plan-") + 16
    digest = hashlib.sha256(b"not-the-same-content").hexdigest()[:16]
    assert version != f"plan-{digest}"
    assert planning_service.plan_version_of(parts) == version
