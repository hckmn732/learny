"""[SPEC-719] Sprint planning service: RLS, journal, effects and idempotence.

Ported from `packages/services/test/integration/spec-719.test.ts`. Postgres is real: the two
30-minute `sprint` slots are written under RLS for the learner, the `sprint_planned` journal action
and its event are committed once, a moved milestone replans only the future sprints, and the
400/404/409 cases write nothing. The milestone move replays the same use case on the moved slot: the
Python worker has no `agenda/slot-moved` consumer of this automation yet (the event trigger of the
TypeScript definition), so the direct run carries the same observable effect.
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.engagement_deps import engagement_deps
from factories.identity_support import (
    FSRS_CARD,
    actor_for,
    count,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
)
from learny.engagement.application.sprints import plan_sprints_before_milestones
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr import engagement_automations as fr
from learny.shared.time import to_iso
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-719")

NOW = datetime(2026, 11, 11, 12, 20, tzinfo=UTC)
TZ = "Europe/Paris"

UPDATE_PROFILE = text(
    "update public.profiles "
    "set onboarding_step = 'done', current_formation_id = cast(:formation as uuid) "
    "where id = cast(:user as uuid)"
)

UPSERT_STUDY_PREFERENCES = text(
    "insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots) "
    "values (cast(:user as uuid), 2, '{1,2,3,4,5}'::smallint[], '{soir}'::study_slot[]) "
    "on conflict (user_id) do update "
    "set study_days = '{1,2,3,4,5}'::smallint[], preferred_slots = '{soir}'::study_slot[]"
)

INSERT_NOTION_STATE = text(
    "insert into public.notion_states (user_id, notion_id, fsrs, due_at, mastery) "
    "values (cast(:user as uuid), cast(:notion as uuid), cast(:fsrs as jsonb), "
    "cast(:due as timestamptz), cast(:mastery as numeric))"
)

INSERT_EXAM = text(
    "insert into public.schedule_slots "
    "(user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by) "
    "values (cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid), "
    "'validation_quiz', :title, cast(:starts_at as timestamptz), cast(:ends_at as timestamptz), "
    "cast(:status as public.slot_status), 'planner') returning id::text as id"
)

MOVE_EXAM = text(
    "update public.schedule_slots "
    "set starts_at = cast(:starts_at as timestamptz), ends_at = cast(:ends_at as timestamptz), "
    "updated_at = cast(:updated_at as timestamptz) where id = cast(:id as uuid) "
    "returning id::text as id"
)

SPRINT_ROWS = text(
    "select id::text as id, status::text as status, planner_key, starts_at, ends_at, meta "
    "from public.schedule_slots "
    "where user_id = cast(:user as uuid) and kind = 'sprint' "
    "order by starts_at asc"
)

COUNT_SPRINT_ACTIONS = (
    "select count(*)::int as count from public.automation_actions "
    "where user_id = cast(:user as uuid) and automation = 'sprint'"
)

COUNT_APPLIED_EVENTS = (
    "select count(*)::int as count from public.event_outbox "
    "where user_id = cast(:user as uuid) and name = 'automation/action-applied'"
)

COUNT_OVERLAPPING_EXAMS = (
    "select count(*)::int as count from public.schedule_slots sprint "
    "join public.schedule_slots exam on exam.user_id = sprint.user_id "
    "and exam.kind = 'validation_quiz' "
    "where sprint.user_id = cast(:user as uuid) and sprint.kind = 'sprint' "
    "and sprint.starts_at < exam.ends_at and sprint.ends_at > exam.starts_at"
)


@dataclass(frozen=True, slots=True)
class Learner:
    """One seeded learner with a one-module programme, like `createLearner` of the TS suite."""

    user_id: str
    formation_id: str
    module_id: str
    notion_ids: list[str]
    actor: Any


async def create_learner(tx: Any, label: str, notions: int = 4) -> Learner:
    user_id = await create_user(tx.conn, label, timezone=TZ)
    formation_id = await create_formation(tx.conn, user_id, title="SAP S/4HANA Finance")
    module_id = await create_module(tx.conn, formation_id, 1)
    chapter_id = await create_chapter(tx.conn, formation_id, module_id, 1)
    notion_ids = [
        await create_notion(tx.conn, formation_id, module_id, chapter_id, position)
        for position in range(1, notions + 1)
    ]
    await tx.conn.execute(UPDATE_PROFILE, {"user": user_id, "formation": formation_id})
    await tx.conn.execute(UPSERT_STUDY_PREFERENCES, {"user": user_id})
    return Learner(
        user_id=user_id,
        formation_id=formation_id,
        module_id=module_id,
        notion_ids=notion_ids,
        actor=actor_for(user_id),
    )


async def add_mastery(tx: Any, learner: Learner, values: list[float]) -> None:
    """`addMastery`: one studied notion per value, in the programme order."""
    for index, mastery in enumerate(values):
        if index >= len(learner.notion_ids):
            continue
        await tx.conn.execute(
            INSERT_NOTION_STATE,
            {
                "user": learner.user_id,
                "notion": learner.notion_ids[index],
                "fsrs": FSRS_CARD,
                "due": NOW,
                "mastery": mastery,
            },
        )


async def add_exam(
    tx: Any,
    learner: Learner,
    *,
    title: str = "Quiz de validation - Partie 1",
    starts_at: str = "2026-11-14T13:00:00Z",
    ends_at: str = "2026-11-14T14:00:00Z",
    status: str = "planned",
) -> str:
    result = await tx.conn.execute(
        INSERT_EXAM,
        {
            "user": learner.user_id,
            "formation": learner.formation_id,
            "module": learner.module_id,
            "title": title,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "status": status,
        },
    )
    return str(result.mappings().one()["id"])


async def sprint_rows(tx: Any, learner: Learner) -> list[Any]:
    result = await tx.conn.execute(SPRINT_ROWS, {"user": learner.user_id})
    return list(result.mappings())


def local_day(instant: Any) -> str:
    """The local civil day of a stored instant, in the zone of the learner."""
    from learny.shared.time import to_epoch_ms, user_local_day

    return user_local_day(to_epoch_ms(instant), TZ)


async def test_two_thirty_minute_sprints_on_j_minus_k_and_j_minus_one(database: Database) -> None:
    """CA-1, ET-3 - two 30-minute sprints on J-3 and J-1, weakest notions first."""

    async def run(tx: Any) -> None:
        learner = await create_learner(tx, "Plan")
        await add_mastery(tx, learner, [70, 20, 50])
        await add_exam(tx, learner)

        result = await plan_sprints_before_milestones(
            engagement_deps(tx), learner.actor, learner.formation_id
        )

        assert result["created"] == 1
        assert len(result["plans"]) == 1
        plan = result["plans"][0]
        assert plan["examDate"] == "2026-11-14"
        assert plan["daysBefore"] == 3
        assert [target["day"] for target in plan["targets"]] == ["2026-11-11", "2026-11-13"]
        assert all(target["durationMin"] == 30 for target in plan["targets"])
        # Only studied notions are targeted, weakest first (20, then 50, then 70).
        assert plan["notionIds"] == [
            learner.notion_ids[1],
            learner.notion_ids[2],
            learner.notion_ids[0],
        ]

        slots = await sprint_rows(tx, learner)
        assert len(slots) == 2
        assert [local_day(slot["starts_at"]) for slot in slots] == ["2026-11-11", "2026-11-13"]
        assert all(slot["status"] == "planned" for slot in slots)
        for slot in slots:
            minutes = (slot["ends_at"] - slot["starts_at"]).total_seconds() / 60
            assert minutes == 30
            assert (slot["meta"] or "").startswith(fr.SPRINT_META.split("{")[0])
        # The exam slot is never overlapped.
        assert await count(tx.conn, COUNT_OVERLAPPING_EXAMS, user=learner.user_id) == 0
        assert await count(tx.conn, COUNT_SPRINT_ACTIONS, user=learner.user_id) == 1
        assert await count(tx.conn, COUNT_APPLIED_EVENTS, user=learner.user_id) == 1

    await rolled_back(database, run)


async def test_a_moved_milestone_replans_the_future_and_keeps_a_done_sprint(
    database: Database,
) -> None:
    """CA-2 - moving the exam replans the future sprints and keeps a finished one."""

    async def run(tx: Any) -> None:
        learner = await create_learner(tx, "Moved")
        await add_mastery(tx, learner, [30, 80, 55])
        exam_id = await add_exam(tx, learner)

        first = await plan_sprints_before_milestones(engagement_deps(tx), learner.actor, learner.formation_id)
        assert first["created"] == 1
        before = await sprint_rows(tx, learner)
        assert len(before) == 2
        done = next(slot for slot in before if local_day(slot["starts_at"]) == "2026-11-11")
        await tx.conn.execute(
            text("update public.schedule_slots set status = 'done' where id = cast(:id as uuid)"),
            {"id": done["id"]},
        )

        # SPEC-705 moved the milestone to Thursday 19 November; J-3 and J-1 are both study days.
        await tx.conn.execute(
            MOVE_EXAM,
            {
                "id": exam_id,
                "starts_at": "2026-11-19T13:00:00Z",
                "ends_at": "2026-11-19T14:00:00Z",
                "updated_at": "2026-11-11T12:30:00Z",
            },
        )
        second = await plan_sprints_before_milestones(
            engagement_deps(tx), learner.actor, learner.formation_id, exam_id
        )
        assert second["created"] == 1

        after = await sprint_rows(tx, learner)
        still_done = next(slot for slot in after if slot["id"] == done["id"])
        assert still_done["status"] == "done"
        planned = [slot for slot in after if slot["status"] == "planned"]
        assert [local_day(slot["starts_at"]) for slot in planned] == ["2026-11-16", "2026-11-18"]
        cancelled = [slot for slot in after if slot["status"] == "cancelled"]
        assert [local_day(slot["starts_at"]) for slot in cancelled] == ["2026-11-13"]
        assert await count(tx.conn, COUNT_SPRINT_ACTIONS, user=learner.user_id) == 2

    await rolled_back(database, run)


async def test_invalid_foreign_and_stale_inputs_write_nothing(database: Database) -> None:
    """CA-3 - 400, 404 under RLS and 409, and a double send never duplicates."""

    async def run(tx: Any) -> None:
        owner = await create_learner(tx, "Owner")
        stranger = await create_learner(tx, "Stranger")
        await add_mastery(tx, owner, [40, 60])
        await add_exam(tx, owner)

        with pytest.raises(AppError) as invalid:
            await plan_sprints_before_milestones(engagement_deps(tx), owner.actor, "pas-un-uuid")
        assert invalid.value.code == "VALIDATION_FAILED"

        with pytest.raises(AppError) as foreign:
            await plan_sprints_before_milestones(engagement_deps(tx), stranger.actor, owner.formation_id)
        assert foreign.value.code == "NOT_FOUND"

        first = await plan_sprints_before_milestones(engagement_deps(tx), owner.actor, owner.formation_id)
        assert first["created"] == 1
        actions = await count(tx.conn, COUNT_SPRINT_ACTIONS, user=owner.user_id)

        second = await plan_sprints_before_milestones(engagement_deps(tx), owner.actor, owner.formation_id)
        assert second["created"] == 0
        assert await count(tx.conn, COUNT_SPRINT_ACTIONS, user=owner.user_id) == actions
        assert len(await sprint_rows(tx, owner)) == 2
        assert await count(tx.conn, COUNT_APPLIED_EVENTS, user=owner.user_id) == 1

        cancelled = await add_exam(tx, owner, status="cancelled", title="Examen annule")
        with pytest.raises(AppError) as stale:
            await plan_sprints_before_milestones(
                engagement_deps(tx), owner.actor, owner.formation_id, cancelled
            )
        assert stale.value.code == "CONFLICT"

    await rolled_back(database, run)


async def test_a_cancelled_exam_or_no_studied_notion_creates_no_sprint(database: Database) -> None:
    """CL-4, CL-5 - a cancelled exam and an unstudied programme propose nothing."""

    async def run(tx: Any) -> None:
        learner = await create_learner(tx, "Empty")
        await add_exam(tx, learner, status="cancelled")
        await add_exam(
            tx,
            learner,
            starts_at="2026-11-14T15:00:00Z",
            ends_at="2026-11-14T16:00:00Z",
        )

        result = await plan_sprints_before_milestones(
            engagement_deps(tx), learner.actor, learner.formation_id
        )

        assert result["created"] == 0
        assert await sprint_rows(tx, learner) == []
        assert (
            await count(
                tx.conn,
                "select count(*)::int as count from public.automation_actions "
                "where user_id = cast(:user as uuid)",
                user=learner.user_id,
            )
            == 0
        )

    await rolled_back(database, run)


async def test_a_disabled_setting_or_an_active_pause_skips_the_run(database: Database) -> None:
    """CL-5 - the setting and the global pause are checked before any draft (harness of SPEC-711)."""

    async def run(tx: Any) -> None:
        learner = await create_learner(tx, "Paused")
        await add_mastery(tx, learner, [30, 40])
        await add_exam(tx, learner)
        await tx.conn.execute(
            text(
                "insert into public.automation_settings (user_id, key, enabled, params) "
                "values (cast(:user as uuid), 'sprint', false, '{}'::jsonb) "
                "on conflict (user_id, key) do update set enabled = false"
            ),
            {"user": learner.user_id},
        )

        disabled = await plan_sprints_before_milestones(
            engagement_deps(tx), learner.actor, learner.formation_id
        )
        assert disabled == {"created": 0, "skipped": "disabled", "plans": []}

        await tx.conn.execute(
            text(
                "update public.automation_settings set enabled = true "
                "where user_id = cast(:user as uuid) and key = 'sprint'"
            ),
            {"user": learner.user_id},
        )
        await tx.conn.execute(
            text(
                "insert into public.pauses (user_id, starts_on, ends_on, status) "
                "values (cast(:user as uuid), '2026-11-09', '2026-11-13', 'active')"
            ),
            {"user": learner.user_id},
        )
        paused = await plan_sprints_before_milestones(
            engagement_deps(tx), learner.actor, learner.formation_id
        )
        assert paused == {"created": 0, "skipped": "paused", "plans": []}
        assert await sprint_rows(tx, learner) == []

    await rolled_back(database, run)


async def test_the_stored_payload_carries_the_slot_identifiers_and_the_undo_material(
    database: Database,
) -> None:
    """ET-4 - the applied payload and its undo payload are the ones the journal renders."""
    from learny.shared.time import parse_iso

    async def run(tx: Any) -> None:
        learner = await create_learner(tx, "Journal")
        await add_mastery(tx, learner, [25, 75])
        await add_exam(tx, learner)

        result = await plan_sprints_before_milestones(
            engagement_deps(tx), learner.actor, learner.formation_id
        )
        assert result["created"] == 1

        stored = (
            (
                await tx.conn.execute(
                    text(
                        "select payload, undo_payload, status, created_at "
                        "from public.automation_actions "
                        "where user_id = cast(:user as uuid) and automation = 'sprint'"
                    ),
                    {"user": learner.user_id},
                )
            )
            .mappings()
            .one()
        )
        payload = dict(stored["payload"])
        slots = await sprint_rows(tx, learner)
        assert [target["slotId"] for target in payload["targets"]] == [slot["id"] for slot in slots]
        assert payload["dedupeKey"].startswith(f"sprint:{payload['examSlotId']}:2026-11-14:3")
        assert stored["status"] == "applied"
        assert to_iso(parse_iso(str(stored["created_at"]))) == "2026-11-11T12:20:00.000Z"
        assert dict(stored["undo_payload"]) == {
            "examSlotId": payload["examSlotId"],
            "slotIds": [slot["id"] for slot in slots],
        }

    await rolled_back(database, run)
