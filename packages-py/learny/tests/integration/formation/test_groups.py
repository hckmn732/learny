"""[SPEC-2201] Shared formations: group, invitation and member exit (formations-a-plusieurs.ts)."""

from typing import Any

import pytest
from factories.db_support import rolled_back
from factories.formation_support import formation_deps
from factories.identity_support import (
    actor_for,
    create_chapter,
    create_formation,
    create_module,
    create_notion,
    create_user,
    join_group,
    one,
)
from learny.formation.application import groups as service
from learny.shared.db.uow import Database
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import GROUP_FULL, GROUP_OWNER_LEAVE
from learny_api.generated.models import (
    FormationsGroupGetOutput,
    GroupsLeaveOutput,
    InvitationsAcceptOutput,
    InvitationsGetOutput,
)

pytestmark = pytest.mark.spec("SPEC-2201")


async def test_a_group_is_created_with_its_code_and_owner_membership(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice", last_name="Martin")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        deps = formation_deps(tx)
        state = await service.create_formation_group(deps, actor_for(alice), formation_id)
        return state

    state = await rolled_back(database, run)
    parsed = FormationsGroupGetOutput.model_validate(state)
    assert parsed.group is not None
    assert parsed.group.inviteCode.startswith("LRN-")
    assert parsed.group.memberCount == 1
    assert parsed.group.viewerRole == "owner"
    assert parsed.group.canManage is True
    assert parsed.group.members[0].firstName == "Alice"


async def test_preview_then_accept_gives_the_member_their_own_progress(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        module_id = await create_module(tx.conn, formation_id, 1)
        chapter_id = await create_chapter(tx.conn, formation_id, module_id)
        await create_notion(tx.conn, formation_id, module_id, chapter_id)
        deps = formation_deps(tx)
        created = await service.create_formation_group(deps, actor_for(alice), formation_id)
        code = created["group"]["inviteCode"]
        preview = await service.get_invitation_preview(deps, f" lrn-{code[4:].lower()} ")
        accepted = await service.accept_invitation(deps, actor_for(bob), code)
        progress = await one(
            tx.conn,
            "select count(*)::int as count from public.module_progress where user_id = cast(:user as uuid)",
            user=bob,
        )
        return preview, accepted, progress

    preview, accepted, progress = await rolled_back(database, run)
    assert InvitationsGetOutput.model_validate(preview).memberCount == 1
    parsed = InvitationsAcceptOutput.model_validate(accepted)
    assert parsed.formationTitle == "SAP"
    assert parsed.memberFirstNames == ["Alice"]
    assert progress["count"] == 1


async def test_the_tenth_seat_is_the_last_one(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        deps = formation_deps(tx)
        created = await service.create_formation_group(deps, actor_for(alice), formation_id)
        code = created["group"]["inviteCode"]
        group_id = created["group"]["id"]
        for index in range(2, 11):
            member = await create_user(tx.conn, f"Membre{index}")
            await join_group(tx.conn, group_id, member)
        outsider = await create_user(tx.conn, "Outsider")
        with pytest.raises(AppError) as failure:
            await service.accept_invitation(deps, actor_for(outsider), code)
        return failure.value

    error = await rolled_back(database, run)
    assert error.code == "CONFLICT"
    assert error.detail == GROUP_FULL


async def test_the_owner_rotates_the_code_and_cannot_leave(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        deps = formation_deps(tx)
        created = await service.create_formation_group(deps, actor_for(alice), formation_id)
        group_id = created["group"]["id"]
        first_code = created["group"]["inviteCode"]
        rotated = await service.rotate_group_code(deps, actor_for(alice), group_id)
        with pytest.raises(AppError) as failure:
            await service.leave_formation_group(deps, actor_for(alice), group_id)
        return first_code, rotated, failure.value

    first_code, rotated, error = await rolled_back(database, run)
    assert rotated["group"]["inviteCode"] != first_code
    assert error.code == "FORBIDDEN"
    assert error.detail == GROUP_OWNER_LEAVE


async def test_a_member_leaves_with_an_individual_copy(database: Database) -> None:
    async def run(tx: Any) -> Any:
        alice = await create_user(tx.conn, "Alice")
        bob = await create_user(tx.conn, "Bob")
        formation_id = await create_formation(tx.conn, alice, title="SAP", status="active")
        module_id = await create_module(tx.conn, formation_id, 1)
        chapter_id = await create_chapter(tx.conn, formation_id, module_id)
        await create_notion(tx.conn, formation_id, module_id, chapter_id)
        deps = formation_deps(tx)
        created = await service.create_formation_group(deps, actor_for(alice), formation_id)
        group_id = created["group"]["id"]
        code = created["group"]["inviteCode"]
        await service.accept_invitation(deps, actor_for(bob), code)
        left = await service.leave_formation_group(deps, actor_for(bob), group_id)
        copy = await one(
            tx.conn,
            "select id::text as id, title from public.formations where owner_id = cast(:user as uuid)",
            user=bob,
        )
        modules = await one(
            tx.conn,
            "select count(*)::int as count from public.modules where formation_id = cast(:id as uuid)",
            id=copy["id"],
        )
        return left, copy, modules

    left, copy, modules = await rolled_back(database, run)
    parsed = GroupsLeaveOutput.model_validate(left)
    assert parsed.formationId == copy["id"]
    assert parsed.formationTitle == copy["title"] == "SAP"
    assert modules["count"] == 1
