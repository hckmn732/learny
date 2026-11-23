"""[SPEC-2207] The notification, generation and push demonstration routes through the facade.

The notify route replays the real service with the simulated settings and restores the account,
the generation route runs the twelve producers and the reminder, and the push route sends one
notification to the caller's mock subscriptions. The development guard refuses everything outside
`ENABLE_SDD_PAGES`.
"""

from typing import Any

import pytest
from dev_route_support import Clock, DevDeps, allow_authentication, build_dev_app
from learny.engagement.infrastructure.email import EmailConfig, MemoryEmailTransport
from learny.engagement.infrastructure.push import create_push_transport
from learny.shared.db.uow import Database
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = ("dev.notificationsGenerate",)
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}
MOCK_ENDPOINT = "https://push.mock.learny.app/spec-2207-push/success"

SETTINGS = {
    "channelEmail": True,
    "channelPush": True,
    "typeRevision": True,
    "typeValidation": True,
    "typeCourse": True,
    "typeGap": True,
    "typePlanning": True,
    "typeRelaunch": True,
    "quietStart": "21:00",
    "quietEnd": "08:00",
    "weekendQuiet": False,
    "maxPerDay": 5,
}


def email_config() -> EmailConfig:
    return EmailConfig(
        mode="memory",
        sender="Learny <bonjour@learny.app>",
        app_url="https://app.learny.example",
        link_secret="learny-test-only-email-link-secret-00000000",
        smtp_host="127.0.0.1",
        smtp_port=1025,
        resend_api_key=None,
        is_production=False,
    )


@pytest.fixture
async def app(database: Database) -> tuple[Any, Any]:
    clock = Clock()
    deps = DevDeps(
        db=database,
        clock=clock,
        email=MemoryEmailTransport(clock),
        email_config=email_config(),
        push=create_push_transport("mock", clock=clock),
    )
    return build_dev_app(ROUTE_IDS, deps, ENABLED)


async def seeded_profile(database: Database) -> Any:
    async with database.service_tx() as tx:
        row = (
            (await tx.conn.execute(text("select id::text as id from public.profiles limit 1")))
            .mappings()
            .first()
        )
    if row is None:
        pytest.skip("the demonstration database has no seeded profile")
    return row


async def test_the_generation_demo_produces_the_producers_and_the_reminder(
    app: tuple[Any, Any], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    row = await seeded_profile(database)
    allow_authentication(monkeypatch, str(row["id"]))

    response = client.post(
        "/api/v1/dev/sdd/notifications/generate",
        json={},
        headers={"idempotency-key": "demo-generate-1", **JSON_ACCEPT},
    )

    assert response.status_code == 201
    body = response.json()
    assert len(body["notifications"]) == 12
    assert {item["type"] for item in body["notifications"]} == {
        "course_ready",
        "global_quiz_today",
        "new_gap",
        "session_planned",
        "module_validated",
        "session_to_reschedule",
        "weekly_review",
        "milestone",
        "ai_cost_alert",
        "ai_task_failed",
        "export_ready",
        "group_invitation",
    }
    assert body["reminder"] is not None
    assert body["reminder"]["schedule"]["dedupeKey"].startswith("validation_soon:")


async def test_the_generation_demo_honours_the_requested_types(
    app: tuple[Any, Any], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    row = await seeded_profile(database)
    allow_authentication(monkeypatch, str(row["id"]))

    response = client.post(
        "/api/v1/dev/sdd/notifications/generate",
        json={"types": ["milestone"]},
        headers={"idempotency-key": "demo-generate-2", **JSON_ACCEPT},
    )

    assert response.status_code == 201
    body = response.json()
    assert [item["type"] for item in body["notifications"]] == ["milestone"]
    assert body["reminder"] is None


async def test_the_guard_refuses_the_generation_in_production() -> None:
    _app, client = build_dev_app(ROUTE_IDS, DevDeps(), {"APP_ENV": "production", "ENABLE_SDD_PAGES": "true"})
    response = client.post("/api/v1/dev/sdd/notifications/generate", json={}, headers=JSON_ACCEPT)

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
