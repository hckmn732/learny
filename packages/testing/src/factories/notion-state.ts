// Notion-state factory (SPEC-115 EF-6). A state belongs to a user who can access the formation;
// a confusion points to another notion of the same formation (SPEC-107 EF-2).
import { sql, type DbTx } from '@learny/db';

import { assertFormationAccess, insert, now } from './helpers';

export interface NotionStateFactoryOverrides {
  userId: string;
  notionId: string;
  mastery?: number;
  gapNature?: 'forgetting' | 'confusion' | 'misunderstanding' | 'application' | null;
  confusedWith?: string | null;
  evidence?: string | null;
  inReview?: boolean;
  dueAt?: Date;
}

export interface FactoryNotionState {
  userId: string;
  notionId: string;
}

export async function createNotionState(
  tx: DbTx,
  overrides: NotionStateFactoryOverrides,
): Promise<FactoryNotionState> {
  const notions = await tx.execute<{ formation_id: string }>(
    sql`select formation_id::text as formation_id from public.notions where id = ${overrides.notionId}::uuid`,
  );
  const formationId = notions[0]?.formation_id;
  if (formationId === undefined) throw new Error('Fabrique état de notion : notion inconnue.');
  await assertFormationAccess(tx, formationId, overrides.userId);

  if (overrides.confusedWith !== undefined && overrides.confusedWith !== null) {
    const confused = await tx.execute<{ formation_id: string }>(
      sql`select formation_id::text as formation_id from public.notions where id = ${overrides.confusedWith}::uuid`,
    );
    if (confused[0]?.formation_id !== formationId) {
      throw new Error(
        'Fabrique état de notion : la confusion doit viser une notion de la même formation.',
      );
    }
  }

  const dueAt = (overrides.dueAt ?? now()).toISOString();
  const mastery = overrides.mastery ?? 50;
  const card = {
    due: dueAt,
    stability: 1,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps: 1,
    lapses: overrides.gapNature === undefined || overrides.gapNature === null ? 0 : 1,
    state: 2,
    last_review: now().toISOString(),
  };
  await insert(
    tx,
    'notion state',
    sql`
      insert into public.notion_states (
        user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
        success_count, gap_nature, gap_confused_with, gap_detected_at, gap_evidence,
        in_review
      )
      values (
        ${overrides.userId}::uuid,
        ${overrides.notionId}::uuid,
        ${JSON.stringify(card)}::jsonb,
        ${dueAt}::timestamptz,
        ${String(mastery)},
        ${now().toISOString()}::timestamptz,
        ${now().toISOString()}::timestamptz,
        1,
        ${overrides.gapNature ?? null},
        ${overrides.confusedWith ?? null}::uuid,
        ${overrides.gapNature === undefined || overrides.gapNature === null ? null : now().toISOString()}::timestamptz,
        ${overrides.evidence ?? null},
        ${overrides.inReview ?? true}
      )
      returning true as ok
    `,
  );
  return { userId: overrides.userId, notionId: overrides.notionId };
}
