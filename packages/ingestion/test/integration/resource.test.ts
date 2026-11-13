// Integration tests of the ingestion service (SPEC-509 §12, CA-1 to CA-4).
//
// Real Postgres with its Row Level Security policies and triggers, real notes and PDF bytes, but
// no provider: `LLM_MODE=mock` embeddings are deterministic and the PDF reader is injected. Every
// test runs in `withRollback`, so the shared local database stays untouched.
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { sql, type Db, type DbTx } from '@learny/db';
import { asUser, createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';

import { buildEmptyPdf, demoPdf } from '../../fixtures/pdf';
import {
  DEFAULT_PDF_LIMITS,
  fakeEmbedding,
  IngestionError,
  processResource,
  toVectorLiteral,
  type EmbeddingClient,
  type IngestionContext,
  type IngestionDeps,
  type IngestionEvents,
  type PdfReader,
} from '../../src/index';

interface Base {
  tx: DbTx;
  db: Db;
  userId: string;
  formationId: string;
  chapterId: string;
}

interface RecordedEvents extends IngestionEvents {
  ready: { userId: string; resourceId: string; chunkCount: number }[];
  failed: { userId: string; resourceId: string; errorCode: string }[];
}

function recorder(): RecordedEvents {
  const ready: RecordedEvents['ready'] = [];
  const failed: RecordedEvents['failed'] = [];
  return {
    ready,
    failed,
    resourceReady: (event) => {
      ready.push(event);
      return Promise.resolve();
    },
    resourceFailed: (event) => {
      failed.push(event);
      return Promise.resolve();
    },
  };
}

/** The service only needs the transaction's `execute` and a no-op nested transaction. */
function databaseOf(tx: DbTx): Db {
  return {
    execute: tx.execute.bind(tx),
    transaction: <T>(fn: (inner: DbTx) => Promise<T>) => fn(tx),
  } as unknown as Db;
}

/** `withRollback` hands a fresh transaction to the callback; each test opens its own. */
function inBase<T>(run: (base: Base) => Promise<T>): Promise<T> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx);
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 0,
    });
    return run({
      tx,
      db: databaseOf(tx),
      userId: user.id,
      formationId: programme.formationId,
      chapterId: programme.chapterIds[0] ?? '',
    });
  });
}

async function insertNote(base: Base, content: string): Promise<string> {
  const id = randomUUID();
  await base.tx.execute(sql`
    insert into public.resources (
      id, owner_id, formation_id, chapter_id, kind, title, content_text, status
    )
    values (
      ${id}::uuid, ${base.userId}::uuid, ${base.formationId}::uuid, ${base.chapterId}::uuid,
      'note', 'Note de test', ${content}, 'queued'
    )
  `);
  return id;
}

async function insertPdf(base: Base, bytes: Uint8Array): Promise<string> {
  const id = randomUUID();
  const path = `${base.userId}/${id}/guide.pdf`;
  await base.tx.execute(sql`
    insert into public.resources (
      id, owner_id, formation_id, chapter_id, kind, title, storage_path, mime, size_bytes,
      status, metadata
    )
    values (
      ${id}::uuid, ${base.userId}::uuid, ${base.formationId}::uuid, ${base.chapterId}::uuid,
      'pdf', 'PDF de test', ${path}, 'application/pdf', ${bytes.length}, 'queued',
      '{"pages": 2}'::jsonb
    )
  `);
  return id;
}

function context(db: Db): IngestionContext {
  return {
    sdb: db,
    clock,
    logger: createLogger({ level: 'silent' }),
    requestId: 'req-spec-509',
  };
}

