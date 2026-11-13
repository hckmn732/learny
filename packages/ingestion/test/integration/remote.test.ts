// Integration tests of the remote ingestion (SPEC-510 §12, CA-1 to CA-4).
//
// Real Postgres with RLS, a local fixture HTTP server for the anti-SSRF guard, mock embeddings,
// mock YouTube captions and the simulated `light` vision task. Every run is rolled back.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { sql, type Db, type DbTx } from '@learny/db';
import { asUser, createTestProgramme, createTestUser, withRollback } from '@learny/db/testing';

import { WEB_FIXTURE_HTML, WEB_FIXTURE_URL } from '../../fixtures/web';
import {
  DEFAULT_PDF_LIMITS,
  extractImageDocument,
  extractWeb,
  mockEmbeddingClient,
  mockYoutubeProvider,
  createLlmVisionReader,
  processResource,
  type EmbeddingClient,
  type IngestionContext,
  type IngestionDeps,
  type IngestionEvents,
  type VisionReader,
} from '../../src/index';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

interface Base {
  tx: DbTx;
  db: Db;
  userId: string;
  formationId: string;
  chapterId: string;
}

function databaseOf(tx: DbTx): Db {
  return {
    execute: tx.execute.bind(tx),
    select: tx.select.bind(tx),
    insert: tx.insert.bind(tx),
    transaction: <T>(fn: (inner: DbTx) => Promise<T>) => fn(tx),
  } as unknown as Db;
}

function inBase<T>(run: (base: Base) => Promise<T>): Promise<T> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx);
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (
        ${user.id}::uuid, 'active',
        ${new Date(clock.now().getTime() + 30 * 86_400_000).toISOString()}::timestamptz
      )
    `);
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

async function insertResource(
  base: Base,
  kind: 'web' | 'youtube' | 'image',
  value: { url?: string; storagePath?: string; mime?: string; sizeBytes?: number },
): Promise<string> {
  const id = randomUUID();
  await base.tx.execute(sql`
    insert into public.resources (
      id, owner_id, formation_id, chapter_id, kind, title, url, storage_path, mime, size_bytes, status
    ) values (
      ${id}::uuid, ${base.userId}::uuid, ${base.formationId}::uuid, ${base.chapterId}::uuid,
      ${kind}::public.resource_kind, 'Apport de test', ${value.url ?? null},
      ${value.storagePath ?? null}, ${value.mime ?? null}, ${value.sizeBytes ?? null}, 'queued'
    )
  `);
  return id;
}

function context(db: Db): IngestionContext {
  return { sdb: db, clock, logger: createLogger({ level: 'silent' }), requestId: 'int-spec-510' };
}

function recorder(): IngestionEvents & { ready: number; failed: number } {
  const events = {
    ready: 0,
    failed: 0,
    resourceReady: () => {
      events.ready += 1;
      return Promise.resolve();
    },
    resourceFailed: () => {
      events.failed += 1;
      return Promise.resolve();
    },
  };
  return events;
}

function countingEmbedder(): EmbeddingClient & { calls: number } {
  const inner = mockEmbeddingClient();
  const client = {
    calls: 0,
    embed: (texts: readonly string[]) => {
      client.calls += 1;
      return inner.embed(texts);
    },
  };
  return client;
}

function deps(overrides: Partial<IngestionDeps> = {}): IngestionDeps {
  return {
    readPdf: () => Promise.resolve(null),
    embedder: mockEmbeddingClient(),
    uploadPdf: () => Promise.resolve(null),
    events: recorder(),
    limits: DEFAULT_PDF_LIMITS,
    mode: 'mock',
    ...overrides,
  };
}

const fixtureWeb = () =>
  Promise.resolve({
    url: WEB_FIXTURE_URL,
    contentType: 'text/html; charset=utf-8',
    body: new TextEncoder().encode(WEB_FIXTURE_HTML),
  });

let server: Server;
let fixtureUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/robots.txt') {
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('User-agent: *\nAllow: /\n');
      return;
    }
    if (request.url === '/redirect') {
      response.writeHead(302, { location: '/article' });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(WEB_FIXTURE_HTML);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  fixtureUrl = `http://127.0.0.1:${String(address.port)}/article`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
});

