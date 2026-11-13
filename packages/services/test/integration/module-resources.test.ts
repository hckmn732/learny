// Integration tests of SCR-06 (SPEC-607 §12, CA-2 to CA-4).
//
// Real Postgres and Row Level Security with genuine `authenticated` identities. Each test builds
// its own users and programme; the suite removes them at the end. The event sink is a recorder, so
// no Inngest call leaves the process.
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppError, type Result } from '@learny/core';
import {
  closeDb,
  createGroup,
  joinGroup,
  serviceDb,
  sql,
} from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { setEventSender } from '@learny/jobs';

import {
  completeChapter,
  createResource,
  createServiceContext,
  deleteResource,
  dismissSuggestion,
  generateCourseNow,
  getModuleScreen,
  importSuggestion,
  renameResource,
  type ResourceDeps,
  type ServiceContext,
} from '../../src/index';

const createdUsers: string[] = [];

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

function deps(): ResourceDeps {
  return {
    gateway: { signRead: () => Promise.reject(new Error('unused')) } as never,
    reader: { info: () => Promise.resolve(null), read: () => Promise.resolve(null) },
    events: {
      emitUploaded: () => Promise.resolve(),
    },
    accessToken: (userId: string) => `token:${userId}`,
  };
}

interface Fixture {
  a: string;
  b: string;
  outsider: string;
  formationId: string;
  moduleId: string;
  chapters: string[];
}

async function fixture(options: { shared?: boolean } = {}): Promise<Fixture> {
  return serviceDb().transaction(async (tx) => {
    const a = await createTestUser(tx, { firstName: 'Alice' });
    const b = await createTestUser(tx, { firstName: 'Bruno' });
    const outsider = await createTestUser(tx, { firstName: 'Clara' });
    const programme = await createTestProgramme(tx, a.id, {
      modules: 1,
      chaptersPerModule: 4,
      notionsPerChapter: 1,
      title: 'Module et apports',
    });
    const moduleId = programme.moduleIds[0] ?? '';
    await tx.execute(sql`
      update public.formations
      set start_date = '2026-11-02', end_date = '2026-12-11'
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set status = 'open',
          planned_start = '2026-11-02',
          planned_end = '2026-12-11'
      where id = ${moduleId}::uuid
    `);
    for (const userId of [a.id, b.id]) {
      await tx.execute(sql`
        insert into public.module_progress (user_id, module_id, status)
        values (${userId}::uuid, ${moduleId}::uuid, 'open')
        on conflict (user_id, module_id) do update set status = 'open'
      `);
    }
    if (options.shared !== false) {
      const group = await createGroup(tx, {
        formationId: programme.formationId,
        ownerId: a.id,
        now: new Date('2026-11-11T12:20:00Z'),
      });
      await joinGroup(tx, {
        inviteCode: group.inviteCode,
        userId: b.id,
        now: new Date('2026-11-11T12:20:00Z'),
      });
    }
    return {
      a: a.id,
      b: b.id,
      outsider: outsider.id,
      formationId: programme.formationId,
      moduleId,
      chapters: programme.chapterIds,
    };
  });
}

function chapterOf(f: Fixture, index = 0): string {
  const chapter = f.chapters[index];
  if (chapter === undefined) throw new Error('chapitre absent');
  return chapter;
}

beforeAll(() => {
  setEventSender({ send: () => Promise.resolve() });
});

afterAll(async () => {
  setEventSender(undefined);
  for (const userId of createdUsers.splice(0)) {
    await serviceDb().execute(sql`delete from public.groups where owner_id = ${userId}::uuid`);
    await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
  }
  await closeDb();
});

