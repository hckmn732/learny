"""Private storage of Learny (SPEC-2101 step 4, SPEC-114, ADR-0249).

Port of `packages/db/src/storage/paths.ts` and `signed-urls.ts`: an object always lives at
`<userId>/<uuid>/<name>`, a read URL is signed for exactly ten minutes and only after the linked
database row proved ownership, and the upload token is minted locally with HS256 because the
Storage API itself hard-codes a two-hour lifetime. URLs and tokens are never logged.
"""

import base64
import hashlib
import hmac
import json
import re
import unicodedata
from collections.abc import MutableSequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal, Protocol
from urllib.parse import quote, unquote

import httpx
from sqlalchemy import text

from learny.shared.clock import Clock
from learny.shared.config import Settings
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    STORAGE_CONTROL_CHARACTER,
    STORAGE_EMPTY_FILE_NAME,
    STORAGE_ENCODED_SEPARATOR,
    STORAGE_EXPORT_ID_INVALID,
    STORAGE_EXPORT_RESERVED,
    STORAGE_FILE_NAME_TOO_LONG,
    STORAGE_FILE_NOT_FOUND,
    STORAGE_INCOMPLETE_ENCODING,
    STORAGE_NESTED_ENCODING,
    STORAGE_PATH_REFUSED,
    STORAGE_READ_URL_UNAVAILABLE,
    STORAGE_RELATIVE_PATH,
    STORAGE_RESOURCE_ID_INVALID,
    STORAGE_TOKEN_MISSING,
    STORAGE_UNAVAILABLE,
    STORAGE_UPLOAD_SECRET_MISSING,
    STORAGE_USER_ID_INVALID,
)

StorageBucket = Literal["resources", "exports"]
STORAGE_BUCKETS: tuple[StorageBucket, ...] = ("resources", "exports")
STORAGE_PATH_SEGMENTS = 3
MAX_STORAGE_FILE_NAME_LENGTH = 200
SIGNED_URL_TTL_SECONDS = 600
STORAGE_TIMEOUT_SECONDS = 10.0

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_FORBIDDEN = re.compile(r'[<>:"|?*]')
_WHITESPACE = re.compile(r"\s+")
_EDGES = re.compile(r"^[.\s]+|[.\s]+$")
_ENCODED_SEPARATOR = re.compile(r"%(?:2f|5c|00)", re.IGNORECASE)
_PERCENT_ESCAPE = re.compile(r"%[0-9a-f]{2}", re.IGNORECASE)
_SEPARATORS = re.compile(r"[\\/]")
_ABSOLUTE_URL = re.compile(r"^https?://", re.IGNORECASE)

RESOURCE_ROW = text(
    """
    select exists (
      select 1 from public.resources r
      where r.owner_id = cast(:user_id as uuid)
        and r.storage_path = :path
        and r.deleted_at is null
    ) as allowed
    """
)
EXPORT_ROW = text(
    """
    select exists (
      select 1 from public.data_exports e
      where e.user_id = cast(:user_id as uuid)
        and e.storage_path = :path
        and e.status = 'done'
        and e.expires_at is not null
        and e.expires_at > cast(:now as timestamptz)
    ) as allowed
    """
)


@dataclass(frozen=True, slots=True)
class OwnedStoragePath:
    """A path whose three segments are valid and whose first segment is the owner."""

    user_id: str
    object_id: str
    name: str
    path: str


@dataclass(frozen=True, slots=True)
class StorageAccess:
    """The owner whose prefix is checked, the token presented and the role it carries."""

    user_id: str
    access_token: str
    role: Literal["user", "service"] = "user"


@dataclass(frozen=True, slots=True)
class SignedStorageUrl:
    url: str
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class StorageObject:
    name: str
    id: str | None
    updated_at: str | None


def _invalid(message: str) -> AppError:
    return AppError("VALIDATION_FAILED", message)


def _has_control_character(value: str) -> bool:
    return any(ord(character) <= 0x1F or ord(character) == 0x7F for character in value)


def _assert_uuid(value: str, message: str) -> str:
    if _UUID.match(value) is None:
        raise _invalid(message)
    return value


