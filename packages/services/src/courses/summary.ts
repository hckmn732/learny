import { z } from 'zod';

import {
  ChapterSummaryBody,
  CourseSummaryView,
  type CourseSummaryFeedback,
} from '@learny/contracts';
import { AppError, isAppError, type Result } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { withTransaction } from '@learny/jobs';
import { correctChapterSummary } from '@learny/tutor';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

// SPEC-609 EF-3, ET-2 to ET-5, BR-COU-07, CL-4 — the chapter summary is written by the learner,
// corrected by the tutor and kept as a draft when the tutor is unavailable. The text is committed
// before the model call, so a model failure never loses it. The summary references the course
// version that was read (BR-COU-10) and never rewrites a past attempt. A replay with the same
// request key returns the first summary and emits no second event.

interface CourseRow extends Record<string, unknown> {
  id: string;
  module_id: string;
  formation_id: string;
}

interface SummaryRow extends Record<string, unknown> {
  id: string;
  chapter_id: string;
  course_id: string;
  text: string;
  feedback: unknown;
  created_at: Date | string;
}

function asFeedback(value: unknown): CourseSummaryFeedback | null {
  if (value === null || value === undefined) return null;
  const candidate = CourseSummaryView.shape.feedback.safeParse(value);
  return candidate.success ? candidate.data : null;
}

function viewOf(row: SummaryRow): CourseSummaryView {
  const feedback = asFeedback(row.feedback);
  return CourseSummaryView.parse({
    id: row.id,
    chapterId: row.chapter_id,
    courseId: row.course_id,
    text: row.text,
    feedback,
    status: feedback === null ? 'deferred' : 'corrected',
    createdAt: new Date(row.created_at).toISOString(),
  });
}

function keyPointsOf(data: unknown): string[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return [];
  const points = (data as Record<string, unknown>).points;
  return Array.isArray(points)
    ? points.filter((point): point is string => typeof point === 'string').slice(0, 7)
    : [];
}

export interface ChapterSummarySubmission {
  courseId: string;
  text: string;
  /** Route `Idempotency-Key` or an explicit key of a direct service call (ET-2). */
  requestKey?: string | null;
}

export function submitChapterSummary(
  ctx: ServiceContext,
  chapterId: string,
  input: ChapterSummarySubmission,
): Promise<Result<CourseSummaryView>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!z.uuid().safeParse(chapterId).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de chapitre invalide.');
    }
    const parsedBody = ChapterSummaryBody.safeParse({ courseId: input.courseId, text: input.text });
    if (!parsedBody.success) {
      throw new AppError('VALIDATION_FAILED', 'Le résumé est invalide.', {
        errors: parsedBody.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      });
    }
    const body = parsedBody.data;
    const requestKey = input.requestKey ?? null;
    if (requestKey !== null && !/^[A-Za-z0-9_-]{8,128}$/.test(requestKey)) {
      throw new AppError('VALIDATION_FAILED', 'Clé de demande invalide.');
    }

    const committed = await withTransaction(db, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`chapter-summary:${userId}:${chapterId}`}, 0))`,
      );
      if (requestKey !== null) {
        const replay = await tx.execute<SummaryRow>(sql`
          select id::text as id, chapter_id::text as chapter_id, course_id::text as course_id,
                 text, feedback, created_at
          from public.chapter_summaries
          where user_id = ${userId}::uuid and request_key = ${requestKey}
          limit 1
        `);
        if (replay[0] !== undefined) {
          return { row: replay[0], created: false, formationId: null, courseId: replay[0].course_id };
        }
      }

      const courses = await tx.execute<CourseRow>(sql`
        select c.id::text as id, c.module_id::text as module_id, c.formation_id::text as formation_id
        from public.courses c
        where c.id = ${body.courseId}::uuid
          and c.owner_id = ${userId}::uuid
          and c.is_current
          and c.status = 'ready'
        limit 1
      `);
      const course = courses[0];
      if (course === undefined) throw new AppError('NOT_FOUND', 'Cours introuvable.');

      const chapters = await tx.execute<{ id: string; title: string }>(sql`
        select ch.id::text as id, ch.title
        from public.chapters ch
        join public.course_sections cs
          on cs.chapter_id = ch.id and cs.course_id = ${course.id}::uuid
        where ch.id = ${chapterId}::uuid and ch.module_id = ${course.module_id}::uuid
        limit 1
      `);
      if (chapters[0] === undefined) throw new AppError('NOT_FOUND', 'Chapitre introuvable.');

      const inserted = await tx.execute<SummaryRow>(sql`
        insert into public.chapter_summaries (
          user_id, chapter_id, course_id, text, request_key, created_at
        ) values (
          ${userId}::uuid, ${chapterId}::uuid, ${course.id}::uuid, ${body.text}, ${requestKey},
          ${ctx.clock.now().toISOString()}::timestamptz
        )
        returning id::text as id, chapter_id::text as chapter_id, course_id::text as course_id,
                  text, feedback, created_at
      `);
      const row = inserted[0];
      if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Résumé non enregistré.');
      return {
        row,
        created: true,
        formationId: course.formation_id,
        courseId: course.id,
        chapterTitle: chapters[0].title,
      };
    });

    if (!committed.created) return viewOf(committed.row);

    const chapterTitle =
      'chapterTitle' in committed && typeof committed.chapterTitle === 'string'
        ? committed.chapterTitle
        : '';
    const keyPoints = await db.run(async (tx) => {
      const rows = await tx.execute<{ data: unknown }>(sql`
        select data
        from public.course_sections
        where course_id = ${committed.courseId}::uuid
          and chapter_id = ${chapterId}::uuid
          and kind = 'retain'
        order by position asc
        limit 1
      `);
      return keyPointsOf(rows[0]?.data);
    });

    let feedback: CourseSummaryFeedback | null = null;
    try {
      const corrected = await correctChapterSummary(
        {
          userId,
          formationId: committed.formationId ?? '',
          requestId: ctx.requestId,
          llmDb: serviceDb(),
        },
        {
          text: committed.row.text,
          chapterTitle,
          keyPoints,
        },
      );
      if (corrected.ok) feedback = corrected.value;
      else ctx.logger.warn('summary correction deferred', { code: corrected.error.code });
    } catch (error) {
      // CL-4 — the text is already stored; a tutor failure only defers the correction.
      if (!isAppError(error)) throw error;
      ctx.logger.warn('summary correction deferred', { code: error.code });
    }

    const correctedRow = await withTransaction(db, async (tx, outbox) => {
      if (feedback !== null) {
        await tx.execute(sql`
          update public.chapter_summaries
          set feedback = ${JSON.stringify(feedback)}::jsonb
          where id = ${committed.row.id}::uuid and user_id = ${userId}::uuid
        `);
      }
      outbox.add(
        'course/summary-submitted',
        {
          userId,
          courseId: committed.courseId,
          chapterId,
          summaryId: committed.row.id,
          corrected: feedback !== null,
        },
        { id: `course-summary:${committed.row.id}` },
      );
      return { ...committed.row, feedback };
    });
    return viewOf(correctedRow);
  });
}
