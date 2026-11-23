"""Brick lifecycle use cases (SPEC-501 ET-8, EF-1 to EF-7).

The pure package owns the schemas, the checks, the references and the fingerprints; this module only
reads locked rows, opens one user transaction and writes immutable versions. A reported brick never
enters a new activity; a correction resolves every open report and makes the brick active again
(BR-BRI-06).
"""

import json
import uuid
from collections.abc import Mapping
from typing import Any

from learny.assessments.application.ports import AssessmentDeps
from learny.assessments.domain.bricks.public_brick import to_public_brick
from learny.assessments.domain.bricks.validate import (
    BrickInvalid,
    parse_brick_payload,
    validate_brick,
)
from learny.assessments.infrastructure import queries
from learny.assessments.infrastructure.references import DbBrickReferenceResolver
from learny.identity.domain.actor import Actor
from learny.shared.errors import AppError
from learny.shared.locale_fr import assessments as texts
from learny.shared.time import to_iso


def _brick_invalid(error: BrickInvalid) -> AppError:
    """`brickInvalid`: every readable issue of the draft crosses the contract."""
    return AppError(
        "BRICK_INVALID",
        texts.BRICK_INVALID,
        errors=[
            {"code": issue["code"], "path": issue["path"], "message": issue["message"]}
            for issue in error.issues
        ],
    )


def _draft(brick: Mapping[str, Any], payload: Any) -> dict[str, Any]:
    """`draftOf`: the immutable envelope of the brick, only the payload changes (EF-4)."""
    return {
        "type": brick["type"],
        "formationId": brick["formation_id"],
        "purpose": brick["purpose"],
        "notionIds": list(brick["notion_ids"] or []),
        "origin": brick["origin"],
        "payload": payload,
    }


def _expected_version(body: Mapping[str, Any]) -> int:
    value = body.get("expectedVersion")
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise AppError(
            "VALIDATION_FAILED",
            texts.BRICK_DATA_INVALID,
            errors=[{"path": "expectedVersion", "message": "Expected a positive integer."}],
        )
    return value


def _created_by(value: Any) -> str:
    """`createdBySchema`: the three origins a brick may declare."""
    if value in ("tutor", "learner", "import"):
        return str(value)
    raise AppError(
        "VALIDATION_FAILED",
        texts.BRICK_DATA_INVALID,
        errors=[{"path": "createdBy", "message": "Invalid enum value."}],
    )


async def create_brick(deps: AssessmentDeps, actor: Actor, draft: Mapping[str, Any]) -> dict[str, Any]:
    """EF-1 - validates then inserts the brick and its version 1 in one user transaction."""
    user_id = actor.user_id
    created_by = _created_by(draft.get("createdBy"))
    envelope = {
        "type": draft.get("type"),
        "formationId": draft.get("formationId"),
        "purpose": draft.get("purpose"),
        "notionIds": list(draft.get("notionIds") or []),
        "origin": draft.get("origin"),
        "payload": draft.get("payload"),
    }
    formation_id = str(envelope["formationId"])
    async with deps.db.user_tx(actor) as tx:
        if await queries.read_formation_owner(tx, user_id, formation_id) is None:
            raise AppError("NOT_FOUND", texts.FORMATION_NOT_FOUND)
        resolver = DbBrickReferenceResolver(tx, user_id, formation_id)
        try:
            valid = await validate_brick(envelope, resolver)
        except BrickInvalid as error:
            raise _brick_invalid(error) from error
        brick_id = await queries.insert_brick(
            tx,
            owner_id=user_id,
            formation_id=formation_id,
            type_name=str(valid["type"]),
            notion_ids=list(valid["notionIds"]),
            purpose=str(valid["purpose"]),
        )
        if brick_id is None:
            raise AppError("INTERNAL_ERROR", texts.BRICK_NOT_CREATED)
        version_id = await queries.insert_brick_version(
            tx,
            brick_id=brick_id,
            version=1,
            payload=json.dumps(valid["payload"], ensure_ascii=False),
            fingerprint=valid["fingerprint"],
            origin=str(valid["origin"]),
            created_by=created_by,
        )
        if version_id is None:
            raise AppError("INTERNAL_ERROR", texts.BRICK_VERSION_NOT_CREATED)
        return {
            "brickId": brick_id,
            "versionId": version_id,
            "version": 1,
            "fingerprint": valid["fingerprint"],
        }


async def get_public_brick(deps: AssessmentDeps, actor: Actor, version_id: str) -> dict[str, Any]:
    """EF-6 - the public charge of one owned version, never a stored payload raw."""
    user_id = actor.user_id
    try:
        uuid.UUID(version_id)
    except (ValueError, AttributeError) as error:
        raise AppError(
            "VALIDATION_FAILED",
            texts.BRICK_DATA_INVALID,
            errors=[{"path": "versionId", "message": "Invalid uuid"}],
        ) from error
    async with deps.db.user_tx(actor) as tx:
        row = await queries.read_public_brick(tx, user_id=user_id, version_id=version_id)
        if row is None:
            raise AppError("NOT_FOUND", texts.BRICK_VERSION_NOT_FOUND)
        try:
            payload = parse_brick_payload(str(row["type"]), row["payload"])
        except BrickInvalid as error:
            raise AppError("INTERNAL_ERROR", texts.BRICK_STORED_PAYLOAD_INVALID) from error
        return to_public_brick(
            brick_id=str(row["brick_id"]),
            version_id=str(row["version_id"]),
            type_name=str(row["type"]),
            notion_ids=list(row["notion_ids"] or []),
            payload=payload,
        )


