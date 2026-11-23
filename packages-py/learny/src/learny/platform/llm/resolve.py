"""Resolution (user, task) -> personal model (SPEC-504 EF-1, port of `resolve.ts`).

The platform provides no model: a task runs only on the qualified personal model the learner
assigned to it. Without an assignment the task is unavailable, whatever the subscription. Reads go
through the service role because the jobs call this outside RLS (SPEC-504 section 8).
"""

from collections.abc import Mapping, Sequence
from typing import Literal

from sqlalchemy import text

from learny.platform.llm.tasks import AiTask
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr import ai as texts

UnavailableReason = Literal["no_model_selected", "credential_not_qualified"]

READ_TASK_MODEL = text(
    """
    select tm.model_id,
           tm.credential_id::text as credential_id,
           c.provider::text as provider,
           c.model_ids
      from public.ai_task_models tm
      left join public.ai_credentials c on c.id = tm.credential_id
     where tm.user_id = cast(:user_id as uuid)
       and tm.task = cast(:task as public.ai_task)
     limit 1
    """
)


def unusable_reason(row: Mapping[str, object] | None) -> UnavailableReason | None:
    """(1) no assignment, (2) deleted key, (3) model removed from the key: the task refuses."""
    if row is None:
        return "no_model_selected"
    if row.get("credential_id") is None or row.get("provider") is None:
        return "credential_not_qualified"
    models = row.get("model_ids")
    known: Sequence[object] = models if isinstance(models, Sequence) and not isinstance(models, str) else ()
    if str(row.get("model_id")) not in {str(model) for model in known}:
        return "credential_not_qualified"
    return None


async def resolve_task_model(tx: Tx, user_id: str, task: AiTask) -> UnavailableReason | None:
    """The reason the task cannot run, or `None` when the learner's model is usable."""
    result = await tx.conn.execute(READ_TASK_MODEL, {"user_id": user_id, "task": task})
    found = result.mappings().first()
    return unusable_reason(None if found is None else dict(found))


def ai_unavailable(reason: UnavailableReason) -> AppError:
    """`aiUnavailable`: the stable code, the French detail and the reason of EF-2."""
    return AppError("AI_UNAVAILABLE", texts.AI_UNAVAILABLE_DETAIL, status=422, reason=reason)


__all__ = ["READ_TASK_MODEL", "UnavailableReason", "ai_unavailable", "resolve_task_model", "unusable_reason"]
