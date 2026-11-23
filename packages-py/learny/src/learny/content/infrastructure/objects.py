"""Measurement and reading of an uploaded object (SPEC-206 EF-2, ET-2, ET-4).

The object is measured and read through the Storage API under the caller's identity, so the Storage
policies still apply, and the body is streamed with a hard cap: an object that grew after it was
measured can never exhaust memory. Nothing here is logged.
"""

from dataclasses import dataclass
from urllib.parse import quote

import httpx

from learny.shared.errors import AppError
from learny.shared.locale_fr.content import FILE_TOO_LARGE_STREAM
from learny.shared.locale_fr.details import STORAGE_UNAVAILABLE

STORAGE_TIMEOUT_SECONDS = 20.0
MISSING_STATUS = 404


@dataclass(frozen=True, slots=True)
class ObjectInfo:
    """Size and ETag of a stored object."""

    size: int
    etag: str


@dataclass(frozen=True, slots=True)
class ObjectContent:
    """The bytes of a stored object with the ETag Storage answered."""

    data: bytes
    etag: str


def _encode_path(path: str) -> str:
    return "/".join(quote(segment, safe="") for segment in path.split("/"))


class SupabaseObjectReader:
    """Reads one object of the `resources` bucket as the caller."""

    def __init__(self, base_url: str, api_key: str) -> None:
        self._base = f"{base_url.rstrip('/')}/storage/v1"
        self._api_key = api_key

    def _headers(self, access_token: str) -> dict[str, str]:
        return {"apikey": self._api_key, "authorization": f"Bearer {access_token}"}

    async def info(self, path: str, access_token: str) -> ObjectInfo | None:
        """`None` when the object does not exist."""
        url = f"{self._base}/object/info/authenticated/resources/{_encode_path(path)}"
        async with httpx.AsyncClient(timeout=STORAGE_TIMEOUT_SECONDS) as client:
            response = await client.get(url, headers=self._headers(access_token))
        if response.status_code == MISSING_STATUS:
            return None
        if response.status_code == 400:
            body = response.json() if response.content else {}
            if str(body.get("statusCode")) == str(MISSING_STATUS):
                return None
        if response.status_code >= 400:
            raise AppError("SERVICE_UNAVAILABLE", STORAGE_UNAVAILABLE.format(status=response.status_code))
        payload = response.json()
        size = payload.get("size")
        etag = payload.get("etag")
        if not isinstance(size, int) or not isinstance(etag, str):
            raise AppError("SERVICE_UNAVAILABLE", STORAGE_UNAVAILABLE.format(status=200))
        return ObjectInfo(size=size, etag=etag)

    async def read(self, path: str, access_token: str, max_bytes: int) -> ObjectContent | None:
        """`None` when the object does not exist; refuses an object larger than `max_bytes`."""
        url = f"{self._base}/object/authenticated/resources/{_encode_path(path)}"
        async with (
            httpx.AsyncClient(timeout=STORAGE_TIMEOUT_SECONDS) as client,
            client.stream("GET", url, headers=self._headers(access_token)) as response,
        ):
            if response.status_code == MISSING_STATUS:
                return None
            if response.status_code == 400:
                body = await response.aread()
                if b'"404"' in body:
                    return None
            if response.status_code >= 400:
                raise AppError(
                    "SERVICE_UNAVAILABLE",
                    STORAGE_UNAVAILABLE.format(status=response.status_code),
                )
            etag = response.headers.get("etag", "")
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise AppError("UPLOAD_TOO_LARGE", FILE_TOO_LARGE_STREAM)
                chunks.append(chunk)
        return ObjectContent(data=b"".join(chunks), etag=etag)
