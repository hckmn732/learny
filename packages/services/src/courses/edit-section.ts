import { z } from 'zod';

import {
  CourseSectionEditBody,
  CourseSectionView,
  type CourseSectionEditBody as EditBody,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { reactivateBricks } from './section-bricks';

// SPEC-609 EF-4, ET-2, ET-4, CL-2, BR-COU-09 — a learner correction archives the previous state
// through the `archive_course_section_revision` trigger, increments the section version and
// reactivates the bank bricks suspended by its report. `expectedVersion` is the optimistic guard: a
// stale reader receives 409 and the current version, never a silent overwrite.

interface SectionRow extends Record<string, unknown> {
  id: string;
  course_id: string;
  formation_id: string;
  chapter_id: string;
  version: number;
  title: string | null;
  content_md: string | null;
  reported: boolean;
  updated_at: Date | string;
}

async function readSection(
  tx: DbTx,
  userId: string,
  sectionId: string,
): Promise<SectionRow | undefined> {
  const rows = await tx.execute<SectionRow>(sql`
    select
      s.id::text as id,
      s.course_id::text as course_id,
      c.formation_id::text as formation_id,
      s.chapter_id::text as chapter_id,
      s.version,
      s.title,
      s.content_md,
      s.reported,
      s.updated_at
    from public.course_sections s
    join public.courses c on c.id = s.course_id
    where s.id = ${sectionId}::uuid
      and s.owner_id = ${userId}::uuid
      and c.owner_id = ${userId}::uuid
      and c.is_current
      and c.status = 'ready'
    limit 1
  `);
  return rows[0];
}

function viewOf(row: SectionRow): CourseSectionView {
  return CourseSectionView.parse({
    sectionId: row.id,
    version: row.version,
    title: row.title,
    contentMd: row.content_md,
    reported: row.reported,
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

export interface SectionEditInput extends EditBody {
  /** Route `Idempotency-Key` or an explicit key of a direct service call (ET-2). */
  requestKey?: string | null;
}

export function editCourseSection(
  ctx: ServiceContext,
  sectionId: string,
  input: SectionEditInput,
): Promise<Result<CourseSectionView>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!z.uuid().safeParse(sectionId).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de section invalide.');
    }
    const body = CourseSectionEditBody.parse({
      expectedVersion: input.expectedVersion,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.contentMd === undefined ? {} : { contentMd: input.contentMd }),
    });
    const requestKey = input.requestKey ?? null;
    if (requestKey !== null && !/^[A-Za-z0-9_-]{8,128}$/.test(requestKey)) {
      throw new AppError('VALIDATION_FAILED', 'Clé de demande invalide.');
    }

    return withTransaction(db, async (tx, outbox) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`course-section:${userId}:${sectionId}`}, 0))`,
      );
      if (requestKey !== null) {
        const replay = await tx.execute<{ id: string }>(sql`
          select s.id::text as id
          from public.course_sections s
          where s.owner_id = ${userId}::uuid and s.edit_request_key = ${requestKey}
          limit 1
        `);
        if (replay[0] !== undefined) {
          const current = await readSection(tx, userId, sectionId);
          if (current === undefined) throw new AppError('NOT_FOUND', 'Section introuvable.');
          return viewOf(current);
        }
      }

      const current = await readSection(tx, userId, sectionId);
      if (current === undefined) throw new AppError('NOT_FOUND', 'Section introuvable.');
      if (current.version !== body.expectedVersion) {
        throw new AppError('CONFLICT', 'La section a changé depuis votre lecture.', {
          errors: [
            {
              path: 'expectedVersion',
              message: `Version actuelle : ${String(current.version)}.`,
            },
          ],
        });
      }

      const nextTitle = body.title === undefined ? current.title : body.title;
      const nextContent = body.contentMd === undefined ? current.content_md : body.contentMd;
      const changed = nextTitle !== current.title || nextContent !== current.content_md;
      const clearedReport = current.reported;
      if (!changed && !clearedReport) return viewOf(current);

      await tx.execute(sql`select set_config('learny.actor', 'learner', true)`);
      const now = ctx.clock.now().toISOString();
      await tx.execute(sql`
        update public.course_sections
        set title = ${nextTitle},
            content_md = ${nextContent},
            reported = false,
            edit_request_key = ${requestKey},
            updated_at = ${now}::timestamptz
        where id = ${sectionId}::uuid and owner_id = ${userId}::uuid
      `);
      const updated = await readSection(tx, userId, sectionId);
      if (updated === undefined) throw new AppError('NOT_FOUND', 'Section introuvable.');

      const resolved = await tx.execute<{ affected_brick_ids: unknown }>(sql`
        update public.course_section_reports
        set status = 'corrected', resolved_at = ${now}::timestamptz
        where section_id = ${sectionId}::uuid
          and owner_id = ${userId}::uuid
          and status = 'open'
        returning affected_brick_ids
      `);
      const affected = new Set<string>();
      for (const row of resolved) {
        const value = row.affected_brick_ids;
        if (Array.isArray(value)) {
          for (const id of value) if (typeof id === 'string') affected.add(id);
        }
      }
      await reactivateBricks(tx, userId, [...affected]);

      outbox.add(
        'course/section-edited',
        {
          userId,
          courseId: current.course_id,
          sectionId,
          version: updated.version,
        },
        { id: `course-section-edited:${sectionId}:${String(updated.version)}` },
      );
      return viewOf(updated);
    });
  });
}
