"""[SPEC-2101] Signed storage URLs: ownership, ten-minute lifetime, upload tokens."""

import base64
import hashlib
import hmac
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any, cast

import httpx
import pytest
from learny.platform.storage import (
    SIGNED_URL_TTL_SECONDS,
    StorageAccess,
    StorageObject,
    SupabaseStorage,
    create_read_url,
    create_upload_url,
    delete_stored_object,
    export_path,
    list_owned_objects,
    resource_path,
    signed_url_expires_at,
)
from learny.shared.clock import FixedClock
from learny.shared.config import Settings
from learny.shared.errors import AppError
from learny.shared.time import parse_iso

pytestmark = pytest.mark.spec("SPEC-2101")

USER = "11111111-1111-4111-8111-111111111111"
OBJECT = "33333333-3333-4333-8333-333333333333"
TOKEN = "access-token"
SECRET = "s" * 48
FIXED = parse_iso("2026-11-11T12:20:00Z")
CLOCK = FixedClock(FIXED)
PATH = resource_path(USER, OBJECT, "cours.pdf")


class FakeResult:
    def __init__(self, rows: Sequence[Mapping[str, Any]]) -> None:
        self._rows = list(rows)

    def mappings(self) -> "FakeResult":
        return self

    def all(self) -> list[Mapping[str, Any]]:
        return self._rows


@dataclass
class FakeTx:
    allowed: bool = True
    statements: list[Any] = field(default_factory=list)

    @property
    def conn(self) -> Any:
        return self

    async def execute(self, statement: Any, parameters: Any = None) -> FakeResult:
        self.statements.append((statement, parameters))
        return FakeResult([{"allowed": self.allowed}])


@dataclass
class FakeGateway:
    calls: list[tuple[Any, ...]] = field(default_factory=list)
    objects: list[StorageObject] = field(default_factory=list)

    async def sign_upload(self, bucket: str, path: str, access_token: str, expires_in_seconds: int) -> str:
        self.calls.append(("upload", bucket, path, access_token, expires_in_seconds))
        return "https://storage.test/upload"

    async def sign_read(self, bucket: str, path: str, access_token: str, expires_in_seconds: int) -> str:
        self.calls.append(("read", bucket, path, access_token, expires_in_seconds))
        return "https://storage.test/read"

    async def remove(self, bucket: str, path: str, access_token: str) -> None:
        self.calls.append(("remove", bucket, path, access_token))

    async def list(self, bucket: str, prefix: str, access_token: str) -> list[StorageObject]:
        self.calls.append(("list", bucket, prefix, access_token))
        return self.objects


def user_access() -> StorageAccess:
    return StorageAccess(user_id=USER, access_token=TOKEN)


def service_access() -> StorageAccess:
    return StorageAccess(user_id=USER, access_token=TOKEN, role="service")


def test_the_lifetime_is_ten_minutes() -> None:
    assert SIGNED_URL_TTL_SECONDS == 600
    assert signed_url_expires_at(CLOCK) == FIXED + timedelta(seconds=600)


async def test_signs_a_read_after_the_row_proves_ownership() -> None:
    tx, gateway = FakeTx(), FakeGateway()
    signed = await create_read_url(cast(Any, tx), gateway, CLOCK, user_access(), "resources", PATH)
    assert signed.url == "https://storage.test/read"
    assert signed.expires_at == FIXED + timedelta(seconds=600)
    assert gateway.calls[0][:5] == ("read", "resources", PATH, TOKEN, 600)
    # The row check runs in the caller's transaction (RLS), never with the service role.
    assert tx.statements[0][1] == {"user_id": USER, "path": PATH}


async def test_refuses_a_read_without_the_row() -> None:
    tx, gateway = FakeTx(allowed=False), FakeGateway()
    with pytest.raises(AppError, match="NOT_FOUND"):
        await create_read_url(cast(Any, tx), gateway, CLOCK, user_access(), "resources", PATH)
    assert gateway.calls == []


async def test_refuses_a_foreign_path_before_the_signature() -> None:
    tx, gateway = FakeTx(), FakeGateway()
    foreign = resource_path("22222222-2222-4222-8222-222222222222", OBJECT, "cours.pdf")
    with pytest.raises(AppError, match="FORBIDDEN"):
        await create_read_url(cast(Any, tx), gateway, CLOCK, user_access(), "resources", foreign)
    assert gateway.calls == []
    assert tx.statements == []


async def test_checks_the_archive_status_for_an_export() -> None:
    tx, gateway = FakeTx(), FakeGateway()
    path = export_path(USER, OBJECT)
    await create_read_url(cast(Any, tx), gateway, CLOCK, user_access(), "exports", path)
    parameters = tx.statements[0][1]
    assert parameters["now"] == FIXED
    assert parameters["path"] == path


async def test_an_upload_under_the_owner_prefix_is_signed() -> None:
    tx, gateway = FakeTx(), FakeGateway()
    signed = await create_upload_url(cast(Any, tx), gateway, CLOCK, user_access(), "resources", PATH)
    assert signed.url == "https://storage.test/upload"
    assert gateway.calls[0][:5] == ("upload", "resources", PATH, TOKEN, 600)


