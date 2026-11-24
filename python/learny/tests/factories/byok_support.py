"""Seeds of the personal AI key tests (SPEC-2204).

Every row is seeded with the owner role inside the service transaction `rolled_back` reverts; the
use cases then run under the caller's `authenticated` role through the savepoints of
`LearningTransactions`. The master key and the API key are fixed dummies: nothing here is a secret.
"""

import base64
import json
from datetime import datetime
from typing import Any

from learny.platform.llm.catalog import PROVIDER_REGIONS
from learny.shared.db.uow import Tx
from sqlalchemy import text

from factories.identity_support import FIXED, create_user, identifier

FAKE_ENCRYPTION_KEY = base64.b64encode(bytes(range(32))).decode("ascii")
FAKE_API_KEY = "sk-test-0000000000a91F"  # learny-test-only
FAKE_PREFIXED_KEY = "sk-ant-test-000000a91F"  # learny-test-only
FAKE_BARE_KEY = "testkeyA7Kq2"  # learny-test-only


async def create_learner(tx: Tx, first_name: str = "Cles") -> str:
    """A learner whose profile and settings the sign-up trigger creates."""
    return await create_user(tx.conn, first_name)


async def create_credential_row(
    tx: Tx,
    *,
    user_id: str,
    provider: str = "openai",
    label: str = "Cle perso",
    base_url: str | None = None,
    model_ids: tuple[str, ...] = ("gpt-seed",),
    encrypted_key: bytes | None = b"\x01" * 32,
    key_last4: str | None = "a91F",
    status: str = "untested",
    qualification: Any = None,
    outside_eu: bool | None = None,
    qualified_at: datetime | None = None,
    created_at: datetime = FIXED,
) -> str:
    """One credential row, with the column defaults the service writes."""
    region = PROVIDER_REGIONS[provider]  # type: ignore[index]  # a valid provider of the catalogue
    return await identifier(
        tx.conn,
        """
        insert into public.ai_credentials (
          user_id, provider, label, base_url, model_ids, encrypted_key, key_last4, status,
          qualification, outside_eu, qualified_at, created_at, updated_at
        ) values (
          cast(:user as uuid), cast(:provider as public.ai_provider), :label, :base_url,
          cast(:model_ids as text[]), :encrypted_key, :key_last4,
          cast(:status as public.credential_status), cast(:qualification as jsonb), :outside_eu,
          cast(:qualified_at as timestamptz), cast(:created as timestamptz),
          cast(:created as timestamptz)
        )
        returning id::text as id
        """,
        user=user_id,
        provider=provider,
        label=label,
        base_url=base_url,
        model_ids="{" + ",".join(model_ids) + "}",
        encrypted_key=encrypted_key,
        key_last4=key_last4,
        status=status,
        qualification=json.dumps({} if qualification is None else qualification),
        outside_eu=region.outside_eu if outside_eu is None else outside_eu,
        qualified_at=qualified_at,
        created=created_at,
    )


async def create_assignment_row(
    tx: Tx,
    *,
    user_id: str,
    task: str,
    credential_id: str | None,
    model_id: str = "gpt-seed",
) -> None:
    """One `ai_task_models` row; a null credential is a key deleted under an existing choice."""
    await tx.conn.execute(
        text(
            """
            insert into public.ai_task_models (user_id, task, credential_id, model_id)
            values (
              cast(:user as uuid), cast(:task as public.ai_task),
              cast(:credential as uuid), :model_id
            )
            """
        ),
        {"user": user_id, "task": task, "credential": credential_id, "model_id": model_id},
    )


async def credential_row(tx: Tx, credential_id: str) -> dict[str, Any]:
    """The stored row, ciphertext included, read with the owner role."""
    result = await tx.conn.execute(
        text(
            """
            select id::text as id, provider::text as provider, label, base_url, model_ids,
              encrypted_key, key_last4, status::text as status, qualification, outside_eu,
              qualified_at, created_at
            from public.ai_credentials
            where id = cast(:id as uuid)
            """
        ),
        {"id": credential_id},
    )
    rows = result.mappings().all()
    if not rows:
        raise AssertionError("no credential row")
    return dict(rows[0])


async def assignment_rows(tx: Tx, user_id: str) -> list[dict[str, Any]]:
    """Every task assignment of one learner."""
    result = await tx.conn.execute(
        text(
            """
            select task::text as task, credential_id::text as credential_id, model_id
            from public.ai_task_models
            where user_id = cast(:user as uuid)
            order by task
            """
        ),
        {"user": user_id},
    )
    return [dict(row) for row in result.mappings().all()]


async def count_credentials(tx: Tx, user_id: str) -> int:
    """How many keys one learner owns, read with the owner role (RLS bypassed on purpose)."""
    result = await tx.conn.execute(
        text("select count(*)::int as count from public.ai_credentials where user_id = cast(:user as uuid)"),
        {"user": user_id},
    )
    return int(result.mappings().all()[0]["count"])
