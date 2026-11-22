"""[SPEC-2207] The e-mail demonstration routes through the facade.

The preview renders the real template with the sample data, the send uses the real service on the
memory transport, and the outbox of that transport is listed then emptied. The development guard
refuses everything outside `ENABLE_SDD_PAGES`.
"""

from typing import Any

import pytest
from dev_route_support import DevDeps, allow_authentication, build_dev_app
from learny.engagement.infrastructure.email import EmailConfig, MemoryEmailTransport
from learny.shared.db.uow import Database
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = (
    "dev.email.outbox",
    "dev.email.outbox.purge",
    "dev.email.preview",
    "dev.email.send",
)
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}
HTML_ACCEPT = {"accept": "text/html"}


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
    deps = DevDeps(
        db=database,
        email=MemoryEmailTransport(DevDeps().clock),
        email_config=email_config(),
    )
    return build_dev_app(ROUTE_IDS, deps, ENABLED)


async def test_the_preview_answers_json_with_the_rendered_template(
    app: tuple[Any, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch)
    response = client.get(
        "/api/v1/dev/sdd/email/preview",
        params={"template": "welcome", "tone": "vous"},
        headers=JSON_ACCEPT,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["template"] == "welcome"
    assert body["tone"] == "vous"
    assert body["category"] == "service"
    assert body["subject"]
    assert body["html"]
    assert "List-Unsubscribe" in body["headers"]


async def test_the_preview_answers_html_without_a_json_accept(
    app: tuple[Any, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    allow_authentication(monkeypatch)
    response = client.get(
        "/api/v1/dev/sdd/email/preview",
        params={"template": "welcome", "tone": "tu"},
        headers=HTML_ACCEPT,
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.text.lstrip().startswith("<!DOCTYPE html>")


async def test_the_send_fills_the_outbox_then_the_purge_empties_it(
    app: tuple[Any, Any], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client = app
    async with database.service_tx() as tx:
        row = (
            (await tx.conn.execute(text("select id::text as id, email from public.profiles limit 1")))
            .mappings()
            .first()
        )
    if row is None:
        pytest.skip("the demonstration database has no seeded profile")
    allow_authentication(monkeypatch, str(row["id"]))

    sent = client.post(
        "/api/v1/dev/sdd/email/send",
        json={"template": "welcome", "tone": "vous"},
        headers={"idempotency-key": "dev-email-1", **JSON_ACCEPT},
    )
    assert sent.status_code == 201
    assert sent.json()["transport"] == "memory"

    outbox = client.get("/api/v1/dev/sdd/email/outbox")
    assert outbox.status_code == 200
    items = outbox.json()["items"]
    assert len(items) == 1
    assert items[0]["template"] == "welcome"
    assert items[0]["to"] == row["email"]

    purged = client.delete("/api/v1/dev/sdd/email/outbox")
    assert purged.status_code == 200
    assert purged.json() == {"items": []}
    assert client.get("/api/v1/dev/sdd/email/outbox").json()["items"] == []


async def test_the_guard_refuses_the_preview_in_production() -> None:
    _app, client = build_dev_app(ROUTE_IDS, DevDeps(), {"APP_ENV": "production", "ENABLE_SDD_PAGES": "true"})
    response = client.get(
        "/api/v1/dev/sdd/email/preview",
        params={"template": "welcome", "tone": "vous"},
        headers=JSON_ACCEPT,
    )

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
