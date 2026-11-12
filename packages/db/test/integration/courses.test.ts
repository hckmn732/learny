// Integration tests of the course and tutor-discussion schema (SPEC-105 §12): introspection,
// versions and their single current row, concurrency, section revisions, citations surviving the
// deletion of their source, constraints and cascades. Every test runs against the local Supabase
// database (testing.md §3).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb, type DbTx } from '../../src/client';
import {
  createTestCourse,
  createTestProgramme,
  createTestUser,
  withRollback,
} from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const ENUMS: Record<string, string[]> = {
  course_status: ['generating', 'ready', 'failed'],
  section_kind: [
    'text',
    'flash_question',
    'dont_confuse',
    'tutor_completed',
    'retain',
    'summary_prompt',
  ],
  citation_media: ['pdf', 'audio', 'video', 'web', 'note', 'image'],
};

let savepoint = 0;

interface Failure {
  code: string;
  message: string;
}

/** SQLSTATE and messages of a Drizzle/driver error (Drizzle 0.44 wraps driver errors in `cause`). */
function failureOf(error: unknown): Failure {
  let current: unknown = error;
  let code = 'unknown';
  const messages: string[] = [];
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === 'unknown' && typeof candidate.code === 'string') code = candidate.code;
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.cause;
  }
  return { code, message: messages.join(' | ') };
}

