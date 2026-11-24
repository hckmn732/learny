"""[SPEC-603] Home read under RLS against the local stack.

These tests build the same scenario with the shared factories - a current SAP formation with seven
modules, a done course, a warm-up, the highlighted validation quiz, a revision, the daily global
quiz, a due notion with its brick, two validated modules and a review at the one-month horizon - and
check the same values the reference suite checks.
"""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.identity_support import (
    FIXED,
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_notion_state,
    create_user,
    deps_for,
    identifier,
)
from learny.shared.db.uow import Database
from learny.shared.locale_fr import home as texts
from learny.views.home import get_home
from learny_api.generated.models import HomeGetOutput
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-603")

SAP_TITLE = "SAP S/4HANA Finance"


async def set_current_formation(tx: Any, user_id: str, formation_id: str | None) -> None:
    await tx.conn.execute(
        text(
            "update public.profiles set current_formation_id = cast(:formation as uuid) "
            "where id = cast(:user as uuid)"
        ),
        {"formation": formation_id, "user": user_id},
    )


async def update_formation(
    tx: Any,
    formation_id: str,
    *,
    objectives: list[str],
    volume_hours: int | None,
    start_date: str | None,
    completed_at: str | None,
    maintenance_mode: str | None,
    description: str | None,
) -> None:
    """Completes a formation created by the factory with the columns of the completed tab."""
    await tx.conn.execute(
        text(
            """
            update public.formations
               set objectives = cast(:objectives as public.formation_objective[]),
                   volume_hours = :volume_hours,
                   start_date = cast(:start_date as date),
                   completed_at = cast(:completed_at as timestamptz),
                   maintenance_mode = cast(:maintenance_mode as public.maintenance_mode),
                   description = :description
             where id = cast(:formation as uuid)
            """
        ),
        {
            "objectives": objectives,
            "volume_hours": volume_hours,
            "start_date": start_date,
            "completed_at": completed_at,
            "maintenance_mode": maintenance_mode,
            "description": description,
            "formation": formation_id,
        },
    )


async def create_progress(
    tx: Any,
    user_id: str,
    module_id: str,
    *,
    status: str = "validated",
    validated_at: str | None = "2026-09-01T10:00:00Z",
    best_score: int | None = None,
) -> None:
    await tx.conn.execute(
        text(
            """
            insert into public.module_progress (user_id, module_id, status, validated_at, best_score)
            values (
              cast(:user as uuid), cast(:module as uuid), cast(:status as public.module_status),
              cast(:validated as timestamptz), :score
            )
            """
        ),
        {
            "user": user_id,
            "module": module_id,
            "status": status,
            "validated": validated_at,
            "score": best_score,
        },
    )


async def create_slot(
    tx: Any,
    user_id: str,
    formation_id: str,
    *,
    kind: str,
    title: str,
    starts_at: str,
    ends_at: str,
    status: str = "planned",
    module_id: str | None = None,
    meta: str | None = None,
) -> str:
    return await identifier(
        tx.conn,
        """
        insert into public.schedule_slots (
          user_id, formation_id, module_id, kind, title, meta, starts_at, ends_at, status, created_by
        )
        values (
          cast(:user as uuid), cast(:formation as uuid), cast(:module as uuid),
          cast(:kind as public.slot_kind), :title, :meta,
          cast(:starts as timestamptz), cast(:ends as timestamptz),
          cast(:status as public.slot_status), 'planner'
        )
        returning id::text as id
        """,
        user=user_id,
        formation=formation_id,
        module=module_id,
        kind=kind,
        title=title,
        meta=meta,
        starts=starts_at,
        ends=ends_at,
        status=status,
    )


async def create_review(tx: Any, user_id: str, notion_id: str, *, reviewed_at: str, correct: bool) -> None:
    await tx.conn.execute(
        text(
            """
            insert into public.review_logs (user_id, notion_id, source, grade, correct, reviewed_at)
            values (
              cast(:user as uuid), cast(:notion as uuid), 'validation', 'good', :correct,
              cast(:reviewed as timestamptz)
            )
            """
        ),
        {"user": user_id, "notion": notion_id, "correct": correct, "reviewed": reviewed_at},
    )


