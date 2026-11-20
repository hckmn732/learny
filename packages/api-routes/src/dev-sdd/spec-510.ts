// Server data of the SPEC-510 demonstration: real extraction and passage pipeline in a rolled-back
// transaction, with mock embeddings, mock captions and the simulated vision task (ADR-0048/0049).
import { randomUUID } from 'node:crypto';

import type { IngestionOutcome } from '@learny/contracts';
import { clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { sql, type Db, type DbTx } from '@learny/db';
import { createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';
import {
  DEFAULT_PDF_LIMITS,
  mockEmbeddingClient,
  mockYoutubeProvider,
  processResource,
  type IngestionEvents,
} from '@learny/ingestion';
import { WEB_FIXTURE_HTML, WEB_FIXTURE_URL } from '@learny/ingestion/fixtures/web';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

export interface Spec510Chunk {
  position: number;
  text: string;
  anchor: string | null;
  startSec: number | null;
  endSec: number | null;
  tokenCount: number;
}

export interface Spec510Snapshot {
  status: 'ready' | 'failed' | 'queued' | 'processing';
  title: string;
  errorCode: string | null;
  errorMessage: string | null;
  chunkCount: number;
  contentOrigin: string | null;
  visionModel: string | null;
  chunks: Spec510Chunk[];
  event: string | null;
  outcome: IngestionOutcome;
}

export interface Spec510Data {
  web: Spec510Snapshot;
  youtube: Spec510Snapshot;
  image: Spec510Snapshot;
  ssrf: Spec510Snapshot;
  noCaptions: Spec510Snapshot;
  input: { kind: 'web' | 'youtube' | 'image'; resourceId: string };
  contractOutput: IngestionOutcome;
}

interface StatusRow extends Record<string, unknown> {
  status: string;
  title: string;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  chunk_count: number;
}

interface ChunkRow extends Record<string, unknown> {
  position: number;
  text: string;
  location: Record<string, unknown>;
  token_count: number;
}

function databaseOf(tx: DbTx): Db {
  return {
    execute: tx.execute.bind(tx),
    select: tx.select.bind(tx),
    insert: tx.insert.bind(tx),
    transaction: <T>(fn: (inner: DbTx) => Promise<T>) => fn(tx),
  } as unknown as Db;
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

async function snapshot(
  tx: DbTx,
  resourceId: string,
  outcome: IngestionOutcome,
  event: string | null,
): Promise<Spec510Snapshot> {
  const rows = await tx.execute<StatusRow>(sql`
    select status::text as status, title, error_code, error_message, metadata,
           (select count(*)::int from public.resource_chunks c where c.resource_id = r.id) as chunk_count
    from public.resources r where r.id = ${resourceId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new Error('apport de démonstration absent');
  const chunks = await tx.execute<ChunkRow>(sql`
    select position, text, location, token_count from public.resource_chunks
    where resource_id = ${resourceId}::uuid order by position
  `);
  const ingestion = row.metadata.ingestion as Record<string, unknown> | undefined;
  return {
    status: row.status as Spec510Snapshot['status'],
    title: row.title,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    chunkCount: row.chunk_count,
    contentOrigin: typeof ingestion?.contentOrigin === 'string' ? ingestion.contentOrigin : null,
    visionModel: typeof ingestion?.visionModel === 'string' ? ingestion.visionModel : null,
    event,
    outcome,
    chunks: chunks.map((chunk) => ({
      position: chunk.position,
      text: chunk.text,
      anchor: typeof chunk.location.anchor === 'string' ? chunk.location.anchor : null,
      startSec: typeof chunk.location.startSec === 'number' ? chunk.location.startSec : null,
      endSec: typeof chunk.location.endSec === 'number' ? chunk.location.endSec : null,
      tokenCount: chunk.token_count,
    })),
  };
}

async function insert(
  tx: DbTx,
  values: {
    id: string;
    userId: string;
    formationId: string;
    chapterId: string;
    kind: string;
    title: string;
    url?: string;
    storagePath?: string;
    mime?: string;
    sizeBytes?: number;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into public.resources (
      id, owner_id, formation_id, chapter_id, kind, title, url, storage_path, mime, size_bytes, status
    ) values (
      ${values.id}::uuid, ${values.userId}::uuid, ${values.formationId}::uuid,
      ${values.chapterId}::uuid, ${values.kind}::public.resource_kind, ${values.title},
      ${values.url ?? null}, ${values.storagePath ?? null}, ${values.mime ?? null},
      ${values.sizeBytes ?? null}, 'queued'
    )
  `);
}

export async function loadSpec510Demo(): Promise<Spec510Data> {
  return withRollback(async (tx) => {
    const db = databaseOf(tx);
    const user = await createTestUser(tx);
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${user.id}::uuid, 'active', ${new Date(clock.now().getTime() + 30 * 86_400_000).toISOString()}::timestamptz)
    `);
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 0,
    });
    const chapterId = programme.chapterIds[0] ?? '';
    const logger = createLogger({ level: 'silent' });
    const ctx = { sdb: db, clock, logger, requestId: 'demo-spec-510' };
    const base = {
      readPdf: () => Promise.resolve(null),
      embedder: mockEmbeddingClient(),
      uploadPdf: () => Promise.resolve(null),
      events: recorder(),
      limits: DEFAULT_PDF_LIMITS,
      mode: 'mock' as const,
    };

    const webId = randomUUID();
    await insert(tx, {
      id: webId,
      userId: user.id,
      formationId: programme.formationId,
      chapterId,
      kind: 'web',
      title: 'fixture.learny.test',
      url: WEB_FIXTURE_URL,
    });
    const webEvents = recorder();
    const webOutcome = await processResource(ctx, webId, {
      ...base,
      events: webEvents,
      fetchWeb: () =>
        Promise.resolve({
          url: WEB_FIXTURE_URL,
          contentType: 'text/html; charset=utf-8',
          body: new TextEncoder().encode(WEB_FIXTURE_HTML),
        }),
    });
    const web = await snapshot(tx, webId, webOutcome, webEvents.sent.at(-1) ?? null);

    const youtubeId = randomUUID();
    await insert(tx, {
      id: youtubeId,
      userId: user.id,
      formationId: programme.formationId,
      chapterId,
      kind: 'youtube',
      title: 'Vidéo YouTube',
      url: 'https://youtu.be/dQw4w9WgXcQ',
    });
    const youtubeEvents = recorder();
    const youtubeOutcome = await processResource(ctx, youtubeId, {
      ...base,
      events: youtubeEvents,
      youtube: mockYoutubeProvider(),
    });
    const youtube = await snapshot(
      tx,
      youtubeId,
      youtubeOutcome,
      youtubeEvents.sent.at(-1) ?? null,
    );

    const imageId = randomUUID();
    const imagePath = `${user.id}/${imageId}/capture.png`;
    await insert(tx, {
      id: imageId,
      userId: user.id,
      formationId: programme.formationId,
      chapterId,
      kind: 'image',
      title: 'Capture du compte 512',
      storagePath: imagePath,
      mime: 'image/png',
      sizeBytes: PNG.length,
    });
    const imageEvents = recorder();
    const imageOutcome = await processResource(ctx, imageId, {
      ...base,
      readPdf: () => Promise.resolve(PNG),
      events: imageEvents,
    });
    const image = await snapshot(tx, imageId, imageOutcome, imageEvents.sent.at(-1) ?? null);

    const ssrfId = randomUUID();
    await insert(tx, {
      id: ssrfId,
      userId: user.id,
      formationId: programme.formationId,
      chapterId,
      kind: 'web',
      title: 'Adresse privée',
      url: 'https://127.0.0.1/secret',
    });
    const ssrfEvents = recorder();
    const ssrfOutcome = await processResource(ctx, ssrfId, { ...base, events: ssrfEvents });
    const ssrf = await snapshot(tx, ssrfId, ssrfOutcome, ssrfEvents.sent.at(-1) ?? null);

    const noCaptionsId = randomUUID();
    await insert(tx, {
      id: noCaptionsId,
      userId: user.id,
      formationId: programme.formationId,
      chapterId,
      kind: 'youtube',
      title: 'Vidéo sans sous-titres',
      url: 'https://www.youtube.com/watch?v=noCaptions1',
    });
    const noCaptionsEvents = recorder();
    const noCaptionsOutcome = await processResource(ctx, noCaptionsId, {
      ...base,
      events: noCaptionsEvents,
      youtube: mockYoutubeProvider(),
    });
    const noCaptions = await snapshot(
      tx,
      noCaptionsId,
      noCaptionsOutcome,
      noCaptionsEvents.sent.at(-1) ?? null,
    );

    return {
      web,
      youtube,
      image,
      ssrf,
      noCaptions,
      input: { kind: 'web', resourceId: webId },
      contractOutput: webOutcome,
    };
  });
}
