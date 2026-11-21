"""Formation management use cases (SPEC-615 ET-1, SPEC-618 EF-1 to EF-3; BR-FOR-10, BR-FOR-15).

Port of `formations/{access,archive,pause,switch-current,state}.ts`. Every query runs on the
learner's RLS transaction, so a formation of another owner is indistinguishable from a missing one,
and every transition is serialised by a per-learner advisory lock.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from learny.formation.application.ports import FormationDeps
from learny.formation.domain.active_limit import TransitionDecision, transition_for
from learny.formation.infrastructure import queries
from learny.identity.domain.actor import Actor
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    FORMATION_CANNOT_ACTIVATE,
    FORMATION_CANNOT_ARCHIVE,
    FORMATION_CANNOT_PAUSE,
    FORMATION_CHANGED,
    FORMATION_NOT_FOUND,
    PROFILE_NOT_FOUND,
)
from learny.shared.naming import accent_of, formation_monogram
from learny.shared.time import parse_iso, to_iso

UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


async def can_access_formation(deps: FormationDeps, actor: Actor, formation_id: str) -> bool:
    """ET-1 - `true` only for a formation the caller may read: owner or active group member."""
    import re

    if re.fullmatch(UUID_PATTERN, formation_id) is None:
        return False
    async with deps.db.user_tx(actor) as tx:
        access = await queries.read_formation_access(tx, actor.user_id, formation_id)
        return access is not None


def _accent(value: str) -> str:
    return accent_of(value)


def to_managed_formation(row: Mapping[str, Any]) -> dict[str, Any]:
    """`toManagedFormation`: the limited projection of the switcher."""
    module_count = int(row["module_count"])
    validated = int(row["validated_count"])
    open_position = row["open_position"]
    return {
        "id": row["id"],
        "title": row["title"],
        "monogram": formation_monogram(str(row["title"]), str(row["monogram"] or "")),
        "accent": _accent(str(row["accent_color"])),
        "status": row["status"],
        "progressPercent": 0 if module_count == 0 else round(validated / module_count * 100),
        "currentModulePosition": None if open_position is None else int(open_position),
        "moduleCount": module_count,
    }


def _last_opened_key(row: Mapping[str, Any]) -> str:
    opened = row["last_opened_at"]
    created = row["created_at"]
    value = opened if opened is not None else created
    return value if isinstance(value, str) else to_iso(value)


def build_management_state(profile: Mapping[str, Any], rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """EF-1 - active formations first (current at the top), then paused ones in the same order."""
    active = [row for row in rows if row["status"] == "active"]
    sorted_active = sorted(active, key=_last_opened_key, reverse=True)
    current = next(
        (row for row in sorted_active if row["id"] == profile["current_formation_id"]),
        None,
    )
    if current is None and sorted_active:
        current = sorted_active[0]
    paused = sorted(
        (row for row in rows if row["status"] == "paused"),
        key=_last_opened_key,
        reverse=True,
    )
    ordered = [
        *([] if current is None else [current]),
        *(row for row in sorted_active if current is None or row["id"] != current["id"]),
        *paused,
    ]
    return {
        "currentFormationId": None if current is None else current["id"],
        "activeCount": len(active),
        "formations": [to_managed_formation(row) for row in ordered],
    }


async def read_management_state(tx: Tx, user_id: str) -> dict[str, Any]:
    """`readManagementState`: the state every transition answers with."""
    profile = await queries.read_profile_for_update(tx, user_id)
    if profile is None:
        raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
    rows = await queries.read_managed_rows(tx, user_id)
    return build_management_state(profile, rows)


async def _read_formation_for_update(tx: Tx, user_id: str, formation_id: str) -> Mapping[str, Any]:
    formation = await queries.read_formation_for_update(tx, user_id, formation_id)
    if formation is None:
        raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
    return formation


def _assert_updated_at(formation: Mapping[str, Any], expected: str | None) -> None:
    """CL-2 - an object version that changed since the dialog opened answers 409."""
    if expected is None:
        return
    stored = formation["updated_at"]
    stored_iso = stored if isinstance(stored, str) else to_iso(stored)
    if stored_iso != to_iso(parse_iso(expected)):
        raise AppError("CONFLICT", FORMATION_CHANGED, status=409)


async def pause_formation(
    deps: FormationDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`POST /formations/:fid/pause` (EF-2 to EF-4; BR-FOR-15, ADR-0016)."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_formation_transitions(tx, actor.user_id)
        formation = await _read_formation_for_update(tx, actor.user_id, formation_id)
        decision = transition_for(str(formation["status"]), "pause")
        if decision is None:
            raise AppError("CONFLICT", FORMATION_CANNOT_PAUSE, status=409)
        if decision.outcome == "unchanged":
            return {
                "outcome": "unchanged",
                "state": await read_management_state(tx, actor.user_id),
                "pausedFormationId": None,
            }
        _assert_updated_at(formation, body.get("expectedUpdatedAt"))
        await queries.pause_formation(tx, actor.user_id, formation_id, now)
        await queries.cancel_future_slots(tx, actor.user_id, formation_id, now)
        await queries.fallback_current_formation(tx, actor.user_id, formation_id)
        state = await read_management_state(tx, actor.user_id)

    await _emit(
        deps,
        actor,
        "formation/paused",
        {
            "userId": actor.user_id,
            "formationId": formation_id,
            "pausedAt": to_iso(now),
        },
        event_id=f"formation-paused:{formation_id}:{to_iso(now)}",
    )
    return {"outcome": "applied", "state": state, "pausedFormationId": None}


async def archive_formation(
    deps: FormationDeps, actor: Actor, formation_id: str, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`POST /formations/:fid/archive` (EF-2, ET-2, ET-4; BR-FOR-15, ADR-0016)."""
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_formation_transitions(tx, actor.user_id)
        formation = await _read_formation_for_update(tx, actor.user_id, formation_id)
        decision = transition_for(str(formation["status"]), "archive")
        if decision is None:
            raise AppError("CONFLICT", FORMATION_CANNOT_ARCHIVE, status=409)
        if decision.outcome == "unchanged":
            return {
                "outcome": "unchanged",
                "state": await read_management_state(tx, actor.user_id),
                "pausedFormationId": None,
            }
        _assert_updated_at(formation, body.get("expectedUpdatedAt"))
        await queries.archive_formation(tx, actor.user_id, formation_id, now)
        await queries.cancel_future_slots(tx, actor.user_id, formation_id, now)
        await queries.fallback_current_formation(tx, actor.user_id, formation_id)
        state = await read_management_state(tx, actor.user_id)
    return {"outcome": "applied", "state": state, "pausedFormationId": None}


async def switch_current_formation(
    deps: FormationDeps, actor: Actor, body: Mapping[str, Any]
) -> dict[str, Any]:
    """`PATCH /me/current-formation` (EF-1, ET-5; BR-FOR-11, ADR-0075)."""
    formation_id = str(body["formationId"])
    async with deps.db.user_tx(actor) as tx:
        await queries.lock_formation_transitions(tx, actor.user_id)
        status = await queries.read_formation_status(tx, actor.user_id, formation_id)
        if status is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        if status != "active":
            raise AppError("CONFLICT", FORMATION_CANNOT_ACTIVATE, status=409)
        await queries.set_current_formation(tx, actor.user_id, formation_id)
        return await read_management_state(tx, actor.user_id)


async def _emit(
    deps: FormationDeps,
    actor: Actor,
    name: str,
    data: Mapping[str, Any],
    *,
    event_id: str,
) -> None:
    """The transition events are written after the status change, like `emitAfterCommit`."""
    async with deps.db.service_tx() as tx:
        await tx.emit(name, data, event_id=event_id, user_id=actor.user_id)


def decision_of(status: str, action: str) -> TransitionDecision | None:
    """Re-exported for the handler table test: the decision table is the published rule."""
    return transition_for(status, action)
