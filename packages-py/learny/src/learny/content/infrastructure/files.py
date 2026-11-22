"""Private file reader of the ingestion (SPEC-509 ET-4, EF-2).

Port of `createSupabasePdfReader` (`packages/ingestion/src/deps.ts`): the path is re-bound to the
owner and to the resource identifier, so a bad row can never read another learner's object, and the
bound is applied before and after the download. Nothing here is logged.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import quote

import httpx

from learny.content.domain.errors import IngestionError
from learny.platform.storage import parse_owned_path
from learny.shared.config import Settings
from learny.shared.errors import AppError
from learny.shared.locale_fr import content as texts

STORAGE_TIMEOUT_SECONDS = 20.0
MISSING_STATUS = 404


@dataclass(frozen=True, slots=True)
class ReadFileInput:
    owner_id: str
    resource_id: str
    storage_path: str
    max_bytes: int


ReadFile = Callable[[ReadFileInput], Awaitable[bytes | None]]


def _too_large(max_bytes: int) -> IngestionError:
    return IngestionError("PDF_TOO_LARGE", texts.PDF_EXTRACT_TOO_LARGE.format(limit=max_bytes // 1_048_576))


def supabase_file_reader(settings: Settings) -> ReadFile:
    """Reads an apport from the private `resources` bucket with the service role."""
    url = settings.supabase_url
    anon_key = settings.supabase_anon_key
    service_key = settings.supabase_service_role_key
    base = f"{url.rstrip('/')}/storage/v1" if url else ""

    async def read(input: ReadFileInput) -> bytes | None:
        owned = parse_owned_path(input.storage_path, input.owner_id)
        if owned is None or owned.object_id != input.resource_id:
            raise IngestionError("RESOURCE_FILE_MISSING", texts.RESOURCE_FILE_MISSING)
        if not base or not anon_key or not service_key:
            raise AppError("SERVICE_UNAVAILABLE", texts.INGESTION_STORAGE_NOT_CONFIGURED)
        encoded = "/".join(quote(segment, safe="") for segment in owned.path.split("/"))
        target = f"{base}/object/authenticated/resources/{encoded}"
        try:
            async with (
                httpx.AsyncClient(timeout=STORAGE_TIMEOUT_SECONDS, trust_env=False) as client,
                client.stream(
                    "GET",
                    target,
                    headers={"apikey": anon_key, "authorization": f"Bearer {service_key}"},
                ) as response,
            ):
                if response.status_code in (MISSING_STATUS, 400):
                    return None
                if response.status_code >= 400:
                    raise AppError("SERVICE_UNAVAILABLE", texts.INGESTION_STORAGE_UNAVAILABLE)
                declared = response.headers.get("content-length")
                if declared is not None and declared.isdigit() and int(declared) > input.max_bytes:
                    raise _too_large(input.max_bytes)
                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > input.max_bytes:
                        raise _too_large(input.max_bytes)
                    chunks.append(chunk)
        except httpx.HTTPError as error:
            raise AppError("SERVICE_UNAVAILABLE", texts.INGESTION_STORAGE_UNAVAILABLE) from error
        return b"".join(chunks)

    return read


__all__ = ["ReadFile", "ReadFileInput", "supabase_file_reader"]
