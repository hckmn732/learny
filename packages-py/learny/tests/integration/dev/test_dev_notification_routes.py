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

ROUTE_IDS = ("dev.notify", "dev.notificationsGenerate", "dev.pushSend")
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


async def test_the_notify_demo_renders_and_restores_the_account(
    app: tuple[Any, Any], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    row = await seeded_profile(database)
    async with database.service_tx() as tx:
        # the dedupe key is stable, so a previous run of the suite must not replay it.
        await tx.conn.execute(
            text(
                "delete from public.notifications where user_id = cast(:user_id as uuid) "
                "and dedupe_key = 'demo:notify:1'"
            ),
            {"user_id": str(row["id"])},
        )
    allow_authentication(monkeypatch, str(row["id"]))

    response = client.post(
        "/api/v1/dev/sdd/notify",
        json={
            "at": "2026-11-11T12:20:00Z",
            "type": "course_ready",
            "tone": "tu",
            "settings": SETTINGS,
            "dedupeKey": "demo:notify:1",
        },
        headers={"idempotency-key": "demo-notify-1", **JSON_ACCEPT},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["notification"]["type"] == "course_ready"
    assert body["notification"]["title"]
    assert body["notification"]["createdAt"] == "2026-11-11T12:20:00.000Z"
    assert body["created"] is True
    assert body["deliveries"]
    assert body["digest"]["heldMaxPerDay"] == 5


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


async def test_the_push_demo_sends_to_the_mock_subscription(
    app: tuple[Any, Any], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    row = await seeded_profile(database)
    user_id = str(row["id"])
    async with database.service_tx() as tx:
        # only the subscription of this demonstration may receive the message.
        await tx.conn.execute(
            text(
                "delete from public.push_subscriptions "
                "where user_id = cast(:user_id as uuid) or endpoint = :endpoint"
            ),
            {"user_id": user_id, "endpoint": MOCK_ENDPOINT},
        )
        await tx.conn.execute(
            text(
                "insert into public.push_subscriptions "
                "(user_id, endpoint, p256dh, auth, user_agent) values "
                "(cast(:user_id as uuid), :endpoint, :p256dh, :auth, null) "
                "on conflict (endpoint) do nothing"
            ),
            {
                "user_id": user_id,
                "endpoint": MOCK_ENDPOINT,
                "p256dh": "BOr0000000000000000000000000000000000000000000000000000000000",
                "auth": "auth0000000000000000000",
            },
        )
    allow_authentication(monkeypatch, user_id)

    response = client.post("/api/v1/dev/sdd/push/send", headers=JSON_ACCEPT)

    assert response.status_code == 201
    body = response.json()
    assert body["delivery"]["status"] == "sent"
    assert body["delivery"]["sentAt"] == "2026-11-11T12:20:00.000Z"
    assert body["payload"]["tag"] == body["notificationId"]
    assert body["attempts"] == [
        {"outcome": "success", "statusCode": 201, "removed": False, "failureCount": 0}
    ]
    assert body["remainingSubscriptions"] == 1


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/dev/sdd/notify",
        "/api/v1/dev/sdd/notifications/generate",
        "/api/v1/dev/sdd/push/send",
    ],
)
async def test_the_guard_refuses_the_demonstration_in_production(path: str) -> None:
    _app, client = build_dev_app(ROUTE_IDS, DevDeps(), {"APP_ENV": "production", "ENABLE_SDD_PAGES": "true"})
    response = client.post(path, json={}, headers=JSON_ACCEPT)

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
