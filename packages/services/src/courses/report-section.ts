import { z } from 'zod';

import {
  CourseSectionReportBody,
  CourseSectionReportView,
  type CourseSectionReportBody as ReportBody,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { suspendBricksForNotions } from './section-bricks';

// SPEC-609 EF-4, ET-2, ET-4, BR-COU-09, BR-MEM-09 — reporting a section keeps it readable,
// archives the reason, excludes it from new quiz draws and suspends the bank bricks of its notions
// until a correction. A second report of the same section returns the open one: no duplicate row,
// no duplicate brick suspension and no second event.

interface SectionRow extends Record<string, unknown> {
  id: string;
  course_id: string;
  formation_id: string;
  notion_ids: unknown;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value === 'string') {
    return value
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((entry) => entry.trim().replace(/^"|"$/g, ''))
      .filter((entry) => entry !== '');
  }
  return [];
}

export interface SectionReportInput extends ReportBody {
  /** Route `Idempotency-Key` or an explicit key of a direct service call (ET-2). */
  requestKey?: string | null;
}

export function reportCourseSection(
  ctx: ServiceContext,
  sectionId: string,
  input: SectionReportInput,
): Promise<Result<CourseSectionReportView>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!z.uuid().safeParse(sectionId).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de section invalide.');
    }
    const body = CourseSectionReportBody.parse({ reason: input.reason });
    const requestKey = input.requestKey ?? null;
    if (requestKey !== null && !/^[A-Za-z0-9_-]{8,128}$/.test(requestKey)) {
      throw new AppError('VALIDATION_FAILED', 'Clé de demande invalide.');
    }

    return withTransaction(db, async (tx, outbox) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`course-section-report:${userId}:${sectionId}`}, 0))`,
      );
      if (requestKey !== null) {
        const replay = await tx.execute<{
          id: string;
          section_id: string;
          created_at: Date | string;
        }>(sql`
          select id::text as id, section_id::text as section_id, created_at
          from public.course_section_reports
          where owner_id = ${userId}::uuid and request_key = ${requestKey}
          limit 1
        `);
        if (replay[0] !== undefined) {
          return CourseSectionReportView.parse({
            reportId: replay[0].id,
            sectionId: replay[0].section_id,
            status: 'open',
            reported: true,
            createdAt: new Date(replay[0].created_at).toISOString(),
          });
        }
      }

      const open = await tx.execute<{ id: string; created_at: Date | string }>(sql`
        select id::text as id, created_at
        from public.course_section_reports
        where section_id = ${sectionId}::uuid
          and owner_id = ${userId}::uuid
          and status = 'open'
        order by created_at desc, id desc
        limit 1
      `);
      if (open[0] !== undefined) {
        return CourseSectionReportView.parse({
          reportId: open[0].id,
          sectionId,
          status: 'open',
          reported: true,
          createdAt: new Date(open[0].created_at).toISOString(),
        });
      }

      const sections = await tx.execute<SectionRow>(sql`
        select
          s.id::text as id,
          s.course_id::text as course_id,
          c.formation_id::text as formation_id,
          s.notion_ids
        from public.course_sections s
        join public.courses c on c.id = s.course_id
        where s.id = ${sectionId}::uuid
          and s.owner_id = ${userId}::uuid
          and c.owner_id = ${userId}::uuid
          and c.is_current
          and c.status = 'ready'
        limit 1
      `);
      const section = sections[0];
      if (section === undefined) throw new AppError('NOT_FOUND', 'Section introuvable.');

      const affected = await suspendBricksForNotions(
        tx,
        userId,
        section.formation_id,
        asStringArray(section.notion_ids),
      );
      const now = ctx.clock.now().toISOString();
      await tx.execute(sql`
        update public.course_sections
        set reported = true, updated_at = ${now}::timestamptz
        where id = ${sectionId}::uuid and owner_id = ${userId}::uuid
      `);
      const inserted = await tx.execute<{ id: string; created_at: Date | string }>(sql`
        insert into public.course_section_reports (
          owner_id, section_id, reason, affected_brick_ids, request_key, created_at
        ) values (
          ${userId}::uuid, ${sectionId}::uuid, ${body.reason},
          ${`{${affected.join(',')}}`}::uuid[], ${requestKey},
          ${now}::timestamptz
        )
        returning id::text as id, created_at
      `);
      const report = inserted[0];
      if (report === undefined) throw new AppError('INTERNAL_ERROR', 'Signalement non enregistré.');

      outbox.add(
        'course/section-reported',
        {
          userId,
          courseId: section.course_id,
          sectionId,
          reportId: report.id,
        },
        { id: `course-section-reported:${report.id}` },
      );
      return CourseSectionReportView.parse({
        reportId: report.id,
        sectionId,
        status: 'open',
        reported: true,
        createdAt: new Date(report.created_at).toISOString(),
      });
    });
  });
}