async def test_only_the_export_job_writes_the_exports_bucket() -> None:
    tx, gateway = FakeTx(), FakeGateway()
    path = export_path(USER, OBJECT)
    with pytest.raises(AppError, match="FORBIDDEN"):
        await create_upload_url(cast(Any, tx), gateway, CLOCK, user_access(), "exports", path)
    await create_upload_url(cast(Any, tx), gateway, CLOCK, service_access(), "exports", path)
    assert gateway.calls[-1][:2] == ("upload", "exports")


async def test_removal_of_a_user_object_needs_the_row() -> None:
    tx, gateway = FakeTx(allowed=False), FakeGateway()
    with pytest.raises(AppError, match="NOT_FOUND"):
        await delete_stored_object(cast(Any, tx), gateway, CLOCK, user_access(), "resources", PATH)
    assert gateway.calls == []


async def test_removal_by_the_service_skips_the_row_check() -> None:
    tx, gateway = FakeTx(allowed=False), FakeGateway()
    await delete_stored_object(cast(Any, tx), gateway, CLOCK, service_access(), "resources", PATH)
    assert gateway.calls == [("remove", "resources", PATH, TOKEN)]
    assert tx.statements == []


async def test_lists_only_the_callers_prefix() -> None:
    gateway = FakeGateway(
        objects=[
            StorageObject(name=f"{USER}/a.pdf", id="1", updated_at=None),
            StorageObject(name="22222222-2222-4222-8222-222222222222/b.pdf", id="2", updated_at=None),
        ]
    )
    objects = await list_owned_objects(gateway, user_access(), "resources")
    assert [obj.name for obj in objects] == [f"{USER}/a.pdf"]
    assert gateway.calls[0] == ("list", "resources", f"{USER}/", TOKEN)


def storage_settings() -> Settings:
    return Settings(
        app_env="test",
        supabase_url="http://127.0.0.1:54321",
        supabase_anon_key="anon-key",
        supabase_jwt_secret=SECRET,
    )


def storage(handler: Any = None) -> SupabaseStorage:
    client = None if handler is None else httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return SupabaseStorage(storage_settings(), CLOCK, client=client)


def decode(token: str) -> dict[str, Any]:
    header, payload, signature = token.split(".")
    expected = hmac.new(SECRET.encode(), f"{header}.{payload}".encode("ascii"), hashlib.sha256).digest()
    assert base64.urlsafe_b64encode(expected).rstrip(b"=").decode("ascii") == signature
    padded = payload + "=" * (-len(payload) % 4)
    decoded: dict[str, Any] = json.loads(base64.urlsafe_b64decode(padded))
    return decoded


async def test_mints_an_upload_token_with_the_exact_claims() -> None:
    url = await storage().sign_upload("resources", PATH, TOKEN, SIGNED_URL_TTL_SECONDS)
    assert url.startswith("http://127.0.0.1:54321/storage/v1/object/upload/sign/resources/")
    token = url.split("?token=", 1)[1]
    claims = decode(token)
    assert claims["owner"] == USER
    assert claims["url"] == f"resources/{PATH}"
    assert claims["scope"] == "upload"
    assert claims["upsert"] is False
    assert claims["iat"] == int(FIXED.timestamp())
    assert claims["exp"] - claims["iat"] == SIGNED_URL_TTL_SECONDS


async def test_refuses_an_upload_without_a_token_or_a_secret() -> None:
    with pytest.raises(AppError, match="FORBIDDEN"):
        await storage().sign_upload("resources", PATH, "", SIGNED_URL_TTL_SECONDS)
    without_secret = SupabaseStorage(
        Settings(app_env="test", supabase_url="http://127.0.0.1:54321", supabase_anon_key="k"),
        CLOCK,
    )
    with pytest.raises(AppError, match="SERVICE_UNAVAILABLE"):
        await without_secret.sign_upload("resources", PATH, TOKEN, SIGNED_URL_TTL_SECONDS)


async def test_signs_a_read_through_the_storage_api() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"signedURL": "/object/sign/resources/x?token=y"})

    url = await storage(handler).sign_read("resources", PATH, TOKEN, SIGNED_URL_TTL_SECONDS)
    assert url == "http://127.0.0.1:54321/storage/v1/object/sign/resources/x?token=y"
    assert seen[0].headers["apikey"] == "anon-key"
    assert seen[0].headers["authorization"] == f"Bearer {TOKEN}"
    assert json.loads(seen[0].content) == {"expiresIn": SIGNED_URL_TTL_SECONDS}


async def test_an_unreadable_storage_answer_is_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"message": "boom"})

    with pytest.raises(AppError, match="SERVICE_UNAVAILABLE"):
        await storage(handler).sign_read("resources", PATH, TOKEN, SIGNED_URL_TTL_SECONDS)


async def test_a_missing_object_is_not_an_error_on_removal() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"message": "not found"})

    await storage(handler).remove("resources", PATH, TOKEN)