def _decode_name(name: str) -> str:
    """Decodes percent escapes so `%2F`, `%5C` or `%00` cannot hide a separator."""
    current = name
    for _ in range(3):
        if _PERCENT_ESCAPE.search(current) is None:
            return current
        try:
            following = unquote(current, errors="strict")
        except UnicodeDecodeError as error:
            raise _invalid(STORAGE_INCOMPLETE_ENCODING) from error
        if following == current:
            return current
        current = following
    if _PERCENT_ESCAPE.search(current) is not None:
        raise _invalid(STORAGE_NESTED_ENCODING)
    return current


def normalize_storage_file_name(original_name: str) -> str:
    """Cleans an original file name; the result never contains a separator or a traversal."""
    source = unicodedata.normalize("NFC", original_name).strip()
    if source in ("", ".", ".."):
        raise _invalid(STORAGE_EMPTY_FILE_NAME)
    if _has_control_character(source):
        raise _invalid(STORAGE_CONTROL_CHARACTER)
    if _SEPARATORS.search(source) is not None or _ENCODED_SEPARATOR.search(source) is not None:
        raise _invalid(STORAGE_RELATIVE_PATH)
    if ".." in source:
        raise _invalid(STORAGE_RELATIVE_PATH)
    decoded = _decode_name(source)
    if decoded != source and (
        _SEPARATORS.search(decoded) is not None
        or _has_control_character(decoded)
        or _ENCODED_SEPARATOR.search(decoded) is not None
        or ".." in decoded
    ):
        raise _invalid(STORAGE_ENCODED_SEPARATOR)
    cleaned = _EDGES.sub("", _WHITESPACE.sub(" ", _FORBIDDEN.sub("-", decoded)))
    if cleaned in ("", ".", ".."):
        raise _invalid(STORAGE_EMPTY_FILE_NAME)
    if len(cleaned) > MAX_STORAGE_FILE_NAME_LENGTH:
        raise _invalid(STORAGE_FILE_NAME_TOO_LONG)
    return cleaned


def resource_path(user_id: str, resource_id: str, original_name: str) -> str:
    """`<userId>/<resourceId>/<cleaned name>`."""
    owner = _assert_uuid(user_id, STORAGE_USER_ID_INVALID)
    resource = _assert_uuid(resource_id, STORAGE_RESOURCE_ID_INVALID)
    return f"{owner}/{resource}/{normalize_storage_file_name(original_name)}"


def export_path(user_id: str, export_id: str, original_name: str = "export.zip") -> str:
    """`<userId>/<exportId>/<cleaned name>`; the default archive name is fixed."""
    owner = _assert_uuid(user_id, STORAGE_USER_ID_INVALID)
    export = _assert_uuid(export_id, STORAGE_EXPORT_ID_INVALID)
    return f"{owner}/{export}/{normalize_storage_file_name(original_name)}"


def is_storage_uuid(value: str) -> bool:
    return _UUID.match(value) is not None


def parse_owned_path(path: str, user_id: str) -> OwnedStoragePath | None:
    """Returns the path only when every segment is valid and the owner matches; None otherwise."""
    if _UUID.match(user_id) is None:
        return None
    segments = path.split("/")
    if len(segments) != STORAGE_PATH_SEGMENTS:
        return None
    owner, object_id, raw_name = segments
    if owner != user_id or _UUID.match(object_id) is None:
        return None
    try:
        name = normalize_storage_file_name(raw_name)
    except AppError:
        return None
    # A cleaned name that differs from the stored one means the path was not built by these helpers.
    if name != raw_name or ".." in path:
        return None
    return OwnedStoragePath(user_id=user_id, object_id=object_id, name=name, path=path)


def signed_url_expires_at(clock: Clock) -> datetime:
    """Exact expiration of a signature created now (ten minutes, ADR-0249)."""
    return clock.now() + timedelta(seconds=SIGNED_URL_TTL_SECONDS)


def _encode_path(path: str) -> str:
    return "/".join(quote(segment, safe="") for segment in path.split("/"))


def _join_url(base: str, path: str) -> str:
    if _ABSOLUTE_URL.match(path):
        return path
    return f"{base}{'' if path.startswith('/') else '/'}{path}"


def _base64url(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode("utf-8")).rstrip(b"=").decode("ascii")


