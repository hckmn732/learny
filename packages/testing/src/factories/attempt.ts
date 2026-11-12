// Attempt factory (SPEC-115 EF-6, CL-7). The attempt belongs to the owner of its activity.
import { sql, type DbTx } from '@learny/db';

import { insert, now, type IdRow } from './helpers';

export interface AttemptFactoryOverrides {
  id?: string;
  userId: string;
  activityId: string;
  attemptNo?: number;
  score?: number | null;
  passed?: boolean | null;
  status?: 'in_progress' | 'submitted' | 'graded' | 'timed_out' | 'abandoned';
}

export async function createAttempt(
  tx: DbTx,
  overrides: AttemptFactoryOverrides,
): Promise<{ id: string }> {
  const owners = await tx.execute<{ owner_id: string }>(
    sql`select owner_id::text as owner_id from public.activities where id = ${overrides.activityId}::uuid`,
  );
  const owner = owners[0]?.owner_id;
  if (owner === undefined) throw new Error('Fabrique tentative : activité inconnue.');
  if (owner !== overrides.userId) {
    throw new Error(
      'Fabrique tentative : owner_id incohérent avec la formation (la tentative appartient au propriétaire de l’activité).',
    );
  }

  const attemptNo =
    overrides.attemptNo ??
    ((
      await tx.execute<{ max: number | null }>(
        sql`select max(attempt_no)::int as max from public.attempts
          where activity_id = ${overrides.activityId}::uuid and user_id = ${overrides.userId}::uuid`,
      )
    )[0]?.max ?? 0) + 1;
  const status = overrides.status ?? (overrides.score === undefined ? 'in_progress' : 'graded');
  const at = now().toISOString();
  const rows = await insert<IdRow>(
    tx,
    'attempt',
    sql`
      insert into public.attempts (
        id, user_id, activity_id, attempt_no, status, started_at, submitted_at,
        duration_ms, score, passed, per_notion, hints_used
      )
      values (
        ${overrides.id ?? sql`gen_random_uuid()`}::uuid,
        ${overrides.userId}::uuid,
        ${overrides.activityId}::uuid,
        ${attemptNo},
        ${status},
        ${at}::timestamptz,
        ${status === 'in_progress' ? null : at}::timestamptz,
        ${status === 'in_progress' ? null : 60000},
        ${overrides.score === undefined || overrides.score === null ? null : String(overrides.score)},
        ${overrides.passed ?? null},
        '{}'::jsonb,
        0
      )
      returning id::text as id
    `,
  );
  const row = rows[0];
  if (row === undefined) throw new Error('Fabrique tentative : aucune ligne insérée.');
  return row;
}
