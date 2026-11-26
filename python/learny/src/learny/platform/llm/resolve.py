"""Resolution (user, task) -> model (SPEC-709).

The platform provides no model: a task runs only on the qualified personal model the learner
assigned to it. Without an assignment the task is unavailable, whatever the subscription. The read
is scoped by the explicit `user_id` because a job calls it outside a request context.
"""

from dataclasses import dataclass

from sqlalchemy import text

from learny.platform.llm.tasks import AiTask
from learny.shared.db.uow import Tx
from learny.shared.errors import AppError
from learny.shared.locale_fr.ai import AI_UNAVAILABLE_MODEL

READ_TASK_MODEL = text(
    """
    select tm.credential_id::text as credential_id,
           tm.model_id,
           c.provider::text as provider,
           c.base_url,
           c.model_ids
      from public.ai_task_models tm
      left join public.ai_credentials c
        on c.id = tm.credential_id
       and c.user_id = cast(:user_id as uuid)
     where tm.user_id = cast(:user_id as uuid)
       and tm.task = cast(:task as public.ai_task)
     limit 1
    """
)


@dataclass(frozen=True, slots=True)
class ResolvedModel:
    """`ResolvedModel`: the personal model a task runs on."""

    provider: str
    model_id: str
    credential_id: str
    task: AiTask
    base_url: str | None = None


# A task no settings screen exposes borrows the model of a neighbour task until the learner assigns
# one: without it the simple-mode analysis could never start (QA 2026-11-26).
FALLBACK_TASKS: dict[str, tuple[AiTask, ...]] = {"simple_analysis": ("course", "light")}


def _unavailable(reason: str) -> AppError:
    """`aiUnavailable`: the same code, detail and `reason`."""
    return AppError("AI_UNAVAILABLE", AI_UNAVAILABLE_MODEL, reason=reason)


async def resolve_task_model(tx: Tx, user_id: str, task: AiTask) -> ResolvedModel:
    """The model assigned to `task`, or `AI_UNAVAILABLE` when the task cannot run."""
    result = await tx.conn.execute(READ_TASK_MODEL, {"user_id": user_id, "task": task})
    rows = result.mappings().all()
    row = rows[0] if rows else None

    # (1) no assignment: the learner has not chosen a model for this task.
    if row is None:
        for fallback in FALLBACK_TASKS.get(task, ()):
            try:
                borrowed = await resolve_task_model(tx, user_id, fallback)
            except AppError:
                continue
            return ResolvedModel(
                provider=borrowed.provider,
                model_id=borrowed.model_id,
                credential_id=borrowed.credential_id,
                task=task,
                base_url=borrowed.base_url,
            )
        raise _unavailable("no_model_selected")

    # (2) the assigned key was deleted (cascade) or never existed.
    if row["credential_id"] is None or row["provider"] is None:
        raise _unavailable("credential_not_qualified")

    # (3) the chosen model is no longer usable: the task refuses instead of switching silently.
    model_ids = [str(model) for model in (row["model_ids"] or [])]
    if str(row["model_id"]) not in model_ids:
        raise _unavailable("credential_not_qualified")

    return ResolvedModel(
        provider=str(row["provider"]),
        model_id=str(row["model_id"]),
        credential_id=str(row["credential_id"]),
        task=task,
        base_url=None if row["base_url"] is None else str(row["base_url"]),
    )