function depsOf(
  overrides: Partial<IngestionDeps> & { events?: RecordedEvents } = {},
): IngestionDeps & { events: RecordedEvents; embedder: EmbeddingClient } {
  const events = overrides.events ?? recorder();
  const embedder: EmbeddingClient = overrides.embedder ?? {
    embed: (texts) => Promise.resolve(texts.map((text) => fakeEmbedding(text))),
  };
  return {
    readPdf: overrides.readPdf ?? (() => Promise.resolve(demoPdf())),
    embedder,
    uploadPdf: overrides.uploadPdf ?? (() => Promise.resolve(null)),
    events,
    limits: overrides.limits ?? DEFAULT_PDF_LIMITS,
  };
}

interface StatusRow extends Record<string, unknown> {
  status: string;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  deleted: boolean;
}

async function statusOf(tx: DbTx, id: string): Promise<StatusRow> {
  const rows = await tx.execute<StatusRow>(sql`
    select status::text as status, error_code, error_message, metadata,
           deleted_at is not null as deleted
    from public.resources where id = ${id}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error('resource absent');
  return row;
}

interface ChunkRow extends Record<string, unknown> {
  position: number;
  text: string;
  location: Record<string, unknown>;
  token_count: number;
  dims: number;
  vector: string;
}

async function chunksOf(tx: DbTx, id: string): Promise<ChunkRow[]> {
  return tx.execute<ChunkRow>(sql`
    select position, text, location, token_count, vector_dims(embedding)::int as dims,
           embedding::text as vector
    from public.resource_chunks
    where resource_id = ${id}::uuid
    order by position
  `);
}

describe('[SPEC-509] service d’ingestion', () => {
  it('traite une note et un PDF, écrit les passages localisés et émet resource/ready (CA-1, CA-2)', async () => {
    await inBase(async (base) => {
      const events = recorder();
      const deps = depsOf({ events });
      const note = 'Clés de comptabilisation\n\nDébit 120, crédit 120 : pièce équilibrée.';
      const noteId = await insertNote(base, note);
      const noteOutcome = await processResource(context(base.db), noteId, deps);

      expect(noteOutcome).toMatchObject({
        resourceId: noteId,
        outcome: 'ready',
        errorCode: null,
      });
      expect(noteOutcome.chunkCount).toBeGreaterThan(0);
      const noteChunks = await chunksOf(base.tx, noteId);
      expect(noteChunks.length).toBe(noteOutcome.chunkCount);
      for (const chunk of noteChunks) {
        expect(note.slice(Number(chunk.location.charStart), Number(chunk.location.charEnd))).toBe(
          chunk.text,
        );
        expect(chunk.dims).toBe(1024);
        expect(chunk.vector).toBe(toVectorLiteral(fakeEmbedding(chunk.text)));
        expect(chunk.token_count).toBe(Math.ceil(chunk.text.length / 4));
      }
      expect(events.ready).toEqual([
        { userId: base.userId, resourceId: noteId, chunkCount: noteChunks.length },
      ]);

      const pdfBytes = demoPdf();
      const pdfId = await insertPdf(base, pdfBytes);
      const pdfOutcome = await processResource(
        context(base.db),
        pdfId,
        depsOf({
          events,
          readPdf: () => Promise.resolve(pdfBytes),
          uploadPdf: () => Promise.resolve('file_mock_spec509'),
        }),
      );
      expect(pdfOutcome.outcome).toBe('ready');
      const pdfStatus = await statusOf(base.tx, pdfId);
      expect(pdfStatus.status).toBe('ready');
      expect(pdfStatus.metadata.pages).toBe(2);
      expect(pdfStatus.metadata.anthropicFileId).toBe('file_mock_spec509');
      const pdfChunks = await chunksOf(base.tx, pdfId);
      expect(pdfChunks.some((chunk) => chunk.location.page === 1)).toBe(true);
      expect(pdfChunks.some((chunk) => chunk.location.page === 2)).toBe(true);
      for (const chunk of pdfChunks) {
        expect(chunk.text.length).toBeGreaterThan(0);
        expect(chunk.dims).toBe(1024);
      }
      expect(events.ready).toHaveLength(2);
    });
  });

  it('ne duplique ni passage ni embedding quand le même événement est livré deux fois (CA-3)', async () => {
    await inBase(async (base) => {
      const events = recorder();
      let embeddingCalls = 0;
      const embedder: EmbeddingClient = {
        embed: (texts) => {
          embeddingCalls += 1;
          return Promise.resolve(texts.map((text) => fakeEmbedding(text)));
        },
      };
      const id = await insertNote(base, 'Une note suffisamment longue pour un passage.');
      const deps = depsOf({ events, embedder });
      const first = await processResource(context(base.db), id, deps);
      const firstChunks = await chunksOf(base.tx, id);
      const second = await processResource(context(base.db), id, deps);
      const secondChunks = await chunksOf(base.tx, id);

      expect(first.outcome).toBe('ready');
      expect(second.outcome).toBe('ready');
      expect(second.chunkCount).toBe(first.chunkCount);
      expect(secondChunks.map((chunk) => chunk.position)).toEqual(
        firstChunks.map((chunk) => chunk.position),
      );
      expect(secondChunks.map((chunk) => chunk.text)).toEqual(
        firstChunks.map((chunk) => chunk.text),
      );
      expect(firstChunks.length).toBe(first.chunkCount);
      expect(embeddingCalls).toBe(1);
      expect(events.ready).toHaveLength(1);
      expect(events.failed).toHaveLength(0);
    });
  });

  it('isole les passages entre deux utilisateurs et refuse leur écriture directe (RLS, ET-4)', async () => {
    await inBase(async (base) => {
      const id = await insertNote(base, 'Note strictement privée de son propriétaire.');
      await processResource(context(base.db), id, depsOf());

      const other = await createTestUser(base.tx, {
        email: `other-${randomUUID()}@test.learny.test`,
      });

      const ownerRows = await asUser(base.tx, base.userId, async (tx) =>
        tx.execute<{ total: number }>(sql`
          select count(*)::int as total from public.resource_chunks where resource_id = ${id}::uuid
        `),
      );
      expect(ownerRows[0]?.total).toBeGreaterThan(0);

      // The select policy hides the passages of another owner.
      const foreignRows = await asUser(base.tx, other.id, async (tx) =>
        tx.execute<{ total: number }>(sql`
          select count(*)::int as total from public.resource_chunks where resource_id = ${id}::uuid
        `),
      );
      expect(foreignRows[0]?.total).toBe(0);

      // There is no insert policy: an authenticated caller cannot forge a passage.
      await expect(
        asUser(base.tx, base.userId, async (tx) =>
          tx.execute(sql`
            insert into public.resource_chunks (
              resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count
            )
            values (
              ${id}::uuid, ${base.userId}::uuid, ${base.formationId}::uuid, ${base.chapterId}::uuid,
              99, 'passage forgé', '{"charStart":0,"charEnd":13}'::jsonb, 3
            )
          `),
        ),
      ).rejects.toThrow();
    });
  });

  it('laisse un PDF sans texte en échec lisible, puis réussit un réessai avec le bon fichier (CA-4, CL-1)', async () => {
    await inBase(async (base) => {
      const events = recorder();
      let bytes: Uint8Array = buildEmptyPdf();
      const id = await insertPdf(base, bytes);
      const deps = depsOf({ events, readPdf: () => Promise.resolve(bytes) });
      const failed = await processResource(context(base.db), id, deps);

      expect(failed.outcome).toBe('failed');
      expect(failed.errorCode).toBe('PDF_EMPTY_TEXT');
      expect(failed.errorMessage).toMatch(/aucun texte/i);
      const status = await statusOf(base.tx, id);
      expect(status.status).toBe('failed');
      expect(status.error_code).toBe('PDF_EMPTY_TEXT');
      expect(status.error_message).toMatch(/aucun texte/i);
      expect(events.failed).toEqual([
        { userId: base.userId, resourceId: id, errorCode: 'PDF_EMPTY_TEXT' },
      ]);
      expect(await chunksOf(base.tx, id)).toHaveLength(0);

      bytes = demoPdf();
      const retried = await processResource(context(base.db), id, deps);
      expect(retried.outcome).toBe('ready');
      const ready = await statusOf(base.tx, id);
      expect(ready.status).toBe('ready');
      expect(ready.error_code).toBeNull();
      expect((await chunksOf(base.tx, id)).length).toBeGreaterThan(0);
      expect(events.ready).toHaveLength(1);
    });
  });

  it('garde le statut processing et reprend quand le fournisseur d’embeddings est indisponible (CL-3)', async () => {
    await inBase(async (base) => {
      const events = recorder();
      let failures = 1;
      const embedder: EmbeddingClient = {
        embed: (texts) => {
          if (failures > 0) {
            failures -= 1;
            return Promise.reject(
              new IngestionError(
                'EMBEDDING_UNAVAILABLE',
                'Le service d’embeddings est momentanément indisponible.',
                { permanent: false },
              ),
            );
          }
          return Promise.resolve(texts.map((text) => fakeEmbedding(text)));
        },
      };
      const id = await insertNote(base, 'Une note à vectoriser en deux tentatives.');
      const deps = depsOf({ events, embedder });
      await expect(processResource(context(base.db), id, deps)).rejects.toThrow(/indisponible/i);
      const processing = await statusOf(base.tx, id);
      expect(processing.status).toBe('processing');
      expect(await chunksOf(base.tx, id)).toHaveLength(0);
      expect(events.failed).toHaveLength(0);

      const retried = await processResource(context(base.db), id, deps);
      expect(retried.outcome).toBe('ready');
      expect((await statusOf(base.tx, id)).status).toBe('ready');
      expect(events.ready).toHaveLength(1);
    });
  });

  it('s’arrête sans recréer un apport supprimé pendant le traitement (CL-5)', async () => {
    await inBase(async (base) => {
      const bytes = demoPdf();
      const id = await insertPdf(base, bytes);
      const reader: PdfReader = async () => {
        await base.tx.execute(sql`
          update public.resources set deleted_at = ${clock.now().toISOString()}::timestamptz
          where id = ${id}::uuid
        `);
        return bytes;
      };
      const events = recorder();
      const outcome = await processResource(
        context(base.db),
        id,
        depsOf({ events, readPdf: reader }),
      );
      expect(outcome.outcome).toBe('skipped');
      const status = await statusOf(base.tx, id);
      expect(status.deleted).toBe(true);
      expect(await chunksOf(base.tx, id)).toHaveLength(0);
      expect(events.ready).toHaveLength(0);
      expect(events.failed).toHaveLength(0);
    });
  });

  it('refuse un PDF trop lourd, trop long, absent ou une note vide avec un code stable', async () => {
    await inBase(async (base) => {
      const bytes = demoPdf();
      const heavyId = await insertPdf(base, bytes);
      const heavy = await processResource(
        context(base.db),
        heavyId,
        depsOf({ limits: { ...DEFAULT_PDF_LIMITS, maxBytes: 100 } }),
      );
      expect(heavy.errorCode).toBe('PDF_TOO_LARGE');

      const longId = await insertPdf(base, bytes);
      const tooLong = await processResource(
        context(base.db),
        longId,
        depsOf({
          limits: { ...DEFAULT_PDF_LIMITS, maxPages: 1 },
          readPdf: () => Promise.resolve(bytes),
        }),
      );
      expect(tooLong.errorCode).toBe('PDF_TOO_MANY_PAGES');

      const missingId = await insertPdf(base, bytes);
      const missing = await processResource(
        context(base.db),
        missingId,
        depsOf({ readPdf: () => Promise.resolve(null) }),
      );
      expect(missing.errorCode).toBe('RESOURCE_FILE_MISSING');

      const noteId = await insertNote(base, '   ');
      const emptyNote = await processResource(context(base.db), noteId, depsOf());
      expect(emptyNote.errorCode).toBe('NOTE_EMPTY');
    });
  });
});
