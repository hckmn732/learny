import { QUESTION_BANK_FORMATS } from '@learny/contracts';
import { sql, serviceDb, type DbTx } from '@learny/db';
import { requestQuestionBank } from '@learny/tutor';

import type { ServiceContext } from '../context';

// Bank adapter of the review flow (SPEC-701 ET-2, BR-MEM-07, ADR-0026). SPEC-513 delivered the
// bank preparation (`prepareQuestionBank`); the daily quiz needs the reading side: one unseen
// variant per notion and format, plus the refill request when the bank is exhausted (CL-7).
// Banks are private to the learner: every query filters on `owner_id` and RLS adds its own guard.

export interface PickedVariant {
  brickId: string;
  brickVersionId: string;
  type: string;
  notionIds: string[];
  payload: unknown;
  fingerprint: string | null;
}

export interface PickVariantInput {
  userId: string;
  formationId: string;
  notionIds: readonly string[];
  format: string;
  /** Fingerprints the learner already saw (BR-MEM-07 EF-5): they are never served again. */
  excludeFingerprints?: ReadonlySet<string>;
}

/**
 * One active variant of `format` covering at least one of `notionIds`, never a `reported` or
 * `retired` brick (BR-MEM-09) and never an already-seen fingerprint. Deterministic: the first
 * brick by identifier wins, so a replay of the same inputs returns the same variant.
 */
export async function pickVariant(
  tx: DbTx,
  input: PickVariantInput,
): Promise<PickedVariant | null> {
  const notionIds = [...new Set(input.notionIds)];
  if (notionIds.length === 0) return null;
  const rows = await tx.execute<{
    brick_id: string;
    version_id: string;
    type: string;
    notion_ids: string[];
    payload: unknown;
    fingerprint: string | null;
  }>(sql`
    select
      b.id::text as brick_id,
      bv.id::text as version_id,
      b.type::text as type,
      b.notion_ids::text[] as notion_ids,
      bv.payload,
      bv.fingerprint
    from public.bricks b
    join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
    where b.owner_id = ${input.userId}::uuid
      and b.formation_id = ${input.formationId}::uuid
      and b.status = 'active'
      and b.type = ${input.format}::public.brick_type
      and b.notion_ids && ${sql.raw(
        `array(select jsonb_array_elements_text(${JSON.stringify(notionIds)}::jsonb)::uuid)`,
      )}
    order by b.id asc
  `);
  for (const row of rows) {
    if (row.fingerprint !== null && input.excludeFingerprints?.has(row.fingerprint) === true) {
      continue;
    }
    return {
      brickId: row.brick_id,
      brickVersionId: row.version_id,
      type: row.type,
      notionIds: row.notion_ids,
      payload: row.payload,
      fingerprint: row.fingerprint,
    };
  }
  return null;
}

/**
 * CL-7 — asks SPEC-513 for new variants of the exhausted notions. The call never blocks the
 * session: the notion leaves the day and stays due until the nightly batch delivers the bank.
 */
export async function requestRefill(
  ctx: ServiceContext,
  userId: string,
  formationId: string,
  notionIds: readonly string[],
  formats: readonly string[],
): Promise<string[]> {
  if (notionIds.length === 0) return [];
  const courseId = await ctx.db?.run(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      select c.id::text as id
      from public.courses c
      where c.owner_id = ${userId}::uuid
        and c.formation_id = ${formationId}::uuid
        and c.is_current
        and c.status = 'ready'
      order by c.version desc
      limit 1
    `);
    return rows[0]?.id;
  });
  if (courseId === undefined) return [];
  const bankFormats = formats.filter((format) => QUESTION_BANK_FORMATS.includes(format as never));
  if (bankFormats.length === 0) return [];
  const requested = await requestQuestionBank(
    {
      userId,
      requestId: ctx.requestId,
      store: ctx.db as never,
      llmDb: serviceDb(),
      clock: ctx.clock,
      logger: ctx.logger,
    },
    {
      courseVersionId: courseId,
      notionIds: [...notionIds],
      formats: bankFormats,
      count: 4,
      reason: 'exhaustion',
    },
  );
  return requested.jobs.map((job) => job.notionId);
}
