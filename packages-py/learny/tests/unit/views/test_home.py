"""[SPEC-603] Home aggregation: the day, the slots, retention, the global quiz and both tabs.

Port of `packages/services/src/home/get-home.test.ts`: the queries are faked, so these tests pin
the projection of the screen and not the SQL.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import pytest
from learny.identity.domain.actor import Actor
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.errors import AppError
from learny.shared.locale_fr import home as texts
from learny.shared.locale_fr.details import PROFILE_NOT_FOUND
from learny.shared.time import parse_iso
from learny.views import home_queries
from learny.views.home import get_home

pytestmark = pytest.mark.spec("SPEC-603")

USER = "11111111-1111-4111-8111-111111111111"
ACTIVE = "22222222-2222-4222-8222-222222222222"
PAUSED = "33333333-3333-4333-8333-333333333333"
PROPOSED = "44444444-4444-4444-8444-444444444444"
CADRAGE = "55555555-5555-4555-8555-555555555555"
COMPLETED = "66666666-6666-4666-8666-666666666666"
COMPLETED_BIS = "77777777-7777-4777-8777-777777777777"
MODULE = "88888888-8888-4888-8888-888888888888"
NOTION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
NOTION_BIS = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
SLOT_DONE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
SLOT_NEXT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
SLOT_REVISION = "ffffffff-ffff-4fff-8fff-ffffffffffff"
SLOT_QUIZ = "10101010-1010-4010-8010-101010101010"
ACTIVITY = "12121212-1212-4212-8212-121212121212"
NEXT_SLOT = "13131313-1313-4313-8313-131313131313"
REVIEW = "14141414-1414-4414-8414-141414141414"
REVIEW_BIS = "15151515-1515-4515-8515-151515151515"
NOW = parse_iso("2026-11-11T12:20:00Z")


class _Transactions:
    """`user_tx` without a connection: every query of the view is patched in these tests."""

    @asynccontextmanager
    async def user_tx(self, actor: Actor) -> AsyncIterator[None]:
        yield None


class _Deps:
    """The dependency bundle the view sees; only the clock and the transaction are used."""

    def __init__(self) -> None:
        self.settings = Settings()
        self.clock = FixedClock(NOW)
        self.db = _Transactions()


def formation(**partial: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": ACTIVE,
        "title": "SAP S/4HANA Finance",
        "monogram": "SA",
        "accent": "indigo",
        "status": "active",
        "description": None,
        "objectives": ["operational"],
        "volume_hours": None,
        "start_date": "2026-09-01",
        "end_date": "2026-12-20",
        "completed_at": None,
        "maintenance_mode": None,
        "last_opened_at": "2026-11-10T10:00:00Z",
        "created_at": "2026-09-01T10:00:00Z",
        "module_count": 3,
        "validated_count": 1,
        "open_module_id": MODULE,
        "open_module_position": 2,
        "open_module_title": "Comptabilite generale",
        "open_module_threshold": 80,
        "open_module_status": "open",
        "contributions_in_progress": False,
        "course_status": "ready",
        "reading_percent": 100,
        "attempt_count": 1,
        "last_score": 60,
        "result_percent": 60,
        "due_count": 2,
        "cadrage_questions": 0,
    }
    row.update(partial)
    return row


def slot(**partial: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": SLOT_DONE,
        "formation_id": ACTIVE,
        "module_id": MODULE,
        "activity_id": None,
        "kind": "course",
        "title": "Comptabilite generale",
        "meta": None,
        "starts_at": "2026-11-11T09:00:00Z",
        "ends_at": "2026-11-11T10:00:00Z",
        "status": "done",
    }
    row.update(partial)
    return row


def due(**partial: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "notion_id": NOTION,
        "module_id": MODULE,
        "module_position": 2,
        "module_status": "open",
        "evaluated": True,
        "due_at": "2026-11-11T09:00:00Z",
        "in_review": True,
        "gap_nature": None,
    }
    row.update(partial)
    return row


def full_workspace() -> dict[str, Any]:
    return {
        "profile": {
            "current_formation_id": ACTIVE,
            "timezone": "Europe/Paris",
            "next_review_at": None,
        },
        "formations": [
            formation(),
            formation(
                id=PAUSED,
                title="Gestion de projet agile",
                monogram="GP",
                accent="green",
                status="paused",
                description="Reprise apres une pause.",
                objectives=["exam"],
                module_count=0,
                validated_count=0,
                open_module_id=None,
                open_module_position=None,
                open_module_title=None,
                open_module_threshold=None,
                open_module_status=None,
                last_opened_at=None,
                created_at="2026-10-01T10:00:00Z",
            ),
            formation(
                id=PROPOSED,
                title="Python et analyse de donnees",
                monogram="PY",
                accent="violet",
                status="programme_proposed",
                objectives=[],
                module_count=1,
                validated_count=0,
                open_module_id=None,
                open_module_position=None,
                open_module_title=None,
                last_opened_at=None,
                created_at="2026-10-05T10:00:00Z",
            ),
            formation(
                id=CADRAGE,
                title="Anglais professionnel",
                monogram="AN",
                accent="orange",
                status="cadrage",
                objectives=[],
                module_count=0,
                validated_count=0,
                open_module_id=None,
                open_module_position=None,
                open_module_title=None,
                last_opened_at=None,
                created_at="2026-10-10T10:00:00Z",
                cadrage_questions=2,
            ),
            formation(
                id=COMPLETED,
                title="Excel et analyse financiere",
                monogram="EX",
                accent="teal",
                status="completed",
                description=None,
                objectives=["exam"],
                volume_hours=60,
                completed_at="2026-10-20T10:00:00Z",
                maintenance_mode="light",
                module_count=4,
                validated_count=4,
                open_module_id=None,
                open_module_position=None,
                open_module_title=None,
                last_opened_at=None,
                created_at="2026-08-01T10:00:00Z",
                result_percent=88,
                due_count=5,
            ),
            formation(
                id=COMPLETED_BIS,
                title="Anglais professionnel B2",
                monogram="EN",
                accent="orange",
                status="completed",
                description=(
                    "Une formation tres longue qui depasse largement la premiere ligne attendue par "
                    "la carte.\nSuite."
                ),
                objectives=[],
                volume_hours=None,
                completed_at=None,
                maintenance_mode="stopped",
                module_count=2,
                validated_count=2,
                open_module_id=None,
                open_module_position=None,
                open_module_title=None,
                last_opened_at=None,
                created_at="2026-08-02T10:00:00Z",
                result_percent=82,
                due_count=0,
            ),
        ],
        "slots": [
            slot(),
            slot(
                id=SLOT_NEXT,
                kind="validation_quiz",
                title="Quiz de validation",
                activity_id=ACTIVITY,
                starts_at="2026-11-11T14:00:00Z",
                ends_at="2026-11-11T15:00:00Z",
                status="planned",
            ),
            slot(
                id=SLOT_REVISION,
                kind="revision",
                title="Revision",
                starts_at="2026-11-11T16:00:00Z",
                ends_at="2026-11-11T17:00:00Z",
                status="planned",
            ),
            slot(
                id=SLOT_QUIZ,
                kind="global_quiz",
                title="Quiz global",
                starts_at="2026-11-11T18:00:00Z",
                ends_at="2026-11-11T18:15:00Z",
                status="planned",
            ),
        ],
        "next_slots": [
            slot(
                id=NEXT_SLOT,
                kind="course",
                title="Cours de demain",
                starts_at="2026-11-12T09:00:00Z",
                ends_at="2026-11-12T10:00:00Z",
                status="planned",
            )
        ],
        "retention": {
            "modules": [
                {
                    "formation_id": ACTIVE,
                    "module_id": MODULE,
                    "validated_at": "2026-09-01T10:00:00Z",
                    "notion_ids": [NOTION],
                }
            ],
            "reviews": [
                {
                    "review_id": REVIEW,
                    "notion_id": NOTION,
                    "reviewed_at": "2026-10-01T10:00:00Z",
                    "correct": True,
                },
                {
                    "review_id": REVIEW_BIS,
                    "notion_id": "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
                    "reviewed_at": "2026-10-01T10:00:00Z",
                    "correct": False,
                },
            ],
        },
        "due": [due(), due(notion_id=NOTION_BIS)],
        "bricks": [
            {"notion_ids": [NOTION], "type": "choice_question"},
            {"notion_ids": [NOTION_BIS], "type": "text"},
        ],
        "card": None,
        "next_quiz": None,
        "cap_params": {},
    }


def patch_queries(monkeypatch: pytest.MonkeyPatch, data: dict[str, Any]) -> None:
    """Replaces every read of `learny.views.home_queries` with the rows of `data`."""

    async def read_profile(_tx: Any, _user_id: str, _now: str) -> Any:
        return data["profile"]

    async def read_formations(_tx: Any, _user_id: str, _now: str) -> Any:
        return data["formations"]

    async def read_today_slots(_tx: Any, _user_id: str, _start: str, _end: str) -> Any:
        return data["slots"]

    async def read_next_slots(_tx: Any, _user_id: str, _now: str) -> Any:
        return data["next_slots"]

    async def read_retention(_tx: Any, _user_id: str) -> Any:
        return data["retention"]

    async def read_due_notions(_tx: Any, _user_id: str, _formation: str, _now: str) -> Any:
        return data["due"]

    async def read_bricks(_tx: Any, _user_id: str, _formation: str) -> Any:
        return data["bricks"]

    async def read_next_quiz_start(_tx: Any, _user_id: str, _formation: str, _today: str, _zone: str) -> Any:
        return data["next_quiz"]

    async def read_today_quiz_card(_tx: Any, _user_id: str, _formation: str, _today: str) -> Any:
        return data["card"]

    async def read_quiz_cap_params(_tx: Any, _user_id: str) -> Any:
        return data["cap_params"]

    monkeypatch.setattr(home_queries, "read_profile", read_profile)
    monkeypatch.setattr(home_queries, "read_formations", read_formations)
    monkeypatch.setattr(home_queries, "read_today_slots", read_today_slots)
    monkeypatch.setattr(home_queries, "read_next_slots", read_next_slots)
    monkeypatch.setattr(home_queries, "read_retention", read_retention)
    monkeypatch.setattr(home_queries, "read_due_notions", read_due_notions)
    monkeypatch.setattr(home_queries, "read_bricks", read_bricks)
    monkeypatch.setattr(home_queries, "read_next_quiz_start", read_next_quiz_start)
    monkeypatch.setattr(home_queries, "read_today_quiz_card", read_today_quiz_card)
    monkeypatch.setattr(home_queries, "read_quiz_cap_params", read_quiz_cap_params)


def actor() -> Actor:
    return Actor(user_id=USER, email="learner@test.learny.test", email_confirmed=True, transport="bearer")


async def home_of(monkeypatch: pytest.MonkeyPatch, data: dict[str, Any]) -> dict[str, Any]:
    patch_queries(monkeypatch, data)
    return await get_home(_Deps(), actor())


async def test_the_day_the_retention_the_quiz_and_both_tabs_are_projected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    home = await home_of(monkeypatch, full_workspace())

    assert home["today"]["date"] == "2026-11-11"
    assert home["today"]["label"] == "Mercredi 11 novembre"
    assert home["today"]["plannedMinutes"] == 180
    assert home["today"]["doneMinutes"] == 60
    assert home["today"]["primaryAction"] == {
        "label": "Commencer le quiz de validation",
        "href": f"/formations/{ACTIVE}/modules/{MODULE}/quiz",
    }
    assert [row["state"] for row in home["today"]["slots"]] == ["done", "next", "upcoming", "upcoming"]
    assert home["today"]["slots"][1]["minutesUntil"] == 100
    assert home["today"]["slots"][1]["time"] == "15:00"
    assert home["retention"] == {"oneMonth": 100, "twoMonths": None}

    quiz = home["globalQuiz"]
    assert quiz is not None
    assert quiz["formationId"] == ACTIVE
    assert quiz["formationTitle"] == "SAP S/4HANA Finance"
    assert quiz["notionCount"] == 1
    assert quiz["gamesCount"] == 1
    assert quiz["hasGaps"] is False
    assert quiz["deferred"] == {
        "dueCount": 2,
        "deferredCount": 1,
        "deferredTo": "2026-11-12",
        "dayLabel": "jeudi",
        "capMin": 15,
    }

    ongoing = home["formations"]["ongoing"]
    assert [row["status"] for row in ongoing] == ["active", "paused", "programme_proposed", "cadrage"]
    assert ongoing[0]["id"] == ACTIVE
    assert ongoing[0]["primaryAction"] is True
    assert ongoing[0]["progressPercent"] == 33
    assert ongoing[0]["moduleStatus"] == {
        "label": texts.MODULE_STATUS_TO_RETAKE[0],
        "tone": texts.MODULE_STATUS_TO_RETAKE[1],
    }
    assert ongoing[0]["nextActivity"] == {"when": "Demain, 10:00", "detail": "Cours"}
    assert ongoing[1]["id"] == PAUSED
    assert ongoing[1]["subtitle"] == "Certification"
    assert ongoing[1]["moduleStatus"] is None
    assert ongoing[1]["nextActivity"] is None
    assert ongoing[1]["action"] == {"label": "Reprendre", "href": f"/formations/{PAUSED}/programme"}
    assert ongoing[2]["id"] == PROPOSED
    assert ongoing[2]["nextActivity"] == {
        "when": "Valider le programme",
        "detail": texts.NEXT_PROGRAMME_ONE_MODULE,
    }
    assert ongoing[2]["action"]["label"] == "Continuer"
    assert ongoing[3]["id"] == CADRAGE
    assert ongoing[3]["nextActivity"] == {
        "when": "Terminer le cadrage",
        "detail": "Question 3 sur 5 au plus",
    }
    assert ongoing[3]["action"]["href"] == f"/formations/{CADRAGE}/cadrage"

    completed = home["formations"]["completed"]
    assert [row["id"] for row in completed] == [COMPLETED, COMPLETED_BIS]
    assert completed[0]["resultPercent"] == 88
    assert completed[0]["retentionPercent"] is None
    assert completed[0]["dueCount"] == 5
    assert completed[0]["maintenanceMode"] == "light"
    assert completed[0]["completedOn"] == "2026-10-20"
    assert completed[0]["weeks"] == 7
    assert completed[0]["volumeHours"] == 60
    assert completed[0]["action"]["label"] == texts.ACTION_REVIEW
    assert completed[1]["retentionPercent"] is None
    assert completed[1]["maintenanceMode"] == "stopped"
    assert completed[1]["completedOn"] is None
    assert completed[1]["weeks"] is None
    assert completed[1]["action"]["label"] == "Voir le bilan"
    assert completed[1]["subtitle"].endswith(texts.ELLIPSIS)


async def test_the_next_review_and_an_empty_quiz_are_computed(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace = full_workspace()
    workspace.update(
        profile={
            "current_formation_id": ACTIVE,
            "timezone": "UTC",
            "next_review_at": "2026-11-13T09:00:00Z",
        },
        formations=[formation()],
        slots=[],
        next_slots=[],
        retention={"modules": [], "reviews": []},
        due=[],
        bricks=[],
    )

    home = await home_of(monkeypatch, workspace)

    assert home["globalQuiz"] == {
        "formationId": ACTIVE,
        "formationTitle": "SAP S/4HANA Finance",
        "notionCount": 0,
        "gamesCount": 0,
        "durationMin": 0,
        "hasGaps": False,
        "deferred": None,
        "nextReviewOn": "2026-11-13",
    }
    assert home["today"]["date"] == "2026-11-11"
    assert home["today"]["plannedMinutes"] == 0
    assert home["today"]["doneMinutes"] == 0
    assert home["today"]["slots"] == []


async def test_a_finished_session_no_longer_offers_the_notions_it_reviewed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = full_workspace()
    workspace.update(
        formations=[formation()],
        slots=[],
        next_slots=[],
        due=[],
        bricks=[],
        card={
            "config": {
                "estimatedSec": 600,
                "items": [{"format": "choice_question", "notionIds": [NOTION, NOTION_BIS]}],
            },
            "completed": True,
        },
        next_quiz="2026-11-12T16:00:00Z",
    )

    home = await home_of(monkeypatch, workspace)

    assert home["globalQuiz"] == {
        "formationId": ACTIVE,
        "formationTitle": "SAP S/4HANA Finance",
        "notionCount": 0,
        "gamesCount": 0,
        "durationMin": 0,
        "hasGaps": False,
        "deferred": None,
        "nextReviewOn": "2026-11-12",
    }


async def test_without_a_planned_quiz_the_next_review_is_tomorrow(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = full_workspace()
    workspace.update(
        formations=[formation()],
        slots=[],
        next_slots=[],
        due=[],
        bricks=[],
        card={"config": {"estimatedSec": 600, "items": []}, "completed": True},
        next_quiz=None,
    )

    home = await home_of(monkeypatch, workspace)

    quiz = home["globalQuiz"]
    assert quiz is not None
    assert quiz["notionCount"] == 0
    assert quiz["nextReviewOn"] == "2026-11-12"


async def test_a_running_session_keeps_its_notions_to_review(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = full_workspace()
    workspace.update(
        formations=[formation()],
        slots=[],
        next_slots=[],
        due=[],
        bricks=[],
        card={
            "config": {
                "estimatedSec": 600,
                "items": [
                    {"format": "choice_question", "notionIds": [NOTION, NOTION_BIS]},
                ],
            },
            "completed": False,
        },
        next_quiz=None,
    )

    home = await home_of(monkeypatch, workspace)

    quiz = home["globalQuiz"]
    assert quiz is not None
    assert quiz["notionCount"] == 2
    assert quiz["gamesCount"] == 1
    assert quiz["durationMin"] == 10


async def test_without_a_current_formation_no_quiz_and_no_bank_are_read(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace: dict[str, Any] = {
        "profile": {
            "current_formation_id": None,
            "timezone": "Europe/Paris",
            "next_review_at": None,
        },
        "formations": [],
        "slots": [],
        "next_slots": [],
        "retention": {"modules": [], "reviews": []},
        "due": [],
        "bricks": [],
        "card": None,
        "next_quiz": None,
        "cap_params": {},
    }

    home = await home_of(monkeypatch, workspace)

    assert home["globalQuiz"] is None
    assert home["today"]["slots"] == []
    assert home["today"]["primaryAction"] is None
    assert home["retention"] == {"oneMonth": None, "twoMonths": None}
    assert home["formations"] == {"ongoing": [], "completed": []}


async def test_an_unknown_profile_is_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    workspace = full_workspace()
    workspace["profile"] = None
    patch_queries(monkeypatch, workspace)

    with pytest.raises(AppError) as raised:
        await get_home(_Deps(), actor())

    assert raised.value.code == "NOT_FOUND"
    assert raised.value.detail == PROFILE_NOT_FOUND


def test_the_clock_is_the_injected_one() -> None:
    deps = _Deps()

    assert deps.clock.now() == NOW
