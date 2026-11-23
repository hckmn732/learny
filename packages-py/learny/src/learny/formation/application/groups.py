"""Shared-formation use cases (SPEC-724 EF-1 to EF-5, ET-1 to ET-5; BR-GRP-01 to BR-GRP-05).

Port of `formations-a-plusieurs.ts` and of the `packages/db` group repository it calls. The
invitation lookup and the acceptance run with the service client because an invitee has no
membership yet (ADR-0246); everything else runs with the caller's RLS client, so another learner's
group is a 404 and never a 403.
"""

from collections.abc import Mapping
from typing import Any

from learny.formation.application.ports import FormationDeps
from learny.formation.domain import groups as rules
from learny.formation.infrastructure import queries
from learny.formation.infrastructure.copy_programme import copy_programme_for_member
from learny.identity.domain.actor import Actor
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import (
    FIELD_INVALID,
    FORMATION_LIMIT_REACHED_JOIN,
    FORMATION_NOT_FOUND,
    GROUP_ALREADY_EXISTS,
    GROUP_CODE_ATTEMPTS,
    GROUP_CODE_COLLISION,
    GROUP_COPY_OWNERSHIP,
    GROUP_FULL,
    GROUP_MEMBER_NOT_FOUND,
    GROUP_MEMBERSHIP_AFTER_CREATE,
    GROUP_MEMBERSHIP_AFTER_JOIN,
    GROUP_MEMBERSHIP_AFTER_LEAVE,
    GROUP_MEMBERSHIP_AFTER_REACTIVATION,
    GROUP_MEMBERSHIP_NOT_FOUND,
    GROUP_NOT_ACTIVE,
    GROUP_NOT_FOUND,
    GROUP_OWNER_CREATE,
    GROUP_OWNER_LEAVE,
    GROUP_OWNER_REMOVE,
    GROUP_OWNER_REMOVE_SELF,
    GROUP_OWNER_ROTATE,
    INVITATION_CODE_UNKNOWN,
    INVITATION_UNKNOWN,
    LRN_FORMAT,
    SLUG_ID_COLUMN,
)
from learny.shared.time import to_iso

INVITE_CODE_COLLISION_CONSTRAINT = "groups_invite_code_unique"
FORMATION_COLLISION_CONSTRAINT = "groups_formation_id_unique"


def _identifier(value: str, field: str) -> str:
    """`identifier`: a UUID path parameter, refused with the contract message."""
    import uuid

    try:
        return str(uuid.UUID(value))
    except (ValueError, AttributeError) as error:
        raise AppError(
            "VALIDATION_FAILED",
            FIELD_INVALID.format(field=field, message=SLUG_ID_COLUMN),
            errors=[{"path": field, "message": SLUG_ID_COLUMN}],
        ) from error


def _invite_code(value: str) -> str:
    """`inviteCode`: trim, upper case, `LRN-XXXX` (BR-GRP-01, CL-3)."""
    return rules.parse_invite_code(value)


def _sqlstate(error: BaseException) -> str | None:
    current: BaseException | None = error
    for _ in range(8):
        if current is None:
            break
        for candidate in (current, getattr(current, "orig", None), getattr(current, "__cause__", None)):
            code = getattr(candidate, "sqlstate", None) or getattr(candidate, "pgcode", None)
            if isinstance(code, str) and len(code) == 5:
                return code
        current = current.__cause__ or current.__context__
    return None


def _constraint(error: BaseException) -> str:
    text = str(error)
    return text


async def _build_group_dto(
    tx: Tx, group: Mapping[str, Any], formation_title: str, viewer_role: str
) -> dict[str, Any]:
    """`buildGroupDto`: the only projection a group page may receive (ET-5)."""
    members = await queries.list_group_members(tx, str(group["id"]))
    progress = await queries.list_group_progress(tx, str(group["id"]))
    by_user = {str(row["user_id"]): row for row in progress}
    views: list[dict[str, Any]] = []
    for member in members:
        row = by_user.get(str(member["user_id"]))
        first_name = None if row is None else row["first_name"]
        views.append(
            {
                "userId": member["user_id"],
                "firstName": first_name,
                "role": member["role"],
                "memberStatus": rules.member_status_of(member["member_status"]),
                "currentModulePosition": 0 if row is None else int(row["current_module_position"]),
                "validatedModules": 0 if row is None else int(row["validated_modules"]),
                "streakDays": 0 if row is None else int(row["streak_days"]),
            }
        )
    views.sort(key=lambda view: rules.member_sort_key(view["firstName"], view["role"], view["userId"]))
    return {
        "id": group["id"],
        "formationId": group["formation_id"],
        "formationTitle": formation_title,
        "inviteCode": group["invite_code"],
        "inviteLink": f"/invitation/{group['invite_code']}",
        "maxMembers": int(group["max_members"]),
        "memberCount": len(views),
        "ownerId": group["owner_id"],
        "viewerRole": viewer_role,
        "canManage": viewer_role == "owner",
        "canLeave": viewer_role == "member",
        "members": views,
    }


