"""[SPEC-2202] Final review and memory interview (SPEC-617, CA-1 to CA-4).

A completed programme aggregates the mastered and fragile notions, the worked minutes and the
retention horizons; an unfinished one answers 409 through the learner's RLS transaction; the mode
transition is owner-only, idempotent and cancels the future slots and reminders when it stops.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    FSRS_CARD,
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
)
from factories.learning_deps import learning_deps
from learny.learning.application import final_review as review_service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny_api.generated.models import FormationsFinalReviewOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2202")

NOW = "2026-11-11T12:20:00Z"


async def seed_review(
    conn: Any,
    user_id: str,
    *,
    modules: int = 2,
    validated: int = 2,
    status: str = "completed",
    with_reminder: bool = False,
) -> dict[str, Any]:
    """One completed programme: validated modules, three notions (one confusion) and five slots."""
    formation_id = await create_formation(conn, user_id, title="SAP Finance", status=status)
    await conn.execute(
        text(
            """
            update public.formations
            set monogram = 'SAP', accent_color = 'indigo', start_date = '2026-10-01',
                end_date = '2026-11-11', volume_hours = 60, default_threshold = 80,
                completed_at = case when cast(:status as text) = 'completed'
                                    then cast(:now as timestamptz) else null end,
                maintenance_mode = null
            where id = cast(:formation as uuid)
            """
        ),
        {"formation": formation_id, "status": status, "now": NOW},
    )
    module_ids: list[str] = []
    notion_ids: list[str] = []
    for index in range(modules):
        module_id = await create_module(conn, formation_id, index + 1, title=f"Module {index + 1}")
        module_ids.append(module_id)
        is_validated = index < validated
        await conn.execute(
            text(
                """
                update public.modules
                set status = cast(:status as public.module_status),
                    threshold = 80,
                    validated_at = case when cast(:status as text) = 'validated'
                                        then cast(:now as timestamptz) else null end
                where id = cast(:module as uuid)
                """
            ),
            {
                "module": module_id,
                "status": "validated" if is_validated else "open",
                "now": NOW,
            },
        )
        if is_validated:
            await conn.execute(
                text(
                    """
                    insert into public.module_progress (
                      user_id, module_id, status, opened_at, validated_at, best_score
                    ) values (
                      cast(:user as uuid), cast(:module as uuid), 'validated',
                      cast(:now as timestamptz), cast(:now as timestamptz), 90
                    )
                    """
                ),
                {"user": user_id, "module": module_id, "now": NOW},
            )
        chapter_id = await create_chapter(conn, formation_id, module_id)
        for position in (1, 2):
            notion_ids.append(
                await create_notion(conn, formation_id, module_id, chapter_id, position=position)
            )

    for index, notion_id in enumerate(notion_ids):
        gap = index == len(notion_ids) - 1
        await conn.execute(
            text(
                """
                insert into public.notion_states (
                  user_id, notion_id, fsrs, mastery, in_review, due_at, suspended,
                  gap_nature, gap_detected_at, gap_evidence
                ) values (
                  cast(:user as uuid), cast(:notion as uuid), cast(:fsrs as jsonb),
                  :mastery, true, cast(:now as timestamptz), false,
                  case when :gap then 'confusion'::public.gap_nature else null end,
                  case when :gap then cast(:now as timestamptz) else null end,
                  case when :gap then 'Evidence of the gap.' else null end
                )
                """
            ),
            {
                "user": user_id,
                "notion": notion_id,
                "fsrs": FSRS_CARD,
                "mastery": 30 if gap else 90,
                "now": NOW,
                "gap": gap,
            },
        )

    await conn.execute(
        text(
            """
            insert into public.schedule_slots (
              user_id, formation_id, kind, title, starts_at, ends_at, status, created_by
            ) values
              (cast(:user as uuid), cast(:formation as uuid), 'course', 'Cours realise',
               '2026-11-09T09:00:00Z'::timestamptz, '2026-11-09T10:00:00Z'::timestamptz,
               'done', 'learner'),
              (cast(:user as uuid), cast(:formation as uuid), 'revision', 'Revision realisee',
               '2026-11-10T09:00:00Z'::timestamptz, '2026-11-10T09:30:00Z'::timestamptz,
               'done', 'learner'),
              (cast(:user as uuid), cast(:formation as uuid), 'global_quiz', 'Quiz global futur',
               '2026-11-12T17:00:00Z'::timestamptz, '2026-11-12T17:10:00Z'::timestamptz,
               'planned', 'planner'),
              (cast(:user as uuid), cast(:formation as uuid), 'revision', 'Revision annulee',
               '2026-11-08T09:00:00Z'::timestamptz, '2026-11-08T09:30:00Z'::timestamptz,
               'cancelled', 'planner')
            """
        ),
        {"user": user_id, "formation": formation_id},
    )
    await conn.execute(
        text(
            """
            insert into public.programme_proposals (
              formation_id, user_id, version, source, description, payload
            ) values (
              cast(:formation as uuid), cast(:user as uuid), 2, 'generated',
              'Programme ajuste', '{}'::jsonb
            )
            """
        ),
        {"formation": formation_id, "user": user_id},
    )

    notification_id: str | None = None
    if with_reminder:
        notification_id = str(
            (
                await conn.execute(
                    text(
                        """
                        insert into public.notifications (
                          user_id, formation_id, type, title, body, href, icon, dedupe_key
                        ) values (
                          cast(:user as uuid), cast(:formation as uuid), 'global_quiz_today',
                          'Quiz global du jour', 'Trois notions a revoir.',
                          '/formations/x/quiz-global', 'quiz', :dedupe
                        )
                        returning id::text as id
                        """
                    ),
                    {
                        "user": user_id,
                        "formation": formation_id,
                        "dedupe": f"spec-2202-reminder-{formation_id}",
                    },
                )
            )
            .mappings()
            .all()[0]["id"]
        )
        await conn.execute(
            text(
                """
                insert into public.notification_deliveries (
                  notification_id, channel, status, scheduled_for
                ) values (
                  cast(:notification as uuid), 'email', 'scheduled',
                  '2026-11-12T08:00:00Z'::timestamptz
                )
                """
            ),
            {"notification": notification_id},
        )
    return {
        "formationId": formation_id,
        "moduleIds": module_ids,
        "notionIds": notion_ids,
        "notificationId": notification_id,
    }


async def one(conn: Any, statement: str, **parameters: Any) -> Any:
    result = await conn.execute(text(statement), parameters)
    found = result.mappings().all()
    if not found:
        raise AssertionError(f"no row returned by: {statement.strip()[:80]}")
    return found[0]


async def test_the_bilan_aggregates_the_completed_formation(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_review(tx.conn, alice)
        deps = learning_deps(tx)
        first = await review_service.get_final_review(deps, actor_for(alice), seed["formationId"])
        second = await review_service.get_final_review(deps, actor_for(alice), seed["formationId"])
        return first, second

    first, second = await rolled_back(database, run)
    review = FormationsFinalReviewOutput.model_validate(first)
    assert review.formationTitle == "SAP Finance"
    assert review.status == "completed"
    assert review.programVersion == 2
    assert review.completedOn == "2026-11-11"
    assert review.weeks == 6
    assert review.stats.masteredNotions == 3
    assert review.stats.fragileNotions == 1
    assert review.stats.totalNotions == 4
    assert review.stats.completedMinutes == 90
    assert review.stats.resultPercent == 90
    assert review.retention.oneMonth is None
    assert review.retention.twoMonths is None
    assert review.maintenance.mode is None
    assert review.maintenance.dailyMinutes == 5
    assert review.maintenance.dueOnly is True
    assert review.maintenance.reminders is False
    assert len(review.gaps) == 1
    assert review.gaps[0].natureLabel == "Confusion"
    assert review.gaps[0].evidence == "Evidence of the gap."
    assert review.gaps[0].mastery == 30
    assert review.mapHref == f"/formations/{review.formationId}/carte"
    assert len(review.modules) == 2
    assert review.monogram == "SA"
    assert FormationsFinalReviewOutput.model_validate(second).gaps == review.gaps


async def test_an_unfinished_formation_is_a_conflict(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_review(tx.conn, alice, modules=2, validated=1, status="active")
        with pytest.raises(AppError) as failure:
            await review_service.get_final_review(learning_deps(tx), actor_for(alice), seed["formationId"])
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "CONFLICT"


async def test_a_foreign_or_malformed_formation_is_refused(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        seed = await seed_review(tx.conn, alice)
        deps = learning_deps(tx)
        with pytest.raises(AppError) as foreign:
            await review_service.get_final_review(deps, actor_for(bob), seed["formationId"])
        with pytest.raises(AppError) as malformed:
            await review_service.get_final_review(deps, actor_for(alice), "pas-un-uuid")
        return foreign.value, malformed.value

    foreign, malformed = await rolled_back(database, run)
    assert foreign.code == "NOT_FOUND"
    assert malformed.code == "VALIDATION_FAILED"


async def test_the_memory_interview_stops_and_resumes(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_review(tx.conn, alice, with_reminder=True)
        deps = learning_deps(tx)
        actor = actor_for(alice)
        formation_id = seed["formationId"]
        light = await review_service.set_maintenance(deps, actor, formation_id, {"mode": "light"})
        same = await review_service.set_maintenance(deps, actor, formation_id, {"mode": "light"})
        stopped = await review_service.set_maintenance(deps, actor, formation_id, {"mode": "stopped"})
        resumed = await review_service.set_maintenance(deps, actor, formation_id, {"mode": "light"})
        events = await one(
            tx.conn,
            "select count(*)::int as count from public.event_outbox "
            "where name = 'formation/maintenance-changed' "
            "and data->>'formationId' = :formation",
            formation=formation_id,
        )
        slots = (
            (
                await tx.conn.execute(
                    text(
                        "select status::text as status, count(*)::int as count "
                        "from public.schedule_slots where formation_id = cast(:formation as uuid) "
                        "group by status order by status"
                    ),
                    {"formation": formation_id},
                )
            )
            .mappings()
            .all()
        )
        deliveries = (
            (
                await tx.conn.execute(
                    text(
                        "select d.status::text as status, d.error from public.notification_deliveries d "
                        "join public.notifications n on n.id = d.notification_id "
                        "where n.id = cast(:notification as uuid)"
                    ),
                    {"notification": seed["notificationId"]},
                )
            )
            .mappings()
            .all()
        )
        states = await one(
            tx.conn,
            "select count(*)::int as count from public.notion_states where user_id = cast(:user as uuid)",
            user=alice,
        )
        return light, same, stopped, resumed, events, slots, deliveries, states

    light, same, stopped, resumed, events, slots, deliveries, states = await rolled_back(database, run)
    parsed = FormationsFinalReviewOutput.model_validate(light)
    assert parsed.maintenance.mode == "light"
    assert parsed.maintenance.reminders is True
    assert parsed.dueCount == 4
    # The replay of light at the same instant reuses the deduplicated event identifier.
    assert int(events["count"]) == 2
    assert FormationsFinalReviewOutput.model_validate(same).maintenance.mode == "light"
    stopped_review = FormationsFinalReviewOutput.model_validate(stopped)
    assert stopped_review.maintenance.mode == "stopped"
    assert stopped_review.maintenance.reminders is False
    assert stopped_review.dueCount == 0
    assert [(row["status"], int(row["count"])) for row in slots] == [
        ("cancelled", 2),
        ("done", 2),
    ]
    assert [(row["status"], row["error"]) for row in deliveries] == [("skipped_pref", "maintenance_stopped")]
    assert int(states["count"]) == 4
    assert FormationsFinalReviewOutput.model_validate(resumed).dueCount == 4


async def test_a_stale_version_or_an_unknown_mode_writes_nothing(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        seed = await seed_review(tx.conn, alice)
        deps = learning_deps(tx)
        actor = actor_for(alice)
        formation_id = seed["formationId"]
        with pytest.raises(AppError) as unknown:
            await review_service.set_maintenance(deps, actor, formation_id, {"mode": "bogus"})
        with pytest.raises(AppError) as stale:
            await review_service.set_maintenance(
                deps,
                actor,
                formation_id,
                {"mode": "light", "expectedUpdatedAt": "2026-11-11T12:19:00Z"},
            )
        events = await one(
            tx.conn,
            "select count(*)::int as count from public.event_outbox "
            "where name = 'formation/maintenance-changed' "
            "and data->>'formationId' = :formation",
            formation=formation_id,
        )
        formation = await one(
            tx.conn,
            "select maintenance_mode::text as mode from public.formations "
            "where id = cast(:formation as uuid)",
            formation=formation_id,
        )
        return unknown.value, stale.value, events, formation

    unknown, stale, events, formation = await rolled_back(database, run)
    assert unknown.code == "VALIDATION_FAILED"
    assert stale.code == "CONFLICT"
    assert int(events["count"]) == 0
    assert formation["mode"] is None