describe('[SPEC-607] module et apports', () => {
  it('CA-2 — ajoute une note et un lien, les renomme, puis supprime avec citation conservée', async () => {
    const f = await fixture({ shared: false });
    createdUsers.push(f.a, f.b, f.outsider);
    const chapter = chapterOf(f);
    const note = unwrap(
      await createResource(contextOf(f.a), chapter, {
        kind: 'note',
        title: 'Note initiale',
        text: 'Le grand livre et le plan comptable.',
      }),
    );
    const web = unwrap(
      await createResource(contextOf(f.a), chapter, {
        kind: 'web',
        url: 'https://example.test/article',
        title: 'Article',
      }),
    );
    let screen = unwrap(await getModuleScreen(contextOf(f.a), f.moduleId));
    expect(screen.resources.map((resource) => resource.id)).toEqual(
      expect.arrayContaining([note.id, web.id]),
    );
    expect(screen.resources.every((resource) => resource.status === 'queued')).toBe(true);
    expect(screen.counts.chapterResources).toBe(2);

    // Rename keeps the passages and citations of the note.
    await serviceDb().execute(sql`
      insert into public.resource_chunks (
        resource_id, owner_id, formation_id, chapter_id, position, text, location
      )
      values (
        ${note.id}::uuid, ${f.a}::uuid, ${f.formationId}::uuid, ${chapter}::uuid,
        0, 'Le grand livre', '{"charStart":0,"charEnd":14}'::jsonb
      )
    `);
    const renamed = unwrap(
      await renameResource(contextOf(f.a), note.id, { title: 'Note renommée' }),
    );
    expect(renamed.title).toBe('Note renommée');
    expect(
      await serviceDb().execute<{ total: number }>(
        sql`select count(*)::int as total from public.resource_chunks where resource_id = ${note.id}::uuid`,
      ).then((rows) => rows[0]?.total),
    ).toBe(1);

    // A citation that points at the note survives the deletion as « source supprimée ».
    const course = await serviceDb().execute<{ id: string }>(sql`
      insert into public.courses (owner_id, formation_id, module_id, version, status)
      values (${f.a}::uuid, ${f.formationId}::uuid, ${f.moduleId}::uuid, 1, 'ready')
      returning id::text as id
    `);
    const section = await serviceDb().execute<{ id: string }>(sql`
      insert into public.course_sections (
        course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin
      )
      values (
        ${course[0]?.id ?? ''}::uuid, ${f.a}::uuid, ${chapter}::uuid,
        1, 'text', 'note', 'Section', 'Texte', 'tutor'
      )
      returning id::text as id
    `);
    await serviceDb().execute(sql`
      insert into public.citations (
        section_id, owner_id, resource_id, quote, label, media_kind
      )
      values (
        ${section[0]?.id ?? ''}::uuid, ${f.a}::uuid, ${note.id}::uuid,
        'Le grand livre', 'Note initiale', 'note'
      )
    `);
    unwrap(await deleteResource(contextOf(f.a), deps(), note.id));
    const citations = await serviceDb().execute<{ label: string; chunk_id: string | null }>(sql`
      select label, chunk_id::text as chunk_id
      from public.citations where resource_id = ${note.id}::uuid
    `);
    expect(citations[0]?.label).toBe('source supprimée');
    expect(citations[0]?.chunk_id).toBeNull();
    screen = unwrap(await getModuleScreen(contextOf(f.a), f.moduleId));
    expect(screen.resources.some((resource) => resource.id === note.id)).toBe(false);
  });

  it('CA-3 — importer ou ignorer une suggestion ne crée jamais d’apport silencieux', async () => {
    const f = await fixture({ shared: false });
    createdUsers.push(f.a, f.b, f.outsider);
    const chapter = chapterOf(f);
    async function suggestion(title: string, url: string) {
      const rows = await serviceDb().execute<{ id: string }>(sql`
        insert into public.resources (
          owner_id, formation_id, chapter_id, kind, origin, suggestion_status, title, url, status,
          metadata
        )
        values (
          ${f.a}::uuid, ${f.formationId}::uuid, ${chapter}::uuid, 'web', 'tutor_suggestion',
          'pending', ${title}, ${url}, 'queued',
          '{"suggestionReason":"Une synthèse utile pour ce chapitre."}'::jsonb
        )
        returning id::text as id
      `);
      return rows[0]?.id ?? '';
    }
    const imported = await suggestion('Guide web', 'https://example.test/guide');
    const ignored = await suggestion('À ignorer', 'https://example.test/ignored');
    let screen = unwrap(await getModuleScreen(contextOf(f.a), f.moduleId));
    expect(screen.suggestions).toHaveLength(2);

    const decision = unwrap(await importSuggestion(contextOf(f.a), imported));
    expect(decision.status).toBe('imported');
    expect(decision.resourceId).not.toBeNull();
    unwrap(await dismissSuggestion(contextOf(f.a), ignored));
    screen = unwrap(await getModuleScreen(contextOf(f.a), f.moduleId));
    expect(screen.suggestions).toHaveLength(0);
    expect(screen.resources.some((resource) => resource.id === decision.resourceId)).toBe(true);
    expect(screen.resources.some((resource) => resource.title === 'À ignorer')).toBe(false);
    const events = await serviceDb().execute<{ total: number }>(sql`
      select count(*)::int as total from public.event_outbox
      where user_id = ${f.a}::uuid and name = 'resource/uploaded'
    `);
    expect(events[0]?.total).toBe(1);
  });

  it('CA-3, CL-5 — tous les chapitres terminés émettent une seule demande de génération', async () => {
    const f = await fixture({ shared: false });
    createdUsers.push(f.a, f.b, f.outsider);
    for (const [index, chapter] of f.chapters.entries()) {
      const result = unwrap(
        await completeChapter(contextOf(f.a), chapter, { done: true }),
      );
      expect(result.chaptersDone).toBe(index + 1);
      expect(result.generationRequested).toBe(index === f.chapters.length - 1);
    }
    const events = await serviceDb().execute<{ total: number; name: string }>(sql`
      select count(*)::int as total, min(name) as name
      from public.event_outbox
      where user_id = ${f.a}::uuid
    `);
    expect(events[0]).toEqual({
      total: 1,
      name: 'chapter/contributions-completed',
    });
    // A second click is a no-op: no second event, no change.
    const replay = unwrap(
      await completeChapter(contextOf(f.a), chapterOf(f, 3), { done: true }),
    );
    expect(replay.generationRequested).toBe(false);
    const after = await serviceDb().execute<{ total: number }>(sql`
      select count(*)::int as total from public.event_outbox where user_id = ${f.a}::uuid
    `);
    expect(after[0]?.total).toBe(1);
    // The explicit demand is accepted while a chapter is open.
    unwrap(await completeChapter(contextOf(f.a), chapterOf(f, 0), { done: false }));
    const forced = unwrap(await generateCourseNow(contextOf(f.a), f.moduleId));
    expect(forced.requested).toBe(true);
  });

  it('CA-4 — un autre utilisateur reçoit 404, même membre du groupe, et les données restent privées', async () => {
    const f = await fixture();
    createdUsers.push(f.a, f.b, f.outsider);
    const chapter = chapterOf(f);
    const note = unwrap(
      await createResource(contextOf(f.a), chapter, {
        kind: 'note',
        title: 'Note privée',
        text: 'Contenu privé.',
      }),
    );
    // The member shares the module but never sees the other's apport.
    const member = unwrap(await getModuleScreen(contextOf(f.b), f.moduleId));
    expect(member.resources).toHaveLength(0);
    expect(member.chapters[0]?.resourceCount).toBe(0);
    // The outsider cannot read the module at all.
    expect(codeOf(await getModuleScreen(contextOf(f.outsider), f.moduleId))).toBe('NOT_FOUND');
    // The member cannot rename the other's apport.
    expect(codeOf(await renameResource(contextOf(f.b), note.id, { title: 'Vol' }))).toBe(
      'NOT_FOUND',
    );
    // Two identical retries or completions leave one effect: a second completion is a no-op.
    const first = unwrap(await completeChapter(contextOf(f.a), chapter, { done: true }));
    const second = unwrap(await completeChapter(contextOf(f.a), chapter, { done: true }));
    expect(first.chaptersDone).toBe(second.chaptersDone);
    expect(second.generationRequested).toBe(false);
  });
});
