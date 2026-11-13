// Mastery after one exercise submission (SPEC-613 EF-3; SPEC-411 ET-2).
//
// SPEC-411 returns the full transition; a replay already graded by a previous call has no new
// transition and reads the persisted notion state instead. The helper never invents a value: it
// falls back to the mastery before the attempt only when the state cannot be read.
import { sql } from 'drizzle-orm';

import type { LearningApplicationSummary } from '@learny/contracts';
import type { Result } from '@learny/core';

import type { ServiceContext } from '../context';

export async function masteryAfterOf(
  ctx: ServiceContext,
  notionId: string,
  fallback: number,
  applied: Result<LearningApplicationSummary> | null,
): Promise<number> {
  if (applied !== null && applied.ok) {
    const transition = applied.value.states.find((state) => state.notionId === notionId);
    if (transition !== undefined) return transition.masteryAfter;
  }
  if (ctx.db === null) return fallback;
  const userId = ctx.userId;
  if (userId === null) return fallback;
  const rows = await ctx.db.run(async (tx) =>
    tx.execute<{ mastery: string | number }>(sql`
      select mastery::text as mastery
      from public.notion_states
      where user_id = ${userId}::uuid and notion_id = ${notionId}::uuid
    `),
  );
  const value = Number(rows[0]?.mastery);
  return Number.isFinite(value) ? value : fallback;
}
