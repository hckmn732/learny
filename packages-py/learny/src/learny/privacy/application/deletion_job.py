"""Nightly account deletion (SPEC-211 EF-7, ET-4, ET-5, CL-7, CL-8, CL-9, ADR-0216, ADR-0267).

Port of `packages/jobs/src/personal-data/deletion.ts`. Steps run in the order fixed by ADR-0216:
capture the address under `select ... for update`, transfer or delete the shared formations, remove
the private blobs, anonymise `ai_calls`, delete the Auth user, delete the business rows (the profile
cascades), then send `deletion_completed` to the captured address. Every step is idempotent: a replay
after a failed step resumes at that step.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, cast

from sqlalchemy import text

from learny.engagement import public as engagement
from learny.platform.storage import StorageBucket
from learny.privacy.application.ports import PrivacyDeps
from learny.privacy.domain.archive import format_long_date
from learny.privacy.domain.deletion import DELETION_BATCH, is_due
from learny.privacy.infrastructure import queries
from learny.shared.locale_fr import privacy as fr
from learny.shared.time import to_iso

RemoveObject = Callable[[StorageBucket, str], Awaitable[None]]


class AccountAdmin:
    """Admin port of the Auth provider; the integration suite injects a database-backed double."""

    async def delete_user(self, user_id: str) -> None:  # pragma: no cover - protocol shape
        raise NotImplementedError

    async def exists(self, user_id: str) -> bool:  # pragma: no cover - protocol shape
        raise NotImplementedError


@dataclass(frozen=True, slots=True)
class DeletionJobDeps:
    """Storage and Auth ports of the deletion; every one is injectable (CL-8)."""

    remove_object: RemoveObject
    admin: AccountAdmin


@dataclass(frozen=True, slots=True)
class RemainingRow:
    """Rows still linked to a learner, table by table (EF-5)."""

    table: str
    remaining: int


@dataclass(frozen=True, slots=True)
class EmailLine:
    """One e-mail the job sent, for the demonstration output."""

    template: str
    to: str
    at: str


@dataclass(frozen=True, slots=True)
class DeletionOutcome:
    """Result of one deletion: what is left, the Auth state and the e-mails."""

    deleted: bool
    tables: list[RemainingRow]
    auth_status: str
    emails: list[EmailLine] = field(default_factory=list)


async def remaining_personal_rows(deps: PrivacyDeps, user_id: str) -> list[RemainingRow]:
    """Counts the rows still linked to a learner, table by table (the EF-5 check)."""
    async with deps.db.service_tx() as tx:
        result = await tx.conn.execute(queries.PERSONAL_TABLES)
        tables = [dict(row) for row in result.mappings().all()]
        remaining: list[RemainingRow] = []
        for entry in tables:
            table = queries.safe_identifier(str(entry["table_name"]))
            column = queries.safe_identifier(str(entry["column_name"]))
            statement = (
                f"select count(*)::int as n from public.{table} "  # noqa: S608 - checked names
                f"where {column} = cast(:user_id as uuid)"
            )
            counted = await tx.conn.execute(text(statement), {"user_id": user_id})
            remaining.append(RemainingRow(table=table, remaining=int(counted.mappings().all()[0]["n"])))
    return remaining


async def _transfer_groups(deps: PrivacyDeps, user_id: str) -> tuple[int, int]:
    """Hands a shared formation to the oldest remaining member, or deletes it (CL-9)."""
    transferred = 0
    removed = 0
    async with deps.db.service_tx() as tx:
        groups = await tx.conn.execute(queries.UPDATE_GROUPS[0], {"user_id": user_id})
        for group in groups.mappings().all():
            data = dict(group)
            group_id = str(data["id"])
            formation_id = str(data["formation_id"])
            new_owner = str(data["new_owner"] or "")
            if new_owner == "":
                await tx.conn.execute(queries.UPDATE_GROUPS[1], {"formation_id": formation_id})
                removed += 1
                continue
            parameters = {
                "group_id": group_id,
                "owner_id": new_owner,
                "user_id": user_id,
                "formation_id": formation_id,
            }
            for statement in queries.UPDATE_GROUPS[2:]:
                await tx.conn.execute(statement, parameters)
            transferred += 1
    return transferred, removed


async def run_account_deletion(
    deps: PrivacyDeps,
    user_id: str,
    job: DeletionJobDeps | None = None,
) -> DeletionOutcome:
    """Runs the deletion of one due account; a cancelled request deletes nothing (CL-7)."""
    ports = job if job is not None else await _default_ports(deps)
    async with deps.db.service_tx() as tx:
        profile = await queries.capture_deletion(tx, user_id)
    not_due = DeletionOutcome(
        deleted=False,
        tables=await remaining_personal_rows(deps, user_id),
        auth_status=fr.AUTH_PRESENT,
    )
    if profile is None or not is_due(profile.deletion_scheduled_for, deps.clock.now()):
        return not_due
    timezone = profile.timezone or fr.DELETE_DEFAULT_TIMEZONE
    requested_at = profile.deletion_requested_at or deps.clock.now()

    await _transfer_groups(deps, user_id)

    async with deps.db.service_tx() as tx:
        resource_rows = await tx.conn.execute(queries.STORAGE_PATHS[0], {"user_id": user_id})
        export_rows = await tx.conn.execute(queries.STORAGE_PATHS[1], {"user_id": user_id})
        resources = [str(row["storage_path"]) for row in resource_rows.mappings().all()]
        exports = [str(row["storage_path"]) for row in export_rows.mappings().all()]
    for path in resources:
        await ports.remove_object("resources", path)
    for path in exports:
        await ports.remove_object("exports", path)

    async with deps.db.service_tx() as tx:
        await tx.conn.execute(queries.ANONYMISE_CALLS, {"user_id": user_id})

    # ADR-0267 - the Auth deletion runs before the profile cascade so that a failed Auth call leaves
    # the due request in place for the next nightly retry (CL-8).
    await ports.admin.delete_user(user_id)

    async with deps.db.service_tx() as tx:
        await tx.conn.execute(queries.DELETE_PROFILE, {"user_id": user_id})

    sent_at = to_iso(deps.clock.now())
    await engagement.send_email(
        cast(Any, deps),
        user_id=user_id,
        template=fr.DELETION_COMPLETED_TEMPLATE,
        props={"requestedLabel": format_long_date(requested_at, timezone)},
        idempotency_key=f"deletion-completed:{user_id}",
        to_override=profile.email,
        tone_override="vous",
    )
    tables = await remaining_personal_rows(deps, user_id)
    deps.logger.info("account deletion completed", userId=user_id, outcome=f"tables={len(tables)}")
    return DeletionOutcome(
        deleted=True,
        tables=tables,
        auth_status=fr.AUTH_DELETED if not await ports.admin.exists(user_id) else fr.AUTH_PRESENT,
        emails=[EmailLine(template=fr.DELETION_COMPLETED_TEMPLATE, to=profile.email, at=sent_at)],
    )


async def run_account_deletions(
    deps: PrivacyDeps, job: DeletionJobDeps | None = None, limit: int = DELETION_BATCH
) -> dict[str, Any]:
    """The nightly function: every due profile, oldest first, fifty per run (EF-7)."""
    ports = job if job is not None else await _default_ports(deps)
    async with deps.db.service_tx() as tx:
        due = await queries.due_deletions(tx, deps.clock.now(), limit)
    results: list[dict[str, Any]] = []
    for user_id in due:
        outcome = await run_account_deletion(deps, user_id, ports)
        results.append({"userId": user_id, "deleted": outcome.deleted})
    deps.logger.info(
        "nightly account deletion",
        outcome=f"due={len(due)} deleted={sum(1 for item in results if item['deleted'])}",
    )
    return {"due": len(due), "results": results}


async def _default_ports(deps: PrivacyDeps) -> DeletionJobDeps:
    from learny.privacy.infrastructure.job_storage import default_deletion_job_deps

    return default_deletion_job_deps(deps)
