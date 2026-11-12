// Schedule-slot factory (SPEC-115 EF-6). The slot belongs to a user who can access the formation.
import { sql, type DbTx } from '@learny/db';

import { assertFormationAccess, insert, now, type IdRow } from './helpers';

export interface ScheduleSlotFactoryOverrides {
  id?: string;
  userId: string;
  formationId: string;
  moduleId?: string | null;
  kind?:
    | 'contributions'
    | 'course'
    | 'exercise'
    | 'validation_quiz'
    | 'global_quiz'
    | 'revision'
    | 'buffer'
    | 'sprint'
    | 'mock_exam'
    | 'warmup'
    | 'micro_session'
    | 'weekly_review';
  title?: string;
  meta?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  status?: 'planned' | 'done' | 'missed' | 'moved' | 'cancelled';
  createdBy?: 'planner' | 'automation' | 'learner';
}

export async function createScheduleSlot(
  tx: DbTx,
  overrides: ScheduleSlotFactoryOverrides,
): Promise<{ id: string }> {
  await assertFormationAccess(tx, overrides.formationId, overrides.userId);
  const startsAt = overrides.startsAt ?? new Date(now().getTime() + 3600_000);
  const endsAt = overrides.endsAt ?? new Date(startsAt.getTime() + 3600_000);
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error('Fabrique créneau : la fin doit être postérieure au début.');
  }
  const rows = await insert<IdRow>(
    tx,
    'créneau',
    sql`
      insert into public.schedule_slots (
        id, user_id, formation_id, module_id, kind, title, meta, starts_at, ends_at,
        status, created_by
      )
      values (
        ${overrides.id ?? sql`gen_random_uuid()`}::uuid,
        ${overrides.userId}::uuid,
        ${overrides.formationId}::uuid,
        ${overrides.moduleId ?? null}::uuid,
        ${overrides.kind ?? 'course'},
        ${overrides.title ?? 'Créneau de fabrique'},
        ${overrides.meta ?? null},
        ${startsAt.toISOString()}::timestamptz,
        ${endsAt.toISOString()}::timestamptz,
        ${overrides.status ?? 'planned'},
        ${overrides.createdBy ?? 'planner'}
      )
      returning id::text as id
    `,
  );
  const row = rows[0];
  if (row === undefined) throw new Error('Fabrique créneau : aucune ligne insérée.');
  return row;
}
