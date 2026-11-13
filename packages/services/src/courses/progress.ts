import { CourseReadingProgress, CourseProgressUpdate } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';
import { z } from 'zod';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

// SPEC-609 EF-3, ET-5, BR-COU-08 — monotone reading progress.
//
// The client sends the sections it has seen; the server derives the percentage from the sections
// that actually belong to the chapter. A smaller value never replaces a larger one, and the
// course percentage is the mean of its chapters. Every transition is a single transactional write
// with one deterministic event, so a replay is a no-op.

export function readingPercent(visible: number, total: number): number {
  if (!Number.isFinite(visible) || !Number.isFinite(total) || total <= 0) return 0;
  const bounded = Math.min(Math.max(visible, 0), total);
  return Math.min(100, Math.max(0, Math.floor((bounded * 100) / total)));
}

export function mergeProgress(current: number, measured: number): number {
  return Math.max(0, Math.min(100, Math.max(current, measured)));
}

/** BR-COU-08 — percentage of the whole course: mean of the chapters that have content. */
export function coursePercent(chapters: readonly number[]): number {
  if (chapters.length === 0) return 0;
  const total = chapters.reduce((sum, percent) => sum + Math.max(0, Math.min(100, percent)), 0);
  return Math.min(100, Math.max(0, Math.round(total / chapters.length)));
}

/** BR-COU-11 — 200 words per minute, rounded up, at least one minute. */
export function estimateReadingMinutes(words: number): number {
  if (!Number.isFinite(words) || words <= 0) return 1;
  return Math.max(1, Math.ceil(words / 200));
}

interface CourseRow extends Record<string, unknown> {
  id: string;
  module_id: string;
}

interface ChapterRow extends Record<string, unknown> {
  id: string;
  total: number;
  percent: number | null;
  updated_at: Date | string | null;
}

interface SectionRow extends Record<string, unknown> {
  id: string;
}

function invalid(message: string): AppError {
  return new AppError('VALIDATION_FAILED', message);
}

function assertUuid(value: string, field: string): void {
  if (!z.uuid().safeParse(value).success) throw invalid(`Identifiant invalide : ${field}.`);
}

export function recordCourseProgress(
  ctx: ServiceContext,
  courseId: string,
  input: CourseProgressUpdate,
): Promise<Result<CourseReadingProgress>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    assertUuid(courseId, 'courseId');
    const parsed = CourseProgressUpdate.parse(input);
    assertUuid(parsed.chapterId, 'chapterId');
    for (const sectionId of parsed.visibleSectionIds) assertUuid(sectionId, 'visibleSectionIds');

    return withTransaction(db, async (tx, outbox): Promise<CourseReadingProgress> => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`course-progress:${userId}:${courseId}`}, 0))`,
      );
      const courses = await tx.execute<CourseRow>(sql`
        select id::text as id, module_id::text as module_id
        from public.courses
        where id = ${courseId}::uuid
          and owner_id = ${userId}::uuid
          and is_current
          and status = 'ready'
        limit 1
      `);
      const course = courses[0];
      if (course === undefined) throw new AppError('NOT_FOUND', 'Cours introuvable.');

      const chapters = await tx.execute<ChapterRow>(sql`
        select
          ch.id::text as id,
          count(cs.id)::int as total,
          rp.percent,
          rp.updated_at
        from public.chapters ch
        left join public.course_sections cs
          on cs.chapter_id = ch.id and cs.course_id = ${course.id}::uuid
        left join public.reading_progress rp
          on rp.user_id = ${userId}::uuid
         and rp.course_id = ${course.id}::uuid
         and rp.chapter_id = ch.id
        where ch.module_id = ${course.module_id}::uuid
        group by ch.id, ch.position, rp.percent, rp.updated_at
        order by ch.position asc, ch.id asc
      `);
      const selected = chapters.find((chapter) => chapter.id === parsed.chapterId);
      if (selected === undefined) throw new AppError('NOT_FOUND', 'Chapitre introuvable.');

      const sections = await tx.execute<SectionRow>(sql`
        select id::text as id
        from public.course_sections
        where course_id = ${course.id}::uuid and chapter_id = ${selected.id}::uuid
      `);
      const known = new Set(sections.map((section) => section.id));
      const visible = new Set(parsed.visibleSectionIds.filter((sectionId) => known.has(sectionId)));
      const measured = readingPercent(visible.size, known.size);
      const current = selected.percent ?? 0;
      const next = mergeProgress(current, measured);
      const now = ctx.clock.now();

      if (next > current) {
        await tx.execute(sql`
          insert into public.reading_progress (user_id, course_id, chapter_id, percent, updated_at)
          values (${userId}::uuid, ${course.id}::uuid, ${selected.id}::uuid, ${next}, ${now.toISOString()}::timestamptz)
          on conflict (user_id, course_id, chapter_id) do update
            set percent = greatest(public.reading_progress.percent, excluded.percent),
                updated_at = excluded.updated_at
        `);
        outbox.add(
          'course/progress-updated',
          { userId, courseId: course.id, chapterId: selected.id, percent: next },
          { id: `course-progress:${course.id}:${selected.id}:${String(next)}` },
        );
        selected.percent = next;
      }

      const chapterPercent = next;
      const measuredChapters = chapters
        .filter((chapter) => chapter.total > 0)
        .map((chapter) => (chapter.id === selected.id ? next : (chapter.percent ?? 0)));
      const storedAt =
        next > current
          ? now.toISOString()
          : selected.updated_at === null
            ? null
            : new Date(selected.updated_at).toISOString();
      return CourseReadingProgress.parse({
        chapterPercent,
        coursePercent: coursePercent(measuredChapters),
        updatedAt: storedAt,
      });
    });
  });
}

/** Shared SQL helper: the persisted percentages of one course, indexed by chapter. */
export async function readProgressByChapter(
  tx: DbTx,
  userId: string,
  courseId: string,
): Promise<Map<string, number>> {
  const rows = await tx.execute<{ chapter_id: string; percent: number }>(sql`
    select chapter_id::text as chapter_id, percent
    from public.reading_progress
    where user_id = ${userId}::uuid and course_id = ${courseId}::uuid
  `);
  return new Map(rows.map((row) => [row.chapter_id, row.percent]));
}