async def correct_brick(
    deps: AssessmentDeps, actor: Actor, brick_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-2, EF-4, EF-5 - the learner's correction creates the next immutable version."""
    return await _create_version(deps, actor, brick_id, body, created_by="learner")


async def _create_version(
    deps: AssessmentDeps,
    actor: Actor,
    brick_id: str,
    body: Mapping[str, Any],
    *,
    created_by: str,
) -> dict[str, Any]:
    """`createBrickVersion`: version, fingerprint, and every open report resolved in one tx."""
    user_id = actor.user_id
    expected_version = _expected_version(body)
    now = to_iso(deps.clock.now())
    async with deps.db.user_tx(actor) as tx:
        brick = await queries.lock_brick(tx, brick_id)
        if brick is None:
            raise AppError("NOT_FOUND", texts.BRICK_NOT_FOUND)
        if brick["status"] == "retired":
            raise AppError("BRICK_RETIRED", texts.BRICK_RETIRED)
        current_version = int(brick["current_version"])
        if current_version != expected_version:
            raise AppError(
                "CONFLICT",
                texts.BRICK_VERSION_OUTDATED.format(version=current_version),
            )
        resolver = DbBrickReferenceResolver(tx, user_id, str(brick["formation_id"]))
        try:
            valid = await validate_brick(_draft(brick, body.get("payload")), resolver)
        except BrickInvalid as error:
            raise _brick_invalid(error) from error

        next_version = current_version + 1
        version_id = await queries.insert_brick_version(
            tx,
            brick_id=str(brick["id"]),
            version=next_version,
            payload=json.dumps(valid["payload"], ensure_ascii=False),
            fingerprint=valid["fingerprint"],
            origin=str(valid["origin"]),
            created_by=created_by,
        )
        if version_id is None:
            raise AppError("INTERNAL_ERROR", texts.BRICK_VERSION_NOT_CREATED)
        updated = await queries.update_brick_current_version(
            tx,
            brick_id=str(brick["id"]),
            next_version=next_version,
            expected_version=expected_version,
        )
        if updated is None:
            raise AppError("CONFLICT", texts.BRICK_CHANGED_MEANWHILE)
        await queries.resolve_open_reports(
            tx,
            brick_id=str(brick["id"]),
            resolution=json.dumps({"by": created_by, "versionId": version_id}, ensure_ascii=False),
            now=now,
        )
        return {"brickId": str(brick["id"]), "version": next_version, "versionId": version_id}


async def report_brick(
    deps: AssessmentDeps, actor: Actor, brick_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """EF-3 - reports the current version and excludes the brick from draws until correction."""
    user_id = actor.user_id
    reason = _reason(body)
    async with deps.db.user_tx(actor) as tx:
        brick = await queries.lock_brick(tx, brick_id)
        if brick is None:
            raise AppError("NOT_FOUND", texts.BRICK_NOT_FOUND)
        if brick["status"] == "retired":
            raise AppError("BRICK_RETIRED", texts.BRICK_RETIRED)
        existing = await queries.read_open_report(tx, user_id, str(brick["id"]))
        if existing is not None:
            return {"reportId": str(existing["id"]), "status": "open", "created": False}
        version_id = await queries.read_brick_version_id(tx, str(brick["id"]), int(brick["current_version"]))
        if version_id is None:
            raise AppError("INTERNAL_ERROR", texts.BRICK_CURRENT_VERSION_MISSING)
        report_id = await queries.insert_brick_report(
            tx,
            user_id=user_id,
            brick_id=str(brick["id"]),
            version_id=version_id,
            reason=reason,
        )
        if report_id is None:
            raise AppError("INTERNAL_ERROR", texts.BRICK_REPORT_NOT_CREATED)
        await queries.mark_brick_reported(tx, str(brick["id"]))
        return {"reportId": report_id, "status": "open", "created": True}


def _reason(body: Mapping[str, Any]) -> str:
    """`z.string().trim().min(1).max(500)`: the trim happens before the length checks."""
    raw = body.get("reason")
    reason = raw.strip() if isinstance(raw, str) else ""
    if reason == "":
        raise AppError(
            "VALIDATION_FAILED",
            texts.BRICK_DATA_INVALID,
            errors=[{"path": "reason", "message": "String must contain at least 1 character(s)"}],
        )
    if len(reason) > 500:
        raise AppError(
            "VALIDATION_FAILED",
            texts.BRICK_DATA_INVALID,
            errors=[{"path": "reason", "message": "String must contain at most 500 character(s)"}],
        )
    return reason


__all__ = ["correct_brick", "create_brick", "get_public_brick", "report_brick"]