def _sign(signing_input: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


class StorageGateway(Protocol):
    """What the storage helpers need from the Storage API; `SupabaseStorage` implements it."""

    async def sign_upload(
        self, bucket: StorageBucket, path: str, access_token: str, expires_in_seconds: int
    ) -> str: ...

    async def sign_read(
        self, bucket: StorageBucket, path: str, access_token: str, expires_in_seconds: int
    ) -> str: ...

    async def remove(self, bucket: StorageBucket, path: str, access_token: str) -> None: ...

    async def list(self, bucket: StorageBucket, prefix: str, access_token: str) -> list[StorageObject]: ...


class SupabaseStorage:
    """Supabase Storage REST gateway; the API key is public, the Authorization header is the JWT."""

    def __init__(
        self,
        settings: Settings,
        clock: Clock,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base = f"{settings.supabase_url.rstrip('/')}/storage/v1"
        self._api_key = settings.supabase_anon_key
        self._jwt_secret = settings.supabase_jwt_secret
        self._clock = clock
        self._client = client
        self._owned: httpx.AsyncClient | None = None

    @property
    def _http(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client
        if self._owned is None:
            self._owned = httpx.AsyncClient(timeout=STORAGE_TIMEOUT_SECONDS)
        return self._owned

    async def aclose(self) -> None:
        if self._owned is not None:
            await self._owned.aclose()
            self._owned = None

    async def _request(
        self,
        method: str,
        path: str,
        access_token: str,
        body: Any = None,
        *,
        allow_not_found: bool = False,
    ) -> Any:
        try:
            response = await self._http.request(
                method,
                _join_url(self._base, path),
                headers={
                    "apikey": self._api_key,
                    "authorization": f"Bearer {access_token}",
                    "content-type": "application/json",
                },
                content=None if body is None else json.dumps(body),
            )
        except httpx.HTTPError as error:
            raise AppError("SERVICE_UNAVAILABLE", STORAGE_UNAVAILABLE.format(status=0)) from error
        if response.status_code == 404 and allow_not_found:
            return None
        if response.status_code >= 400:
            raise AppError(
                "SERVICE_UNAVAILABLE",
                STORAGE_UNAVAILABLE.format(status=response.status_code),
                status=response.status_code,
            )
        if response.status_code == 204 or not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return None

    async def sign_upload(
        self, bucket: StorageBucket, path: str, access_token: str, expires_in_seconds: int
    ) -> str:
        """Mints the scoped `upload` token locally: the Storage API ignores `expiresIn`."""
        if access_token == "":
            raise AppError("FORBIDDEN", STORAGE_TOKEN_MISSING)
        if self._jwt_secret == "":
            raise AppError("SERVICE_UNAVAILABLE", STORAGE_UPLOAD_SECRET_MISSING)
        now = int(self._clock.now().timestamp())
        header = _base64url(json.dumps({"alg": "HS256", "typ": "JWT"}))
        payload = _base64url(
            json.dumps(
                {
                    "owner": path.split("/")[0],
                    "url": f"{bucket}/{path}",
                    "upsert": False,
                    "scope": "upload",
                    "iat": now,
                    "exp": now + expires_in_seconds,
                }
            )
        )
        token = f"{header}.{payload}.{_sign(f'{header}.{payload}', self._jwt_secret)}"
        return f"{self._base}/object/upload/sign/{bucket}/{_encode_path(path)}?token={token}"

    async def sign_read(
        self, bucket: StorageBucket, path: str, access_token: str, expires_in_seconds: int
    ) -> str:
        payload = await self._request(
            "POST",
            f"/object/sign/{bucket}/{_encode_path(path)}",
            access_token,
            {"expiresIn": expires_in_seconds},
        )
        signed = payload.get("signedURL") if isinstance(payload, dict) else None
        if not isinstance(signed, str) or signed == "":
            raise AppError("SERVICE_UNAVAILABLE", STORAGE_READ_URL_UNAVAILABLE)
        return _join_url(self._base, signed)

    async def remove(self, bucket: StorageBucket, path: str, access_token: str) -> None:
        await self._request(
            "DELETE", f"/object/{bucket}", access_token, {"prefixes": [path]}, allow_not_found=True
        )

    async def list(self, bucket: StorageBucket, prefix: str, access_token: str) -> list[StorageObject]:
        objects: list[StorageObject] = []
        await self._walk(bucket, prefix, access_token, objects, 0)
        return objects

    async def _walk(
        self,
        bucket: StorageBucket,
        folder: str,
        access_token: str,
        collected: MutableSequence[StorageObject],
        depth: int,
    ) -> None:
        if depth > 4:
            return
        offset = 0
        for _ in range(1000):
            payload = await self._request(
                "POST",
                f"/object/list/{bucket}",
                access_token,
                {
                    "prefix": folder,
                    "limit": 1000,
                    "offset": offset,
                    "sortBy": {"column": "name", "order": "asc"},
                },
            )
            if not isinstance(payload, list):
                return
            for entry in payload:
                if not isinstance(entry, dict) or not isinstance(entry.get("name"), str):
                    continue
                # The list endpoint is one level deep: a folder has no id and no metadata.
                if entry.get("id") is None and entry.get("metadata") is None:
                    await self._walk(bucket, f"{folder}{entry['name']}/", access_token, collected, depth + 1)
                    continue
                collected.append(
                    StorageObject(
                        name=f"{folder}{entry['name']}",
                        id=entry["id"] if isinstance(entry["id"], str) else None,
                        updated_at=entry["updated_at"] if isinstance(entry["updated_at"], str) else None,
                    )
                )
            if len(payload) < 1000:
                return
            offset += 1000


def _owned_path(path: str, user_id: str) -> str:
    owned = parse_owned_path(path, user_id)
    if owned is None:
        # Same message for malformed and foreign paths: the caller learns nothing about existence.
        raise AppError("FORBIDDEN", STORAGE_PATH_REFUSED)
    return owned.path


async def _has_readable_row(
    tx: Tx, access: StorageAccess, bucket: StorageBucket, path: str, now: datetime
) -> bool:
    statement = RESOURCE_ROW if bucket == "resources" else EXPORT_ROW
    parameters: dict[str, Any] = {"user_id": access.user_id, "path": path}
    if bucket == "exports":
        parameters["now"] = now
    rows = (await tx.conn.execute(statement, parameters)).mappings().all()
    return bool(rows) and rows[0]["allowed"] is True


async def create_upload_url(
    tx: Tx,
    gateway: StorageGateway,
    clock: Clock,
    access: StorageAccess,
    bucket: StorageBucket,
    path: str,
) -> SignedStorageUrl:
    """Signs an upload under the caller's prefix; writing `exports` is reserved to the job."""
    if bucket == "exports" and access.role != "service":
        raise AppError("FORBIDDEN", STORAGE_EXPORT_RESERVED)
    owned = _owned_path(path, access.user_id)
    url = await gateway.sign_upload(bucket, owned, access.access_token, SIGNED_URL_TTL_SECONDS)
    return SignedStorageUrl(url=url, expires_at=signed_url_expires_at(clock))


async def create_read_url(
    tx: Tx,
    gateway: StorageGateway,
    clock: Clock,
    access: StorageAccess,
    bucket: StorageBucket,
    path: str,
) -> SignedStorageUrl:
    """Signs a read only after the linked row proves ownership (and, for exports, expiry)."""
    owned = _owned_path(path, access.user_id)
    now = clock.now()
    if not await _has_readable_row(tx, access, bucket, owned, now):
        raise AppError("NOT_FOUND", STORAGE_FILE_NOT_FOUND)
    url = await gateway.sign_read(bucket, owned, access.access_token, SIGNED_URL_TTL_SECONDS)
    return SignedStorageUrl(url=url, expires_at=signed_url_expires_at(clock))


async def delete_stored_object(
    tx: Tx,
    gateway: StorageGateway,
    clock: Clock,
    access: StorageAccess,
    bucket: StorageBucket,
    path: str,
) -> None:
    """Removes one object under the owner's prefix; a missing blob is a success."""
    owned = _owned_path(path, access.user_id)
    if access.role != "service" and not await _has_readable_row(tx, access, bucket, owned, clock.now()):
        raise AppError("NOT_FOUND", STORAGE_FILE_NOT_FOUND)
    await gateway.remove(bucket, owned, access.access_token)


async def list_owned_objects(
    gateway: StorageGateway,
    access: StorageAccess,
    bucket: StorageBucket,
) -> list[StorageObject]:
    """Lists only the objects under the caller's exact prefix."""
    prefix = f"{access.user_id}/"
    objects = await gateway.list(bucket, prefix, access.access_token)
    return [obj for obj in objects if obj.name.startswith(prefix)]