/** Runs a statement that must fail, then restores the transaction to its savepoint. */
async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec105_${String(savepoint)}`;
  await tx.execute(sql.raw(`savepoint ${name}`));
  try {
    await run();
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return { code: '00000', message: '' };
  } catch (error) {
    await tx.execute(sql.raw(`rollback to savepoint ${name}`));
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return failureOf(error);
  }
}

function asText(row: Row, key: string): string {
  return String(row[key]);
}

interface Base {
  userId: string;
  formationId: string;
  moduleId: string;
  chapterIds: string[];
}

async function createBase(tx: DbTx): Promise<Base> {
  const user = await createTestUser(tx);
  const programme = await createTestProgramme(tx, user.id, {
    modules: 1,
    chaptersPerModule: 2,
    notionsPerChapter: 0,
  });
  return {
    userId: user.id,
    formationId: programme.formationId,
    moduleId: programme.moduleIds[0] ?? '',
    chapterIds: programme.chapterIds,
  };
}

interface CourseInput {
  ownerId: string;
  formationId: string;
  moduleId: string;
  version: number;
  isCurrent?: boolean;
  status?: string;
  model?: string | null;
  error?: string | null;
}

async function insertCourse(tx: Queryable, input: CourseInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.courses (
      owner_id, formation_id, module_id, version, is_current, status, model, error
    )
    values (
      ${input.ownerId}::uuid,
      ${input.formationId}::uuid,
      ${input.moduleId}::uuid,
      ${input.version},
      ${input.isCurrent ?? true},
      ${input.status ?? 'ready'}::public.course_status,
      ${input.model ?? null},
      ${input.error ?? null}
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('cours non créé');
  return id;
}

interface SectionInput {
  courseId: string;
  ownerId: string;
  chapterId: string;
  position: number;
  kind?: string;
  anchor?: string;
  title?: string | null;
  contentMd?: string | null;
  data?: Record<string, unknown> | null;
  origin?: string;
  version?: number;
}

async function insertSection(tx: Queryable, input: SectionInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.course_sections (
      course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, data, origin,
      version
    )
    values (
      ${input.courseId}::uuid,
      ${input.ownerId}::uuid,
      ${input.chapterId}::uuid,
      ${input.position},
      ${input.kind ?? 'text'}::public.section_kind,
      ${input.anchor ?? `section-${String(input.position)}`},
      ${input.title ?? 'Section de test'},
      ${input.contentMd ?? 'Contenu de test.'},
      ${input.data === undefined || input.data === null ? null : JSON.stringify(input.data)}::jsonb,
      ${input.origin ?? 'tutor'}::public.content_origin,
      ${input.version ?? 1}
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('section non créée');
  return id;
}

async function insertNote(
  tx: Queryable,
  input: { ownerId: string; formationId: string; chapterId: string; title?: string },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.resources (
      owner_id, formation_id, chapter_id, kind, title, content_text, status
    )
    values (
      ${input.ownerId}::uuid,
      ${input.formationId}::uuid,
      ${input.chapterId}::uuid,
      'note',
      ${input.title ?? 'Guide FI'},
      'Clés de comptabilisation : 40 = débit, 50 = crédit ?',
      'ready'
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('note non créée');
  return id;
}

async function insertChunk(
  tx: Queryable,
  resourceId: string,
  ownerId: string,
  formationId: string,
  chapterId: string,
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.resource_chunks (
      resource_id, owner_id, formation_id, chapter_id, position, text, location
    )
    values (
      ${resourceId}::uuid, ${ownerId}::uuid, ${formationId}::uuid, ${chapterId}::uuid,
      0, 'Clés de comptabilisation', '{"charStart":0,"charEnd":24}'::jsonb
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('passage non créé');
  return id;
}

interface CitationInput {
  sectionId: string;
  ownerId: string;
  chunkId?: string | null;
  resourceId?: string | null;
  label?: string;
  mediaKind?: string;
  quote?: string | null;
}

async function insertCitation(tx: Queryable, input: CitationInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.citations (
      section_id, owner_id, chunk_id, resource_id, quote, location, label, media_kind
    )
    values (
      ${input.sectionId}::uuid,
      ${input.ownerId}::uuid,
      ${input.chunkId ?? null}::uuid,
      ${input.resourceId ?? null}::uuid,
      ${input.quote ?? 'Clés de comptabilisation'},
      '{"page":4,"charStart":0,"charEnd":24}'::jsonb,
      ${input.label ?? 'Guide FI, p. 4'},
      ${input.mediaKind ?? 'pdf'}::public.citation_media
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('citation non créée');
  return id;
}

async function insertConversation(
  tx: Queryable,
  input: { userId: string; courseId: string; title?: string },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.tutor_conversations (user_id, course_id, title)
    values (
      ${input.userId}::uuid, ${input.courseId}::uuid,
      ${input.title ?? 'Comment fonctionne une clé ?'}
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('discussion non créée');
  return id;
}

async function insertMessage(
  tx: Queryable,
  input: {
    conversationId: string;
    userId: string;
    role?: string;
    content?: string;
    sources?: unknown[];
  },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.tutor_messages (
      conversation_id, user_id, role, content, sources
    )
    values (
      ${input.conversationId}::uuid,
      ${input.userId}::uuid,
      ${input.role ?? 'learner'}::public.message_role,
      ${input.content ?? 'Comment reconnaître une clé ?'},
      ${JSON.stringify(input.sources ?? [])}::jsonb
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('message non créé');
  return id;
}

async function count(tx: Queryable, table: string, where: string, value: string): Promise<number> {
  const rows = await tx.execute<Row>(sql`
    select count(*)::int as count from ${sql.raw(`public.${table}`)}
    where ${sql.raw(where)} = ${value}::uuid
  `);
  return Number(rows[0]?.count ?? -1);
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-105] cours et discussions', () => {
  it('CA-1 — les 8 tables, 3 énumérations, contraintes, index et déclencheurs existent', async () => {
    await withRollback(async (tx) => {
      const tables = await tx.execute<Row>(sql`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in (
            'courses', 'course_sections', 'course_section_revisions', 'citations',
            'reading_progress', 'chapter_summaries', 'tutor_conversations', 'tutor_messages'
          )
        order by c.relname
      `);
      expect(tables.map((row) => asText(row, 'name'))).toEqual([
        'chapter_summaries',
        'citations',
        'course_section_revisions',
        'course_sections',
        'courses',
        'reading_progress',
        'tutor_conversations',
        'tutor_messages',
      ]);
      expect(
        tables.every((row) => row.rls === true),
        'RLS activée (ADR-0112)',
      ).toBe(true);

      for (const [name, values] of Object.entries(ENUMS)) {
        const enums = await tx.execute<Row>(sql`
          select e.enumlabel as label
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          where t.typnamespace = 'public'::regnamespace and t.typname = ${name}
          order by e.enumsortorder
        `);
        expect(
          enums.map((row) => asText(row, 'label')),
          name,
        ).toEqual(values);
      }

      const constraints = await tx.execute<Row>(sql`
        select conname as name, contype as kind
        from pg_constraint
        where conrelid in (
          'public.courses'::regclass,
          'public.course_sections'::regclass,
          'public.course_section_revisions'::regclass,
          'public.citations'::regclass,
          'public.reading_progress'::regclass,
          'public.chapter_summaries'::regclass,
          'public.tutor_conversations'::regclass,
          'public.tutor_messages'::regclass
        )
      `);
      const names = constraints.map((row) => asText(row, 'name'));
      for (const expected of [
        'courses_owner_id_module_id_version_unique',
        'courses_version_check',
        'courses_failed_has_error',
        'course_sections_course_id_anchor_unique',
        'course_sections_course_id_chapter_id_position_unique',
        'course_sections_anchor_check',
        'course_section_revisions_section_id_version_unique',
        'citations_label_length_check',
        'reading_progress_percent_check',
        'reading_progress_seconds_spent_check',
        'chapter_summaries_text_length_check',
        'tutor_messages_content_length_check',
        'tutor_messages_sources_check',
      ]) {
        expect(names, expected).toContain(expected);
      }

      const indexes = await tx.execute<Row>(sql`
        select indexname as name, indexdef as definition
        from pg_indexes
        where schemaname = 'public' and tablename in (
          'courses', 'course_sections', 'course_section_revisions', 'citations',
          'reading_progress', 'chapter_summaries', 'tutor_conversations', 'tutor_messages'
        )
      `);
      const byName = new Map(
        indexes.map((row) => [asText(row, 'name'), asText(row, 'definition')]),
      );
      const currentIndex = byName.get('courses_one_current_idx') ?? '';
      expect(currentIndex).toContain('UNIQUE');
      expect(currentIndex).toContain('WHERE');
      expect(byName.get('course_sections_notion_ids_idx') ?? '').toContain('USING gin');
      for (const expected of [
        'courses_owner_formation_idx',
        'course_sections_owner_id_idx',
        'course_sections_chapter_id_idx',
        'course_section_revisions_owner_id_idx',
        'citations_section_id_idx',
        'citations_owner_id_idx',
        'citations_chunk_id_idx',
        'citations_resource_id_idx',
        'chapter_summaries_user_chapter_idx',
        'tutor_conversations_user_course_idx',
        'tutor_messages_conversation_idx',
        'tutor_messages_user_id_idx',
      ]) {
        expect(byName.has(expected), expected).toBe(true);
      }

      const triggers = await tx.execute<Row>(sql`
        select cl.relname as table, tg.tgname as name
        from pg_trigger tg
        join pg_class cl on cl.oid = tg.tgrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public' and not tg.tgisinternal
      `);
      const triggerKeys = new Set(
        triggers.map((row) => `${asText(row, 'table')}.${asText(row, 'name')}`),
      );
      for (const expected of [
        'courses.courses_single_current',
        'courses.set_updated_at',
        'course_sections.course_sections_revision',
        'course_sections.course_sections_owner_consistency',
        'course_sections.set_updated_at',
        'citations.citations_owner_consistency',
        'reading_progress.reading_progress_owner_consistency',
        'reading_progress.set_updated_at',
        'chapter_summaries.chapter_summaries_owner_consistency',
        'tutor_conversations.set_updated_at',
        'tutor_messages.tutor_messages_owner_consistency',
        'tutor_messages.tutor_messages_touch_conversation',
      ]) {
        expect(triggerKeys.has(expected), expected).toBe(true);
      }
    });
  });

  it('CA-2 — insérer une version courante bascule la précédente (EF-1, EF-2)', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const first = await insertCourse(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        moduleId: base.moduleId,
        version: 1,
      });
      const second = await insertCourse(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        moduleId: base.moduleId,
        version: 2,
      });
      const third = await insertCourse(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        moduleId: base.moduleId,
        version: 3,
        isCurrent: false,
      });

      const rows = await tx.execute<Row>(sql`
        select id::text as id, version, is_current
        from public.courses
        where owner_id = ${base.userId}::uuid and module_id = ${base.moduleId}::uuid
        order by version
      `);
      expect(rows).toEqual([
        { id: first, version: 1, is_current: false },
        { id: second, version: 2, is_current: true },
        { id: third, version: 3, is_current: false },
      ]);
      const currents = await tx.execute<Row>(sql`
        select count(*)::int as count from public.courses
        where owner_id = ${base.userId}::uuid and module_id = ${base.moduleId}::uuid
          and is_current
      `);
      expect(currents[0]?.count).toBe(1);

      // EF-2 — version ≥ 1, unique per course, `failed` requires an error.
      const zero = await attempt(tx, () =>
        insertCourse(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          moduleId: base.moduleId,
          version: 0,
        }),
      );
      expect(zero.code).toBe('23514');
      expect(zero.message).toContain('courses_version_check');

      const duplicate = await attempt(tx, () =>
        insertCourse(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          moduleId: base.moduleId,
          version: 2,
          isCurrent: false,
        }),
      );
      expect(duplicate.code).toBe('23505');
      expect(duplicate.message).toContain('courses_owner_id_module_id_version_unique');

      const failedWithoutError = await attempt(tx, () =>
        insertCourse(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          moduleId: base.moduleId,
          version: 4,
          isCurrent: false,
          status: 'failed',
        }),
      );
      expect(failedWithoutError.code).toBe('23514');
      expect(failedWithoutError.message).toContain('courses_failed_has_error');

      const failedWithError = await attempt(tx, () =>
        insertCourse(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          moduleId: base.moduleId,
          version: 4,
          isCurrent: false,
          status: 'failed',
          error: 'Génération interrompue',
        }),
      );
      expect(failedWithError.code).toBe('00000');

      const modelTooLong = await attempt(tx, () =>
        insertCourse(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          moduleId: base.moduleId,
          version: 5,
          isCurrent: false,
          model: 'a'.repeat(121),
        }),
      );
      expect(modelTooLong.code).toBe('23514');
      expect(modelTooLong.message).toContain('courses_model_length_check');
    });
  });

  it('CL-2 — deux promotions courantes dans la même instruction sont refusées (23505)', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const first = await insertCourse(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        moduleId: base.moduleId,
        version: 1,
      });
      const second = await insertCourse(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        moduleId: base.moduleId,
        version: 2,
        isCurrent: false,
      });

      const forced = await attempt(tx, () =>
        tx.execute(sql`
          update public.courses set is_current = true
          where id in (${first}::uuid, ${second}::uuid)
        `),
      );
      expect(forced.code).toBe('23505');
      expect(forced.message).toContain('courses_one_current_idx');

      const currents = await tx.execute<Row>(sql`
        select id::text as id from public.courses
        where owner_id = ${base.userId}::uuid and module_id = ${base.moduleId}::uuid
          and is_current
      `);
      expect(currents.map((row) => asText(row, 'id'))).toEqual([first]);
    });
  });

  it('CL-1 — deux insertions concurrentes laissent une seule version courante', async () => {
    // Deliberately outside withRollback: both inserts need two real transactions.
    const user = await serviceDb().transaction((tx) => createTestUser(tx));
    try {
      const programme = await serviceDb().transaction((tx) =>
        createTestProgramme(tx, user.id, {
          modules: 1,
          chaptersPerModule: 1,
          notionsPerChapter: 0,
        }),
      );
      const moduleId = programme.moduleIds[0] ?? '';
      const formationId = programme.formationId;

      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let firstInserted!: () => void;
      const firstReady = new Promise<void>((resolve) => {
        firstInserted = resolve;
      });

      // The first transaction inserts version 1 and holds its row lock.
      const first = serviceDb().transaction(async (tx) => {
        await insertCourse(tx, { ownerId: user.id, formationId, moduleId, version: 1 });
        firstInserted();
        await firstGate;
      });
      await firstReady;

      // The second insert targets the same module: its switch waits for the first row.
      const second = serviceDb().transaction((tx) =>
        insertCourse(tx, { ownerId: user.id, formationId, moduleId, version: 2 }),
      );
      const secondOutcome = second.then<Failure, Failure>(
        () => ({ code: '00000', message: '' }),
        (error: unknown) => failureOf(error),
      );

      const firstTurn = await Promise.race([
        secondOutcome.then(() => 'settled' as const),
        new Promise<'pending'>((resolve) => {
          setImmediate(() => {
            resolve('pending');
          });
        }),
      ]);
      expect(firstTurn, 'la seconde insertion attend le verrou de ligne').toBe('pending');

      releaseFirst();
      await first;
      const failure = await secondOutcome;
      expect(failure.code).toBe('00000');

      const rows = await serviceDb().execute<Row>(sql`
        select version, is_current from public.courses
        where owner_id = ${user.id}::uuid and module_id = ${moduleId}::uuid
        order by version
      `);
      expect(rows).toEqual([
        { version: 1, is_current: false },
        { version: 2, is_current: true },
      ]);
    } finally {
      // Removes the user, the formation, the course and its sections (cascade).
      await serviceDb().execute(sql`delete from auth.users where id = ${user.id}::uuid`);
    }
  });

  it('CA-3 / CL-4 — trois corrections archivent trois révisions et incrémentent la version', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const course = await createTestCourse(tx, {
        ownerId: base.userId,
        moduleId: base.moduleId,
        sectionsPerChapter: 1,
      });
      const sectionId = course.sectionIds[0] ?? '';
      await tx.execute(sql`select set_config('learny.actor', 'learner', true)`);

      await tx.execute(sql`
        update public.course_sections
        set content_md = 'Contenu corrigé une fois.'
        where id = ${sectionId}::uuid
      `);
      await tx.execute(sql`
        update public.course_sections
        set title = 'L’en-tête de pièce corrigé'
        where id = ${sectionId}::uuid
      `);
      await tx.execute(sql`
        update public.course_sections
        set data = '{"note":"renvoi"}'::jsonb
        where id = ${sectionId}::uuid
      `);

      const section = await tx.execute<Row>(sql`
        select version, title, content_md, data from public.course_sections
        where id = ${sectionId}::uuid
      `);
      expect(section[0]).toMatchObject({
        version: 4,
        title: 'L’en-tête de pièce corrigé',
        content_md: 'Contenu corrigé une fois.',
        data: { note: 'renvoi' },
      });

      const revisions = await tx.execute<Row>(sql`
        select version, title, content_md, data, edited_by
        from public.course_section_revisions
        where section_id = ${sectionId}::uuid
        order by version
      `);
      expect(revisions.map((row) => row.version)).toEqual([1, 2, 3]);
      expect(revisions.map((row) => row.edited_by)).toEqual(['learner', 'learner', 'learner']);
      expect(revisions[0]).toMatchObject({
        title: 'Section 1',
        content_md: 'Contenu de la section 1.',
      });
      expect(revisions[1]?.content_md).toBe('Contenu corrigé une fois.');
      expect(revisions[2]?.title).toBe('L’en-tête de pièce corrigé');

      // EF-4 — `reported` changes without creating a revision.
      await tx.execute(sql`
        update public.course_sections set reported = true where id = ${sectionId}::uuid
      `);
      const afterReport = await tx.execute<Row>(sql`
        select
          (select version from public.course_sections where id = ${sectionId}::uuid) as version,
          (select count(*)::int from public.course_section_revisions
             where section_id = ${sectionId}::uuid) as revisions
      `);
      expect(afterReport[0]).toMatchObject({ version: 4, revisions: 3 });
    });
  });

  it('CA-3 — sans acteur de session, une correction est attribuée au tuteur', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const sectionId = await insertSection(tx, {
        courseId: await insertCourse(tx, {
          ownerId: base.userId,
          formationId: base.formationId,
          moduleId: base.moduleId,
          version: 1,
        }),
        ownerId: base.userId,
        chapterId: base.chapterIds[0] ?? '',
        position: 1,
      });
      await tx.execute(sql`
        update public.course_sections set content_md = 'Correction du tuteur.'
        where id = ${sectionId}::uuid
      `);
      const revisions = await tx.execute<Row>(sql`
        select edited_by, version from public.course_section_revisions
        where section_id = ${sectionId}::uuid
      `);
      expect(revisions[0]).toMatchObject({ edited_by: 'tutor', version: 1 });
    });
  });

  it('CA-4 / CL-5 — les citations survivent à la suppression de leur source', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const course = await createTestCourse(tx, {
        ownerId: base.userId,
        moduleId: base.moduleId,
        sectionsPerChapter: 1,
      });
      const sectionId = course.sectionIds[0] ?? '';
      const chapterId = course.chapterIds[0] ?? '';
      const resourceId = await insertNote(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        chapterId,
      });
      const chunkId = await insertChunk(tx, resourceId, base.userId, base.formationId, chapterId);
      const citationId = await insertCitation(tx, {
        sectionId,
        ownerId: base.userId,
        chunkId,
        resourceId,
      });

      // EF-5 — soft deletion of the resource removes its passages, the citation keeps its label.
      await tx.execute(sql`
        update public.resources set deleted_at = now() where id = ${resourceId}::uuid
      `);
      const afterSoftDelete = await tx.execute<Row>(sql`
        select chunk_id, resource_id, label from public.citations
        where id = ${citationId}::uuid
      `);
      expect(afterSoftDelete).toHaveLength(1);
      expect(afterSoftDelete[0]).toMatchObject({ chunk_id: null, resource_id: resourceId });
      expect(afterSoftDelete[0]?.label).toBe('Guide FI, p. 4');

      // Physical deletion of the resource nulls `resource_id`; the citation is still kept.
      await tx.execute(sql`delete from public.resources where id = ${resourceId}::uuid`);
      const afterDelete = await tx.execute<Row>(sql`
        select chunk_id, resource_id, label from public.citations
        where id = ${citationId}::uuid
      `);
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0]).toMatchObject({ chunk_id: null, resource_id: null });
      expect(afterDelete[0]?.label).toBe('Guide FI, p. 4');
    });
  });

  it('CA-5 — ancres, pourcentages, longueurs et cohérence propriétaire sont imposés', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const course = await createTestCourse(tx, {
        ownerId: base.userId,
        moduleId: base.moduleId,
        sectionsPerChapter: 1,
      });
      const courseId = course.courseId;
      const sectionId = course.sectionIds[0] ?? '';
      const chapterId = course.chapterIds[0] ?? '';
      const other = await createTestUser(tx);

      // CL-3 — an anchor outside the expression is refused.
      for (const anchor of ['Postes-Et-Cles', 'postes_et_cles', '-debut']) {
        const invalidAnchor = await attempt(tx, () =>
          insertSection(tx, {
            courseId,
            ownerId: base.userId,
            chapterId,
            position: 2,
            anchor,
          }),
        );
        expect(invalidAnchor.code, anchor).toBe('23514');
        expect(invalidAnchor.message, anchor).toContain('course_sections_anchor_check');
      }

      // EF-3 — the anchor is unique in the course.
      const duplicateAnchor = await attempt(tx, () =>
        insertSection(tx, {
          courseId,
          ownerId: base.userId,
          chapterId: course.chapterIds[1] ?? '',
          position: 2,
          anchor: 'section-1-1',
        }),
      );
      expect(duplicateAnchor.code).toBe('23505');
      expect(duplicateAnchor.message).toContain('course_sections_course_id_anchor_unique');

      // EF-3 — positions are unique per chapter.
      const duplicatePosition = await attempt(tx, () =>
        insertSection(tx, {
          courseId,
          ownerId: base.userId,
          chapterId,
          position: 1,
          anchor: 'autre-ancre',
        }),
      );
      expect(duplicatePosition.code).toBe('23505');
      expect(duplicatePosition.message).toContain(
        'course_sections_course_id_chapter_id_position_unique',
      );

      const invalidPosition = await attempt(tx, () =>
        insertSection(tx, {
          courseId,
          ownerId: base.userId,
          chapterId,
          position: 0,
          anchor: 'position-zero',
        }),
      );
      expect(invalidPosition.code).toBe('23514');
      expect(invalidPosition.message).toContain('course_sections_position_check');

      // CL-6 — percent ∈ [0, 100] and seconds_spent ≥ 0.
      const tooMuchRead = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.reading_progress (user_id, course_id, chapter_id, percent)
          values (${base.userId}::uuid, ${courseId}::uuid, ${chapterId}::uuid, 101)
        `),
      );
      expect(tooMuchRead.code).toBe('23514');
      expect(tooMuchRead.message).toContain('reading_progress_percent_check');

      const negativeTime = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.reading_progress (user_id, course_id, chapter_id, seconds_spent)
          values (${base.userId}::uuid, ${courseId}::uuid, ${chapterId}::uuid, -1)
        `),
      );
      expect(negativeTime.code).toBe('23514');
      expect(negativeTime.message).toContain('reading_progress_seconds_spent_check');

      // EF-6 — one row per (user, course, chapter).
      await tx.execute(sql`
        insert into public.reading_progress (user_id, course_id, chapter_id, percent, seconds_spent)
        values (${base.userId}::uuid, ${courseId}::uuid, ${chapterId}::uuid, 40, 120)
      `);
      const duplicateProgress = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.reading_progress (user_id, course_id, chapter_id, percent)
          values (${base.userId}::uuid, ${courseId}::uuid, ${chapterId}::uuid, 50)
        `),
      );
      expect(duplicateProgress.code).toBe('23505');

      // CL-9 — a summary is between 1 and 2 000 characters.
      const tooLongSummary = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.chapter_summaries (user_id, chapter_id, course_id, text)
          values (
            ${base.userId}::uuid, ${chapterId}::uuid, ${courseId}::uuid, ${'a'.repeat(2001)}
          )
        `),
      );
      expect(tooLongSummary.code).toBe('23514');
      expect(tooLongSummary.message).toContain('chapter_summaries_text_length_check');

      // CL-7 — a tutor message belongs to the owner of its conversation.
      const conversationId = await insertConversation(tx, {
        userId: base.userId,
        courseId,
      });
      const wrongMessageOwner = await attempt(tx, () =>
        insertMessage(tx, { conversationId, userId: other.id }),
      );
      expect(wrongMessageOwner.code).toBe('23514');
      expect(wrongMessageOwner.message).toContain('owner_mismatch');

      // The same consistency rule protects every scoped row (ADR-0113).
      const wrongSectionOwner = await attempt(tx, () =>
        insertSection(tx, {
          courseId,
          ownerId: other.id,
          chapterId,
          position: 3,
          anchor: 'section-autre-proprietaire',
        }),
      );
      expect(wrongSectionOwner.code).toBe('23514');
      expect(wrongSectionOwner.message).toContain('owner_mismatch');

      const wrongCitationOwner = await attempt(tx, () =>
        insertCitation(tx, { sectionId, ownerId: other.id }),
      );
      expect(wrongCitationOwner.code).toBe('23514');
      expect(wrongCitationOwner.message).toContain('owner_mismatch');

      const wrongSummaryOwner = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.chapter_summaries (user_id, chapter_id, course_id, text)
          values (
            ${other.id}::uuid, ${chapterId}::uuid, ${courseId}::uuid, 'Résumé étranger'
          )
        `),
      );
      expect(wrongSummaryOwner.code).toBe('23514');
      expect(wrongSummaryOwner.message).toContain('owner_mismatch');

      const wrongProgressOwner = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.reading_progress (user_id, course_id, chapter_id)
          values (${other.id}::uuid, ${courseId}::uuid, ${chapterId}::uuid)
        `),
      );
      expect(wrongProgressOwner.code).toBe('23514');
      expect(wrongProgressOwner.message).toContain('owner_mismatch');

      // A summary without a course version is accepted (course_id remains null).
      const detachedSummary = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.chapter_summaries (user_id, chapter_id, text)
          values (${other.id}::uuid, ${chapterId}::uuid, 'Résumé hors version')
        `),
      );
      expect(detachedSummary.code).toBe('00000');

      // Bounds of a tutor message and of a citation label.
      const emptyMessage = await attempt(tx, () =>
        insertMessage(tx, { conversationId, userId: base.userId, content: '' }),
      );
      expect(emptyMessage.code).toBe('23514');
      expect(emptyMessage.message).toContain('tutor_messages_content_length_check');

      const emptyLabel = await attempt(tx, () =>
        insertCitation(tx, { sectionId, ownerId: base.userId, label: '' }),
      );
      expect(emptyLabel.code).toBe('23514');
      expect(emptyLabel.message).toContain('citations_label_length_check');
    });
  });

  it('CA-6 / CL-8 — la cascade du module efface cours, sections, citations et discussions', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const course = await createTestCourse(tx, {
        ownerId: base.userId,
        moduleId: base.moduleId,
        sectionsPerChapter: 1,
      });
      const courseId = course.courseId;
      const sectionId = course.sectionIds[0] ?? '';
      const chapterId = course.chapterIds[0] ?? '';

      // A second version with its own section and citation: deleting the module removes all of them.
      const secondVersion = await insertCourse(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        moduleId: base.moduleId,
        version: 2,
      });
      const secondSection = await insertSection(tx, {
        courseId: secondVersion,
        ownerId: base.userId,
        chapterId,
        position: 1,
        anchor: 'section-1-1',
      });
      expect(secondSection).toMatch(/[0-9a-f-]{36}/);
      const resourceId = await insertNote(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        chapterId,
      });
      const chunkId = await insertChunk(tx, resourceId, base.userId, base.formationId, chapterId);
      const citationId = await insertCitation(tx, {
        sectionId,
        ownerId: base.userId,
        chunkId,
        resourceId,
      });

      // A revision on the first section.
      await tx.execute(sql`
        update public.course_sections set content_md = 'Corrigé.' where id = ${sectionId}::uuid
      `);

      await tx.execute(sql`
        insert into public.reading_progress (user_id, course_id, chapter_id, percent)
        values (${base.userId}::uuid, ${courseId}::uuid, ${chapterId}::uuid, 100)
      `);
      await tx.execute(sql`
        insert into public.chapter_summaries (user_id, chapter_id, course_id, text)
        values (${base.userId}::uuid, ${chapterId}::uuid, ${courseId}::uuid, 'Résumé')
      `);

      // EF-7, ADR-0040 — a new discussion adds a row; deleting one removes only its messages.
      const firstConversation = await insertConversation(tx, { userId: base.userId, courseId });
      const secondConversation = await insertConversation(tx, { userId: base.userId, courseId });
      const firstMessage = await insertMessage(tx, {
        conversationId: firstConversation,
        userId: base.userId,
        sources: [{ label: 'Guide FI, p. 4' }],
      });
      await insertMessage(tx, {
        conversationId: firstConversation,
        userId: base.userId,
        role: 'tutor',
        content: 'La clé se lit dans le plan comptable.',
        sources: [{ label: 'Guide FI, p. 4' }],
      });
      await insertMessage(tx, {
        conversationId: secondConversation,
        userId: base.userId,
      });

      const messagesBefore = await tx.execute<Row>(sql`
        select count(*)::int as count from public.tutor_messages
        where conversation_id = ${firstConversation}::uuid
      `);
      expect(messagesBefore[0]?.count).toBe(2);

      await tx.execute(sql`
        delete from public.tutor_conversations where id = ${firstConversation}::uuid
      `);
      const afterConversationDelete = await tx.execute<Row>(sql`
        select
          (select count(*)::int from public.tutor_messages
             where conversation_id = ${firstConversation}::uuid) as messages,
          (select count(*)::int from public.tutor_conversations
             where id = ${secondConversation}::uuid) as conversations
      `);
      expect(afterConversationDelete[0]).toMatchObject({ messages: 0, conversations: 1 });

      // Sanity check before the cascade: every row exists.
      expect(await count(tx, 'courses', 'module_id', base.moduleId)).toBe(2);
      expect(await count(tx, 'course_sections', 'course_id', secondVersion)).toBe(1);

      await tx.execute(sql`delete from public.modules where id = ${base.moduleId}::uuid`);

      expect(await count(tx, 'courses', 'module_id', base.moduleId)).toBe(0);
      expect(await count(tx, 'course_sections', 'course_id', courseId)).toBe(0);
      expect(await count(tx, 'course_sections', 'course_id', secondVersion)).toBe(0);
      expect(await count(tx, 'course_section_revisions', 'section_id', sectionId)).toBe(0);
      expect(await count(tx, 'citations', 'id', citationId)).toBe(0);
      expect(await count(tx, 'reading_progress', 'course_id', courseId)).toBe(0);
      expect(await count(tx, 'chapter_summaries', 'course_id', courseId)).toBe(0);
      expect(await count(tx, 'tutor_conversations', 'course_id', courseId)).toBe(0);
      expect(await count(tx, 'tutor_messages', 'id', firstMessage)).toBe(0);
      expect(await count(tx, 'resources', 'id', resourceId)).toBe(0);
      expect(await count(tx, 'resource_chunks', 'resource_id', resourceId)).toBe(0);
    });
  });
});
