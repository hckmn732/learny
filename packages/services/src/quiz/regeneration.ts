import { QUESTION_BANK_FORMATS } from '@learny/contracts';
import { sql, serviceDb, type DbTx } from '@learny/db';
import { requestQuestionBank } from '@learny/tutor';

import type { ServiceContext } from '../context';

// SPEC-611 EF-8, CL-5 — an exhausted notion asks SPEC-513 for new variants. The call is made after
// the creation transaction has observed the exhaustion and created nothing: the retry is the only
// path that creates an attempt, so a learner never answers a question drawn from an empty bank.

export async function requestQuizRegeneration(
  tx: DbTx,
  ctx: ServiceContext,
  userId: string,
  formationId: string,
  notionIds: readonly string[],
): Promise<string[]> {
  const courses = await tx.execute<{ id: string }>(sql`
    select c.id::text as id
    from public.courses c
    where c.owner_id = ${userId}::uuid
      and c.formation_id = ${formationId}::uuid
      and c.is_current
      and c.status = 'ready'
    order by c.version desc
    limit 1
  `);
  const courseId = courses[0]?.id;
  if (courseId === undefined || notionIds.length === 0) return [];
  if (ctx.db === null) return [];

  const requested = await requestQuestionBank(
    {
      userId,
      requestId: ctx.requestId,
      store: ctx.db,
      llmDb: serviceDb(),
      clock: ctx.clock,
      logger: ctx.logger,
    },
    {
      courseVersionId: courseId,
      notionIds: [...notionIds],
      formats: [...QUESTION_BANK_FORMATS],
      count: 4,
      reason: 'exhaustion',
    },
  );
  return requested.jobs.map((job) => job.notionId);
}
