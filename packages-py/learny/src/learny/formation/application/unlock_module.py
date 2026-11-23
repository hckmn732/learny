"""Unlock of the next module after a passed validation quiz (SPEC-612 EF-7, ET-3, BR-QUI-05).

One transaction performs every domain write and queues `module/validated` and `formation/completed`;
the milestone, the notification and the replanning happen after the commit. A replay finds the
module already validated and only raises `best_score` (CL-3): no second milestone, notification or
event. The advisory lock serialises two deliveries of the same module (CL-2).
"""

import json
import uuid
from collections.abc import Mapping
from typing import Any

from sqlalchemy import text

from learny.engagement import public as engagement
from learny.formation.application.ports import FormationDeps
from learny.identity.domain.actor import Actor
from learny.learning.application.apply_result import to_persistence_card
from learny.learning.application.planning import replan_user_in_tx
from learny.learning.domain.fsrs import create_notion_card
from learny.learning.domain.params import ENGINE
from learny.shared.errors import AppError
from learny.shared.locale_fr import details
from learny.shared.time import to_iso

MODULE_UNLOCK_JOB = "module-unlock"
FORMATION_END_PATH = "/formations/{formation_id}/bilan"
PROGRAMME_PATH = "/formations/{formation_id}/programme"

LOCK_MODULE = text("select pg_advisory_xact_lock(hashtextextended(:key, 0))")
READ_MODULE = text(
    """
    select m.id::text as id,
           m.formation_id::text as formation_id,
           f.title as formation_title,
           f.group_id::text as group_id,
           m.position::int as position,
           m.title,
           m.status::text as status,
           coalesce(mp.status = 'validated', false) as validated
    from public.modules m
    join public.formations f on f.id = m.formation_id
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = cast(:user_id as uuid)
    where m.id = cast(:module_id as uuid)
      and (
        f.owner_id = cast(:user_id as uuid)
        or exists (
          select 1
          from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = cast(:user_id as uuid)
            and gm.member_status = 'active'
            and gm.left_at is null
        )
      )
    limit 1
    """
)
NEXT_MODULE = text(
    """
    select id::text as id, position::int as position, title
    from public.modules
    where formation_id = cast(:formation_id as uuid) and position > :position
    order by position asc
    limit 1
    """
)
RAISE_BEST_SCORE = text(
    """
    update public.module_progress
    set best_score = greatest(coalesce(best_score, 0), :score),
        updated_at = cast(:now as timestamptz)
    where user_id = cast(:user_id as uuid) and module_id = cast(:module_id as uuid)
    """
)
VALIDATE_MODULE_PROGRESS = text(
    """
    insert into public.module_progress (
      user_id, module_id, status, opened_at, validated_at, best_score, updated_at
    ) values (
      cast(:user_id as uuid), cast(:module_id as uuid), 'validated'::public.module_status,
      cast(:now as timestamptz), cast(:now as timestamptz), :score, cast(:now as timestamptz)
    )
    on conflict (user_id, module_id) do update set
      status = 'validated'::public.module_status,
      opened_at = coalesce(module_progress.opened_at, excluded.opened_at),
      validated_at = coalesce(module_progress.validated_at, excluded.validated_at),
      best_score = greatest(coalesce(module_progress.best_score, 0), excluded.best_score),
      updated_at = excluded.updated_at
    """
)
MIRROR_MODULE_VALIDATED = text(
    """
    update public.modules
    set status = 'validated'::public.module_status
    where id = cast(:module_id as uuid) and status <> 'validated'
    """
)
OPEN_NEXT_MODULE_PROGRESS = text(
    """
    insert into public.module_progress (user_id, module_id, status, opened_at, updated_at)
    values (
      cast(:user_id as uuid), cast(:module_id as uuid), 'open'::public.module_status,
      cast(:now as timestamptz), cast(:now as timestamptz)
    )
    on conflict (user_id, module_id) do update set
      status = (
        case when module_progress.status = 'validated' then 'validated' else 'open' end
      )::public.module_status,
      opened_at = coalesce(module_progress.opened_at, excluded.opened_at),
      updated_at = excluded.updated_at
    """
)
MIRROR_MODULE_OPEN = text(
    """
    update public.modules
    set status = 'open'::public.module_status
    where id = cast(:module_id as uuid) and status = 'locked'
    """
)
ADD_NOTIONS_TO_REVIEW = text(
    """
    insert into public.notion_states (
      user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
      success_count, in_review, revision
    )
    select cast(:user_id as uuid), n.id, cast(:card as jsonb), cast(:now as timestamptz),
           0, cast(:now as timestamptz), cast(:now as timestamptz),
           0, true, 0
    from public.notions n
    where n.module_id = cast(:module_id as uuid)
    on conflict (user_id, notion_id) do update set
      in_review = true,
      revision = notion_states.revision + 1
    """
)
COMPLETE_FORMATION = text(
    """
    update public.formations
    set status = 'completed',
        completed_at = coalesce(completed_at, cast(:now as timestamptz)),
        updated_at = cast(:now as timestamptz)
    where id = cast(:formation_id as uuid)
      and owner_id = cast(:user_id as uuid)
      and status <> 'archived'
    """
)
INSERT_MILESTONE = text(
    """
    insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at)
    values (
      cast(:user_id as uuid), cast(:formation_id as uuid), 'module_validated',
      cast(:module_id as uuid), cast(:now as timestamptz)
    )
    on conflict (user_id, key, ref_id) do nothing
    """
)