async def _build_group_state(tx: Tx, user_id: str, access: Mapping[str, Any]) -> dict[str, Any]:
    """`buildGroupState`: the formation state plus the group projection when one exists."""
    if access["group_id"] is None:
        return {
            "formationId": access["id"],
            "formationTitle": access["title"],
            "formationStatus": access["status"],
            "group": None,
            "canCreate": access["owner_id"] == user_id and access["status"] == "active",
        }
    group = await queries.get_group(tx, str(access["group_id"]))
    if group is None:
        raise AppError("NOT_FOUND", GROUP_NOT_FOUND)
    membership = await queries.get_membership(tx, str(group["id"]), user_id)
    if membership is None or membership["left_at"] is not None:
        raise AppError("NOT_FOUND", GROUP_NOT_FOUND)
    dto = await _build_group_dto(tx, group, str(access["title"]), str(membership["role"]))
    return {
        "formationId": access["id"],
        "formationTitle": access["title"],
        "formationStatus": access["status"],
        "group": dto,
        "canCreate": False,
    }


async def get_formation_group(deps: FormationDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """EF-3 - `GET /formations/:fid/group`; the owner of a formation without group gets `group: null`."""
    fid = _identifier(formation_id, "fid")
    async with deps.db.user_tx(actor) as tx:
        access = await queries.read_formation_access(tx, actor.user_id, fid)
        if access is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        return await _build_group_state(tx, actor.user_id, access)


async def create_formation_group(deps: FormationDeps, actor: Actor, formation_id: str) -> dict[str, Any]:
    """BR-GRP-01, ET-3 - creates the group of an active formation owned by the caller."""
    fid = _identifier(formation_id, "fid")
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        await _create_group(tx, fid, actor.user_id, now)
        access = await queries.read_formation_access(tx, actor.user_id, fid)
        if access is None:
            raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
        if access["group_id"] is None:
            raise AppError("INTERNAL_ERROR", GROUP_MEMBERSHIP_AFTER_CREATE)
        state = await _build_group_state(tx, actor.user_id, access)
        group_id = str(state["group"]["id"]) if state["group"] is not None else fid
        await tx.emit(
            "group/member-joined",
            {"groupId": group_id, "formationId": fid, "userId": actor.user_id},
            event_id=f"group-member-joined:{group_id}:{actor.user_id}",
        )
        return state


async def _create_group(tx: Tx, formation_id: str, owner_id: str, now: Any) -> None:
    """`createGroup`: ownership and status first, then the code with a savepoint retry (CL-2)."""
    formation = await queries.lock_formation_for_group(tx, formation_id)
    if formation is None:
        raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
    if str(formation["owner_id"]) != owner_id:
        raise AppError("FORBIDDEN", GROUP_OWNER_CREATE)
    if formation["status"] != "active":
        raise AppError("CONFLICT", GROUP_NOT_ACTIVE)
    code = rules.generate_invite_code()
    try:
        async with tx.conn.begin_nested():
            group = await queries.insert_group(
                tx,
                formation_id,
                owner_id,
                invite_code=code,
                max_members=rules.GROUP_MAX_MEMBERS,
                now=now,
            )
            await queries.insert_owner_membership(tx, str(group["id"]), owner_id, now)
            await queries.back_reference_group(tx, formation_id, str(group["id"]))
    except Exception as error:
        if _sqlstate(error) == "23505" and FORMATION_COLLISION_CONSTRAINT in _constraint(error):
            raise AppError("CONFLICT", GROUP_ALREADY_EXISTS) from error
        if _sqlstate(error) == "23505" and INVITE_CODE_COLLISION_CONSTRAINT in _constraint(error):
            raise AppError("CONFLICT", GROUP_CODE_COLLISION) from error
        raise


async def rotate_group_code(deps: FormationDeps, actor: Actor, group_id: str) -> dict[str, Any]:
    """BR-GRP-05 - the owner rotates the code; the previous one dies immediately."""
    gid = _identifier(group_id, "gid")
    now = deps.clock.now()
    async with deps.db.user_tx(actor) as tx:
        owner_id = await queries.lock_group_owner(tx, gid)
        if owner_id is None:
            raise AppError("NOT_FOUND", GROUP_NOT_FOUND)
        if owner_id != actor.user_id:
            raise AppError("FORBIDDEN", GROUP_OWNER_ROTATE)
        for _ in range(rules.MAX_CODE_ATTEMPTS):
            code = rules.generate_invite_code()
            try:
                async with tx.conn.begin_nested():
                    await queries.update_invite_code(tx, gid, code, now)
                break
            except Exception as error:
                if _sqlstate(error) == "23505" and INVITE_CODE_COLLISION_CONSTRAINT in _constraint(error):
                    continue
                raise
        else:
            raise AppError("CONFLICT", GROUP_CODE_ATTEMPTS.format(attempts=rules.MAX_CODE_ATTEMPTS))
        access = await queries.read_group_formation(tx, gid)
        if access is None:
            raise AppError("NOT_FOUND", GROUP_NOT_FOUND)
        return await _build_group_state(tx, actor.user_id, access)


async def remove_member_from_group(
    deps: FormationDeps, actor: Actor, group_id: str, member_id: str
) -> dict[str, Any]:
    """BR-GRP-05, EF-4 - the owner removes a member; the member keeps a private copy."""
    gid = _identifier(group_id, "gid")
    uid = _identifier(member_id, "uid")
    now = deps.clock.now()
    if uid == actor.user_id:
        raise AppError("FORBIDDEN", GROUP_OWNER_REMOVE_SELF)
    async with deps.db.user_tx(actor) as tx:
        group = await queries.get_group(tx, gid)
        if group is None:
            raise AppError("NOT_FOUND", GROUP_NOT_FOUND)
        if str(group["owner_id"]) != actor.user_id:
            raise AppError("FORBIDDEN", GROUP_OWNER_REMOVE)
        removed = await queries.complete_member(tx, gid, uid, now)
        if removed is None:
            raise AppError("NOT_FOUND", GROUP_MEMBER_NOT_FOUND)
        access = await queries.read_group_formation(tx, gid)
        if access is None:
            raise AppError("NOT_FOUND", GROUP_NOT_FOUND)
        state = await _build_group_state(tx, actor.user_id, access)

    async with deps.db.service_tx() as tx:
        await tx.emit(
            "group/member-left",
            {"groupId": gid, "formationId": state["formationId"], "userId": uid},
            event_id=f"group-member-left:{gid}:{uid}",
            user_id=actor.user_id,
        )
    return state


async def leave_formation_group(deps: FormationDeps, actor: Actor, group_id: str) -> dict[str, Any]:
    """EF-4, CL-5 - a member leaves; the individual copy is created in the same transaction."""
    gid = _identifier(group_id, "gid")
    now = deps.clock.now()
    async with deps.db.service_tx() as tx:
        if not await queries.lock_group(tx, gid):
            raise AppError("NOT_FOUND", GROUP_NOT_FOUND)
        group = await queries.get_group(tx, gid)
        if group is None:
            raise AppError("NOT_FOUND", GROUP_NOT_FOUND)
        membership = await queries.get_membership(tx, gid, actor.user_id)
        if membership is None or membership["left_at"] is not None:
            raise AppError("NOT_FOUND", GROUP_MEMBERSHIP_NOT_FOUND)
        if membership["role"] == "owner":
            raise AppError("FORBIDDEN", GROUP_OWNER_LEAVE)
        copy_id = await copy_programme_for_member(tx, str(group["formation_id"]), actor.user_id, now)
        owner_row = await queries.read_programme_formation(tx, actor.user_id, copy_id, access="owner")
        if owner_row is None:
            raise AppError("CONFLICT", GROUP_COPY_OWNERSHIP)
        closed = await queries.complete_member(tx, gid, actor.user_id, now)
        if closed is None:
            raise AppError("INTERNAL_ERROR", GROUP_MEMBERSHIP_AFTER_LEAVE)
        await queries.move_current_formation_if_group(tx, actor.user_id, str(group["formation_id"]), copy_id)
        title = await queries.read_formation_title(tx, copy_id)
        await tx.emit(
            "group/member-left",
            {"groupId": gid, "formationId": group["formation_id"], "userId": actor.user_id},
            event_id=f"group-member-left:{gid}:{actor.user_id}",
            user_id=actor.user_id,
        )
        return {
            "formationId": copy_id,
            "formationTitle": title or "Formation individuelle",
            "previousGroupId": gid,
            "leftAt": to_iso(now),
        }


async def get_invitation_preview(deps: FormationDeps, code: str) -> dict[str, Any]:
    """ET-3 - public preview; a rotated or unknown code is a 404 without revealing the group."""
    invite = _invite_code(code)
    async with deps.db.service_tx() as tx:
        group = await queries.find_group_by_code(tx, invite)
        if group is None:
            raise AppError("NOT_FOUND", INVITATION_UNKNOWN)
        title = await queries.read_formation_title(tx, str(group["formation_id"]))
        if title is None:
            raise AppError("NOT_FOUND", INVITATION_UNKNOWN)
        active = await queries.count_group_members(tx, str(group["id"]))
        return {
            "code": group["invite_code"],
            "formationId": group["formation_id"],
            "formationTitle": title,
            "memberCount": max(1, active),
            "maxMembers": int(group["max_members"]),
            "full": active >= int(group["max_members"]),
        }


async def accept_invitation(deps: FormationDeps, actor: Actor, code: str) -> dict[str, Any]:
    """EF-2, ET-4, CL-4 - joins through the code, under the learner advisory lock."""
    invite = _invite_code(code)
    now = deps.clock.now()
    async with deps.db.service_tx() as tx:
        await queries.lock_formation_transitions(tx, actor.user_id)
        group = await queries.find_group_by_code(tx, invite)
        if group is None:
            raise AppError("NOT_FOUND", INVITATION_CODE_UNKNOWN)
        existing = await queries.get_membership(tx, str(group["id"]), actor.user_id)
        if existing is not None and existing["left_at"] is None:
            return await _accepted_dto(tx, str(group["formation_id"]), str(group["id"]), actor.user_id)
        active_count = await queries.count_active_formations_function(tx, actor.user_id)
        if active_count >= 3:
            raise AppError("FORMATION_LIMIT_REACHED", FORMATION_LIMIT_REACHED_JOIN)
        joined = await _join_group(tx, str(group["id"]), actor.user_id, now)
        formation_id = str(joined["formation_id"])
        await queries.initialize_member_progress(tx, formation_id, actor.user_id, now)
        await queries.set_member_current_formation(tx, actor.user_id, formation_id)
        accepted = await _accepted_dto(tx, formation_id, str(group["id"]), actor.user_id)
        await tx.emit(
            "group/member-joined",
            {"groupId": group["id"], "formationId": formation_id, "userId": actor.user_id},
            event_id=f"group-member-joined:{group['id']}:{actor.user_id}",
            user_id=actor.user_id,
        )
        return accepted


async def _join_group(tx: Tx, group_id: str, user_id: str, now: Any) -> Mapping[str, Any]:
    """`joinGroup`: the seat count runs under the group row lock (EF-3, CL-1)."""
    group = await queries.get_group(tx, group_id)
    if group is None:
        raise AppError("NOT_FOUND", GROUP_NOT_FOUND)
    existing = await queries.get_membership(tx, group_id, user_id)
    if existing is not None and existing["left_at"] is None:
        return group
    active = await queries.count_group_members(tx, group_id)
    if active >= int(group["max_members"]):
        raise AppError("CONFLICT", GROUP_FULL)
    if existing is not None:
        member = await queries.reactivate_member(tx, group_id, user_id, now)
        if member is None:
            raise AppError("INTERNAL_ERROR", GROUP_MEMBERSHIP_AFTER_REACTIVATION)
        return group
    member = await queries.insert_member(tx, group_id, user_id, now)
    if member is None:
        raise AppError("INTERNAL_ERROR", GROUP_MEMBERSHIP_AFTER_JOIN)
    return group


async def _accepted_dto(tx: Tx, formation_id: str, group_id: str, user_id: str) -> dict[str, Any]:
    """`acceptedDto`: the title and the first names of the other members, never an address."""
    title = await queries.read_formation_title(tx, formation_id)
    if title is None:
        raise AppError("NOT_FOUND", FORMATION_NOT_FOUND)
    names = await queries.accepted_first_names(tx, group_id, user_id)
    return {
        "formationId": formation_id,
        "formationTitle": title,
        "memberFirstNames": names[: rules.GROUP_MAX_MEMBERS - 1],
    }


def format_code_error() -> str:
    """The contract message of a malformed code, shared with the input refinement."""
    return LRN_FORMAT
