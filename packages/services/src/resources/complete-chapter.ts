// BR-APP-04 — declare a chapter's contributions finished, or reopen it (SPEC-607 EF-4, ET-2).
//
// One transaction serialises the transition per learner and chapter, updates `chapter_progress`
// and enqueues `chapter/contributions-completed` only when the module becomes complete. Reopening a
// chapter never generates anything. The event identifier is deterministic for the completion
// version (done chapters + resources), so replaying a committed request cannot request a second
// generation. A concurrent double click finds the row already done and changes nothing (CL-5).
import {
  CompleteChapterBody,
  type ChapterCompletion,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';

import { requireUser, toResult } from './result';

const CHAPTER_LOCK_NAMESPACE = 607;

interface ChapterRow extends Record<string, unknown> {
  id: string;
  module_id: string;
  formation_id: string;
  module_status: string;
  contributions_status: string | null;
  done_at: Date | null;
}

interface ProgressRow extends Record<string, unknown> {
  contributions_status: string;
  done_at: Date | null;
  updated_at: Date;
}

function statusOf(value: string | null): 'in_progress' | 'done' {
  return value === 'done' ? 'done' : 'in_progress';
}

/** Counts the chapters of the module and how many are done for this learner. */
async function chapterCounts(
  tx: DbTx,
  userId: string,
  moduleId: string,
): Promise<{ total: number; done: number }> {
  const rows = await tx.execute<{ total: number; done: number }>(sql`
    select count(*)::int as total,
           count(*) filter (where cp.contributions_status = 'done')::int as done
    from public.chapters c
    left join public.chapter_progress cp
      on cp.chapter_id = c.id and cp.user_id = ${userId}::uuid
    where c.module_id = ${moduleId}::uuid
  `);
  return { total: rows[0]?.total ?? 0, done: rows[0]?.done ?? 0 };
}

/**
 * EF-4, CL-5 — mark the chapter done or reopen it. The completion event is emitted once, when the
 * last open chapter becomes done; the explicit generation service covers the forced request.
 */
export function completeChapter(
  ctx: ServiceContext,
  chapterId: string,
  input: CompleteChapterBody,
): Promise<Result<ChapterCompletion>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return withTransaction(
      db,
      async (tx, outbox): Promise<ChapterCompletion> => {
        const rows = await tx.execute<ChapterRow>(sql`
          select c.id::text as id,
                 c.module_id::text as module_id,
                 c.formation_id::text as formation_id,
                 coalesce(mp.status, m.status)::text as module_status,
                 cp.contributions_status::text as contributions_status,
                 cp.done_at
          from public.chapters c
          join public.modules m on m.id = c.module_id
          left join public.module_progress mp
            on mp.module_id = m.id and mp.user_id = ${userId}::uuid
          left join public.chapter_progress cp
            on cp.chapter_id = c.id and cp.user_id = ${userId}::uuid
          where c.id = ${chapterId}::uuid
          for update of c
        `);
        const chapter = rows[0];
        if (chapter === undefined) throw new AppError('NOT_FOUND', 'Chapitre introuvable.');
        if (chapter.module_status === 'locked') {
          throw new AppError(
            'FORBIDDEN',
            'Ce module est verrouillé : terminez le quiz du module précédent.',
          );
        }

        // Serialises two clicks of the same learner on the same chapter (CL-5).
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${userId}:${chapterId}`}, ${CHAPTER_LOCK_NAMESPACE}::bigint))`,
        );

        const before = await tx.execute<ProgressRow>(sql`
          select cp.contributions_status::text as contributions_status, cp.done_at, cp.updated_at
          from public.chapter_progress cp
          where cp.user_id = ${userId}::uuid and cp.chapter_id = ${chapterId}::uuid
        `);
        const current = before[0];
        const target = input.done ? 'done' : 'in_progress';
        const countsBefore = await chapterCounts(tx, userId, chapter.module_id);

        if (statusOf(current?.contributions_status ?? null) === target) {
          return {
            chapterId,
            moduleId: chapter.module_id,
            contributionsStatus: target,
            doneAt: current?.done_at?.toISOString() ?? null,
            chaptersDone: countsBefore.done,
            chaptersTotal: countsBefore.total,
            generationRequested: false,
          };
        }

        const now = ctx.clock.now();
        await tx.execute(sql`
          insert into public.chapter_progress (
            user_id, chapter_id, contributions_status, done_at, updated_at
          )
          values (
            ${userId}::uuid,
            ${chapterId}::uuid,
            ${target}::public.contrib_status,
            ${target === 'done' ? now.toISOString() : null}::timestamptz,
            ${now.toISOString()}::timestamptz
          )
          on conflict (user_id, chapter_id) do update
          set contributions_status = excluded.contributions_status,
              done_at = excluded.done_at,
              updated_at = excluded.updated_at
        `);

        const counts = await chapterCounts(tx, userId, chapter.module_id);
        const allDone = counts.total > 0 && counts.done === counts.total;
        if (target === 'done' && allDone) {
          const resourceCount = await tx.execute<{ total: number }>(sql`
            select count(*)::int as total
            from public.resources r
            where r.owner_id = ${userId}::uuid
              and r.formation_id = ${chapter.formation_id}::uuid
              and r.deleted_at is null
              and r.origin = 'learner'
          `);
          const version = `${String(counts.done)}:${String(resourceCount[0]?.total ?? 0)}`;
          outbox.add(
            'chapter/contributions-completed',
            { userId, moduleId: chapter.module_id, chapterId, force: false },
            { id: `course-generation:${chapter.module_id}:auto:${version}` },
          );
        }

        return {
          chapterId,
          moduleId: chapter.module_id,
          contributionsStatus: target,
          doneAt: target === 'done' ? now.toISOString() : null,
          chaptersDone: counts.done,
          chaptersTotal: counts.total,
          generationRequested: target === 'done' && allDone,
        };
      },
      { clock: ctx.clock, logger: ctx.logger },
    );
  });
}
