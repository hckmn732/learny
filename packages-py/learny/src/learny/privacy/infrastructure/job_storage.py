"""Production ports of the export and deletion jobs (SPEC-211 ET-2, EF-7, CL-8).

Port of `packages/jobs/src/personal-data/deps.ts`. The ZIP is uploaded to the private `exports`
bucket and the apports are read from the private `resources` bucket with the service role: the job
acts on behalf of a learner who may already be deleted. URLs, tokens and e-mail addresses are never
logged (ET-7).
"""

import asyncio
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import TYPE_CHECKING

import httpx

from learny.platform.storage import StorageBucket
from learny.privacy.application.deletion_job import AccountAdmin, DeletionJobDeps
from learny.privacy.application.export_job import (
    MAX_OBJECT_BYTES,
    ExportJobDeps,
)
from learny.privacy.application.purge import PurgeDeps
from learny.shared.errors import AppError
from learny.shared.locale_fr import privacy as fr

if TYPE_CHECKING:
    from learny.privacy.application.ports import PrivacyDeps

STORAGE_TIMEOUT_SECONDS = 30.0
type RemoveObjectPort = Callable[[StorageBucket, str], Awaitable[None]]


def _config(deps: "PrivacyDeps") -> tuple[str, str, str]:
    settings = deps.settings
    url = settings.supabase_url.rstrip("/")
    anon = settings.supabase_anon_key
    service = settings.supabase_service_role_key
    if url == "" or anon == "" or service == "":
        raise AppError("SERVICE_UNAVAILABLE", fr.STORAGE_NOT_CONFIGURED)
    return (url, anon, service)


def _encode(path: str) -> str:
    from urllib.parse import quote

    return "/".join(quote(segment, safe="") for segment in path.split("/"))


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=STORAGE_TIMEOUT_SECONDS)


async def read_object(deps: "PrivacyDeps", storage_path: str) -> bytes | None:
    """Reads one apport of the private bucket with the service role (50 MB is the upload bound)."""
    url, anon, service = _config(deps)
    async with _client() as client:
        response = await client.get(
            f"{url}/storage/v1/object/authenticated/resources/{_encode(storage_path)}",
            headers={"apikey": anon, "authorization": f"Bearer {service}"},
        )
    if response.status_code in (400, 404):
        return None
    if response.status_code >= 400:
        raise AppError("SERVICE_UNAVAILABLE", fr.STORAGE_NOT_CONFIGURED)
    if len(response.content) > MAX_OBJECT_BYTES:
        raise AppError("SERVICE_UNAVAILABLE", fr.STORAGE_NOT_CONFIGURED)
    return response.content


async def upload_archive(
    deps: "PrivacyDeps", bucket: StorageBucket, storage_path: str, archive_path: Path
) -> None:
    """Upsert of the local ZIP file: a replay overwrites the same object (CL-6)."""
    url, anon, service = _config(deps)
    body = await asyncio.to_thread(archive_path.read_bytes)
    async with _client() as client:
        response = await client.post(
            f"{url}/storage/v1/object/{bucket}/{_encode(storage_path)}",
            headers={
                "apikey": anon,
                "authorization": f"Bearer {service}",
                "content-type": "application/zip",
                "x-upsert": "true",
            },
            content=body,
        )
    if response.status_code >= 400:
        raise AppError("SERVICE_UNAVAILABLE", fr.STORAGE_NOT_CONFIGURED)


async def remove_object(deps: "PrivacyDeps", bucket: StorageBucket, storage_path: str) -> None:
    """Removes one object; a missing blob is already removed (idempotent step)."""
    url, anon, service = _config(deps)
    async with _client() as client:
        response = await client.request(
            "DELETE",
            f"{url}/storage/v1/object/{bucket}",
            headers={
                "apikey": anon,
                "authorization": f"Bearer {service}",
                "content-type": "application/json",
            },
            content=httpx.Request("DELETE", url, json={"prefixes": [storage_path]}).content,
        )
    if response.status_code >= 400 and response.status_code not in (400, 404):
        raise AppError("SERVICE_UNAVAILABLE", fr.STORAGE_NOT_CONFIGURED)


class GoTrueAdmin(AccountAdmin):
    """Admin calls of the Auth provider; a missing user is a success (idempotent replay)."""

    def __init__(self, deps: "PrivacyDeps") -> None:
        self._deps = deps

    async def delete_user(self, user_id: str) -> None:
        url, _anon, service = _config(self._deps)
        async with _client() as client:
            response = await client.delete(
                f"{url}/auth/v1/admin/users/{user_id}",
                headers={"apikey": service, "authorization": f"Bearer {service}"},
            )
        if response.status_code >= 400 and response.status_code != 404:
            raise AppError("SERVICE_UNAVAILABLE", fr.AUTH_UNAVAILABLE)

    async def exists(self, user_id: str) -> bool:
        url, _anon, service = _config(self._deps)
        async with _client() as client:
            response = await client.get(
                f"{url}/auth/v1/admin/users/{user_id}",
                headers={"apikey": service, "authorization": f"Bearer {service}"},
            )
        if response.status_code == 404:
            return False
        if response.status_code >= 400:
            raise AppError("SERVICE_UNAVAILABLE", fr.AUTH_UNAVAILABLE)
        return True


def default_export_ports(deps: "PrivacyDeps") -> ExportJobDeps:
    """Production ports of the export job (read an apport, upload the archive)."""

    async def read(
        storage_path: str,
    ) -> bytes | None:
        return await read_object(deps, storage_path)

    async def upload(bucket: StorageBucket, storage_path: str, archive_path: Path) -> None:
        await upload_archive(deps, bucket, storage_path, archive_path)

    return ExportJobDeps(read_object=read, upload_archive=upload)


def default_remove_object(deps: "PrivacyDeps") -> RemoveObjectPort:
    """`removeObject` of the purge, bound to the production storage."""

    async def remove(bucket: StorageBucket, storage_path: str) -> None:
        await remove_object(deps, bucket, storage_path)

    return remove


def default_deletion_job_deps(deps: "PrivacyDeps") -> DeletionJobDeps:
    """Production ports of the deletion: storage removal and the Auth admin."""
    return DeletionJobDeps(remove_object=default_remove_object(deps), admin=GoTrueAdmin(deps))


def default_purge_deps(deps: "PrivacyDeps") -> PurgeDeps:
    """Production ports of the purge."""
    return PurgeDeps(remove_object=default_remove_object(deps))
