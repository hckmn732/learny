// BR-APP-04 — « Générer le cours maintenant » (SPEC-607 EF-4, ET-2).
//
// An explicit demand is accepted even while a chapter is still open: the event carries `force`.
// It is written through the transactional outbox after the access check, with an identifier that
// covers the completion version (done chapters and resource count), so a repeated click on the same
// state cannot request a second generation. A locked module is refused.
import type { GenerateCourseOutput } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';

import type { ServiceContext } from '../context';

import { requireUser, toResult } from './result';

interface AccessRow extends Record<string, unknown> {
  module_id: string;
  module_status: string;
  chapters_total: number;
  chapters_done: number;
  resource_count: number;
}

export function generateCourseNow(
  ctx: ServiceContext,
  moduleId: string,
): Promise<Result<GenerateCourseOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const access = await db.run(async (tx) => {
      const rows = await tx.execute<AccessRow>(sql`
        select m.id::text as module_id,
               coalesce(mp.status, m.status)::text as module_status,
               (
                 select count(*)::int from public.chapters c where c.module_id = m.id
               ) as chapters_total,
               (
                 select count(*)::int
                 from public.chapters c
                 join public.chapter_progress cp
                   on cp.chapter_id = c.id and cp.user_id = ${userId}::uuid
                 where c.module_id = m.id and cp.contributions_status = 'done'
               ) as chapters_done,
               (
                 select count(*)::int
                 from public.resources r
                 join public.chapters c on c.id = r.chapter_id
                 where c.module_id = m.id
                   and r.owner_id = ${userId}::uuid
                   and r.origin = 'learner'
                   and r.deleted_at is null
               ) as resource_count
        from public.modules m
        left join public.module_progress mp
          on mp.module_id = m.id and mp.user_id = ${userId}::uuid
        where m.id = ${moduleId}::uuid
      `);
      return rows[0];
    });
    if (access === undefined) throw new AppError('NOT_FOUND', 'Module introuvable.');
    if (access.module_status === 'locked') {
      throw new AppError(
        'FORBIDDEN',
        'Ce module est verrouillé : terminez le quiz du module précédent.',
      );
    }

    const version = `${String(access.chapters_done)}:${String(access.chapters_total)}:${String(access.resource_count)}`;
    await emitAfterCommit(
      db,
      'chapter/contributions-completed',
      { userId, moduleId, chapterId: null, force: true },
      { id: `course-generation:${moduleId}:force:${version}` },
      { clock: ctx.clock, logger: ctx.logger },
    );
    return { moduleId, requested: true };
  });
}
