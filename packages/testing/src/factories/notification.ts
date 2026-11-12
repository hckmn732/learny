// Notification factory (SPEC-115 EF-6). A notification is personal; a formation, when provided,
// must be accessible by the user.
import { sql, type DbTx } from '@learny/db';

import { assertFormationAccess, insert, now, suffix, type IdRow } from './helpers';

export interface NotificationFactoryOverrides {
  id?: string;
  userId: string;
  formationId?: string | null;
  type?:
    | 'validation_soon'
    | 'course_ready'
    | 'global_quiz_today'
    | 'new_gap'
    | 'session_planned'
    | 'module_validated'
    | 'session_to_reschedule'
    | 'weekly_review'
    | 'milestone'
    | 'ai_cost_alert'
    | 'ai_task_failed'
    | 'export_ready'
    | 'group_invitation'
    | 'daily_digest'
    | 'relaunch'
    | 'planning_adjusted';
  title?: string;
  body?: string;
  href?: string;
  icon?: string;
  dedupeKey?: string;
}

export async function createNotification(
  tx: DbTx,
  overrides: NotificationFactoryOverrides,
): Promise<{ id: string }> {
  if (overrides.formationId !== undefined && overrides.formationId !== null) {
    await assertFormationAccess(tx, overrides.formationId, overrides.userId);
  }
  const rows = await insert<IdRow>(
    tx,
    'notification',
    sql`
      insert into public.notifications (
        id, user_id, formation_id, type, title, body, href, icon, dedupe_key, created_at
      )
      values (
        ${overrides.id ?? sql`gen_random_uuid()`}::uuid,
        ${overrides.userId}::uuid,
        ${overrides.formationId ?? null}::uuid,
        ${overrides.type ?? 'course_ready'},
        ${overrides.title ?? 'Notification de fabrique'},
        ${overrides.body ?? 'Corps de la notification.'},
        ${overrides.href ?? '/accueil'},
        ${overrides.icon ?? 'course'},
        ${overrides.dedupeKey ?? `factory:${suffix()}`},
        ${now().toISOString()}::timestamptz
      )
      returning id::text as id
    `,
  );
  const row = rows[0];
  if (row === undefined) throw new Error('Fabrique notification : aucune ligne insérée.');
  return row;
}