IDLE_OUTCOME: Mapping[str, Any] = {
    "unlocked": False,
    "revisionOnly": False,
    "formationCompleted": False,
    "nextModuleId": None,
    "nextModulePosition": None,
    "nextModuleTitle": None,
}


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return False
    return True


def _outcome(
    *,
    unlocked: bool,
    revision_only: bool,
    formation_completed: bool,
    next_module: Mapping[str, Any] | None,
) -> dict[str, Any]:
    return {
        "unlocked": unlocked,
        "revisionOnly": revision_only,
        "formationCompleted": formation_completed,
        "nextModuleId": None if next_module is None else str(next_module["id"]),
        "nextModulePosition": None if next_module is None else int(next_module["position"]),
        "nextModuleTitle": None if next_module is None else str(next_module["title"]),
    }


async def _read_module(tx: Any, user_id: str, module_id: str) -> Mapping[str, Any]:
    row = (await tx.conn.execute(READ_MODULE, {"user_id": user_id, "module_id": module_id})).mappings().all()
    if not row:
        raise AppError("NOT_FOUND", details.MODULE_NOT_FOUND)
    return dict(row[0])


async def _validate_module(tx: Any, user_id: str, module: Mapping[str, Any], score: float, now: str) -> None:
    await tx.conn.execute(
        VALIDATE_MODULE_PROGRESS,
        {"user_id": user_id, "module_id": module["id"], "now": now, "score": score},
    )
    if module["group_id"] is None:
        # BR-FOR-07 - an individual formation mirrors the owner's progress on the module row.
        await tx.conn.execute(MIRROR_MODULE_VALIDATED, {"module_id": module["id"]})


async def _open_next_module(
    tx: Any, user_id: str, module: Mapping[str, Any], next_module: Mapping[str, Any], now: str
) -> None:
    await tx.conn.execute(
        OPEN_NEXT_MODULE_PROGRESS,
        {"user_id": user_id, "module_id": next_module["id"], "now": now},
    )
    if module["group_id"] is None:
        await tx.conn.execute(MIRROR_MODULE_OPEN, {"module_id": next_module["id"]})


async def _add_notions_to_review(tx: Any, user_id: str, module_id: str, now: str) -> None:
    card = json.dumps(
        to_persistence_card(create_notion_card(now, float(ENGINE["fsrs"]["requestRetention"]))),
        ensure_ascii=False,
    )
    await tx.conn.execute(
        ADD_NOTIONS_TO_REVIEW,
        {"user_id": user_id, "module_id": module_id, "card": card, "now": now},
    )


