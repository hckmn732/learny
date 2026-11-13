// Integration tests of the course generation (SPEC-608 §12, CA-1 to CA-4).
//
// Real Postgres and Row Level Security with genuine `authenticated` identities. Each test builds its
// own users and programme. The event sink is a recorder, so no Inngest call leaves the process; the
// job itself is executed inline to cover the `chapter/contributions-completed` trigger.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Result } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { executeFunctionInline, generateCourseJob, setEventSender } from '@learny/jobs';

import {
  createServiceContext,
  generateCourse,
  getModuleCourse,
  type ServiceContext,
} from '../../src/index';

const createdUsers: string[] = [];
const NOW = '2026-11-11T12:20:00Z';

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
  chapters: [string, string];
  chunkId: string;
}

async function fixture(): Promise<Fixture> {
  return serviceDb().transaction(async (tx) => {
    const a = await createTestUser(tx, { firstName: 'Alice' });
    const b = await createTestUser(tx, { firstName: 'Bruno' });
    const programme = await createTestProgramme(tx, a.id, {
      modules: 1,
      chaptersPerModule: 2,
      notionsPerChapter: 1,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0] ?? '';
    const first = programme.chapterIds[0] ?? '';
    const second = programme.chapterIds[1] ?? '';
    await tx.execute(sql`
      update public.formations
      set title = 'SAP S/4HANA Finance',
          description = 'Comprendre la comptabilité générale de SAP S/4HANA.',
          volume_hours = 150,
          start_date = '2026-11-02',
          end_date = '2026-12-11',
          default_threshold = 80
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set title = 'Comptabilité générale',
          status = 'open',
          planned_start = '2026-11-02',
          planned_end = '2026-12-11'
      where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${a.id}::uuid, ${moduleId}::uuid, 'open')
      on conflict (user_id, module_id) do update set status = 'open'
    `);
    await tx.execute(sql`
      update public.chapters
      set title = case when position = 1 then 'Saisie des pièces comptables' else 'Journal universel (ACDOCA)' end
      where module_id = ${moduleId}::uuid
    `);
    const resource = await tx.execute<{ id: string }>(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, title, mime, status, storage_path
      ) values (
        ${a.id}::uuid, ${programme.formationId}::uuid, ${first}::uuid,
        'pdf', 'Guide utilisateur FI — saisie.pdf', 'application/pdf', 'ready',
        ${`${a.id}/${randomUUID()}/guide.pdf`}
      )
      returning id::text as id
    `);
    const resourceId = resource[0]?.id ?? '';
    const chunk = await tx.execute<{ id: string }>(sql`
      insert into public.resource_chunks (
        resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count
      ) values (
        ${resourceId}::uuid, ${a.id}::uuid, ${programme.formationId}::uuid, ${first}::uuid,
        0,
        'Toute écriture comptable dans SAP S/4HANA est enregistrée sous forme de pièce. Une pièce réunit un en-tête et des postes.',
        '{"page":2,"charStart":0,"charEnd":120}'::jsonb,
        30
      )
      returning id::text as id
    `);
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${a.id}::uuid, 'active', '2030-01-01T00:00:00Z')
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
      chapters: [first, second],
      chunkId: chunk[0]?.id ?? '',
    };
  });
}

async function outboxCount(userId: string, name: string): Promise<number> {
  const rows = await serviceDb().execute<{ total: number }>(sql`
    select count(*)::int as total
    from public.event_outbox
    where user_id = ${userId}::uuid and name = ${name}
  `);
  return rows[0]?.total ?? 0;
}

beforeAll(() => {
  setEventSender({ send: () => Promise.resolve() });
});

afterAll(async () => {
  setEventSender(undefined);
  for (const userId of createdUsers.splice(0)) {
    await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
  }
  await closeDb();
});

describe('[SPEC-608] génération du cours', () => {
  it('CA-1, CA-2, CA-4 — rédige les chapitres, vérifie les citations et ne duplique rien', async () => {
    const f = await fixture();
    createdUsers.push(f.a, f.b);
    const key = `course-generation:${f.moduleId}:auto:1`;

    // The real job handler, triggered by the chapter-completed event.
    const run = await executeFunctionInline(generateCourseJob, {
      id: key,
      name: 'chapter/contributions-completed',
      data: { userId: f.a, moduleId: f.moduleId, chapterId: null, force: true },
      ts: 0,
    });
    expect(run.status).toBe('completed');

    const courses = await serviceDb().execute<{
      id: string;
      version: number;
      status: string;
      is_current: boolean;
    }>(sql`
      select id::text as id, version, status::text as status, is_current
      from public.courses
      where owner_id = ${f.a}::uuid and module_id = ${f.moduleId}::uuid
      order by version asc
    `);
    expect(courses).toHaveLength(1);
    expect(courses[0]).toMatchObject({ version: 1, status: 'ready', is_current: true });

    const sections = await serviceDb().execute<{ kind: string; origin: string; id: string }>(sql`
      select kind::text as kind, origin::text as origin, id::text as id
      from public.course_sections
      where course_id = ${courses[0]?.id ?? ''}::uuid and chapter_id = ${f.chapters[0]}::uuid
      order by position asc
    `);
    expect(sections.map((section) => section.kind)).toEqual([
      'text',
      'flash_question',
      'text',
      'text',
      'dont_confuse',
      'tutor_completed',
      'retain',
      'summary_prompt',
    ]);
    expect(sections.some((section) => section.origin === 'tutor')).toBe(true);

    const citations = await serviceDb().execute<{
      chunk_id: string;
      owner_id: string;
      resource_id: string;
    }>(sql`
      select chunk_id::text as chunk_id, owner_id::text as owner_id, resource_id::text as resource_id
      from public.citations
      where owner_id = ${f.a}::uuid
    `);
    expect(citations).toHaveLength(3);
    expect(new Set(citations.map((citation) => citation.chunk_id))).toEqual(new Set([f.chunkId]));
    expect(citations.every((citation) => citation.owner_id === f.a)).toBe(true);

    const retain = await serviceDb().execute<{ points: unknown }>(sql`
      select data -> 'points' as points
      from public.course_sections
      where course_id = ${courses[0]?.id ?? ''}::uuid and kind = 'retain'
      limit 1
    `);
    expect(Array.isArray(retain[0]?.points)).toBe(true);
    expect((retain[0]?.points as unknown[]).length).toBe(4);

    // The second chapter has no contribution: it is a flagged base course with suggestions.
    const baseSections = await serviceDb().execute<{ origin: string; citations: number }>(sql`
      select s.origin::text as origin,
             (select count(*)::int from public.citations c where c.section_id = s.id) as citations
      from public.course_sections s
      where s.course_id = ${courses[0]?.id ?? ''}::uuid and s.chapter_id = ${f.chapters[1]}::uuid
    `);
    expect(baseSections.length).toBeGreaterThan(0);
    expect(baseSections.every((section) => section.origin === 'tutor')).toBe(true);
    expect(baseSections.every((section) => section.citations === 0)).toBe(true);
    const suggestions = await serviceDb().execute<{ total: number }>(sql`
      select count(*)::int as total
      from public.resources
      where owner_id = ${f.a}::uuid and chapter_id = ${f.chapters[1]}::uuid
        and origin = 'tutor_suggestion' and suggestion_status = 'pending'
    `);
    expect(suggestions[0]?.total).toBe(2);

    // Read model and RLS.
    const screen = unwrap(await getModuleCourse(contextOf(f.a), f.moduleId, f.chapters[0]));
    expect(screen.course?.baseCourse).toBe(false);
    expect(screen.course?.sections.flatMap((section) => section.citations)[0]?.label).toContain(
      'Guide utilisateur FI',
    );
    expect(screen.course?.version).toBe(1);
    expect(codeOf(await getModuleCourse(contextOf(f.b), f.moduleId))).toBe('NOT_FOUND');
    expect(
      codeOf(
        await generateCourse(contextOf(f.b), {
          moduleId: f.moduleId,
          generationKey: `course-generation:${f.moduleId}:force:other`,
        }),
      ),
    ).toBe('NOT_FOUND');

    // Same key: no second version and no second event.
    const replay = unwrap(
      await generateCourse(contextOf(f.a), { moduleId: f.moduleId, generationKey: key }),
    );
    expect(replay).toMatchObject({ created: false, version: 1 });
    expect(await outboxCount(f.a, 'course/generated')).toBe(1);
    expect(await outboxCount(f.a, 'notification/requested')).toBe(1);

    // Invalid input creates nothing.
    expect(
      codeOf(await generateCourse(contextOf(f.a), { moduleId: f.moduleId, generationKey: '' })),
    ).toBe('VALIDATION_FAILED');
    expect(
      codeOf(await generateCourse(contextOf(f.a), { moduleId: 'not-a-uuid', generationKey: 'y' })),
    ).toBe('VALIDATION_FAILED');
  });

  it('CA-3 — régénère N+1, préserve N et laisse N active après une sortie invalide', async () => {
    const f = await fixture();
    createdUsers.push(f.a);
    const first = unwrap(
      await generateCourse(contextOf(f.a), {
        moduleId: f.moduleId,
        generationKey: `course-generation:${f.moduleId}:auto:1`,
      }),
    );
    expect(first.version).toBe(1);

    const second = unwrap(
      await generateCourse(contextOf(f.a), {
        moduleId: f.moduleId,
        generationKey: `course-generation:${f.moduleId}:auto:2`,
      }),
    );
    expect(second.version).toBe(2);

    const versions = await serviceDb().execute<{
      id: string;
      version: number;
      is_current: boolean;
      status: string;
    }>(sql`
      select id::text as id, version, is_current, status::text as status
      from public.courses
      where owner_id = ${f.a}::uuid and module_id = ${f.moduleId}::uuid
      order by version asc
    `);
    expect(versions.map((version) => [version.version, version.is_current])).toEqual([
      [1, false],
      [2, true],
    ]);
    const firstCitations = await serviceDb().execute<{ total: number }>(sql`
      select count(*)::int as total
      from public.citations c
      join public.course_sections s on s.id = c.section_id
      where s.course_id = ${versions[0]?.id ?? ''}::uuid
    `);
    expect(firstCitations[0]?.total).toBe(3);

    const invalid = await generateCourse(
      contextOf(f.a),
      {
        moduleId: f.moduleId,
        generationKey: `course-generation:${f.moduleId}:auto:3`,
      },
      { deps: { scenario: 'course-invalid' } },
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('AI_TASK_FAILED');

    const after = await serviceDb().execute<{
      version: number;
      is_current: boolean;
      status: string;
      error: string | null;
    }>(sql`
      select version, is_current, status::text as status, error
      from public.courses
      where owner_id = ${f.a}::uuid and module_id = ${f.moduleId}::uuid
      order by version asc
    `);
    expect(after).toHaveLength(3);
    expect(after[1]).toMatchObject({ version: 2, is_current: true, status: 'ready' });
    expect(after[2]).toMatchObject({ version: 3, is_current: false, status: 'failed' });
    expect(await outboxCount(f.a, 'course/generated')).toBe(2);
    const screen = unwrap(await getModuleCourse(contextOf(f.a), f.moduleId, f.chapters[1]));
    expect(screen.course?.version).toBe(2);
    expect(screen.course?.baseCourse).toBe(true);
    expect(screen.course?.suggestions.length).toBe(2);
  });

  it('CA-2 — un chapitre vide reste un cours de base sans citation ni source inventée', async () => {
    const f = await fixture();
    createdUsers.push(f.a);
    await serviceDb().execute(sql`
      update public.resources set deleted_at = ${NOW}::timestamptz
      where owner_id = ${f.a}::uuid
    `);
    const result = unwrap(
      await generateCourse(contextOf(f.a), {
        moduleId: f.moduleId,
        generationKey: `course-generation:${f.moduleId}:auto:base`,
      }),
    );
    const citations = await serviceDb().execute<{ total: number }>(sql`
      select count(*)::int as total
      from public.citations
      where owner_id = ${f.a}::uuid
    `);
    expect(result.status).toBe('ready');
    expect(citations[0]?.total).toBe(0);
    const screen = unwrap(await getModuleCourse(contextOf(f.a), f.moduleId, f.chapters[0]));
    expect(screen.course?.baseCourse).toBe(true);
    expect(screen.course?.suggestions.length).toBe(2);
  });
});
