"""[SPEC-2302] The recorded demonstration pages through the facade.

Each page builds its fixture in a transaction that is always rolled back and answers the shape of
its TypeScript loader. The development guard refuses everything outside `ENABLE_SDD_PAGES`.
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
    "dev.sdd.spec-103.demo",
    "dev.sdd.spec-104.demo",
    "dev.sdd.spec-105.demo",
    "dev.sdd.spec-106.demo",
    "dev.sdd.spec-107.demo",
)
PATHS = {
    "dev.sdd.spec-103.demo": "/api/v1/dev/sdd/SPEC-103/demo",
    "dev.sdd.spec-104.demo": "/api/v1/dev/sdd/SPEC-104/demo",
    "dev.sdd.spec-105.demo": "/api/v1/dev/sdd/SPEC-105/demo",
    "dev.sdd.spec-106.demo": "/api/v1/dev/sdd/SPEC-106/demo",
    "dev.sdd.spec-107.demo": "/api/v1/dev/sdd/SPEC-107/demo",
}
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}


def settings(app_env: str = "test") -> Any:
    return SimpleNamespace(enable_sdd_pages="true", app_env=app_env)


def build(database: Database | None, app_env: str = "test") -> tuple[Any, Any]:
    deps = DevDeps(db=database, settings=settings(app_env))
    return build_dev_app((), deps, ENABLED, pipeline_ids=ROUTE_IDS)


async def test_the_formation_page_answers_the_tree_the_probes_and_the_plan(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-103.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert [module["title"] for module in body["modules"]] == ["Partie 1", "Partie 2"]
    assert body["modules"][0]["chapters"][0]["notions"][0]["label"] == "Notion 1.1.1"
    keys = [constraint["key"] for constraint in body["constraints"]]
    assert keys == ["cl1", "cl2", "cl4", "cl5", "cl6", "cl7", "cl3"]
    assert all(constraint["ok"] for constraint in body["constraints"])
    assert body["constraints"][-1]["expected"] == "00000"
    assert body["constraints"][-1]["message"] == fixture.SPEC103_CL3_MESSAGE
    assert body["fts"]["query"] == fixture.SPEC103_FTS_QUERY
    assert body["fts"]["matchCount"] == 1
    assert body["fts"]["matchedLabel"] == fixture.SPEC103_FIRST_NOTION_LABEL


async def test_the_resource_page_answers_the_passages_the_search_and_the_soft_delete(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-104.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["resource"]["contentText"] == fixture.SPEC104_NOTE
    assert [chunk["text"] for chunk in body["resource"]["chunks"]] == list(fixture.SPEC104_PASSAGES)
    assert all(chunk["charStart"] >= 0 for chunk in body["resource"]["chunks"])
    assert body["search"]["query"] == fixture.SPEC104_QUERY
    assert len(body["search"]["neighbours"]) == 3
    assert body["search"]["indexUsed"] is True
    assert [limit["key"] for limit in body["limits"]] == ["cl1", "cl2", "cl3", "cl8"]
    assert all(limit["ok"] for limit in body["limits"])
    assert body["softDelete"] == {
        "title": fixture.SPEC104_RESOURCE_TITLE,
        "before": 3,
        "after": 0,
        "retained": True,
        "contentErased": True,
    }


async def test_the_course_page_answers_the_versions_the_revisions_and_the_deleted_source(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-105.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert [version["version"] for version in body["versions"]] == [1, 2]
    assert [version["isCurrent"] for version in body["versions"]] == [False, True]
    assert body["section"]["title"] == fixture.SPEC105_SECTION_TITLE
    assert body["section"]["currentVersion"] == 3
    assert [revision["version"] for revision in body["section"]["revisions"]] == [1, 2]
    assert body["citation"]["displayed"] == fixture.SPEC105_DELETED_SOURCE
    assert body["citation"]["chunkId"] is None
    assert body["citation"]["label"] == fixture.SPEC105_SOURCE_LABEL
    assert [message["role"] for message in body["messages"]] == ["learner", "tutor"]
    assert body["messages"][1]["sources"] == [fixture.SPEC105_SOURCE_LABEL]


async def test_the_brick_page_answers_the_types_the_activity_and_the_graded_attempt(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-106.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["types"]) == 13
    assert body["types"][0]["type"] == "text"
    assert body["types"][11]["status"] == "reported"
    assert body["types"][12]["status"] == "retired"
    assert body["activity"]["kind"] == "validation_quiz"
    assert body["activity"]["status"] == "ready"
    assert [item["version"] for item in body["activity"]["items"]] == [1, 2, 3]
    assert [item["availableVersion"] for item in body["activity"]["items"]] == [4, 4, 4]
    assert body["attempt"] == {
        "attemptNo": 1,
        "status": "graded",
        "score": 50,
        "passed": False,
        "answers": 3,
    }
    assert [answer["position"] for answer in body["answers"]] == [1, 2, 3]
    assert [answer["version"] for answer in body["answers"]] == [1, 2, 3]
    assert [answer["currentVersion"] for answer in body["answers"]] == [4, 4, 4]
    assert body["answers"][2]["gradedBy"] == "tutor"


async def test_the_memory_page_answers_the_due_states_the_gap_and_the_isolation(
    database: Database,
) -> None:
    _app, client = build(database)

    response = client.get(PATHS["dev.sdd.spec-107.demo"], headers=JSON_ACCEPT)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dueCount"] == 2
    assert len(body["states"]) == 3
    assert body["states"][0]["label"] == "Notion 1.1.1"
    assert body["states"][0]["mastery"] == 82.5
    assert body["states"][1]["fsrs"]["lapses"] == 1
    assert body["gap"]["active"] is True
    assert body["gap"]["nature"] == "confusion"
    assert body["gap"]["confusedWithLabel"] == "Notion 1.1.3"
    assert body["gap"]["natures"] == list(("confusion", "application", "misunderstanding", "forgetting"))
    assert [log["grade"] for log in body["history"]] == ["hard", "good"]
    assert body["isolation"] == {"foreignStates": 1, "foreignVisible": 0}


@pytest.mark.parametrize("route_id", ROUTE_IDS)
async def test_the_guard_refuses_the_recorded_demonstrations_in_production(
    database: Database, route_id: str
) -> None:
    _app, client = build(database, app_env="production")

    response = client.get(PATHS[route_id], headers=JSON_ACCEPT)

    assert response.status_code == 404, response.text
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
