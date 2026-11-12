// Owner-role reads of the SPEC-104 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
//
// The whole demonstration runs inside `withRollback`: the note, its passages and every constraint
// probe disappear at the end of the request, so the page never mutates the database.
import { sql, type DbTx } from '@learny/db';
import {
  createTestProgramme,
  createTestUser,
  fakeEmbedding,
  toVectorLiteral,
  withRollback,
} from '@learny/db/testing';

export const DEMO_NOTE = 'Clés de comptabilisation : 40 = débit, 50 = crédit ? À vérifier';

export interface Spec104Chunk {
  position: number;
  text: string;
  charStart: number;
  charEnd: number;
}

export interface Spec104ResourceCard {
  title: string;
  kind: string;
  status: string;
  contentText: string;
  chunks: Spec104Chunk[];
}

export interface Spec104Neighbour {
  position: number;
  text: string;
  distance: number;
}

export interface Spec104VectorSearch {
  query: string;
  neighbours: Spec104Neighbour[];
  plan: string;
  indexUsed: boolean;
}

export type Spec104LimitKey = 'cl1' | 'cl2' | 'cl3' | 'cl8';

export interface Spec104Limit {
  key: Spec104LimitKey;
  expected: string;
  sqlstate: string;
  code: string;
  ok: boolean;
}

export interface Spec104SoftDelete {
  title: string;
  before: number;
  after: number;
  retained: boolean;
  contentErased: boolean;
}

export interface Spec104Data {
  resource: Spec104ResourceCard;
  search: Spec104VectorSearch;
  limits: Spec104Limit[];
  softDelete: Spec104SoftDelete;
}

interface Row {
  [key: string]: unknown;
}

interface Failure {
  code: string;
  message: string;
}

let savepoint = 0;

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

