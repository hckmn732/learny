// Server data of the SPEC-509 demonstration: two real ingestion runs and one failure + retry,
// all inside `withRollback` so the page never mutates the database. Provider ports are the mock
// adapters: no network, no key, deterministic vectors (ADR-0048).
import { createHash, randomUUID } from 'node:crypto';

import type { IngestionOutcome } from '@learny/contracts';
import { clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { sql, type Db, type DbTx } from '@learny/db';
import { createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';
import {
  DEFAULT_PDF_LIMITS,
  fakeEmbedding,
  mockEmbeddingClient,
  processResource,
  toVectorLiteral,
  type IngestionEvents,
} from '@learny/ingestion';
import { buildEmptyPdf, demoPdf } from '@learny/ingestion/fixtures';

export interface Spec509VectorSummary {
  dims: number;
  norm: number;
  sample: number[];
  digest: string;
}

export interface Spec509Chunk {
  position: number;
  text: string;
  page: number | null;
  charStart: number;
  charEnd: number;
  tokenCount: number;
  vector: Spec509VectorSummary;
}

export interface Spec509Snapshot {
  status: 'ready' | 'failed' | 'queued' | 'processing';
  errorCode: string | null;
  errorMessage: string | null;
  chunkCount: number;
  chunks: Spec509Chunk[];
  pages: number | null;
  anthropicFileId: string | null;
  event: string | null;
  outcome: IngestionOutcome;
}

export interface Spec509Data {
  note: Spec509Snapshot;
  pdf: Spec509Snapshot;
  failure: {
    failed: Spec509Snapshot;
    retried: Spec509Snapshot;
  };
  input: { resourceId: string; kind: 'note' | 'pdf' };
  contractOutput: IngestionOutcome;
}

interface ChunkRow extends Record<string, unknown> {
  position: number;
  text: string;
  location: Record<string, unknown>;
  token_count: number;
}

interface StatusRow extends Record<string, unknown> {
  status: string;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  chunk_count: number;
}

function databaseOf(tx: DbTx): Db {
  return {
    execute: tx.execute.bind(tx),
    transaction: <T>(fn: (inner: DbTx) => Promise<T>) => fn(tx),
  } as unknown as Db;
}

function vectorSummary(text: string): Spec509VectorSummary {
  const vector = fakeEmbedding(text);
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return {
    dims: vector.length,
    norm,
    sample: vector.slice(0, 5),
    digest: createHash('sha256').update(toVectorLiteral(vector)).digest('hex').slice(0, 16),
  };
}

async function snapshot(
  tx: DbTx,
  resourceId: string,
  outcome: IngestionOutcome,
  event: string | null,
): Promise<Spec509Snapshot> {
  const rows = await tx.execute<StatusRow>(sql`
    select status::text as status, error_code, error_message, metadata,
           (select count(*)::int from public.resource_chunks c where c.resource_id = r.id) as chunk_count
    from public.resources r where r.id = ${resourceId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error('apport de démonstration absent');
  const chunks = await tx.execute<ChunkRow>(sql`
    select position, text, location, token_count
    from public.resource_chunks where resource_id = ${resourceId}::uuid order by position
  `);
  return {
    status: row.status as Spec509Snapshot['status'],
    errorCode: row.error_code,
    errorMessage: row.error_message,
    chunkCount: row.chunk_count,
    pages: typeof row.metadata.pages === 'number' ? row.metadata.pages : null,
    anthropicFileId:
      typeof row.metadata.anthropicFileId === 'string' ? row.metadata.anthropicFileId : null,
    event,
    outcome,
    chunks: chunks.map((chunk) => ({
      position: chunk.position,
      text: chunk.text,
      page: typeof chunk.location.page === 'number' ? chunk.location.page : null,
      charStart: Number(chunk.location.charStart),
      charEnd: Number(chunk.location.charEnd),
      tokenCount: chunk.token_count,
      vector: vectorSummary(chunk.text),
    })),
  };
}

function recorder(): IngestionEvents & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    resourceReady: () => {
      sent.push('resource/ready');
      return Promise.resolve();
    },
    resourceFailed: () => {
      sent.push('resource/failed');
      return Promise.resolve();
    },
  };
}

const NOTE =
  'Clés de comptabilisation\n\nLe compte 401 enregistre les fournisseurs. Le compte 512 enregistre la banque.\n\nUne écriture est équilibrée quand le total des débits égale le total des crédits.';

/** Full demonstration payload; every read and write is rolled back at the end of the request. */
export async function loadSpec509Demo(): Promise<Spec509Data> {
  return withRollback(async (tx) => {
    const db = databaseOf(tx);
    const user = await createTestUser(tx);
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 0,
    });
    const chapterId = programme.chapterIds[0] ?? '';
    const logger = createLogger({ level: 'silent' });
    const ctx = { sdb: db, clock, logger, requestId: 'demo-spec-509' };

    const noteId = randomUUID();
    await tx.execute(sql`
      insert into public.resources (
        id, owner_id, formation_id, chapter_id, kind, title, content_text, status
      )
      values (
        ${noteId}::uuid, ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
        'note', 'Clés de comptabilisation', ${NOTE}, 'queued'
      )
    `);
    const noteEvents = recorder();
    const noteOutcome = await processResource(ctx, noteId, {
      readPdf: () => Promise.resolve(null),
      embedder: mockEmbeddingClient(),
      uploadPdf: () => Promise.resolve(null),
      events: noteEvents,
      limits: DEFAULT_PDF_LIMITS,
    });
    const note = await snapshot(tx, noteId, noteOutcome, noteEvents.sent.at(-1) ?? null);

    const pdfBytes = demoPdf();
    const pdfId = randomUUID();
    const pdfPath = `${user.id}/${pdfId}/demo.pdf`;
    await tx.execute(sql`
      insert into public.resources (
        id, owner_id, formation_id, chapter_id, kind, title, storage_path, mime, size_bytes,
        status, metadata
      )
      values (
        ${pdfId}::uuid, ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
        'pdf', 'Support de cours', ${pdfPath}, 'application/pdf', ${pdfBytes.length}, 'queued',
        '{"pages": 2}'::jsonb
      )
    `);
    const pdfEvents = recorder();
    const pdfOutcome = await processResource(ctx, pdfId, {
      readPdf: () => Promise.resolve(pdfBytes),
      embedder: mockEmbeddingClient(),
      uploadPdf: () => Promise.resolve('file_mock_spec509'),
      events: pdfEvents,
      limits: DEFAULT_PDF_LIMITS,
    });
    const pdf = await snapshot(tx, pdfId, pdfOutcome, pdfEvents.sent.at(-1) ?? null);

    let failureBytes = buildEmptyPdf();
    const failureId = randomUUID();
    const failurePath = `${user.id}/${failureId}/scan.pdf`;
    await tx.execute(sql`
      insert into public.resources (
        id, owner_id, formation_id, chapter_id, kind, title, storage_path, mime, size_bytes,
        status, metadata
      )
      values (
        ${failureId}::uuid, ${user.id}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
        'pdf', 'Scan sans texte', ${failurePath}, 'application/pdf', ${failureBytes.length},
        'queued', '{"pages": 1}'::jsonb
      )
    `);
    const failureEvents = recorder();
    const failureDeps = {
      readPdf: () => Promise.resolve(failureBytes),
      embedder: mockEmbeddingClient(),
      uploadPdf: () => Promise.resolve(null),
      events: failureEvents,
      limits: DEFAULT_PDF_LIMITS,
    };
    const failedOutcome = await processResource(ctx, failureId, failureDeps);
    const failed = await snapshot(tx, failureId, failedOutcome, failureEvents.sent.at(-1) ?? null);

    failureBytes = demoPdf();
    const retriedOutcome = await processResource(ctx, failureId, failureDeps);
    const retried = await snapshot(
      tx,
      failureId,
      retriedOutcome,
      failureEvents.sent.at(-1) ?? null,
    );

    return {
      note,
      pdf,
      failure: { failed, retried },
      input: { resourceId: noteId, kind: 'note' },
      contractOutput: noteOutcome,
    };
  });
}
