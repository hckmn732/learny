// Integration tests of the course reading (SPEC-609 §12, CA-1 to CA-4).
//
// Real Postgres and Row Level Security with genuine `authenticated` identities. The course is
// inserted directly so the test pins the reading services instead of the generation pipeline; the
// event sink is a recorder and no Inngest call leaves the process.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Result } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { setEventSender } from '@learny/jobs';

import {
  createServiceContext,
  editCourseSection,
  getModuleCourse,
  recordCourseProgress,
  reportCourseSection,
  submitChapterSummary,
  type ServiceContext,
} from '../../src/index';

const createdUsers: string[] = [];
const NOW = '2026-11-11T12:20:00Z';
const events: { id: string; name: string; data: Record<string, unknown> }[] = [];

function contextOf(userId: string): ServiceContext {
  return createServiceContext({ userId, requestId: `req-${randomUUID()}` });
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
}

function codeOf(result: Result<unknown>): string {
  return result.ok ? 'OK' : result.error.code;
}

interface Fixture {
  a: string;
  b: string;
  formationId: string;
  moduleId: string;
  chapterId: string;
  notionId: string;
  courseId: string;
  sectionIds: string[];
  reportedSections: string[];
  brickId: string;
}

async function fixture(): Promise<Fixture> {
  return serviceDb().transaction(async (tx) => {
    const a = await createTestUser(tx, { firstName: 'Alice' });
    const b = await createTestUser(tx, { firstName: 'Bruno' });
    const programme = await createTestProgramme(tx, a.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0] ?? '';
    const chapterId = programme.chapterIds[0] ?? '';
    const notionId = programme.notionIds[0] ?? '';
    await tx.execute(sql`
      update public.formations
      set title = 'SAP S/4HANA Finance',
          default_threshold = 80
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set title = 'Comptabilité générale', status = 'open'
      where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      update public.chapters
      set title = 'Saisie des pièces comptables'
      where id = ${chapterId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${a.id}::uuid, ${moduleId}::uuid, 'open')
      on conflict (user_id, module_id) do update set status = 'open'
    `);
    const course = await tx.execute<{ id: string }>(sql`
      insert into public.courses (
        owner_id, formation_id, module_id, version, is_current, status, model, created_at, updated_at
      ) values (
        ${a.id}::uuid, ${programme.formationId}::uuid, ${moduleId}::uuid, 1, true, 'ready',
        'mock', ${NOW}::timestamptz, ${NOW}::timestamptz
      )
      returning id::text as id
    `);
    const courseId = course[0]?.id ?? '';
    const sectionIds: string[] = [];
    for (let position = 1; position <= 5; position += 1) {
      const kind = position === 5 ? 'summary_prompt' : 'text';
      const inserted = await tx.execute<{ id: string }>(sql`
        insert into public.course_sections (
          course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin,
          notion_ids, version, created_at, updated_at
        ) values (
          ${courseId}::uuid, ${a.id}::uuid, ${chapterId}::uuid, ${position},
          ${kind}::public.section_kind, ${`section-${String(position)}`},
          ${`Section ${String(position)}`},
          ${position === 5 ? null : `Contenu de la section ${String(position)}.`},
          'resource', ${`{${notionId}}`}::uuid[], 1, ${NOW}::timestamptz, ${NOW}::timestamptz
        )
        returning id::text as id
      `);
      sectionIds.push(inserted[0]?.id ?? '');
    }
    const resource = await tx.execute<{ id: string }>(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, title, mime, status, storage_path, created_at,
        updated_at
      ) values (
        ${a.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid, 'pdf',
        'Guide FI', 'application/pdf', 'ready', ${`${a.id}/${randomUUID()}/guide.pdf`},
        ${NOW}::timestamptz, ${NOW}::timestamptz
      )
      returning id::text as id
    `);
    const chunk = await tx.execute<{ id: string }>(sql`
      insert into public.resource_chunks (
        resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count
      ) values (
        ${resource[0]?.id ?? ''}::uuid, ${a.id}::uuid, ${programme.formationId}::uuid,
        ${chapterId}::uuid, 0, 'Toute écriture comptable est une pièce.',
        '{"page":4,"charStart":0,"charEnd":40}'::jsonb, 10
      )
      returning id::text as id
    `);
    await tx.execute(sql`
      insert into public.citations (
        section_id, owner_id, chunk_id, resource_id, quote, location, label, media_kind, created_at
      ) values (
        ${sectionIds[0] ?? ''}::uuid, ${a.id}::uuid, ${chunk[0]?.id ?? ''}::uuid,
        ${resource[0]?.id ?? ''}::uuid, 'Toute écriture comptable est une pièce.',
        '{"page":4}'::jsonb, 'Guide FI', 'pdf', ${NOW}::timestamptz
      )
    `);
    const brick = await tx.execute<{ id: string }>(sql`
      insert into public.bricks (
        owner_id, formation_id, type, notion_ids, purpose, status, current_version, created_at
      ) values (
        ${a.id}::uuid, ${programme.formationId}::uuid, 'text', ${`{${notionId}}`}::uuid[],
        'bank', 'active', 1, ${NOW}::timestamptz
      )
      returning id::text as id
    `);
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${a.id}::uuid, 'active', '2030-01-01T00:00:00Z')
      on conflict (user_id) do update set status = 'active'
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', current_formation_id = ${programme.formationId}::uuid
      where id = ${a.id}::uuid
    `);
    return {
      a: a.id,
      b: b.id,
      formationId: programme.formationId,
      moduleId,
      chapterId,
      notionId,
      courseId,
      sectionIds,
      reportedSections: [sectionIds[1] ?? ''],
      brickId: brick[0]?.id ?? '',
    };
  });
}