async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec104_demo_${String(savepoint)}`;
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

/** Stable error code shown by the limits card: raised code or violated constraint name. */
const RAISED_CODES = [
  'chapter_resource_limit',
  'storage_quota_exceeded',
  'resource_pdf_limit',
  'resource_image_limit',
] as const;

function codedMessage(failure: Failure): string {
  const raised = RAISED_CODES.find((code) => failure.message.includes(code));
  if (raised !== undefined) return raised;
  const constraint = /(resources?_[a-z_]+)/.exec(failure.message);
  return constraint?.[1] ?? failure.code;
}

async function loadChunks(tx: DbTx, resourceId: string): Promise<Spec104Chunk[]> {
  const rows = await tx.execute<Row>(sql`
    select position, text, (location ->> 'charStart')::int as char_start,
           (location ->> 'charEnd')::int as char_end
    from public.resource_chunks
    where resource_id = ${resourceId}::uuid
    order by position
  `);
  return rows.map((row) => ({
    position: Number(row.position),
    text: String(row.text),
    charStart: Number(row.char_start),
    charEnd: Number(row.char_end),
  }));
}

/** Full demonstration payload; every read is rolled back at the end of the request. */
export async function loadSpec104Demo(): Promise<Spec104Data> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx);
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 0,
    });
    const chapterId = programme.chapterIds[0] ?? '';

    const resourceRows = await tx.execute<{ id: string }>(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, title, content_text, status
      )
      values (
        ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
        'note', 'Clés de comptabilisation', ${DEMO_NOTE}, 'ready'
      )
      returning id::text as id
    `);
    const resourceId = resourceRows[0]?.id ?? '';
    if (resourceId === '') throw new Error('ressource de démonstration non créée');

    const passages = [
      'Clés de comptabilisation',
      '40 = débit, 50 = crédit',
      '? À vérifier',
    ] as const;
    for (const [position, text] of passages.entries()) {
      const charStart = DEMO_NOTE.indexOf(text);
      const charEnd = charStart + text.length;
      await tx.execute(sql`
        insert into public.resource_chunks (
          resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count,
          embedding
        )
        values (
          ${resourceId}::uuid, ${user.id}::uuid, ${programme.formationId}::uuid,
          ${chapterId}::uuid, ${position}, ${text},
          ${JSON.stringify({ charStart, charEnd })}::jsonb, ${text.split(' ').length},
          ${toVectorLiteral(fakeEmbedding(text))}::extensions.vector
        )
      `);
    }

    const query = 'clé débit';
    const vector = toVectorLiteral(fakeEmbedding(query));
    await tx.execute(sql`set local hnsw.ef_search = 40`);
    await tx.execute(sql`set local enable_seqscan = off`);
    await tx.execute(sql`set local enable_sort = off`);
    await tx.execute(sql`set local enable_bitmapscan = off`);
    const searchQuery = sql`
      select position, text, round((embedding <=> ${vector}::extensions.vector)::numeric, 4)::float8
        as distance
      from public.resource_chunks
      where owner_id = ${user.id}::uuid
      order by embedding <=> ${vector}::extensions.vector
      limit 3
    `;
    const planRows = await tx.execute<Row>(sql`explain (format json) ${searchQuery}`);
    const plan = JSON.stringify(planRows[0]?.['QUERY PLAN'] ?? null);
    const neighbours = await tx.execute<Row>(searchQuery);

    // CL-1, CL-2, CL-3 and CL-8, each in its own rolled-back savepoint.
    const cl1 = await attempt(tx, () =>
      tx.execute(sql`
        insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text)
        values (
          ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
          'note', 'Note trop longue', repeat('a', 100001)
        )
      `),
    );
    const cl2 = await attempt(tx, () =>
      tx.execute(sql`
        insert into public.resources (
          owner_id, formation_id, chapter_id, kind, title, storage_path, size_bytes, metadata
        )
        values (
          ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
          'pdf', 'Guide trop long',
          ${`${user.id}/00000000-0000-4000-8000-000000000000/guide.pdf`}, 1024,
          '{"pages": 501}'::jsonb
        )
      `),
    );
    const cl8 = await attempt(tx, () =>
      tx.execute(sql`
        insert into public.resources (
          owner_id, formation_id, chapter_id, kind, origin, suggestion_status, title
        )
        values (
          ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
          'web', 'tutor_suggestion', 'pending', 'Suggestion sans URL'
        )
      `),
    );
    // The demonstration note plus 99 neutral contributions reach the 100-per-chapter ceiling.
    await tx.execute(sql`
      insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text)
      select ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
             'note', 'Contribution ' || i, 'Contenu ' || i
      from generate_series(1, 99) i
    `);
    const cl3 = await attempt(tx, () =>
      tx.execute(sql`
        insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text)
        values (
          ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
          'note', 'Contribution de trop', 'Contenu de trop'
        )
      `),
    );

    const cases: [Spec104LimitKey, string, Failure][] = [
      ['cl1', 'resources_note_shape', cl1],
      ['cl2', 'resource_pdf_limit', cl2],
      ['cl3', 'chapter_resource_limit', cl3],
      ['cl8', 'resources_link_shape', cl8],
    ];

    // EF-4 — deleting the demonstration note erases its three passages and its content.
    const chunksBefore = await loadChunks(tx, resourceId);
    await tx.execute(sql`
      update public.resources set deleted_at = now() where id = ${resourceId}::uuid
    `);
    const chunksAfter = await loadChunks(tx, resourceId);
    const retained = await tx.execute<Row>(sql`
      select title, content_text, deleted_at from public.resources
      where id = ${resourceId}::uuid
    `);

    return {
      resource: {
        title: 'Clés de comptabilisation',
        kind: 'note',
        status: 'ready',
        contentText: DEMO_NOTE,
        chunks: chunksBefore,
      },
      search: {
        query,
        neighbours: neighbours.map((row) => ({
          position: Number(row.position),
          text: String(row.text),
          distance: Number(row.distance),
        })),
        plan,
        indexUsed: plan.includes('resource_chunks_embedding_hnsw_idx'),
      },
      limits: cases.map(([key, expected, failure]) => {
        const code = codedMessage(failure);
        return {
          key,
          expected,
          sqlstate: failure.code,
          code,
          ok: failure.code === '23514' && code === expected,
        };
      }),
      softDelete: {
        title: typeof retained[0]?.title === 'string' ? retained[0].title : '',
        before: chunksBefore.length,
        after: chunksAfter.length,
        retained: retained.length === 1,
        contentErased: retained[0]?.content_text === null,
      },
    };
  });
}
