# --------------------------------------------------------------------------------------------------
# Personal AI keys and model assignments (SPEC-2204, port of
# `packages/services/src/ai/{credentials-service,qualify-model}.ts` and
# `packages/services/src/parametres-modeles-d-ia.ts`).
#
# Same tables, same selected columns in the same order, same `order by`, same `for update`, same
# advisory lock. A learner's row is never readable through another learner: every statement filters
# on `user_id` and runs under RLS.
# --------------------------------------------------------------------------------------------------

from sqlalchemy import text

LOCK_CREDENTIAL_CREATION = text(
    """
    select pg_advisory_xact_lock(hashtext(cast(:user_id as text))::bigint)
    """
)
CREDENTIALS_OF_USER = text(
    """
    select provider::text as provider, base_url, key_last4, qualification
    from public.ai_credentials
    where user_id = cast(:user_id as uuid)
    """
)
INSERT_CREDENTIAL = text(
    """
    insert into public.ai_credentials (
      id, user_id, provider, label, base_url, model_ids, encrypted_key, key_last4, status,
      qualification, outside_eu, qualified_at, created_at, updated_at
    ) values (
      cast(:id as uuid), cast(:user_id as uuid), cast(:provider as public.ai_provider), :label,
      :base_url, cast(:model_ids as text[]), :encrypted_key, :key_last4,
      cast(:status as public.credential_status), cast(:qualification as jsonb), :outside_eu,
      null, cast(:now as timestamptz), cast(:now as timestamptz)
    )
    returning id::text as id, provider::text as provider, label, base_url, model_ids, key_last4,
      status::text as status, qualification, outside_eu, qualified_at, created_at
    """
)
LIST_CREDENTIALS = text(
    """
    select id::text as id, provider::text as provider, label, base_url, model_ids, key_last4,
      status::text as status, qualification, outside_eu, qualified_at, created_at
    from public.ai_credentials
    where user_id = cast(:user_id as uuid)
    order by created_at asc
    limit 10
    """
)
DELETE_CREDENTIAL_ASSIGNMENTS = text(
    """
    delete from public.ai_task_models
    where user_id = cast(:user_id as uuid)
      and credential_id = cast(:credential_id as uuid)
    """
)
DELETE_CREDENTIAL = text(
    """
    delete from public.ai_credentials
    where id = cast(:id as uuid) and user_id = cast(:user_id as uuid)
    returning id::text as id
    """
)
PROBE_CREDENTIAL = text(
    """
    select provider::text as provider, base_url, model_ids, outside_eu
    from public.ai_credentials
    where id = cast(:credential_id as uuid) and user_id = cast(:user_id as uuid)
    limit 1
    """
)
LOCK_CREDENTIAL_QUALIFICATION = text(
    """
    select qualification
    from public.ai_credentials
    where id = cast(:credential_id as uuid) and user_id = cast(:user_id as uuid)
    for update
    limit 1
    """
)
UPDATE_CREDENTIAL_QUALIFICATION = text(
    """
    update public.ai_credentials
    set qualification = cast(:qualification as jsonb), updated_at = cast(:now as timestamptz)
    where id = cast(:credential_id as uuid) and user_id = cast(:user_id as uuid)
    """
)
MARK_CREDENTIAL_CONNECTED = text(
    """
    update public.ai_credentials
    set status = 'qualified', qualified_at = cast(:now as timestamptz),
        updated_at = cast(:now as timestamptz)
    where id = cast(:credential_id as uuid) and user_id = cast(:user_id as uuid)
    """
)
MODELS_CREDENTIALS = text(
    """
    select id::text as id, provider::text as provider, label, model_ids, key_last4,
      status::text as status, qualification, outside_eu, qualified_at, created_at
    from public.ai_credentials
    where user_id = cast(:user_id as uuid)
    order by created_at asc
    """
)
MODELS_ASSIGNMENTS = text(
    """
    select task::text as task, credential_id::text as credential_id, model_id
    from public.ai_task_models
    where user_id = cast(:user_id as uuid)
    """
)
CLEAR_TASK_MODEL = text(
    """
    delete from public.ai_task_models
    where user_id = cast(:user_id as uuid) and task = cast(:task as public.ai_task)
    """
)
CREDENTIAL_FOR_ASSIGNMENT = text(
    """
    select id::text as id, model_ids, status::text as status, qualification
    from public.ai_credentials
    where id = cast(:credential_id as uuid) and user_id = cast(:user_id as uuid)
    limit 1
    """
)
UPSERT_TASK_MODEL = text(
    """
    insert into public.ai_task_models (user_id, task, credential_id, model_id)
    values (
      cast(:user_id as uuid), cast(:task as public.ai_task),
      cast(:credential_id as uuid), :model_id
    )
    on conflict (user_id, task) do update
    set credential_id = excluded.credential_id,
        model_id = excluded.model_id
    """
)