async def create_brick(
    tx: Any, user_id: str, formation_id: str, notion_ids: list[str], brick_type: str
) -> None:
    await tx.conn.execute(
        text(
            """
            insert into public.bricks (owner_id, formation_id, type, notion_ids, purpose, status)
            values (
              cast(:owner as uuid), cast(:formation as uuid), cast(:type as public.brick_type),
              array(select cast(value as uuid) from unnest(cast(:notions as text[])) as value),
              'course', 'active'
            )
            """
        ),
        {
            "owner": user_id,
            "formation": formation_id,
            "type": brick_type,
            "notions": notion_ids,
        },
    )


async def count_ai_calls(database: Database) -> int:
    async with database.service_tx() as tx:
        found = (
            (await tx.conn.execute(text("select count(*)::int as count from public.ai_calls")))
            .mappings()
            .all()
        )
    return int(found[0]["count"])


async def workspace(tx: Any) -> dict[str, Any]:
    """One learner with a current SAP formation, a paused one, a proposed one and two completed."""
    alex = await create_user(tx.conn, "Alex")
    sap = await create_formation(tx.conn, alex, title=SAP_TITLE, last_opened_at=FIXED, monogram="SA")
    modules = [
        await create_module(tx.conn, sap, position, title=title)
        for position, title in enumerate(
            (
                "Fondamentaux",
                "Parametrage",
                "Comptabilite generale",
                "Controle de gestion",
                "Reporting",
                "Fiscalite",
                "Synthese",
            ),
            start=1,
        )
    ]
    chapter = await create_chapter(tx.conn, sap, modules[0])
    reviewed_notion = await create_notion(tx.conn, sap, modules[0], chapter, position=1)
    await create_review(tx, alex, reviewed_notion, reviewed_at="2026-10-01T10:00:00Z", correct=True)
    await create_progress(tx, alex, modules[0])
    await create_progress(tx, alex, modules[1])

    open_chapter = await create_chapter(tx.conn, sap, modules[2])
    due_notion = await create_notion(tx.conn, sap, modules[2], open_chapter, position=1)
    await create_notion_state(tx.conn, alex, due_notion, due_at=FIXED, in_review=True)
    await create_brick(tx, alex, sap, [due_notion], "choice_question")
    # The open module is evaluated once it has a best score: its due notion enters the quiz.
    await create_progress(tx, alex, modules[2], status="open", validated_at=None, best_score=60)

    await create_slot(
        tx,
        alex,
        sap,
        kind="course",
        title="Cours du matin",
        module_id=modules[2],
        starts_at="2026-11-11T09:00:00Z",
        ends_at="2026-11-11T10:00:00Z",
        status="done",
    )
    await create_slot(
        tx,
        alex,
        sap,
        kind="warmup",
        title="Echauffement",
        starts_at="2026-11-11T12:50:00Z",
        ends_at="2026-11-11T12:52:00Z",
    )
    await create_slot(
        tx,
        alex,
        sap,
        kind="validation_quiz",
        title="Quiz de validation",
        module_id=modules[2],
        starts_at="2026-11-11T13:00:00Z",
        ends_at="2026-11-11T14:00:00Z",
    )
    await create_slot(
        tx,
        alex,
        sap,
        kind="revision",
        title="Revision",
        starts_at="2026-11-11T15:00:00Z",
        ends_at="2026-11-11T16:00:00Z",
    )
    await create_slot(
        tx,
        alex,
        sap,
        kind="global_quiz",
        title="Quiz global",
        starts_at="2026-11-11T17:00:00Z",
        ends_at="2026-11-11T17:15:00Z",
    )

    agile = await create_formation(
        tx.conn, alex, title="Gestion de projet agile", status="paused", monogram="GP"
    )
    await create_slot(
        tx,
        alex,
        agile,
        kind="contributions",
        title="Retrospectives",
        meta="Retrospectives, chapitre 2",
        starts_at="2026-11-12T16:30:00Z",
        ends_at="2026-11-12T17:30:00Z",
    )

    proposed = await create_formation(
        tx.conn,
        alex,
        title="Python et analyse de donnees",
        status="programme_proposed",
        monogram="PY",
    )
    for position in range(1, 9):
        await create_module(tx.conn, proposed, position, title=f"Module {position}")

    excel = await create_formation(
        tx.conn, alex, title="Excel et analyse financiere", status="completed", monogram="EX"
    )
    await update_formation(
        tx,
        excel,
        objectives=["exam"],
        volume_hours=60,
        start_date="2026-08-24",
        completed_at="2026-09-18T16:00:00Z",
        maintenance_mode="light",
        description=None,
    )
    excel_modules = [
        await create_module(tx.conn, excel, position, title=f"Module {position}") for position in (1, 2)
    ]
    for module in excel_modules:
        await create_progress(tx, alex, module, best_score=88)

    english = await create_formation(
        tx.conn,
        alex,
        title="Anglais professionnel B2",
        status="completed",
        monogram="EN",
        accent_color="orange",
    )
    await update_formation(
        tx,
        english,
        objectives=["dialogue"],
        volume_hours=None,
        start_date=None,
        completed_at=None,
        maintenance_mode="stopped",
        description=(
            "Une formation tres longue qui depasse largement la premiere ligne attendue par la carte."
        ),
    )

    await set_current_formation(tx, alex, sap)
    return {
        "alex": alex,
        "sap": sap,
        "modules": modules,
        "chapter": chapter,
        "reviewed_notion": reviewed_notion,
        "due_notion": due_notion,
        "agile": agile,
        "proposed": proposed,
        "excel": excel,
        "english": english,
    }


