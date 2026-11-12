// Integration tests of the resource schema and the vector passages (SPEC-104 §12): introspection,
// per-type shapes, coded limits, concurrency, soft deletion, scope consistency, vector dimension,
// HNSW search and cascades. Every test runs against the local Supabase database (testing.md §3).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { EMBEDDING_DIM } from '@learny/config';

import { closeDb, serviceDb, type DbTx } from '../../src/client';
import { createTestProgramme, createTestUser, withRollback } from '../../src/testing';
import { fakeEmbedding, toVectorLiteral } from '../../src/testing/embedding';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const ENUMS: Record<string, string[]> = {
  resource_kind: ['note', 'pdf', 'web', 'youtube', 'image', 'audio', 'video', 'exam_guide'],
  resource_origin: ['learner', 'tutor_suggestion'],
  suggestion_status: ['pending', 'imported', 'dismissed'],
  resource_status: ['queued', 'processing', 'ready', 'failed'],
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
  const name = `spec104_${String(savepoint)}`;
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

interface Base {
  userId: string;
  formationId: string;
  chapterId: string;
}

async function createBase(tx: DbTx, chapters = 1): Promise<Base> {
  const user = await createTestUser(tx);
  const programme = await createTestProgramme(tx, user.id, {
    modules: 1,
    chaptersPerModule: chapters,
    notionsPerChapter: 0,
  });
  return {
    userId: user.id,
    formationId: programme.formationId,
    chapterId: programme.chapterIds[0] ?? '',
  };
}

interface ResourceInput {
  ownerId: string;
  formationId: string;
  chapterId?: string | null;
  kind: string;
  title?: string;
  contentText?: string | null;
  storagePath?: string | null;
  url?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
  status?: string;
  errorCode?: string | null;
  origin?: string;
  suggestionStatus?: string | null;
  metadata?: Record<string, unknown>;
}

function storagePath(ownerId: string, name = 'guide.pdf'): string {
  return `${ownerId}/00000000-0000-4000-8000-000000000000/${name}`;
}

async function insertResource(tx: Queryable, input: ResourceInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.resources (
      owner_id, formation_id, chapter_id, kind, origin, suggestion_status, title, content_text,
      storage_path, url, mime, size_bytes, status, error_code, metadata
    )
    values (
      ${input.ownerId}::uuid,
      ${input.formationId}::uuid,
      ${input.chapterId ?? null}::uuid,
      ${input.kind}::public.resource_kind,
      ${input.origin ?? 'learner'}::public.resource_origin,
      ${input.suggestionStatus ?? null}::public.suggestion_status,
      ${input.title ?? 'Ressource de test'},
      ${input.contentText ?? null},
      ${input.storagePath ?? null},
      ${input.url ?? null},
      ${input.mime ?? null},
      ${input.sizeBytes ?? null},
      ${input.status ?? 'queued'}::public.resource_status,
      ${input.errorCode ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('ressource non créée');
  return id;
}

interface ChunkInput {
  resourceId: string;
  ownerId?: string | null;
  formationId?: string | null;
  chapterId?: string | null;
  position: number;
  text?: string;
  location?: Record<string, unknown>;
  embedding?: string | null;
}

async function insertChunk(tx: Queryable, input: ChunkInput): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.resource_chunks (
      resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count,
      embedding
    )
    values (
      ${input.resourceId}::uuid,
      ${input.ownerId ?? null}::uuid,
      ${input.formationId ?? null}::uuid,
      ${input.chapterId ?? null}::uuid,
      ${input.position},
      ${input.text ?? `Passage ${String(input.position)}`},
      ${JSON.stringify(input.location ?? { charStart: 0, charEnd: 7 })}::jsonb,
      ${7},
      ${input.embedding ?? null}::extensions.vector
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('passage non créé');
  return id;
}

function asText(row: Row, key: string): string {
  return String(row[key]);
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-104] ressources et passages', () => {
  it('CA-1 — les deux tables, quatre énumérations, contraintes et index HNSW existent', async () => {
    await withRollback(async (tx) => {
      const tables = await tx.execute<Row>(sql`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('resources', 'resource_chunks')
        order by c.relname
      `);
      expect(tables.map((row) => asText(row, 'name'))).toEqual(['resource_chunks', 'resources']);
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
        select conname as name
        from pg_constraint
        where conrelid in ('public.resources'::regclass, 'public.resource_chunks'::regclass)
        order by conname
      `);
      const names = constraints.map((row) => asText(row, 'name'));
      for (const expected of [
        'resources_note_shape',
        'resources_file_shape',
        'resources_link_shape',
        'resources_exam_guide_shape',
        'resources_suggestion_shape',
        'resources_failed_has_error',
        'resources_content_max',
        'resources_pdf_size',
        'resources_image_size',
        'resources_pdf_pages',
        'resource_chunks_resource_id_position_unique',
        'resource_chunks_location_check',
      ]) {
        expect(names, expected).toContain(expected);
      }

      const index = await tx.execute<Row>(sql`
        select indexdef as definition
        from pg_indexes
        where schemaname = 'public' and indexname = 'resource_chunks_embedding_hnsw_idx'
      `);
      expect(index).toHaveLength(1);
      const definition = asText(index[0] ?? {}, 'definition');
      expect(definition).toContain('hnsw');
      expect(definition).toContain('vector_cosine_ops');
      expect(definition).toContain("m='16'");
      expect(definition).toContain("ef_construction='64'");

      const column = await tx.execute<Row>(sql`
        select format_type(a.atttypid, a.atttypmod) as type
        from pg_attribute a
        where a.attrelid = 'public.resource_chunks'::regclass and a.attname = 'embedding'
      `);
      expect(asText(column[0] ?? {}, 'type')).toBe(`vector(${String(EMBEDDING_DIM)})`);

      const programmeForeignKey = await tx.execute<Row>(sql`
        select confdeltype as on_delete
        from pg_constraint
        where conname = 'programme_imports_resource_fk'
      `);
      expect(programmeForeignKey[0]?.on_delete).toBe('n');

      const statusIndex = await tx.execute<Row>(sql`
        select indexdef as definition
        from pg_indexes
        where schemaname = 'public' and indexname = 'resources_status_idx'
      `);
      expect(asText(statusIndex[0] ?? {}, 'definition')).toContain('WHERE');
    });
  });

  it('EF-1 — une ressource naît en file, apport de l’apprenant, métadonnées vides', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const id = await insertResource(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        chapterId: base.chapterId,
        kind: 'note',
        contentText: 'Note de départ',
      });
      const rows = await tx.execute<Row>(sql`
        select origin, status, metadata, deleted_at
        from public.resources where id = ${id}::uuid
      `);
      expect(rows[0]).toMatchObject({
        origin: 'learner',
        status: 'queued',
        metadata: {},
        deleted_at: null,
      });
    });
  });

  it('CA-2 — chaque type impose sa forme (EF-2, CL-1, CL-8, CL-9)', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const common = {
        ownerId: base.userId,
        formationId: base.formationId,
        chapterId: base.chapterId,
      };
      const path = storagePath(base.userId);

      const refused: [string, ResourceInput, string][] = [
        ['note sans contenu', { ...common, kind: 'note' }, 'resources_note_shape'],
        [
          'note avec fichier',
          { ...common, kind: 'note', contentText: 'x', storagePath: path },
          'resources_note_shape',
        ],
        [
          'note avec URL',
          { ...common, kind: 'note', contentText: 'x', url: 'https://example.test' },
          'resources_note_shape',
        ],
        ['PDF sans fichier', { ...common, kind: 'pdf' }, 'resources_file_shape'],
        ['image sans fichier', { ...common, kind: 'image' }, 'resources_file_shape'],
        ['page web sans URL', { ...common, kind: 'web' }, 'resources_link_shape'],
        [
          'page web non HTTPS',
          { ...common, kind: 'web', url: 'http://example.test' },
          'resources_url_check',
        ],
        ['YouTube sans URL', { ...common, kind: 'youtube' }, 'resources_link_shape'],
        ['guide d’examen vide', { ...common, kind: 'exam_guide' }, 'resources_exam_guide_shape'],
        [
          'suggestion sans URL',
          {
            ...common,
            kind: 'web',
            origin: 'tutor_suggestion',
            suggestionStatus: 'pending',
          },
          'resources_link_shape',
        ],
        [
          'apport avec statut de suggestion',
          {
            ...common,
            kind: 'note',
            contentText: 'x',
            suggestionStatus: 'pending',
          },
          'resources_suggestion_shape',
        ],
        [
          'échec sans code',
          { ...common, kind: 'note', contentText: 'x', status: 'failed' },
          'resources_failed_has_error',
        ],
      ];

      for (const [label, input, expected] of refused) {
        const result = await attempt(tx, () => insertResource(tx, input));
        expect(result.code, label).toBe('23514');
        expect(result.message, label).toContain(expected);
      }

      // Valid shapes of every type.
      const accepted: ResourceInput[] = [
        { ...common, kind: 'note', contentText: 'Une note valide' },
        { ...common, kind: 'pdf', storagePath: path, sizeBytes: 1024, metadata: { pages: 2 } },
        { ...common, kind: 'image', storagePath: path, sizeBytes: 1024 },
        { ...common, kind: 'web', url: 'https://example.test/page' },
        { ...common, kind: 'youtube', url: 'https://www.youtube.com/watch?v=abc' },
        { ...common, kind: 'exam_guide', url: 'https://example.test/guide' },
        { ...common, kind: 'exam_guide', storagePath: path },
        {
          ...common,
          kind: 'web',
          url: 'https://example.test/suggestion',
          origin: 'tutor_suggestion',
          suggestionStatus: 'pending',
        },
        { ...common, kind: 'note', contentText: 'x', status: 'failed', errorCode: 'parse_error' },
      ];
      for (const input of accepted) {
        const result = await attempt(tx, () => insertResource(tx, input));
        expect(result.code, `${input.kind} valide`).toBe('00000');
      }
    });
  });

  it('CA-2 — les limites codées refusent PDF, image, chapitre et quota (EF-3, CL-1 à CL-3)', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const common = {
        ownerId: base.userId,
        formationId: base.formationId,
        chapterId: base.chapterId,
      };
      const path = storagePath(base.userId);

      const noteTooLong = await attempt(tx, () =>
        insertResource(tx, { ...common, kind: 'note', contentText: 'a'.repeat(100_001) }),
      );
      expect(noteTooLong.code).toBe('23514');
      expect(noteTooLong.message).toContain('resources_note_shape');

      const pdfTooHeavy = await attempt(tx, () =>
        insertResource(tx, {
          ...common,
          kind: 'pdf',
          storagePath: path,
          sizeBytes: 52_428_801,
          metadata: { pages: 10 },
        }),
      );
      expect(pdfTooHeavy.code).toBe('23514');
      expect(pdfTooHeavy.message).toContain('resource_pdf_limit');

      const pdfTooLong = await attempt(tx, () =>
        insertResource(tx, {
          ...common,
          kind: 'pdf',
          storagePath: path,
          sizeBytes: 1024,
          metadata: { pages: 501 },
        }),
      );
      expect(pdfTooLong.code).toBe('23514');
      expect(pdfTooLong.message).toContain('resource_pdf_limit');

      const imageTooHeavy = await attempt(tx, () =>
        insertResource(tx, {
          ...common,
          kind: 'image',
          storagePath: path,
          sizeBytes: 10_485_761,
        }),
      );
      expect(imageTooHeavy.code).toBe('23514');
      expect(imageTooHeavy.message).toContain('resource_image_limit');

      // Exactly at the bounds: accepted.
      const atBounds = await attempt(tx, () =>
        insertResource(tx, {
          ...common,
          kind: 'pdf',
          storagePath: path,
          sizeBytes: 52_428_800,
          metadata: { pages: 500 },
        }),
      );
      expect(atBounds.code).toBe('00000');

      // CL-3 — 100 contributions in the chapter, the 101st is refused, then a soft deletion frees a slot.
      await tx.execute(sql`
        insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text)
        select ${base.userId}::uuid, ${base.formationId}::uuid, ${base.chapterId}::uuid,
               'note', 'Contribution ' || i, 'Contenu ' || i
        from generate_series(1, 99) i
      `);
      const tooMany = await attempt(tx, () =>
        insertResource(tx, { ...common, kind: 'note', contentText: 'Une de trop' }),
      );
      expect(tooMany.code).toBe('23514');
      expect(tooMany.message).toContain('chapter_resource_limit');

      await tx.execute(sql`
        update public.resources set deleted_at = now()
        where owner_id = ${base.userId}::uuid and chapter_id = ${base.chapterId}::uuid
          and title = 'Contribution 1'
      `);
      const afterDelete = await attempt(tx, () =>
        insertResource(tx, { ...common, kind: 'note', contentText: 'Après suppression' }),
      );
      expect(afterDelete.code).toBe('00000');
    });
  });

  it('CL-4 — deux insertions concurrentes ne peuvent pas franchir ensemble le quota de 2 Go', async () => {
    // Deliberately outside withRollback: the advisory lock only serialises two real transactions.
    const user = await serviceDb().transaction((tx) => createTestUser(tx));
    try {
      const programme = await serviceDb().transaction((tx) =>
        createTestProgramme(tx, user.id, {
          modules: 1,
          chaptersPerModule: 1,
          notionsPerChapter: 0,
        }),
      );
      const chapterId = programme.chapterIds[0] ?? '';
      const path = storagePath(user.id, 'video.mp4');
      const base = {
        ownerId: user.id,
        formationId: programme.formationId,
        chapterId,
        kind: 'video',
        storagePath: path,
      };
      // 2 GiB − 100 bytes already used by the committed baseline.
      await serviceDb().transaction((tx) =>
        insertResource(tx, { ...base, sizeBytes: 2_147_483_548, title: 'Vidéo de base' }),
      );

      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      let firstInserted!: () => void;
      const firstReady = new Promise<void>((resolve) => {
        firstInserted = resolve;
      });

      // The first transaction inserts 60 bytes (total stays under the quota) and holds its lock.
      const first = serviceDb().transaction(async (tx) => {
        await insertResource(tx, { ...base, sizeBytes: 60, title: 'Vidéo concurrente A' });
        firstInserted();
        await firstGate;
      });
      await firstReady;

      // The second transaction wants 100 bytes: only possible after the first one is counted.
      const second = serviceDb().transaction((tx) =>
        insertResource(tx, { ...base, sizeBytes: 100, title: 'Vidéo concurrente B' }),
      );
      const secondOutcome = second.then<Failure, Failure>(
        () => ({ code: '00000', message: '' }),
        (error: unknown) => failureOf(error),
      );

      releaseFirst();
      await first;
      const failure = await secondOutcome;
      expect(failure.code).toBe('23514');
      expect(failure.message).toContain('storage_quota_exceeded');

      const used = await serviceDb().execute<Row>(sql`
        select coalesce(sum(size_bytes), 0)::bigint as total
        from public.resources
        where owner_id = ${user.id}::uuid and deleted_at is null
      `);
      expect(Number(used[0]?.total)).toBe(2_147_483_608);
    } finally {
      // Removes the user, the formation and every resource of this test (cascade).
      await serviceDb().execute(sql`delete from auth.users where id = ${user.id}::uuid`);
    }
  });

  it('CA-3 / CL-6 — la suppression logique retire les passages, efface le contenu et fige la ligne', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const path = storagePath(base.userId);
      const resourceId = await insertResource(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        chapterId: base.chapterId,
        kind: 'note',
        title: 'Clés de comptabilisation',
        contentText: 'Clés de comptabilisation : 40 = débit, 50 = crédit ? À vérifier',
      });
      expect(resourceId).toMatch(/[0-9a-f-]{36}/);

      await tx.execute(sql`
        insert into public.resource_chunks (
          resource_id, owner_id, formation_id, chapter_id, position, text, location
        )
        select ${resourceId}::uuid, ${base.userId}::uuid, ${base.formationId}::uuid,
               ${base.chapterId}::uuid, g.i, 'Passage ' || g.i,
               jsonb_build_object('charStart', g.i * 10, 'charEnd', g.i * 10 + 9)
        from generate_series(0, 39) g(i)
      `);
      const before = await tx.execute<Row>(sql`
        select count(*)::int as count from public.resource_chunks
        where resource_id = ${resourceId}::uuid
      `);
      expect(before[0]?.count).toBe(40);

      await tx.execute(sql`
        update public.resources set deleted_at = now() where id = ${resourceId}::uuid
      `);

      const after = await tx.execute<Row>(sql`
        select count(*)::int as count from public.resource_chunks
        where resource_id = ${resourceId}::uuid
      `);
      expect(after[0]?.count).toBe(0);
      const row = await tx.execute<Row>(sql`
        select title, content_text, deleted_at from public.resources
        where id = ${resourceId}::uuid
      `);
      expect(row).toHaveLength(1);
      expect(row[0]).toMatchObject({ title: 'Clés de comptabilisation', content_text: null });
      expect(row[0]?.deleted_at).not.toBeNull();

      // EF-4 — a deleted resource is frozen for anybody but the table owner (service).
      await tx.execute(sql`create policy spec104_test_update on public.resources
        for update to authenticated using (true) with check (true)`);
      await tx.execute(sql`create policy spec104_test_select on public.resources
        for select to authenticated using (true)`);
      await tx.execute(sql`grant select, update on public.resources to authenticated`);
      const frozen = await attempt(tx, async () => {
        await tx.execute(sql`set local role authenticated`);
        await tx.execute(sql`
          update public.resources set title = 'Renommée' where id = ${resourceId}::uuid
        `);
      });
      expect(frozen.code).toBe('42501');
      expect(frozen.message).toContain('resource_deleted');

      // The service may still erase the file metadata afterwards.
      const serviceUpdate = await attempt(tx, () =>
        tx.execute(sql`
          update public.resources set storage_path = ${path} where id = ${resourceId}::uuid
        `),
      );
      expect(serviceUpdate.code).toBe('00000');
    });
  });

  it('CA-4 / CL-7 — les passages héritent du périmètre de la ressource et le refusent sinon', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const first = await createTestProgramme(tx, user.id, {
        modules: 1,
        chaptersPerModule: 2,
        notionsPerChapter: 0,
      });
      const second = await createTestProgramme(tx, user.id, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 0,
      });
      const resourceId = await insertResource(tx, {
        ownerId: user.id,
        formationId: first.formationId,
        chapterId: first.chapterIds[0] ?? '',
        kind: 'note',
        contentText: 'Note source',
      });

      // Explicit scope accepted.
      const explicit = await insertChunk(tx, {
        resourceId,
        ownerId: user.id,
        formationId: first.formationId,
        chapterId: first.chapterIds[0] ?? '',
        position: 0,
      });
      expect(explicit).toMatch(/[0-9a-f-]{36}/);

      // Copied from the resource when omitted.
      const copied = await insertChunk(tx, { resourceId, position: 1 });
      const copiedRow = await tx.execute<Row>(sql`
        select owner_id::text as owner_id, formation_id::text as formation_id,
               chapter_id::text as chapter_id
        from public.resource_chunks where id = ${copied}::uuid
      `);
      expect(copiedRow[0]).toMatchObject({
        owner_id: user.id,
        formation_id: first.formationId,
        chapter_id: first.chapterIds[0],
      });

      const wrongOwner = await attempt(tx, () =>
        insertChunk(tx, {
          resourceId,
          ownerId: second.formationId,
          formationId: first.formationId,
          chapterId: first.chapterIds[0] ?? '',
          position: 2,
        }),
      );
      expect(wrongOwner.code).toBe('23514');
      expect(wrongOwner.message).toContain('resource_chunk_owner_mismatch');

      const wrongFormation = await attempt(tx, () =>
        insertChunk(tx, {
          resourceId,
          ownerId: user.id,
          formationId: second.formationId,
          chapterId: first.chapterIds[0] ?? '',
          position: 3,
        }),
      );
      expect(wrongFormation.code).toBe('23514');
      expect(wrongFormation.message).toContain('resource_chunk_scope_mismatch');

      const wrongChapter = await attempt(tx, () =>
        insertChunk(tx, {
          resourceId,
          ownerId: user.id,
          formationId: first.formationId,
          chapterId: first.chapterIds[1] ?? '',
          position: 4,
        }),
      );
      expect(wrongChapter.code).toBe('23514');
      expect(wrongChapter.message).toContain('resource_chunk_scope_mismatch');

      const unknownResource = await attempt(tx, () =>
        insertChunk(tx, {
          resourceId: '00000000-0000-4000-8000-000000000000',
          ownerId: user.id,
          formationId: first.formationId,
          position: 5,
        }),
      );
      expect(unknownResource.code).toBe('23503');
      expect(unknownResource.message).toContain('resource_not_found');

      await tx.execute(sql`
        update public.resources set deleted_at = now() where id = ${resourceId}::uuid
      `);
      const deleted = await attempt(tx, () => insertChunk(tx, { resourceId, position: 6 }));
      expect(deleted.code).toBe('42501');
      expect(deleted.message).toContain('resource_deleted');
    });
  });

  it('CL-5 — un embedding de dimension 1 023 est refusé (22000)', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const resourceId = await insertResource(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        chapterId: base.chapterId,
        kind: 'note',
        contentText: 'Note vectorielle',
      });
      const wrongDimension = `[${Array<number>(1023).fill(0.1).join(',')}]`;
      const result = await attempt(tx, () =>
        insertChunk(tx, { resourceId, position: 0, embedding: wrongDimension }),
      );
      expect(result.code).toBe('22000');
      expect(result.message).toMatch(/expected 1024 dimensions/i);
    });
  });

  it('CA-5 / ET-5 — 5 000 passages, 8 plus proches voisins par HNSW en moins de 50 ms', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const resourceId = await insertResource(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        chapterId: base.chapterId,
        kind: 'note',
        contentText: 'Corpus vectoriel',
      });

      // Deterministic hash-like vectors: each component is derived from the passage identifier and
      // its index, then normalised by pgvector for the cosine metric (ADR-0056 mock mode).
      await tx.execute(sql`
        insert into public.resource_chunks (
          resource_id, owner_id, formation_id, chapter_id, position, text, location, embedding
        )
        select ${resourceId}::uuid, ${base.userId}::uuid, ${base.formationId}::uuid,
               ${base.chapterId}::uuid, g.i, 'Passage ' || g.i,
               jsonb_build_object('charStart', 0, 'charEnd', 10),
               (
                 '[' || (
                   select string_agg(
                     (((g.i * 7919 + j * 104729) % 2001 - 1000)::float8 / 1000)::text,
                     ',' order by j
                   )
                   from generate_series(1, 1024) j
                 ) || ']'
               )::extensions.vector
        from generate_series(0, 4999) g(i)
      `);
      const total = await tx.execute<Row>(sql`
        select count(*)::int as count from public.resource_chunks
        where owner_id = ${base.userId}::uuid
      `);
      expect(total[0]?.count).toBe(5000);

      const vector = toVectorLiteral(fakeEmbedding('clé débit'));
      await tx.execute(sql`set local hnsw.ef_search = 40`);
      await tx.execute(sql`set local enable_seqscan = off`);
      await tx.execute(sql`set local enable_sort = off`);
      await tx.execute(sql`set local enable_bitmapscan = off`);

      const query = sql`
        select id::text as id, embedding <=> ${vector}::extensions.vector as distance
        from public.resource_chunks
        where owner_id = ${base.userId}::uuid
        order by embedding <=> ${vector}::extensions.vector
        limit 8
      `;
      const plan = await tx.execute<Row>(sql`explain (analyze, format json) ${query}`);
      const rendered = JSON.stringify(plan);
      expect(rendered).toContain('resource_chunks_embedding_hnsw_idx');
      const match = /"Execution Time":\s*([0-9.]+)/.exec(rendered);
      const executionMs = Number(match?.[1] ?? Number.POSITIVE_INFINITY);
      expect(executionMs, `durée mesurée : ${String(executionMs)} ms`).toBeLessThan(50);

      const neighbours = await tx.execute<Row>(query);
      expect(neighbours).toHaveLength(8);
      const distances = neighbours.map((row) => Number(row.distance));
      expect(distances).toEqual([...distances].sort((left, right) => left - right));
    });
  });

  it('CA-6 / CL-10 — la cascade du chapitre efface ressources et passages, l’import garde sa ligne', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const resourceId = await insertResource(tx, {
        ownerId: base.userId,
        formationId: base.formationId,
        chapterId: base.chapterId,
        kind: 'note',
        contentText: 'Note importée',
      });
      await insertChunk(tx, { resourceId, position: 0 });
      const importRows = await tx.execute<{ id: string }>(sql`
        insert into public.programme_imports (
          formation_id, user_id, source_kind, raw_text, resource_id
        )
        values (
          ${base.formationId}::uuid, ${base.userId}::uuid, 'text', 'Programme importé',
          ${resourceId}::uuid
        )
        returning id::text as id
      `);
      const importId = importRows[0]?.id ?? '';

      await tx.execute(sql`delete from public.chapters where id = ${base.chapterId}::uuid`);

      const counts = await tx.execute<Row>(sql`
        select
          (select count(*)::int from public.resources where id = ${resourceId}::uuid) as resources,
          (select count(*)::int from public.resource_chunks where resource_id = ${resourceId}::uuid) as chunks
      `);
      expect(counts[0]).toMatchObject({ resources: 0, chunks: 0 });

      const kept = await tx.execute<Row>(sql`
        select id::text as id, resource_id from public.programme_imports
        where id = ${importId}::uuid
      `);
      expect(kept).toHaveLength(1);
      expect(kept[0]?.resource_id).toBeNull();
    });
  });
});
