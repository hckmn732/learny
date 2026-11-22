"""[SPEC-2207] The personal-data demonstration routes through the facade.

The schedule and the cancel use the real services, the export runs the real job on the demo
programme, and the execution deletes a throwaway account at its deadline. The development guard
refuses everything outside `ENABLE_SDD_PAGES`.
"""

from dataclasses import dataclass, field
from typing import Any

import pytest
from dev_route_support import DevDeps, allow_authentication, build_dev_app
from learny.engagement.infrastructure.email import EmailConfig, MemoryEmailTransport
from learny.identity.infrastructure.gotrue import GoTrueUser
from learny.shared.db.uow import Database
from learny.shared.locale_fr import privacy as fr
from learny.shared.locale_fr.details import RESOURCE_NOT_FOUND
from sqlalchemy import text

pytestmark = pytest.mark.spec("SPEC-2207")

ROUTE_IDS = (
    "dev.personal-data.deletion.schedule",
    "dev.personal-data.deletion.cancel",
    "dev.personal-data.execute",
    "dev.personal-data.export",
)
ENABLED = {"APP_ENV": "test", "ENABLE_SDD_PAGES": "true"}
JSON_ACCEPT = {"accept": "application/json"}
THROWAWAY_ID = "33333333-3333-4333-8333-333333333333"


@dataclass
class FakeGotrue:
    """The Auth admin of the demonstration; the throwaway account never reaches GoTrue."""

    on_create: Any = None
    on_delete: Any = None
    created: list[str] = field(default_factory=list)
    deleted: list[str] = field(default_factory=list)

    async def admin_create_user(
        self,
        email: str,
        password: str | None = None,
        *,
        email_confirm: bool = True,
        user_metadata: dict[str, Any] | None = None,
    ) -> GoTrueUser:
        self.created.append(email)
        if self.on_create is not None:
            await self.on_create(THROWAWAY_ID, email)
        return GoTrueUser(id=THROWAWAY_ID, email=email, email_confirmed=True)

    async def admin_get_user(self, user_id: str) -> GoTrueUser:
        if user_id in self.deleted:
            raise RuntimeError("gone")
        return GoTrueUser(id=user_id, email=None, email_confirmed=True)

    async def admin_delete_user(self, user_id: str) -> None:
        self.deleted.append(user_id)
        if self.on_delete is not None:
            await self.on_delete(user_id)


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
async def app(database: Database) -> tuple[Any, Any, FakeGotrue]:
    async def create_profile(user_id: str, email: str) -> None:
        # GoTrue creates the Auth row and the database trigger the profile; the double does both.
        async with database.service_tx() as tx:
            await tx.conn.execute(
                text(
                    "insert into auth.users (id, instance_id, aud, role, email, "
                    "raw_user_meta_data, raw_app_meta_data, created_at, updated_at) values "
                    "(cast(:id as uuid), '00000000-0000-0000-0000-000000000000', "
                    "'authenticated', 'authenticated', :email, '{}'::jsonb, '{}'::jsonb, "
                    "now(), now()) on conflict (id) do nothing"
                ),
                {"id": user_id, "email": email},
            )

    async def delete_profile(user_id: str) -> None:
        async with database.service_tx() as tx:
            await tx.conn.execute(
                text("delete from auth.users where id = cast(:id as uuid)"), {"id": user_id}
            )

    gotrue = FakeGotrue(on_create=create_profile, on_delete=delete_profile)
    deps = DevDeps(
        db=database,
        email=MemoryEmailTransport(DevDeps().clock),
        email_config=email_config(),
        gotrue=gotrue,
    )
    app, client = build_dev_app(ROUTE_IDS, deps, ENABLED)
    return app, client, gotrue


async def seeded_profile(database: Database) -> Any:
    async with database.service_tx() as tx:
        row = (
            (await tx.conn.execute(text("select id::text as id, email from public.profiles limit 1")))
            .mappings()
            .first()
        )
    if row is None:
        pytest.skip("the demonstration database has no seeded profile")
    return row


async def test_the_schedule_then_the_cancel_flow_answers_the_deadline(
    app: tuple[Any, Any, FakeGotrue], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client, _gotrue = app
    row = await seeded_profile(database)
    allow_authentication(monkeypatch, str(row["id"]))

    scheduled = client.post("/api/v1/dev/sdd/personal-data/deletion", headers=JSON_ACCEPT)
    assert scheduled.status_code == 200
    body = scheduled.json()
    assert body["scheduledFor"]
    assert any(line["template"] == fr.DELETION_SCHEDULED_TEMPLATE for line in body["emails"])

    cancelled = client.delete("/api/v1/dev/sdd/personal-data/deletion", headers=JSON_ACCEPT)
    assert cancelled.status_code == 200
    assert cancelled.json()["scheduledFor"] is None


async def test_the_export_runs_the_real_job_on_the_demo_programme(
    app: tuple[Any, Any, FakeGotrue], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client, _gotrue = app
    row = await seeded_profile(database)
    allow_authentication(monkeypatch, str(row["id"]))

    response = client.post("/api/v1/dev/sdd/personal-data/export", headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    # the row is real: remove it so the purge test of SPEC-211 keeps its global count.
    async with database.service_tx() as tx:
        await tx.conn.execute(
            text("delete from public.data_exports where id = cast(:id as uuid)"),
            {"id": body["export"]["id"]},
        )
    assert body["export"]["status"] == "done"
    assert body["export"]["sizeBytes"] > 0
    assert body["tree"]
    assert body["durationMs"] >= 0


async def test_the_execution_deletes_a_throwaway_account_at_its_deadline(
    app: tuple[Any, Any, FakeGotrue], database: Database, monkeypatch: pytest.MonkeyPatch
) -> None:
    _app, client, gotrue = app
    row = await seeded_profile(database)
    allow_authentication(monkeypatch, str(row["id"]))

    response = client.post("/api/v1/dev/sdd/personal-data/execute", headers=JSON_ACCEPT)

    assert response.status_code == 200
    body = response.json()
    assert body["authStatus"] == fr.AUTH_DELETED
    assert body["scheduledFor"]
    remaining = {line["table"]: line["remaining"] for line in body["tables"]}
    assert remaining.get("profiles", 0) == 0
    assert gotrue.deleted == [THROWAWAY_ID]


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/v1/dev/sdd/personal-data/deletion"),
        ("delete", "/api/v1/dev/sdd/personal-data/deletion"),
        ("post", "/api/v1/dev/sdd/personal-data/execute"),
        ("post", "/api/v1/dev/sdd/personal-data/export"),
    ],
)
async def test_the_guard_refuses_the_demonstration_in_production(method: str, path: str) -> None:
    _app, client = build_dev_app(ROUTE_IDS, DevDeps(), {"APP_ENV": "production", "ENABLE_SDD_PAGES": "true"})
    response = getattr(client, method)(path, headers=JSON_ACCEPT)

    assert response.status_code == 404
    assert response.json()["detail"] == RESOURCE_NOT_FOUND