async def test_the_home_screen_of_the_learner_is_projected(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        seeded = await workspace(tx)
        before = await count_ai_calls(database)
        result = await get_home(deps_for(tx), actor_for(seeded["alex"]))
        HomeGetOutput.model_validate(result)
        return result, seeded, before, await count_ai_calls(database)

    home, seeded, before, after = await rolled_back(database, scenario)

    assert before == after
    assert home["today"]["date"] == "2026-11-11"
    assert home["today"]["label"] == "Mercredi 11 novembre"
    assert len(home["today"]["slots"]) == 5
    assert home["today"]["plannedMinutes"] == 182
    assert home["today"]["doneMinutes"] == 60
    assert [slot["state"] for slot in home["today"]["slots"]] == [
        "done",
        "todo",
        "next",
        "upcoming",
        "upcoming",
    ]
    assert home["today"]["slots"][1]["kind"] == "warmup"
    assert home["today"]["slots"][1]["time"] == "13:50"
    assert home["today"]["slots"][2]["minutesUntil"] == 40
    assert home["today"]["slots"][2]["href"] == (
        f"/formations/{seeded['sap']}/modules/{seeded['modules'][2]}/quiz"
    )
    assert home["today"]["primaryAction"] == {
        "label": "Commencer le quiz de validation",
        "href": f"/formations/{seeded['sap']}/modules/{seeded['modules'][2]}/quiz",
    }
    assert sorted(home["retention"]) == ["oneMonth", "twoMonths"]
    assert home["retention"]["oneMonth"] == 100
    assert home["retention"]["twoMonths"] is None

    quiz = home["globalQuiz"]
    assert quiz is not None
    assert quiz["formationTitle"] == SAP_TITLE
    assert quiz["notionCount"] == 1
    assert quiz["gamesCount"] == 1
    assert quiz["hasGaps"] is False
    assert quiz["deferred"] is None

    ongoing = home["formations"]["ongoing"]
    assert [row["title"] for row in ongoing] == [
        SAP_TITLE,
        "Gestion de projet agile",
        "Python et analyse de donnees",
    ]
    assert ongoing[0]["progressPercent"] == 29
    assert ongoing[0]["modulePosition"] == 3
    assert ongoing[0]["moduleTitle"] == "Comptabilite generale"
    assert ongoing[0]["action"]["label"] == "Reprendre"
    assert ongoing[0]["action"]["href"] == (f"/formations/{seeded['sap']}/modules/{seeded['modules'][2]}")
    assert ongoing[0]["primaryAction"] is True
    assert ongoing[1]["moduleStatus"] is None
    assert ongoing[1]["nextActivity"] == {"when": "Demain, 17:30", "detail": "Apports, chapitre 2"}
    assert ongoing[2]["status"] == "programme_proposed"
    assert ongoing[2]["nextActivity"] == {
        "when": "Valider le programme",
        "detail": texts.NEXT_PROGRAMME_MODULES.format(count=8),
    }
    assert ongoing[2]["action"]["label"] == "Continuer"

    completed = home["formations"]["completed"]
    assert [row["title"] for row in completed] == [
        "Excel et analyse financiere",
        "Anglais professionnel B2",
    ]
    assert completed[0]["resultPercent"] == 88
    assert completed[0]["maintenanceMode"] == "light"
    assert completed[0]["weeks"] == 4
    assert completed[0]["volumeHours"] == 60
    assert completed[0]["completedOn"] == "2026-09-18"
    assert completed[0]["action"]["label"] == texts.ACTION_REVIEW
    assert completed[1]["resultPercent"] is None
    assert completed[1]["maintenanceMode"] == "stopped"
    assert completed[1]["action"]["label"] == "Voir le bilan"
    assert completed[1]["subtitle"].endswith(texts.ELLIPSIS)


async def test_another_learner_never_sees_the_first_ones_data(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        await workspace(tx)
        other = await create_user(tx.conn, "Bea", timezone="Europe/Paris")
        result = await get_home(deps_for(tx), actor_for(other))
        HomeGetOutput.model_validate(result)
        return result

    home = await rolled_back(database, scenario)

    assert home["formations"]["ongoing"] == []
    assert home["formations"]["completed"] == []
    assert home["today"]["slots"] == []
    assert home["today"]["primaryAction"] is None
    assert home["globalQuiz"] is None
    assert home["retention"] == {"oneMonth": None, "twoMonths": None}


async def test_the_day_and_the_hours_follow_the_learner_zone(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        user = await create_user(tx.conn, "Nina", timezone="America/New_York")
        formation = await create_formation(tx.conn, user, title="Fuseau de New York")
        module = await create_module(tx.conn, formation, 1)
        await create_slot(
            tx,
            user,
            formation,
            kind="course",
            title="Cours du matin",
            module_id=module,
            starts_at="2026-11-11T14:00:00Z",
            ends_at="2026-11-11T15:00:00Z",
        )
        await set_current_formation(tx, user, formation)
        result = await get_home(deps_for(tx), actor_for(user))
        HomeGetOutput.model_validate(result)
        return result

    home = await rolled_back(database, scenario)

    assert home["today"]["label"] == "Mercredi 11 novembre"
    assert home["today"]["slots"][0]["time"] == "09:00"
    assert home["retention"] == {"oneMonth": None, "twoMonths": None}


async def test_the_present_is_never_read_outside_the_injected_clock(database: Database) -> None:
    async def scenario(tx: Any) -> Any:
        await workspace(tx)
        alex = await create_user(tx.conn, "Zoe")
        deps = deps_for(tx)
        frozen = deps.clock.now()
        first = await get_home(deps, actor_for(alex))
        second = await get_home(deps, actor_for(alex))
        return first, second, frozen, deps.clock.now()

    first, second, frozen, after = await rolled_back(database, scenario)

    assert frozen == after == FIXED
    assert first == second