async def _notify(
    deps: FormationDeps,
    user_id: str,
    module: Mapping[str, Any],
    next_module: Mapping[str, Any] | None,
    score: float,
) -> None:
    formation_id = str(module["formation_id"])
    if next_module is None:
        href = FORMATION_END_PATH.format(formation_id=formation_id)
        suffix: dict[str, Any] = {"isLastModule": True, "href": href}
    else:
        href = PROGRAMME_PATH.format(formation_id=formation_id)
        suffix = {
            "nextModulePosition": int(next_module["position"]),
            "nextModuleTitle": str(next_module["title"]),
            "href": href,
        }
    result = await engagement.notify(
        deps,  # type: ignore[arg-type]
        user_id=user_id,
        notification_type="module_validated",
        formation_id=formation_id,
        data={
            "modulePosition": int(module["position"]),
            "moduleTitle": str(module["title"]),
            "score": score,
            **suffix,
        },
        dedupe_key=f"module_validated:{module['id']}",
    )
    logger = getattr(deps, "logger", None)
    if not result and logger is not None:
        logger.warn("module-unlock.notify.failed", outcome="notification_failed")


async def unlock_module(
    deps: FormationDeps,
    user_id: str,
    formation_id: str,
    module_id: str,
    score: float,
    passed: bool,
    *,
    attempt_id: str | None = None,
) -> dict[str, Any]:
    """Unlocks the next module once; a passed attempt on a validated module only raises the score."""
    del attempt_id  # the event carries it for traceability only
    if not _is_uuid(user_id):
        raise AppError("VALIDATION_FAILED", details.USER_ID_INVALID)
    if not passed:
        return dict(IDLE_OUTCOME)
    clamped = min(100.0, max(0.0, score))
    now = deps.clock.now()
    stamp = to_iso(now)
    actor = Actor(user_id=user_id, email="", email_confirmed=True, transport="bearer")
    async with deps.db.user_tx(actor) as tx:
        await tx.conn.execute(LOCK_MODULE, {"key": f"module-unlock:{user_id}:{module_id}"})
        module = await _read_module(tx, user_id, module_id)
        if module["validated"] is True:
            await tx.conn.execute(
                RAISE_BEST_SCORE,
                {"user_id": user_id, "module_id": module["id"], "score": clamped, "now": stamp},
            )
            return _outcome(
                unlocked=False,
                revision_only=True,
                formation_completed=False,
                next_module=None,
            )
        next_module = (
            (
                await tx.conn.execute(
                    NEXT_MODULE,
                    {"formation_id": module["formation_id"], "position": int(module["position"])},
                )
            )
            .mappings()
            .all()
        )
        found_next = next_module[0] if next_module else None
        await _validate_module(tx, user_id, module, clamped, stamp)
        if found_next is not None:
            await _open_next_module(tx, user_id, module, found_next, stamp)
        await _add_notions_to_review(tx, user_id, str(module["id"]), stamp)
        await tx.emit(
            "module/validated",
            {
                "userId": user_id,
                "formationId": str(module["formation_id"]),
                "moduleId": str(module["id"]),
                "score": clamped,
                "nextModuleId": None if found_next is None else str(found_next["id"]),
            },
            event_id=f"module-validated:{module['id']}",
        )
        if found_next is None:
            # SPEC-617, BR-FOR-12 - the last validated module closes the formation once.
            await tx.conn.execute(
                COMPLETE_FORMATION,
                {
                    "formation_id": module["formation_id"],
                    "user_id": user_id,
                    "now": stamp,
                },
            )
            await tx.emit(
                "formation/completed",
                {
                    "userId": user_id,
                    "formationId": str(module["formation_id"]),
                    "completedAt": stamp,
                },
                event_id=f"formation-completed:{module['formation_id']}",
            )
        outcome = _outcome(
            unlocked=True,
            revision_only=False,
            formation_completed=found_next is None,
            next_module=found_next,
        )

    # Milestones are system-managed rows (SPEC-408 policy); the unique key keeps the replay
    # idempotent even outside the unlock transaction.
    async with deps.db.service_tx() as tx:
        await tx.conn.execute(
            INSERT_MILESTONE,
            {"user_id": user_id, "formation_id": formation_id, "module_id": module_id, "now": stamp},
        )
    await _notify(deps, user_id, module, found_next, clamped)
    try:
        async with deps.db.user_tx(actor) as tx:
            await replan_user_in_tx(tx, user_id, now)
    except Exception as error:  # a failed replan never cancels the unlock (EF-7)
        logger = getattr(deps, "logger", None)
        if logger is not None:
            logger.warn("module-unlock.replan.failed", outcome="replan_failed", error=str(error))
    return outcome


__all__ = ["IDLE_OUTCOME", "MODULE_UNLOCK_JOB", "unlock_module"]
