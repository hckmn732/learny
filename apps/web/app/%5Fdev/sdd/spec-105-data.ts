// Owner-role reads of the SPEC-105 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The whole demonstration runs inside `withRollback`: the two course versions, the corrected
// section, the citation and the discussion disappear at the end of the request.
import { sql, type DbTx } from '@learny/db';
import { createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';

export interface Spec105Version {
  version: number;
  status: string;
  isCurrent: boolean;
}

export interface Spec105Revision {
  version: number;
  title: string;
  editedBy: string;
}

export interface Spec105Section {
  title: string;
  currentVersion: number;
  revisions: Spec105Revision[];
}

export interface Spec105Citation {
  label: string;
  displayed: string;
  chunkId: string | null;
  resourceId: string | null;
}

export interface Spec105Message {
  role: string;
  content: string;
  sources: string[];
}

export interface Spec105Data {
  versions: Spec105Version[];
  section: Spec105Section;
  citation: Spec105Citation;
  messages: Spec105Message[];
}

interface Row {
  [key: string]: unknown;
}

const SOURCE_LABEL = 'Guide FI, p. 4';

/** Something a learner can read as a source; a deleted source is shown as « source supprimée ». */
function displayedSource(chunkId: string | null): string {
  return chunkId === null ? 'source supprimée' : SOURCE_LABEL;
}

async function loadVersions(
  tx: DbTx,
  ownerId: string,
  moduleId: string,
): Promise<Spec105Version[]> {
  const rows = await tx.execute<Row>(sql`
    select version, status, is_current
    from public.courses
    where owner_id = ${ownerId}::uuid and module_id = ${moduleId}::uuid
    order by version
  `);
  return rows.map((row) => ({
    version: Number(row.version),
    status: String(row.status),
    isCurrent: row.is_current === true,
  }));
}

async function loadSection(tx: DbTx, sectionId: string): Promise<Spec105Section> {
  const rows = await tx.execute<Row>(sql`
    select title, version from public.course_sections where id = ${sectionId}::uuid
  `);
  const revisions = await tx.execute<Row>(sql`
    select version, title, edited_by
    from public.course_section_revisions
    where section_id = ${sectionId}::uuid
    order by version
  `);
  return {
    title: typeof rows[0]?.title === 'string' ? rows[0].title : '',
    currentVersion: Number(rows[0]?.version ?? 0),
    revisions: revisions.map((row) => ({
      version: Number(row.version),
      title: typeof row.title === 'string' ? row.title : '',
      editedBy: String(row.edited_by),
    })),
  };
}

async function loadCitation(tx: DbTx, citationId: string): Promise<Spec105Citation> {
  const rows = await tx.execute<Row>(sql`
    select label, chunk_id::text as chunk_id, resource_id::text as resource_id
    from public.citations where id = ${citationId}::uuid
  `);
  const row = rows[0];
  const chunkId = typeof row?.chunk_id === 'string' ? row.chunk_id : null;
  const resourceId = typeof row?.resource_id === 'string' ? row.resource_id : null;
  return {
    label: typeof row?.label === 'string' ? row.label : '',
    displayed: displayedSource(chunkId),
    chunkId,
    resourceId,
  };
}

async function loadMessages(tx: DbTx, conversationId: string): Promise<Spec105Message[]> {
  const rows = await tx.execute<Row>(sql`
    select role, content, sources
    from public.tutor_messages
    where conversation_id = ${conversationId}::uuid
    order by created_at, id
  `);
  return rows.map((row) => ({
    role: String(row.role),
    content: String(row.content),
    sources: Array.isArray(row.sources)
      ? (row.sources as { label?: unknown }[]).map((source) =>
          typeof source.label === 'string' ? source.label : '',
        )
      : [],
  }));
}

/** Full demonstration payload; every read is rolled back at the end of the request. */
export async function loadSpec105Demo(): Promise<Spec105Data> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx);
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 0,
    });
    const moduleId = programme.moduleIds[0] ?? '';
    const chapterId = programme.chapterIds[0] ?? '';

    const courseRows = await tx.execute<{ id: string }>(sql`
      insert into public.courses (owner_id, formation_id, module_id, version, status)
      values (${user.id}::uuid, ${programme.formationId}::uuid, ${moduleId}::uuid, 1, 'ready')
      returning id::text as id
    `);
    // EF-1 — generating version 2 switches version 1 to non-current.
    await tx.execute(sql`
      insert into public.courses (owner_id, formation_id, module_id, version, status)
      values (${user.id}::uuid, ${programme.formationId}::uuid, ${moduleId}::uuid, 2, 'ready')
    `);
    const versions = await loadVersions(tx, user.id, moduleId);
    const currentCourse = versions.find((version) => version.isCurrent);
    if (currentCourse === undefined) throw new Error('cours courant introuvable');
    const currentCourseRows = await tx.execute<{ id: string }>(sql`
      select id::text as id from public.courses
      where owner_id = ${user.id}::uuid and module_id = ${moduleId}::uuid
        and version = ${currentCourse.version}
    `);
    const courseId = currentCourseRows[0]?.id ?? courseRows[0]?.id ?? '';

    const sectionRows = await tx.execute<{ id: string }>(sql`
      insert into public.course_sections (
        course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin
      )
      values (
        ${courseId}::uuid, ${user.id}::uuid, ${chapterId}::uuid, 1, 'text',
        'en-tete-de-piece', 'L’en-tête de pièce',
        'L’en-tête de pièce regroupe les informations communes à toutes les écritures.',
        'tutor'
      )
      returning id::text as id
    `);
    const sectionId = sectionRows[0]?.id ?? '';
    if (sectionId === '') throw new Error('section de démonstration non créée');

    // EF-4 — two learner corrections: current version 3, archived versions 1 and 2.
    await tx.execute(sql`select set_config('learny.actor', 'learner', true)`);
    await tx.execute(sql`
      update public.course_sections
      set content_md = 'L’en-tête de pièce précise la date, le journal et la pièce.'
      where id = ${sectionId}::uuid
    `);
    await tx.execute(sql`
      update public.course_sections
      set content_md = 'L’en-tête de pièce précise la date, le journal, la pièce et le libellé.'
      where id = ${sectionId}::uuid
    `);

    // EF-5 — the citation keeps its label after the logical deletion of the resource.
    const resourceRows = await tx.execute<{ id: string }>(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, title, content_text, status
      )
      values (
        ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
        'note', 'Guide FI', 'Clés de comptabilisation : 40 = débit, 50 = crédit ?', 'ready'
      )
      returning id::text as id
    `);
    const resourceId = resourceRows[0]?.id ?? '';
    const chunkRows = await tx.execute<{ id: string }>(sql`
      insert into public.resource_chunks (
        resource_id, owner_id, formation_id, chapter_id, position, text, location
      )
      values (
        ${resourceId}::uuid, ${user.id}::uuid, ${programme.formationId}::uuid,
        ${chapterId}::uuid, 0, 'Clés de comptabilisation',
        '{"charStart":0,"charEnd":24}'::jsonb
      )
      returning id::text as id
    `);
    const chunkId = chunkRows[0]?.id ?? '';
    const citationRows = await tx.execute<{ id: string }>(sql`
      insert into public.citations (
        section_id, owner_id, chunk_id, resource_id, quote, location, label, media_kind
      )
      values (
        ${sectionId}::uuid, ${user.id}::uuid, ${chunkId}::uuid, ${resourceId}::uuid,
        'Clés de comptabilisation', '{"page":4,"charStart":0,"charEnd":24}'::jsonb,
        ${SOURCE_LABEL}, 'pdf'
      )
      returning id::text as id
    `);
    const citationId = citationRows[0]?.id ?? '';
    await tx.execute(sql`
      update public.resources set deleted_at = now() where id = ${resourceId}::uuid
    `);

    // EF-7 / ADR-0040 — one discussion, two ordered messages with their sources.
    const conversationRows = await tx.execute<{ id: string }>(sql`
      insert into public.tutor_conversations (user_id, course_id, title)
      values (${user.id}::uuid, ${courseId}::uuid, 'Comment lire une clé ?')
      returning id::text as id
    `);
    const conversationId = conversationRows[0]?.id ?? '';
    await tx.execute(sql`
      insert into public.tutor_messages (
        conversation_id, user_id, role, content, sources, created_at
      )
      values (
        ${conversationId}::uuid, ${user.id}::uuid, 'learner',
        'Comment reconnaître une clé de comptabilisation ?',
        ${JSON.stringify([{ label: SOURCE_LABEL }])}::jsonb,
        now()
      )
    `);
    await tx.execute(sql`
      insert into public.tutor_messages (
        conversation_id, user_id, role, content, sources, created_at
      )
      values (
        ${conversationId}::uuid, ${user.id}::uuid, 'tutor',
        'La clé se lit dans le plan comptable : le premier chiffre indique la classe.',
        ${JSON.stringify([{ label: SOURCE_LABEL }])}::jsonb,
        now() + interval '1 second'
      )
    `);

    return {
      versions,
      section: await loadSection(tx, sectionId),
      citation: await loadCitation(tx, citationId),
      messages: await loadMessages(tx, conversationId),
    };
  });
}