describe('[SPEC-510] service', () => {
  it('traite une page, une vidéo et une image puis isole les passages par RLS', async () => {
    await inBase(async (base) => {
      const webId = await insertResource(base, 'web', { url: WEB_FIXTURE_URL });
      const youtubeId = await insertResource(base, 'youtube', {
        url: 'https://youtu.be/dQw4w9WgXcQ',
      });
      const imageId = await insertResource(base, 'image', {
        storagePath: `${base.userId}/${randomUUID()}/capture.png`,
        mime: 'image/png',
        sizeBytes: PNG.length,
      });
      const ctx = context(base.db);
      const web = await processResource(ctx, webId, deps({ fetchWeb: fixtureWeb }));
      const youtube = await processResource(
        ctx,
        youtubeId,
        deps({ youtube: mockYoutubeProvider() }),
      );
      const image = await processResource(
        ctx,
        imageId,
        deps({ readPdf: () => Promise.resolve(PNG) }),
      );

      expect([web.outcome, youtube.outcome, image.outcome]).toEqual(['ready', 'ready', 'ready']);
      expect(web.chunkCount).toBeGreaterThan(0);
      expect(youtube.chunkCount).toBeGreaterThan(0);
      expect(image.chunkCount).toBe(1);

      const statuses = await base.tx.execute<{
        kind: string;
        metadata: Record<string, unknown>;
      }>(sql`
        select kind::text as kind, metadata from public.resources
        where id in (${webId}::uuid, ${youtubeId}::uuid, ${imageId}::uuid)
      `);
      const imageRow = statuses.find((row) => row.kind === 'image');
      expect(imageRow?.metadata.ingestion).toMatchObject({
        contentOrigin: 'model',
        visionTask: 'light',
        visionModel: 'claude-haiku-5-5',
      });
      const youtubeRow = statuses.find((row) => row.kind === 'youtube');
      expect(youtubeRow?.metadata).toMatchObject({ youtubeId: 'dQw4w9WgXcQ' });

      const other = await createTestUser(base.tx);
      expect(
        (
          await asUser(base.tx, other.id, (tx) =>
            tx.execute(sql`select id from public.resources where id = ${webId}::uuid`),
          )
        ).length,
      ).toBe(0);
      expect(
        (
          await asUser(base.tx, base.userId, (tx) =>
            tx.execute(
              sql`select id from public.resource_chunks where resource_id = ${webId}::uuid`,
            ),
          )
        ).length,
      ).toBeGreaterThan(0);
    });
  });

  it('refuse une adresse privée et une vidéo sans sous-titres avec les codes attendus (CA-3, CL-4)', async () => {
    await inBase(async (base) => {
      const ssrfId = await insertResource(base, 'web', { url: 'https://127.0.0.1/secret' });
      const noCaptionsId = await insertResource(base, 'youtube', {
        url: 'https://www.youtube.com/watch?v=noCaptions1',
      });
      const events = recorder();
      const ssrf = await processResource(context(base.db), ssrfId, deps({ events }));
      const noCaptions = await processResource(
        context(base.db),
        noCaptionsId,
        deps({ events, youtube: mockYoutubeProvider() }),
      );
      expect(ssrf).toMatchObject({ outcome: 'failed', errorCode: 'URL_BLOCKED_HOST' });
      expect(noCaptions).toMatchObject({ outcome: 'failed', errorCode: 'YOUTUBE_NO_CAPTIONS' });
      expect(events.failed).toBe(2);
    });
  });

  it('reprend sans dupliquer les passages ni rappeler les embeddings (idempotence)', async () => {
    await inBase(async (base) => {
      const webId = await insertResource(base, 'web', { url: WEB_FIXTURE_URL });
      const embedder = countingEmbedder();
      const ctx = context(base.db);
      const first = await processResource(ctx, webId, deps({ fetchWeb: fixtureWeb, embedder }));
      const second = await processResource(ctx, webId, deps({ fetchWeb: fixtureWeb, embedder }));
      expect(first.chunkCount).toBe(second.chunkCount);
      expect(embedder.calls).toBe(1);
      const rows = await base.tx.execute<{ count: number }>(sql`
        select count(*)::int as count from public.resource_chunks where resource_id = ${webId}::uuid
      `);
      expect(rows[0]?.count).toBe(first.chunkCount);
    });
  });

  it('lit la même image deux fois avec la même lecture simulée (CA-4)', async () => {
    await inBase(async (base) => {
      const vision: VisionReader = createLlmVisionReader({
        db: base.db,
        userId: base.userId,
        mode: 'mock',
      });
      const first = await extractImageDocument(
        { bytes: PNG, mime: 'image/png', title: 'Capture' },
        { reader: vision, db: base.db, userId: base.userId, mode: 'mock' },
      );
      const second = await extractImageDocument(
        { bytes: PNG, mime: 'image/png', title: 'Capture' },
        { reader: vision, db: base.db, userId: base.userId, mode: 'mock' },
      );
      expect(first.extraction.text).toBe(second.extraction.text);
      expect(first.content.contentOrigin).toBe('model');
      expect(first.content.locations[0]?.anchor).toBe('lecture-ia');
    });
  });

  it('refuse une adresse locale et lit le serveur de fixture autorisé (CA-3)', async () => {
    await expect(extractWeb('https://127.0.0.1/secret')).rejects.toMatchObject({
      code: 'URL_BLOCKED_HOST',
    });
    const extraction = await extractWeb(fixtureUrl, { allowPrivate: true });
    expect(extraction.text).toContain('La marge brute');
  });
});
