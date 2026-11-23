import { serviceDb, sql } from '@learny/testing/db';

// ADR-0340 — the platform provides no model: a task can only run on the learner's own qualified key.
// The e2e journeys that exercise an AI task seed that choice here instead of a subscription. With
// `LLM_MODE=mock` the provider is never called, so the ciphertext is a placeholder.

export const OWN_MODEL_ID = 'gpt-e2e-own';
export const OWN_CREDENTIAL_LABEL = 'OpenAI e2e';

const TASKS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;

interface Executor {
  execute: (query: Parameters<ReturnType<typeof serviceDb>['execute']>[0]) => PromiseLike<unknown>;
}

/** Gives the learner a qualified personal key and chooses its model for the five tasks. */
export async function seedOwnModels(
  userId: string,
  executor: Executor = serviceDb(),
): Promise<void> {
  await clearOwnModels(userId, executor);
  await executor.execute(sql`
    insert into public.ai_credentials (
      user_id, provider, label, model_ids, encrypted_key, key_last4, status, outside_eu, qualified_at
    ) values (
      ${userId}::uuid, 'openai', ${OWN_CREDENTIAL_LABEL}, array[${OWN_MODEL_ID}]::text[],
      decode(repeat('07', 32), 'hex'), 'e2e1', 'qualified', true, '2026-11-10T10:00:00Z'::timestamptz
    )
  `);
  for (const task of TASKS) {
    await executor.execute(sql`
      insert into public.ai_task_models (user_id, task, credential_id, model_id)
      select ${userId}::uuid, ${task}::ai_task, c.id, ${OWN_MODEL_ID}
      from public.ai_credentials c
      where c.user_id = ${userId}::uuid and c.label = ${OWN_CREDENTIAL_LABEL}
      on conflict (user_id, task) do update
        set credential_id = excluded.credential_id, model_id = excluded.model_id
    `);
  }
}

/** Removes the choices and the keys of the learner: every AI task becomes unavailable. */
export async function clearOwnModels(
  userId: string,
  executor: Executor = serviceDb(),
): Promise<void> {
  await executor.execute(sql`delete from public.ai_task_models where user_id = ${userId}::uuid`);
  await executor.execute(sql`delete from public.ai_credentials where user_id = ${userId}::uuid`);
}
