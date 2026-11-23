"""Fixed header of the application shell (SPEC-305 EF-1, EF-4, ET-2, ET-4; SPEC-2201).

Read-only aggregation of `learny.views` (00-conventions section 2): one SQL statement under the
learner's RLS, no rule and no write. The full e-mail address stays on the server; only the
abbreviated label of the fallback identity is returned (CL-1).
"""

from typing import Any

from sqlalchemy import text

from learny.identity.domain.actor import Actor
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.details import PROFILE_NOT_FOUND

HEADER = text(
    """
    select p.first_name,
           p.last_name,
           p.email,
           (select count(distinct f.id)::int
              from public.formations f
              left join public.groups g on g.formation_id = f.id
              left join public.group_members gm
                on gm.group_id = g.id
               and gm.user_id = p.id
               and gm.member_status = 'active'
               and gm.left_at is null
             where f.status = 'active'
               and (f.owner_id = p.id or gm.user_id is not null)) as active_count,
           (select count(*)::int
              from public.notifications n
             where n.user_id = p.id
               and n.read_at is null) as unread_count
      from public.profiles p
     where p.id = cast(:user_id as uuid)
    """
)


def abbreviate_email(email: str | None) -> str | None:
    """Abbreviated display of an address (CL-1): first local character, then the domain."""
    value = (email or "").strip()
    at = value.rfind("@")
    if at <= 0 or at == len(value) - 1:
        return None
    local = value[:at]
    domain = value[at + 1 :]
    first = local[0]
    if first == "":
        return None
    return f"{first}***@{domain}"


def to_header(row: Any) -> dict[str, Any]:
    """`toHeader`: blank names are `null`, counters are never negative."""
    first_name = row["first_name"]
    last_name = row["last_name"]
    return {
        "firstName": None if first_name is None or first_name.strip() == "" else first_name,
        "lastName": None if last_name is None or last_name.strip() == "" else last_name,
        "emailLabel": abbreviate_email(row["email"]),
        "activeFormationCount": max(0, int(row["active_count"])),
        "unreadNotificationCount": max(0, int(row["unread_count"])),
    }


async def read_header(tx: Tx, user_id: str) -> dict[str, Any]:
    """`readHeader`: the header of one learner, inside an existing transaction."""
    result = await tx.conn.execute(HEADER, {"user_id": user_id})
    found = result.mappings().all()
    if not found:
        raise AppError("NOT_FOUND", PROFILE_NOT_FOUND)
    return to_header(found[0])


async def get_header(deps: Any, actor: Actor) -> dict[str, Any]:
    """`GET /api/v1/me/header` - header data of the authenticated learner (ET-1, ET-4)."""
    async with deps.db.user_tx(actor) as tx:
        return await read_header(tx, actor.user_id)
