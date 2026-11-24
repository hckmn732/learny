"""Legal acceptance of the active documents (SPEC-806 EF-3, EF-4, ET-3, ET-4; SPEC-2201).

The pair (`cgu`, `privacy`) is written once in the same transaction, a version that is no longer
active is a 409 that writes nothing, and a replay of the same pair returns the original acceptance
instant.
"""

from collections.abc import Mapping
from datetime import datetime
from typing import Any

from learny.identity.application.ports import IdentityDeps
from learny.identity.domain.actor import Actor
from learny.identity.infrastructure import queries
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    LEGAL_ACCEPTANCE_STORED_NOT_FOUND,
    LEGAL_VERSIONS_CONFLICT,
)
from learny.shared.time import to_iso


def expected_versions(deps: IdentityDeps) -> dict[str, str]:
    """`activeLegalVersions()`: the two versions the server currently expects."""
    return {
        "cguVersion": deps.settings.legal_cgu_version,
        "privacyVersion": deps.settings.legal_privacy_version,
    }


def _version_errors(expected: Mapping[str, str]) -> list[dict[str, str]]:
    return [
        {"code": "EXPECTED_VERSION", "path": "cguVersion", "message": expected["cguVersion"]},
        {"code": "EXPECTED_VERSION", "path": "privacyVersion", "message": expected["privacyVersion"]},
    ]


async def accept_legal_versions(
    deps: IdentityDeps,
    actor: Actor,
    body: Mapping[str, Any],
) -> dict[str, Any]:
    """`POST /api/v1/me/legal-acceptances` - records the active pair once, atomically."""
    expected = expected_versions(deps)
    cgu_version = str(body["cguVersion"]).strip()
    privacy_version = str(body["privacyVersion"]).strip()
    if cgu_version != expected["cguVersion"] or privacy_version != expected["privacyVersion"]:
        raise AppError(
            "CONFLICT",
            LEGAL_VERSIONS_CONFLICT,
            errors=_version_errors(expected),
        )

    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        cgu = await _record(tx, actor.user_id, "cgu", cgu_version, now)
        privacy = await _record(tx, actor.user_id, "privacy", privacy_version, now)
        await queries.update_terms(
            tx,
            actor.user_id,
            f"cgu:{cgu_version};privacy:{privacy_version}",
            now,
        )
        accepted_at = max(cgu.accepted_at, privacy.accepted_at)
        return {
            "cguVersion": cgu_version,
            "privacyVersion": privacy_version,
            "acceptedAt": to_iso(accepted_at),
            "complete": True,
        }


async def _record(
    tx: Tx,
    user_id: str,
    document: str,
    version: str,
    accepted_at: datetime,
) -> queries.LegalAcceptanceRow:
    """`recordLegalAcceptance`: a replay keeps the original row and its original instant."""
    inserted = await queries.insert_legal_acceptance(tx, user_id, document, version, accepted_at)
    if inserted is not None:
        return inserted
    existing = await queries.read_legal_acceptance(tx, user_id, document, version)
    if existing is None:
        raise AppError("INTERNAL_ERROR", LEGAL_ACCEPTANCE_STORED_NOT_FOUND)
    return existing
