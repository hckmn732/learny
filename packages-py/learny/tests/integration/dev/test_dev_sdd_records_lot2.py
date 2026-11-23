"""[SPEC-2302] The recorded demonstration pages of the second lot through the facade.

The programme, memory and sharing pages build their fixture in a rolled-back transaction; the
search, RLS and seed pages measure the real database. The development guard refuses production.
"""

from types import SimpleNamespace
from typing import Any

import pytest
from dev_route_support import DevDeps, build_dev_app
from learny.shared.db.uow import Database
from learny.shared.locale_fr import dev_sdd_fixtures as fixture
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND

pytestmark = pytest.mark.spec("SPEC-2302")

ROUTE_IDS = (
    "dev.sdd.spec-108.demo",
    "dev.sdd.spec-111.demo",
    "dev.sdd.spec-112.demo",
    "dev.sdd.spec-113.demo",
    "dev.sdd.spec-115.demo",
)
PATHS = {
    "dev.sdd.spec-108.demo": "/api/v1/dev/sdd/SPEC-108/demo",
    "dev.sdd.spec-111.demo": "/api/v1/dev/sdd/SPEC-111/demo",
    "dev.sdd.spec-112.demo": "/api/v1/dev/sdd/SPEC-112/demo",
    "dev.sdd.spec-113.demo": "/api/v1/dev/sdd/SPEC-113/demo",
    "dev.sdd.spec-115.demo": "/api/v1/dev/sdd/SPEC-115/demo",
}
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}


def settings(app_env: str = "test") -> Any:
    return SimpleNamespace(enable_sdd_pages="true", app_env=app_env)


def build(database: Database | None, app_env: str = "test") -> tuple[Any, Any]:
    deps = DevDeps(db=database, settings=settings(app_env))
    return build_dev_app((), deps, ENABLED, pipeline_ids=ROUTE_IDS)


async def test_the_agenda_page_answers_the_five_statuses_the_action_and_the_daily(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-108.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["slots"]) == 5
    statuses = {slot["status"] for slot in body["slots"]}
    assert statuses == {"planned", "done", "missed", "cancelled", "moved"}
    moved = next(slot for slot in body["slots"] if slot["status"] == "moved")
    successor = next(slot for slot in body["slots"] if slot["status"] == "planned")
    assert successor["movedFromStartsAt"] == moved["startsAt"]
    assert successor["createdBy"] == "learner"
    assert body["daily"] == {
        "day": "2026-11-11",
        "minutes": 45,
        "qualifying": True,
        "sources": ["attempt:1", "slot:2"],
    }
    assert body["action"]["automation"] == "reprise"
    assert body["action"]["status"] == "pending_consent"
    assert body["action"]["requiresConsent"] is True
    assert body["action"]["summary"] == fixture.SPEC108_ACTION_SUMMARY
    assert [milestone["key"] for milestone in body["milestones"]] == [
        "streak_30",
        "module_validated",
    ]


async def test_the_group_page_answers_the_code_the_capacity_and_the_progress(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-111.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["code"] == fixture.SPEC111_INVITE_CODE
    assert body["capacity"] == {"used": 3, "max": 10}
    assert [entry["firstName"] for entry in body["progress"]] == ["Alice", "Bob", "Carol"]
    assert [entry["validatedModules"] for entry in body["progress"]] == [1, 1, 0]
    assert [entry["streakDays"] for entry in body["progress"]] == [0, 7, 3]
    assert body["activeCount"] == 1


async def test_the_search_page_answers_the_groups_the_exports_and_the_keys(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-112.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["query"] == fixture.SPEC112_QUERY
    assert [group["kind"] for group in body["groups"]] == ["formation", "notion", "section"]
    assert body["total"] == 3
    assert body["foreignTitle"] == fixture.SPEC112_FOREIGN_TITLE
    assert body["foreignVisible"] == 0
    assert "<script>" not in body["groups"][2]["items"][0]["snippet"]
    assert len(body["exports"]) == 2
    assert [entry["downloadable"] for entry in body["exports"]] == [True, False]
    assert len(body["acceptances"]) == 3
    assert body["latestCgu"] == "1.3"
    states = {entry["key"]: entry["state"] for entry in body["idempotency"]}
    assert states == {
        "demo-export-running-02": "in_progress",
        "demo-export-ready-0001": "replayed",
        "demo-export-reused-003": "reused",
    }


async def test_the_rls_page_answers_the_catalogue_and_the_matrix(database: Database) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-113.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tableCount"] > 0
    assert 0 < body["rlsCount"] <= body["tableCount"]
    assert body["policyCount"] > 0
    assert body["categories"] == [
        {"category": "shared-programme", "count": 7},
        {"category": "personal", "count": 46},
        {"category": "service", "count": 7},
    ]
    assert [row["key"] for row in body["matrix"]] == [
        "programme-read",
        "programme-write",
        "resources-read",
        "progress-read",
        "projection-read",
        "service-read",
        "settings-read",
    ]
    assert body["matrix"][0]["cells"] == {"a": True, "b": True, "c": False}
    assert body["matrix"][2]["cells"] == {"a": True, "b": False, "c": False}
    assert body["matrix"][5]["cells"] == {"a": False, "b": False, "c": False}


async def test_the_seed_page_measures_the_demonstration_dataset(database: Database) -> None:
    _app, client = build(database)
    async with database.service_tx() as tx:
        row = (
            (
                await tx.conn.execute(
                    __import__("sqlalchemy").text(
                        "select count(*)::int as count from public.profiles where id = cast(:id as uuid)"
                    ),
                    {"id": fixture_demo_user()},
                )
            )
            .mappings()
            .first()
        )
    present = row is not None and int(row["count"]) > 0

    response = client.get(PATHS["dev.sdd.spec-115.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["present"] is present
    if present:
        assert body["profile"] is not None
        assert [title["title"] for title in body["formations"]["titles"]] == [
            title for title, _status, _progress in fixture.SPEC115_FORMATIONS
        ]
        assert [check["key"] for check in body["checks"]] == [
            "sap.modules",
            "sap.notions",
            "formations.active_or_proposed",
            "formations.completed",
            "group.members",
            "agenda.slots",
            "agenda.days",
            "notifications.unread",
        ]
        # CA-1 - every count of the seeded dataset matches the fixture (48 SAP notions, ...).
        assert [check["key"] for check in body["checks"] if not check["ok"]] == []
    else:
        assert body == {
            "present": False,
            "profile": None,
            "formations": {"activeOrProposed": 0, "completed": 0, "titles": []},
            "sap": {"modules": 0, "chapters": 0, "notions": 0},
            "group": {"members": 0, "names": []},
            "agenda": {"days": [], "slots": 0, "unread": 0},
            "checks": [],
        }


def fixture_demo_user() -> str:
    """The stable `alex` identifier of the demonstration dataset (UUID v5)."""
    import uuid

    namespace = uuid.uuid5(uuid.NAMESPACE_DNS, "learny-demo")
    return str(uuid.uuid5(namespace, "user:alex"))


@pytest.mark.parametrize("route_id", ROUTE_IDS)
async def test_the_guard_refuses_the_recorded_demonstrations_in_production(
    database: Database, route_id: str
) -> None:
    _app, client = build(database, app_env="production")

    response = client.get(PATHS[route_id], headers=JSON_ACCEPT)

    assert response.status_code == 404, response.text
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