async function countRows(table: string, where: string, value: string): Promise<number> {
  const rows = await serviceDb().execute<{ total: number }>(
    sql.raw(`select count(*)::int as total from public.${table} where ${where} = '${value}'`),
  );
  return rows[0]?.total ?? 0;
}

function eventNames(name: string): number {
  return events.filter((event) => event.name === name).length;
}

beforeAll(() => {
  setEventSender({
    send: (batch) => {
      events.push(...batch);
      return Promise.resolve();
    },
  });
});

afterAll(async () => {
  setEventSender(undefined);
  for (const userId of createdUsers.splice(0)) {
    await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
  }
  await closeDb();
});

describe('[SPEC-609] lecture du cours', () => {
  it('CA-2, CA-4 — progression monotone, résumé corrigé et rejeu sans doublon', async () => {
    const f = await fixture();
    createdUsers.push(f.a, f.b);
    const ctx = contextOf(f.a);

    const sixty = unwrap(
      await recordCourseProgress(ctx, f.courseId, {
        chapterId: f.chapterId,
        visibleSectionIds: f.sectionIds.slice(0, 3),
      }),
    );
    expect(sixty).toMatchObject({ chapterPercent: 60, coursePercent: 60 });
    const forty = unwrap(
      await recordCourseProgress(ctx, f.courseId, {
        chapterId: f.chapterId,
        visibleSectionIds: f.sectionIds.slice(0, 2),
      }),
    );
    expect(forty.chapterPercent).toBe(60);
    const screen = unwrap(await getModuleCourse(ctx, f.moduleId, f.chapterId));
    expect(screen.course?.progress.chapterPercent).toBe(60);
    expect(screen.course?.sections[0]?.citations[0]).toMatchObject({
      label: 'Guide FI',
      location: { page: 4 },
      deleted: false,
    });
    expect(eventNames('course/progress-updated')).toBe(1);

    const summary = unwrap(
      await submitChapterSummary(ctx, f.chapterId, {
        courseId: f.courseId,
        text: 'Une pièce a un en-tête et des postes. La clé 40 débite, la clé 50 crédite.',
        requestKey: 'summary-key-0001',
      }),
    );
    expect(summary).toMatchObject({
      chapterId: f.chapterId,
      courseId: f.courseId,
      status: 'corrected',
      feedback: { verdict: 'partial' },
    });
    expect(summary.feedback?.missing.length).toBeGreaterThan(0);

    const replay = unwrap(
      await submitChapterSummary(ctx, f.chapterId, {
        courseId: f.courseId,
        text: 'Texte rejoué mais ignoré.',
        requestKey: 'summary-key-0001',
      }),
    );
    expect(replay.id).toBe(summary.id);
    expect(await countRows('chapter_summaries', 'user_id', f.a)).toBe(1);
    expect(eventNames('course/summary-submitted')).toBe(1);

    // CA-4 — an invalid body writes nothing.
    const before = await countRows('chapter_summaries', 'user_id', f.a);
    expect(
      codeOf(
        await submitChapterSummary(ctx, f.chapterId, {
          courseId: f.courseId,
          text: '   ',
        }),
      ),
    ).toBe('VALIDATION_FAILED');
    expect(await countRows('chapter_summaries', 'user_id', f.a)).toBe(before);
  });

  it('CA-3, CA-4 — correction versionnée, signalement exclu des tirages et 404 RLS', async () => {
    const f = await fixture();
    createdUsers.push(f.a, f.b);
    const ctx = contextOf(f.a);
    const sectionId = f.sectionIds[0] ?? '';

    const edited = unwrap(
      await editCourseSection(ctx, sectionId, {
        expectedVersion: 1,
        contentMd: 'Contenu corrigé par l’apprenant.',
        requestKey: 'edit-key-0001',
      }),
    );
    expect(edited).toMatchObject({ sectionId, version: 2, contentMd: 'Contenu corrigé par l’apprenant.' });
    const replay = unwrap(
      await editCourseSection(ctx, sectionId, {
        expectedVersion: 1,
        contentMd: 'Rejeu ignoré.',
        requestKey: 'edit-key-0001',
      }),
    );
    expect(replay.version).toBe(2);
    expect(
      codeOf(
        await editCourseSection(ctx, sectionId, {
          expectedVersion: 1,
          contentMd: 'Version obsolète.',
          requestKey: 'edit-key-0002',
        }),
      ),
    ).toBe('CONFLICT');

    const reportedSection = f.reportedSections[0] ?? '';
    const report = unwrap(
      await reportCourseSection(ctx, reportedSection, {
        reason: 'La clé 40 est décrite à l’envers.',
        requestKey: 'report-key-0001',
      }),
    );
    expect(report).toMatchObject({ sectionId: reportedSection, status: 'open', reported: true });
    const reportReplay = unwrap(
      await reportCourseSection(ctx, reportedSection, {
        reason: 'Rejeu.',
        requestKey: 'report-key-0001',
      }),
    );
    expect(reportReplay.reportId).toBe(report.reportId);
    expect(await countRows('course_section_reports', 'section_id', reportedSection)).toBe(1);
    expect(eventNames('course/section-reported')).toBe(1);

    const brick = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.bricks where id = ${f.brickId}::uuid
    `);
    expect(brick[0]?.status).toBe('reported');

    const corrected = unwrap(
      await editCourseSection(ctx, reportedSection, {
        expectedVersion: 1,
        contentMd: 'La clé 40 débite, la clé 50 crédite.',
        requestKey: 'edit-key-0003',
      }),
    );
    expect(corrected).toMatchObject({ version: 2, reported: false });
    const reportStatus = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status
      from public.course_section_reports where id = ${report.reportId}::uuid
    `);
    expect(reportStatus[0]?.status).toBe('corrected');
    const restored = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.bricks where id = ${f.brickId}::uuid
    `);
    expect(restored[0]?.status).toBe('active');

    const stranger = contextOf(f.b);
    expect(codeOf(await recordCourseProgress(stranger, f.courseId, {
      chapterId: f.chapterId,
      visibleSectionIds: [sectionId],
    }))).toBe('NOT_FOUND');
    expect(codeOf(await editCourseSection(stranger, sectionId, {
      expectedVersion: 2,
      contentMd: 'Intrusion.',
      requestKey: 'edit-key-stranger',
    }))).toBe('NOT_FOUND');
    expect(codeOf(await reportCourseSection(stranger, sectionId, {
      reason: 'Intrusion.',
      requestKey: 'report-key-stranger',
    }))).toBe('NOT_FOUND');
    expect(codeOf(await submitChapterSummary(stranger, f.chapterId, {
      courseId: f.courseId,
      text: 'Intrusion.',
      requestKey: 'summary-key-stranger',
    }))).toBe('NOT_FOUND');
  });
});
