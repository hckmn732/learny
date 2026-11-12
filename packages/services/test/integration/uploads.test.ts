// Integration tests of the private file service (SPEC-206 §12, CA-1 to CA-4).
//
// Everything below the service is real: the local Supabase Storage API (buckets, policies, signed
// URLs, real bytes up to the 50 MB bound), Postgres with its Row Level Security policies and limit
// triggers, and genuine `authenticated` identities for several users. Only the `resource/uploaded`
// sink is a recorder. Fixtures are committed (the concurrency tests need several connections), so
// each test builds its own users and the suite removes them, their rows and their blobs at the end.
import { randomBytes, randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { RESOURCE_LIMITS } from '@learny/config';
import { AppError, systemClock, type Clock, type Result } from '@learny/core';
import {
  SupabaseStorageGateway,
  closeDb,
  createGroup,
  joinGroup,
  serviceDb,
  sql,
  type StorageGateway,
} from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { supabaseLocalEnv } from '@learny/testing/supabase';

import {
  SupabaseObjectReader,
  createResource,
  createServiceContext,
  createSystemContext,
  createUpload,
  deleteResource,
  finalizeUpload,
  getSignedReadUrl,
  mintUserAccessToken,
  purgeDeletedBlobs,
  type ResourceDeps,
  type ResourceEventSink,
  type ResourceUploadedEvent,
  type ServiceContext,
} from '../../src/index';
import { buildImage, buildPdf } from '../support/files';

const MEBIBYTE = 1024 * 1024;
const stack = supabaseLocalEnv();
// Storage validates token expiry against real time, so the gateway gets the real system clock
// (the default `clock` honours CLOCK_FIXED_AT, ADR-0047) while reservations use the test clock.
const gateway = new SupabaseStorageGateway({
  url: stack.url,
  apiKey: stack.anonKey,
  jwtSecret: stack.jwtSecret,
  clock: systemClock,
});
const reader = new SupabaseObjectReader({ url: stack.url, apiKey: stack.anonKey });

/** Test clock moved by hand: reservations and claims use it, Storage tokens use real time. */
class TestClock implements Clock {
  private current = new Date('2026-11-11T12:20:00Z');
  now(): Date {
    return new Date(this.current);
  }
  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}

class RecordingSink implements ResourceEventSink {
  readonly sent: Array<{ event: ResourceUploadedEvent; id: string }> = [];
  failures = 0;
  emitUploaded(event: ResourceUploadedEvent, options: { id: string }): Promise<void> {
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error('Inngest injoignable'));
    }
    this.sent.push({ event, id: options.id });
    return Promise.resolve();
  }
}

/** Storage gateway that can refuse to remove an object, then recover (CL-8). */
class FlakyRemoveGateway implements StorageGateway {
  failing = false;
  signUpload: StorageGateway['signUpload'] = (...args) => gateway.signUpload(...args);
  signRead: StorageGateway['signRead'] = (...args) => gateway.signRead(...args);
  list: StorageGateway['list'] = (...args) => gateway.list(...args);
  remove: StorageGateway['remove'] = (...args) => {
    if (this.failing) {
      return Promise.reject(new AppError('SERVICE_UNAVAILABLE', 'Stockage indisponible (503).'));
    }
    return gateway.remove(...args);
  };
}

function makeDeps(overrides: Partial<ResourceDeps> = {}): ResourceDeps & { sink: RecordingSink } {
  const sink = new RecordingSink();
  return {
    gateway,
    reader,
    events: sink,
    accessToken: (userId) => mintUserAccessToken(userId, stack.jwtSecret),
    ...overrides,
    sink,
  };
}

const clock = new TestClock();

function contextOf(userId: string, at: Clock = clock): ServiceContext {
  return createServiceContext({
    userId,
    requestId: `req-${randomBytes(4).toString('hex')}`,
    clock: at,
  });
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
  outsider: string;
  formationId: string;
  moduleId: string;
  chapters: string[];
}

const createdUsers: string[] = [];
const createdPaths: string[] = [];

/** A learner with a three-chapter programme, a group member who shares it, and an outsider. */
async function createFixture(): Promise<Fixture> {
  const fixture = await serviceDb().transaction(async (tx) => {
    const a = await createTestUser(tx, { firstName: 'Alice' });
    const b = await createTestUser(tx, { firstName: 'Bruno' });
    const outsider = await createTestUser(tx, { firstName: 'Clara' });
    const programme = await createTestProgramme(tx, a.id, {
      modules: 1,
      chaptersPerModule: 3,
      notionsPerChapter: 1,
      title: 'Programme des envois privés',
    });
    const group = await createGroup(tx, {
      formationId: programme.formationId,
      ownerId: a.id,
      now: systemClock.now(),
    });
    await joinGroup(tx, { inviteCode: group.inviteCode, userId: b.id, now: systemClock.now() });
    return {
      a: a.id,
      b: b.id,
      outsider: outsider.id,
      formationId: programme.formationId,
      moduleId: programme.moduleIds[0] ?? '',
      chapters: programme.chapterIds,
    };
  });
  createdUsers.push(fixture.a, fixture.b, fixture.outsider);
  return fixture;
}

function chapterOf(fixture: Fixture, index = 0): string {
  const chapter = fixture.chapters[index];
  if (chapter === undefined) throw new Error('chapitre de test absent');
  return chapter;
}

async function seedNotes(
  fixture: Fixture,
  chapterId: string,
  count: number,
  ownerId = fixture.a,
): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.resources (owner_id, formation_id, chapter_id, kind, title, content_text, status)
    select ${ownerId}::uuid, ${fixture.formationId}::uuid, ${chapterId}::uuid, 'note',
           'Note ' || g, 'texte', 'ready'
    from generate_series(1, ${count}) g
  `);
}

/** Finalized PDFs that fill the quota: rows only, there is no blob behind them. */
async function seedFinalizedPdfs(
  fixture: Fixture,
  chapterId: string,
  count: number,
  bytes: number,
): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.resources (
      owner_id, formation_id, chapter_id, kind, title, storage_path, mime, size_bytes, status
    )
    select ${fixture.a}::uuid, ${fixture.formationId}::uuid, ${chapterId}::uuid, 'pdf',
           'Archive ' || g, gen_random_uuid()::text || '/' || gen_random_uuid()::text || '/archive.pdf',
           'application/pdf', ${bytes}::bigint, 'ready'
    from generate_series(1, ${count}) g
  `);
}

const QUOTA_FILL_COUNT = 40;
const QUOTA_FILL_BYTES = 50 * MEBIBYTE;
/** 2 GB minus the 2000 MB seeded above: the exact room left for the boundary tests. */
const QUOTA_REMAINING = RESOURCE_LIMITS.userQuotaBytes - QUOTA_FILL_COUNT * QUOTA_FILL_BYTES;

function jwtClaims(url: string): { exp: number; iat: number } {
  const token = new URL(url).searchParams.get('token') ?? '';
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    exp: number;
    iat: number;
  };
}

function remember(userId: string, resourceId: string, name: string): void {
  createdPaths.push(`${userId}/${resourceId}/${name}`);
}

async function putObject(url: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: { apikey: stack.anonKey, 'content-type': contentType },
    body: bytes as unknown as BodyInit,
  });
  if (!response.ok) {
    throw new Error(`Envoi Storage refusé : ${String(response.status)} ${await response.text()}`);
  }
}

interface Uploaded {
  resourceId: string;
  uploadUrl: string;
  expiresAt: string;
}

/** Reserves an upload and sends the bytes; `declared` lets a test announce a different size. */
async function reserveAndUpload(
  deps: ResourceDeps,
  fixture: Fixture,
  options: {
    userId?: string;
    chapterIndex?: number;
    name?: string;
    mime: string;
    bytes?: Uint8Array;
    declaredBytes?: number;
    key?: string;
    context?: ServiceContext;
  },
): Promise<Uploaded> {
  const userId = options.userId ?? fixture.a;
  const name = options.name ?? 'guide.pdf';
  const size = options.declaredBytes ?? options.bytes?.length ?? 1;
  const created = unwrap(
    await createUpload(
      options.context ?? contextOf(userId),
      deps,
      chapterOf(fixture, options.chapterIndex ?? 0),
      {
        fileName: name,
        mime: options.mime,
        sizeBytes: size,
        idempotencyKey: options.key ?? randomUUID(),
      },
    ),
  );
  remember(userId, created.resourceId, name);
  if (options.bytes !== undefined) await putObject(created.uploadUrl, options.bytes, options.mime);
  return created;
}

async function rowOf(resourceId: string) {
  const rows = await serviceDb().execute<{
    kind: string;
    status: string;
    mime: string | null;
    size_bytes: number | null;
    storage_path: string | null;
    deleted_at: Date | null;
    content_text: string | null;
    metadata: Record<string, unknown> & { pages?: number; upload?: Record<string, unknown> };
  }>(sql`
    select kind::text as kind, status::text as status, mime, size_bytes::float8 as size_bytes,
           storage_path, deleted_at, content_text, metadata
    from public.resources where id = ${resourceId}::uuid
  `);
  return rows[0];
}

async function countRows(sqlText: ReturnType<typeof sql>): Promise<number> {
  const rows = await serviceDb().execute<{ total: number }>(sqlText);
  return rows[0]?.total ?? -1;
}

async function blobExists(userId: string, resourceId: string, name: string): Promise<boolean> {
  const info = await reader.info(
    'resources',
    `${userId}/${resourceId}/${name}`,
    mintUserAccessToken(userId, stack.jwtSecret),
  );
  return info !== null;
}

afterAll(async () => {
  const serviceToken = stack.serviceRoleKey;
  for (const path of createdPaths.splice(0)) {
    try {
      await gateway.remove('resources', path, serviceToken);
    } catch {
      // Best effort: the blob may already be removed by the test itself.
    }
  }
  for (const userId of createdUsers.splice(0)) {
    // A group owner cannot leave its group: the group goes first, then the account and its rows.
    await serviceDb().execute(sql`delete from public.groups where owner_id = ${userId}::uuid`);
    await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
  }
  await closeDb();
});

describe('[SPEC-206] upload service', () => {
  describe('creation and signed upload (EF-1, ET-4)', () => {
    it('reserves a queued resource and signs ten minutes for the exact private path', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const pdf = buildPdf({ pages: 3 });
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: pdf,
      });

      const path = `${fixture.a}/${created.resourceId}/guide.pdf`;
      const url = new URL(created.uploadUrl);
      expect(url.pathname).toBe(`/storage/v1/object/upload/sign/resources/${path}`);
      const claims = jwtClaims(created.uploadUrl);
      expect(claims.exp - claims.iat).toBe(600);
      expect(created.expiresAt).toBe('2026-11-11T12:30:00.000Z');

      const row = await rowOf(created.resourceId);
      expect(row).toMatchObject({
        kind: 'pdf',
        status: 'queued',
        storage_path: path,
        size_bytes: null,
        mime: null,
      });
      expect(row?.metadata.upload).toMatchObject({
        declaredBytes: pdf.length,
        declaredMime: 'application/pdf',
        reservedUntil: '2026-11-11T12:30:00.000Z',
      });
      // ET-4 — no signed URL or token is stored in any column of the resource.
      expect(JSON.stringify(row)).not.toContain('token=');
    });

    it('refuses a declared type or size before reserving anything (CL-1 to CL-3, ET-7)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const ctx = contextOf(fixture.a);
      const attempt = (mime: string, sizeBytes: number, fileName = 'fichier.pdf') =>
        createUpload(ctx, deps, chapterOf(fixture), {
          fileName,
          mime,
          sizeBytes,
          idempotencyKey: randomUUID(),
        });
      expect(codeOf(await attempt('application/pdf', RESOURCE_LIMITS.pdfMaxBytes + 1))).toBe(
        'UPLOAD_TOO_LARGE',
      );
      expect(codeOf(await attempt('image/png', RESOURCE_LIMITS.imageMaxBytes + 1))).toBe(
        'UPLOAD_TOO_LARGE',
      );
      expect(codeOf(await attempt('video/mp4', 1024))).toBe('UNSUPPORTED_TYPE');
      expect(codeOf(await attempt('audio/mpeg', 1024))).toBe('UNSUPPORTED_TYPE');
      expect(codeOf(await attempt('application/zip', 1024))).toBe('UNSUPPORTED_TYPE');
      expect(codeOf(await attempt('application/pdf', 1024, '../secret.pdf'))).toBe(
        'VALIDATION_FAILED',
      );
      expect(
        await countRows(
          sql`select count(*)::int as total from public.resources where owner_id = ${fixture.a}::uuid`,
        ),
      ).toBe(0);
    });

    it('answers FORBIDDEN for another learner’s chapter and NOT_FOUND for an unknown one (EF-6)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const body = {
        fileName: 'guide.pdf',
        mime: 'application/pdf',
        sizeBytes: 1024,
        idempotencyKey: randomUUID(),
      };
      const foreign = await createUpload(
        contextOf(fixture.outsider),
        deps,
        chapterOf(fixture),
        body,
      );
      expect(codeOf(foreign)).toBe('FORBIDDEN');
      const unknown = await createUpload(contextOf(fixture.a), deps, randomUUID(), body);
      expect(codeOf(unknown)).toBe('NOT_FOUND');
      const anonymous = await createUpload(
        createServiceContext({ userId: null, requestId: 'req-anonyme-1', clock }),
        deps,
        chapterOf(fixture),
        body,
      );
      expect(codeOf(anonymous)).toBe('UNAUTHENTICATED');
    });

    it('replays a creation with the same key on the same resource, with a fresh URL (ET-4)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const ctx = contextOf(fixture.a);
      const key = randomUUID();
      const body = {
        fileName: 'guide.pdf',
        mime: 'application/pdf',
        sizeBytes: 4096,
        idempotencyKey: key,
      };
      const first = unwrap(await createUpload(ctx, deps, chapterOf(fixture), body));
      remember(fixture.a, first.resourceId, 'guide.pdf');
      const second = unwrap(await createUpload(ctx, deps, chapterOf(fixture), body));
      expect(second.resourceId).toBe(first.resourceId);
      expect(
        await countRows(
          sql`select count(*)::int as total from public.resources where owner_id = ${fixture.a}::uuid`,
        ),
      ).toBe(1);

      const other = await createUpload(ctx, deps, chapterOf(fixture), { ...body, sizeBytes: 8192 });
      expect(codeOf(other)).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('runs two simultaneous creations with one key as a single reservation (CA-2)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const body = {
        fileName: 'guide.pdf',
        mime: 'application/pdf',
        sizeBytes: 4096,
        idempotencyKey: randomUUID(),
      };
      const results = await Promise.all([
        createUpload(contextOf(fixture.a), deps, chapterOf(fixture), body),
        createUpload(contextOf(fixture.a), deps, chapterOf(fixture), body),
      ]);
      const ids = new Set(results.map((result) => unwrap(result).resourceId));
      expect(ids.size).toBe(1);
      expect(
        await countRows(
          sql`select count(*)::int as total from public.resources where owner_id = ${fixture.a}::uuid`,
        ),
      ).toBe(1);
      for (const id of ids) remember(fixture.a, id, 'guide.pdf');
    });
  });

  describe('finalization with the real bytes (EF-2, ET-2, ET-5, CA-1)', () => {
    it('measures type, size and pages, then emits resource/uploaded exactly once', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const pdf = buildPdf({ pages: 7 });
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: pdf,
      });
      const ctx = contextOf(fixture.a);

      const done = unwrap(await finalizeUpload(ctx, deps, created.resourceId));
      expect(done).toEqual({
        id: created.resourceId,
        kind: 'pdf',
        status: 'queued',
        mime: 'application/pdf',
        sizeBytes: pdf.length,
        pages: 7,
      });
      const row = await rowOf(created.resourceId);
      expect(row).toMatchObject({ mime: 'application/pdf', size_bytes: pdf.length });
      expect(row?.metadata.pages).toBe(7);
      expect(row?.metadata.upload?.sha256).toMatch(/^[0-9a-f]{64}$/);

      // ET-5 — the second call returns the same state and sends nothing.
      expect(unwrap(await finalizeUpload(ctx, deps, created.resourceId))).toEqual(done);
      expect(deps.sink.sent).toEqual([
        {
          event: {
            userId: fixture.a,
            resourceId: created.resourceId,
            formationId: fixture.formationId,
            chapterId: chapterOf(fixture),
            kind: 'pdf',
          },
          id: `resource-uploaded:${created.resourceId}`,
        },
      ]);
    });

    it('rejects an object that changed after its finalization (ET-5)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: buildPdf({ pages: 2 }),
      });
      const ctx = contextOf(fixture.a);
      unwrap(await finalizeUpload(ctx, deps, created.resourceId));

      // The owner can still overwrite the blob with their own session: the next call notices.
      const overwrite = await fetch(
        `${stack.url}/storage/v1/object/resources/${fixture.a}/${created.resourceId}/guide.pdf`,
        {
          method: 'PUT',
          headers: {
            apikey: stack.anonKey,
            authorization: `Bearer ${mintUserAccessToken(fixture.a, stack.jwtSecret)}`,
            'content-type': 'application/pdf',
            'x-upsert': 'true',
          },
          body: buildPdf({ pages: 9 }) as unknown as BodyInit,
        },
      );
      expect(overwrite.ok).toBe(true);
      expect(codeOf(await finalizeUpload(ctx, deps, created.resourceId))).toBe('CONFLICT');
      expect(deps.sink.sent).toHaveLength(1);
    });

    it('accepts a 50 MB PDF of 500 pages and refuses 501 pages (CL-1)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const ctx = contextOf(fixture.a);

      const exact = buildPdf({ pages: 500, totalBytes: RESOURCE_LIMITS.pdfMaxBytes });
      const accepted = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: exact,
        name: 'limite.pdf',
      });
      expect(unwrap(await finalizeUpload(ctx, deps, accepted.resourceId))).toMatchObject({
        sizeBytes: RESOURCE_LIMITS.pdfMaxBytes,
        pages: 500,
      });

      const tooManyPages = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: buildPdf({ pages: 501 }),
        name: 'trop-de-pages.pdf',
      });
      const refused = await finalizeUpload(ctx, deps, tooManyPages.resourceId);
      expect(codeOf(refused)).toBe('UPLOAD_TOO_LARGE');
      expect(refused.ok ? '' : refused.error.detail).toContain('500 pages');
      // The refused upload is discarded: its row no longer counts and its blob is gone.
      expect((await rowOf(tooManyPages.resourceId))?.deleted_at).not.toBeNull();
      expect(await blobExists(fixture.a, tooManyPages.resourceId, 'trop-de-pages.pdf')).toBe(false);
      expect(deps.sink.sent).toHaveLength(1);
    }, 120_000);

    it('accepts a 10 MB image and refuses one measured beyond it, whatever was announced', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const ctx = contextOf(fixture.a);

      const exact = await reserveAndUpload(deps, fixture, {
        mime: 'image/png',
        bytes: buildImage('png', RESOURCE_LIMITS.imageMaxBytes),
        name: 'capture.png',
      });
      expect(unwrap(await finalizeUpload(ctx, deps, exact.resourceId))).toMatchObject({
        kind: 'image',
        mime: 'image/png',
        sizeBytes: RESOURCE_LIMITS.imageMaxBytes,
        pages: null,
      });

      // The client announces 1 MB and sends one byte more than the bound.
      const cheating = await reserveAndUpload(deps, fixture, {
        mime: 'image/png',
        bytes: buildImage('png', RESOURCE_LIMITS.imageMaxBytes + 1),
        declaredBytes: MEBIBYTE,
        name: 'triche.png',
      });
      expect(codeOf(await finalizeUpload(ctx, deps, cheating.resourceId))).toBe('UPLOAD_TOO_LARGE');
      expect(await blobExists(fixture.a, cheating.resourceId, 'triche.png')).toBe(false);
    }, 120_000);

    it('refuses an executable named .png and discards it (CL-2)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const hostile = await reserveAndUpload(deps, fixture, {
        mime: 'image/png',
        bytes: buildImage('exe', 2048),
        name: 'photo.png',
      });
      const refused = await finalizeUpload(contextOf(fixture.a), deps, hostile.resourceId);
      expect(codeOf(refused)).toBe('UNSUPPORTED_TYPE');
      const row = await rowOf(hostile.resourceId);
      expect(row?.deleted_at).not.toBeNull();
      expect(row?.size_bytes).toBeNull();
      expect(await blobExists(fixture.a, hostile.resourceId, 'photo.png')).toBe(false);
      expect(deps.sink.sent).toHaveLength(0);
    });

    it('refuses an absent or truncated object without losing the reservation (CL-6)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const ctx = contextOf(fixture.a);

      const absent = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        declaredBytes: 5000,
      });
      expect(codeOf(await finalizeUpload(ctx, deps, absent.resourceId))).toBe('UPLOAD_INCOMPLETE');

      const truncated = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: buildPdf({ pages: 1 }),
        declaredBytes: 90_000,
        name: 'tronque.pdf',
      });
      expect(codeOf(await finalizeUpload(ctx, deps, truncated.resourceId))).toBe(
        'UPLOAD_INCOMPLETE',
      );
      expect((await rowOf(truncated.resourceId))?.deleted_at).toBeNull();
      expect(deps.sink.sent).toHaveLength(0);
    });

    it('releases an expired reservation, so a finalization too late is refused (CL-6, ET-3)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const late = new TestClock();
      const stale = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        declaredBytes: 5000,
        context: contextOf(fixture.a, late),
      });
      late.advance(11 * 60 * 1000);
      // Another upload of the same learner purges the expired reservation.
      await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        declaredBytes: 5000,
        name: 'autre.pdf',
        context: contextOf(fixture.a, late),
      });
      expect((await rowOf(stale.resourceId))?.deleted_at).not.toBeNull();
      expect(codeOf(await finalizeUpload(contextOf(fixture.a, late), deps, stale.resourceId))).toBe(
        'NOT_FOUND',
      );
    });

    it('sends the event again after a failed send, and still only once overall', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      deps.sink.failures = 1;
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: buildPdf({ pages: 1 }),
      });
      const ctx = contextOf(fixture.a);
      expect(codeOf(await finalizeUpload(ctx, deps, created.resourceId))).toBe(
        'SERVICE_UNAVAILABLE',
      );
      // The file itself is finalized and the claim was released.
      expect((await rowOf(created.resourceId))?.size_bytes).not.toBeNull();
      expect(deps.sink.sent).toHaveLength(0);

      expect(unwrap(await finalizeUpload(ctx, deps, created.resourceId))).toMatchObject({
        pages: 1,
      });
      expect(unwrap(await finalizeUpload(ctx, deps, created.resourceId))).toMatchObject({
        pages: 1,
      });
      expect(deps.sink.sent).toHaveLength(1);
    });
  });

  describe('contributions without a blob (EF-3)', () => {
    it('creates a note of 100 000 characters, refuses 100 001 and never makes it ready', async () => {
      const fixture = await createFixture();
      const ctx = contextOf(fixture.a);
      const exact = unwrap(
        await createResource(ctx, chapterOf(fixture), {
          kind: 'note',
          title: 'Ma note',
          text: 'é'.repeat(RESOURCE_LIMITS.noteMaxChars),
        }),
      );
      expect(exact).toMatchObject({ kind: 'note', status: 'queued', title: 'Ma note' });
      const row = await rowOf(exact.id);
      expect(row).toMatchObject({ status: 'queued', storage_path: null });
      expect(row?.content_text?.length).toBe(RESOURCE_LIMITS.noteMaxChars);

      const tooLong = await createResource(ctx, chapterOf(fixture), {
        kind: 'note',
        title: 'Trop longue',
        text: 'é'.repeat(RESOURCE_LIMITS.noteMaxChars + 1),
      });
      expect(codeOf(tooLong)).toBe('UPLOAD_TOO_LARGE');
      expect(
        await countRows(
          sql`select count(*)::int as total from public.resources where owner_id = ${fixture.a}::uuid`,
        ),
      ).toBe(1);
    });

    it('creates web and YouTube links queued, and refuses a foreign host as YouTube', async () => {
      const fixture = await createFixture();
      const ctx = contextOf(fixture.a);
      const web = unwrap(
        await createResource(ctx, chapterOf(fixture), {
          kind: 'web',
          url: 'https://example.com/article',
        }),
      );
      expect(web).toMatchObject({ kind: 'web', status: 'queued', title: 'example.com' });
      const video = unwrap(
        await createResource(ctx, chapterOf(fixture), {
          kind: 'youtube',
          url: 'https://www.youtube.com/watch?v=abc123',
          title: 'Cours vidéo',
        }),
      );
      expect(video).toMatchObject({ kind: 'youtube', status: 'queued' });
      expect((await rowOf(video.id))?.status).toBe('queued');
      const fake = await createResource(ctx, chapterOf(fixture), {
        kind: 'youtube',
        url: 'https://example.com/watch?v=abc123',
      });
      expect(codeOf(fake)).toBe('VALIDATION_FAILED');
    });
  });

  describe('limits per chapter and per learner (EF-6, ET-3, CL-3, CA-2)', () => {
    it('refuses the 101st contribution of a chapter and gives no upload URL', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      await seedNotes(fixture, chapterOf(fixture), 99);
      const hundredth = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        declaredBytes: 4096,
      });
      expect(hundredth.uploadUrl).toContain('/object/upload/sign/');
      const refused = await createUpload(contextOf(fixture.a), deps, chapterOf(fixture), {
        fileName: 'une-de-trop.pdf',
        mime: 'application/pdf',
        sizeBytes: 4096,
        idempotencyKey: randomUUID(),
      });
      expect(codeOf(refused)).toBe('QUOTA_EXCEEDED');
      expect(refused.ok ? '' : refused.error.detail).toContain('100 apports');
      const note = await createResource(contextOf(fixture.a), chapterOf(fixture), {
        kind: 'note',
        title: 'Encore une',
        text: 'texte',
      });
      expect(codeOf(note)).toBe('QUOTA_EXCEEDED');
      // The second chapter of the same programme is untouched by that bound.
      const other = await createResource(contextOf(fixture.a), chapterOf(fixture, 1), {
        kind: 'note',
        title: 'Autre chapitre',
        text: 'texte',
      });
      expect(codeOf(other)).toBe('OK');
    });

    it('never lets two simultaneous creations pass a chapter at 99 contributions (CA-2)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      await seedNotes(fixture, chapterOf(fixture), 99);
      const attempt = () =>
        createUpload(contextOf(fixture.a), deps, chapterOf(fixture), {
          fileName: 'course.pdf',
          mime: 'application/pdf',
          sizeBytes: 4096,
          idempotencyKey: randomUUID(),
        });
      const results = await Promise.all([attempt(), attempt(), attempt()]);
      expect(results.map(codeOf).sort()).toEqual(['OK', 'QUOTA_EXCEEDED', 'QUOTA_EXCEEDED']);
      for (const result of results) {
        if (result.ok) remember(fixture.a, result.value.resourceId, 'course.pdf');
      }
      expect(
        await countRows(sql`
          select count(*)::int as total from public.resources
          where owner_id = ${fixture.a}::uuid and chapter_id = ${chapterOf(fixture)}::uuid
            and deleted_at is null
        `),
      ).toBe(100);
    });

    it('counts live reservations in the 2 GB quota, to the exact byte, under concurrency', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      await seedFinalizedPdfs(fixture, chapterOf(fixture, 1), QUOTA_FILL_COUNT, QUOTA_FILL_BYTES);
      const ask = (bytes: number, context = contextOf(fixture.a)) =>
        createUpload(context, deps, chapterOf(fixture), {
          fileName: 'volume.pdf',
          mime: 'application/pdf',
          sizeBytes: bytes,
          idempotencyKey: randomUUID(),
        });
      // One byte beyond the room left is refused, the exact room is accepted.
      expect(codeOf(await ask(QUOTA_REMAINING + 1))).toBe('QUOTA_EXCEEDED');
      expect(QUOTA_REMAINING).toBe(48 * MEBIBYTE);

      // Two simultaneous reservations of 30 MB: only one fits in the 48 MB left.
      const results = await Promise.all([ask(30 * MEBIBYTE), ask(30 * MEBIBYTE)]);
      expect(results.map(codeOf).sort()).toEqual(['OK', 'QUOTA_EXCEEDED']);
      const winner = results.find((result) => result.ok);
      if (winner?.ok) remember(fixture.a, winner.value.resourceId, 'volume.pdf');
      const used = await countRows(sql`
        select (
          coalesce(sum(size_bytes), 0)
          + coalesce(sum((metadata -> 'upload' ->> 'declaredBytes')::bigint)
              filter (where size_bytes is null), 0)
        )::float8 as total
        from public.resources where owner_id = ${fixture.a}::uuid and deleted_at is null
      `);
      expect(used).toBeLessThanOrEqual(RESOURCE_LIMITS.userQuotaBytes);
      // 18 MB are still free: a smaller upload passes, the exact remainder does too.
      expect(codeOf(await ask(18 * MEBIBYTE))).toBe('OK');
      expect(codeOf(await ask(1))).toBe('QUOTA_EXCEEDED');
    });

    it('frees the room of an expired reservation (ET-3)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      await seedFinalizedPdfs(fixture, chapterOf(fixture, 1), QUOTA_FILL_COUNT, QUOTA_FILL_BYTES);
      const late = new TestClock();
      const ask = (bytes: number) =>
        createUpload(contextOf(fixture.a, late), deps, chapterOf(fixture), {
          fileName: 'volume.pdf',
          mime: 'application/pdf',
          sizeBytes: bytes,
          idempotencyKey: randomUUID(),
        });
      const reserved = await ask(QUOTA_REMAINING);
      expect(codeOf(reserved)).toBe('OK');
      expect(codeOf(await ask(MEBIBYTE))).toBe('QUOTA_EXCEEDED');
      late.advance(10 * 60 * 1000 + 1000);
      const freed = await ask(MEBIBYTE);
      expect(codeOf(freed)).toBe('OK');
      if (reserved.ok) {
        expect((await rowOf(reserved.value.resourceId))?.deleted_at).not.toBeNull();
        remember(fixture.a, reserved.value.resourceId, 'volume.pdf');
      }
      if (freed.ok) remember(fixture.a, freed.value.resourceId, 'volume.pdf');
    });

    it('counts a finalization once when two arrive together (CL-4, CA-2)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: buildPdf({ pages: 4 }),
      });
      const results = await Promise.all([
        finalizeUpload(contextOf(fixture.a), deps, created.resourceId),
        finalizeUpload(contextOf(fixture.a), deps, created.resourceId),
        finalizeUpload(contextOf(fixture.a), deps, created.resourceId),
      ]);
      const states = results.map((result) => unwrap(result));
      expect(new Set(states.map((state) => JSON.stringify(state))).size).toBe(1);
      expect(deps.sink.sent).toHaveLength(1);
      expect(
        await countRows(sql`
          select count(*)::int as total from public.resources
          where owner_id = ${fixture.a}::uuid and size_bytes is not null
        `),
      ).toBe(1);
    });

    it('refuses a finalization that would exceed the quota and frees its place', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      await seedFinalizedPdfs(fixture, chapterOf(fixture, 1), QUOTA_FILL_COUNT, QUOTA_FILL_BYTES);
      // Announces 1 MB, sends about 49 MB: the real size no longer fits in the 48 MB left.
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: buildPdf({ pages: 2, totalBytes: QUOTA_REMAINING + 1 }),
        declaredBytes: MEBIBYTE,
      });
      expect(codeOf(await finalizeUpload(contextOf(fixture.a), deps, created.resourceId))).toBe(
        'QUOTA_EXCEEDED',
      );
      expect((await rowOf(created.resourceId))?.deleted_at).not.toBeNull();
      expect(await blobExists(fixture.a, created.resourceId, 'guide.pdf')).toBe(false);
    }, 120_000);
  });

  describe('private reading and isolation (EF-4, CL-5, CL-7, CA-3)', () => {
    it('signs a ten-minute read URL for the owner and a new one at each call', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const pdf = buildPdf({ pages: 2 });
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: pdf,
      });
      unwrap(await finalizeUpload(contextOf(fixture.a), deps, created.resourceId));

      const first = unwrap(await getSignedReadUrl(contextOf(fixture.a), deps, created.resourceId));
      expect(first.expiresAt).toBe('2026-11-11T12:30:00.000Z');
      const claims = jwtClaims(first.url);
      expect(claims.exp - claims.iat).toBe(600);
      const download = await fetch(first.url);
      expect(download.status).toBe(200);
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(pdf);

      // CL-5 — a later call signs a new URL (expiration from the new instant), never the old one.
      const later = new TestClock();
      later.advance(11 * 60 * 1000);
      const second = unwrap(
        await getSignedReadUrl(contextOf(fixture.a, later), deps, created.resourceId),
      );
      expect(second.expiresAt).toBe('2026-11-11T12:41:00.000Z');
      // The first URL keeps its own ten-minute window: it is never extended.
      expect(jwtClaims(first.url)).toEqual(claims);
      const renewed = jwtClaims(second.url);
      expect(renewed.exp - renewed.iat).toBe(600);
    });

    it('keeps a group member out of another member’s contribution (CL-7)', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: buildPdf({ pages: 2 }),
      });
      unwrap(await finalizeUpload(contextOf(fixture.a), deps, created.resourceId));

      for (const intruder of [fixture.b, fixture.outsider]) {
        const ctx = contextOf(intruder);
        expect(codeOf(await getSignedReadUrl(ctx, deps, created.resourceId))).toBe('FORBIDDEN');
        expect(codeOf(await finalizeUpload(ctx, deps, created.resourceId))).toBe('FORBIDDEN');
        expect(codeOf(await deleteResource(ctx, deps, created.resourceId))).toBe('FORBIDDEN');
      }
      // Row Level Security itself hides the row from the member.
      const visible = await contextOf(fixture.b).db?.run((tx) =>
        tx.execute<{ id: string }>(
          sql`select id::text as id from public.resources where id = ${created.resourceId}::uuid`,
        ),
      );
      expect(visible).toHaveLength(0);
      // Nothing happened to the owner's contribution.
      expect((await rowOf(created.resourceId))?.deleted_at).toBeNull();
      expect(await blobExists(fixture.a, created.resourceId, 'guide.pdf')).toBe(true);
      // The member shares the programme and can add their own file to the same chapter.
      const own = await reserveAndUpload(deps, fixture, {
        userId: fixture.b,
        mime: 'application/pdf',
        declaredBytes: 4096,
        name: 'mon-pdf.pdf',
      });
      expect(own.resourceId).not.toBe(created.resourceId);
      expect(codeOf(await getSignedReadUrl(contextOf(fixture.a), deps, own.resourceId))).toBe(
        'FORBIDDEN',
      );
    });

    it('answers NOT_FOUND for an unknown, deleted, unfinalized or file-less contribution', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const ctx = contextOf(fixture.a);
      expect(codeOf(await getSignedReadUrl(ctx, deps, randomUUID()))).toBe('NOT_FOUND');
      expect(codeOf(await finalizeUpload(ctx, deps, randomUUID()))).toBe('NOT_FOUND');
      expect(codeOf(await deleteResource(ctx, deps, randomUUID()))).toBe('NOT_FOUND');

      const pending = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        declaredBytes: 4096,
      });
      expect(codeOf(await getSignedReadUrl(ctx, deps, pending.resourceId))).toBe('NOT_FOUND');
      const note = unwrap(
        await createResource(ctx, chapterOf(fixture), {
          kind: 'note',
          title: 'Note',
          text: 'texte',
        }),
      );
      expect(codeOf(await getSignedReadUrl(ctx, deps, note.id))).toBe('NOT_FOUND');
      expect(codeOf(await finalizeUpload(ctx, deps, note.id))).toBe('CONFLICT');
    });
  });

  describe('deletion that keeps the citations (EF-5, ET-6, CL-8, CA-4)', () => {
    interface Cited {
      resourceId: string;
      chunkId: string;
      citationId: string;
    }

    /** A finalized PDF with one passage, cited by one course section of its owner. */
    async function citedPdf(fixture: Fixture, deps: ResourceDeps): Promise<Cited> {
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: buildPdf({ pages: 5 }),
      });
      unwrap(await finalizeUpload(contextOf(fixture.a), deps, created.resourceId));
      const chunk = await serviceDb().execute<{ id: string }>(sql`
        insert into public.resource_chunks (
          resource_id, owner_id, formation_id, chapter_id, position, text, location
        )
        values (
          ${created.resourceId}::uuid, ${fixture.a}::uuid, ${fixture.formationId}::uuid,
          ${chapterOf(fixture)}::uuid, 0, 'Clés de comptabilisation',
          '{"page":4,"charStart":0,"charEnd":24}'::jsonb
        )
        returning id::text as id
      `);
      const course = await serviceDb().execute<{ id: string }>(sql`
        insert into public.courses (owner_id, formation_id, module_id, version, is_current, status)
        values (${fixture.a}::uuid, ${fixture.formationId}::uuid, ${fixture.moduleId}::uuid, 1, true, 'ready')
        returning id::text as id
      `);
      const section = await serviceDb().execute<{ id: string }>(sql`
        insert into public.course_sections (
          course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, origin, version
        )
        values (
          ${course[0]?.id ?? ''}::uuid, ${fixture.a}::uuid, ${chapterOf(fixture)}::uuid, 1,
          'text', 'section-1', 'Les clés', 'Contenu cité.', 'tutor', 1
        )
        returning id::text as id
      `);
      const citation = await serviceDb().execute<{ id: string }>(sql`
        insert into public.citations (
          section_id, owner_id, chunk_id, resource_id, quote, location, label, media_kind
        )
        values (
          ${section[0]?.id ?? ''}::uuid, ${fixture.a}::uuid, ${chunk[0]?.id ?? ''}::uuid,
          ${created.resourceId}::uuid, 'Clés de comptabilisation',
          '{"page":4,"charStart":0,"charEnd":24}'::jsonb, 'Guide FI, p. 4', 'pdf'
        )
        returning id::text as id
      `);
      return {
        resourceId: created.resourceId,
        chunkId: chunk[0]?.id ?? '',
        citationId: citation[0]?.id ?? '',
      };
    }

    async function citationOf(id: string) {
      const rows = await serviceDb().execute<{
        chunk_id: string | null;
        resource_id: string | null;
        label: string;
        quote: string | null;
        location: Record<string, unknown>;
      }>(sql`
        select chunk_id::text as chunk_id, resource_id::text as resource_id, label, quote, location
        from public.citations where id = ${id}::uuid
      `);
      return rows[0];
    }

    it('removes blob and passages, keeps the citations « source supprimée », and is idempotent', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const cited = await citedPdf(fixture, deps);
      const ctx = contextOf(fixture.a);
      expect(await blobExists(fixture.a, cited.resourceId, 'guide.pdf')).toBe(true);
      expect(await citationOf(cited.citationId)).toMatchObject({
        chunk_id: cited.chunkId,
        label: 'Guide FI, p. 4',
      });

      expect(codeOf(await deleteResource(ctx, deps, cited.resourceId))).toBe('OK');

      const row = await rowOf(cited.resourceId);
      expect(row?.deleted_at).not.toBeNull();
      expect(typeof row?.metadata.upload?.blobRemovedAt).toBe('string');
      expect(
        await countRows(sql`
          select count(*)::int as total from public.resource_chunks
          where resource_id = ${cited.resourceId}::uuid
        `),
      ).toBe(0);
      // The citation row survives, consultable, pointing at nothing but still quoting its source.
      expect(await citationOf(cited.citationId)).toEqual({
        chunk_id: null,
        resource_id: cited.resourceId,
        label: 'source supprimée',
        quote: 'Clés de comptabilisation',
        location: { page: 4, charStart: 0, charEnd: 24 },
      });
      expect(await blobExists(fixture.a, cited.resourceId, 'guide.pdf')).toBe(false);

      // A second deletion is a success; the resource stays unreachable.
      expect(codeOf(await deleteResource(ctx, deps, cited.resourceId))).toBe('OK');
      expect(codeOf(await getSignedReadUrl(ctx, deps, cited.resourceId))).toBe('NOT_FOUND');
      expect(codeOf(await finalizeUpload(ctx, deps, cited.resourceId))).toBe('NOT_FOUND');
      expect(await citationOf(cited.citationId)).toMatchObject({ label: 'source supprimée' });

      // The room is given back: quota and chapter count no longer include the file.
      const again = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        declaredBytes: 4096,
        name: 'autre.pdf',
      });
      expect(again.resourceId).not.toBe(cited.resourceId);
    });

    it('deletes a note and erases its text', async () => {
      const fixture = await createFixture();
      const deps = makeDeps();
      const ctx = contextOf(fixture.a);
      const note = unwrap(
        await createResource(ctx, chapterOf(fixture), {
          kind: 'note',
          title: 'À supprimer',
          text: 'contenu privé',
        }),
      );
      expect(codeOf(await deleteResource(ctx, deps, note.id))).toBe('OK');
      const row = await rowOf(note.id);
      expect(row?.deleted_at).not.toBeNull();
      expect(row?.content_text).toBeNull();
    });

    it('revokes access at once when Storage fails, then resumes the cleanup without loss (CL-8)', async () => {
      const fixture = await createFixture();
      const flaky = new FlakyRemoveGateway();
      const deps = makeDeps({ gateway: flaky });
      const cited = await citedPdf(fixture, deps);
      const ctx = contextOf(fixture.a);

      flaky.failing = true;
      expect(codeOf(await deleteResource(ctx, deps, cited.resourceId))).toBe('OK');
      // Access is revoked in the database although the blob is still there.
      expect((await rowOf(cited.resourceId))?.deleted_at).not.toBeNull();
      expect(codeOf(await getSignedReadUrl(ctx, deps, cited.resourceId))).toBe('NOT_FOUND');
      expect(await blobExists(fixture.a, cited.resourceId, 'guide.pdf')).toBe(true);
      expect((await rowOf(cited.resourceId))?.metadata.upload?.blobRemovedAt).toBeUndefined();
      expect(await citationOf(cited.citationId)).toMatchObject({
        chunk_id: null,
        label: 'source supprimée',
      });

      // The cleanup job fails while Storage is down, and keeps the work for later...
      const system = createSystemContext({ requestId: 'req-nettoyage-1', clock });
      expect(await purgeDeletedBlobs(system, deps, { ownerId: fixture.a })).toEqual({
        removed: 0,
        failed: 1,
      });
      // ...then removes the blob once Storage is back, and is a no-op afterwards.
      flaky.failing = false;
      expect(await purgeDeletedBlobs(system, deps, { ownerId: fixture.a })).toEqual({
        removed: 1,
        failed: 0,
      });
      expect(await blobExists(fixture.a, cited.resourceId, 'guide.pdf')).toBe(false);
      expect((await rowOf(cited.resourceId))?.metadata.upload?.blobRemovedAt).toEqual(
        expect.any(String),
      );
      expect(await purgeDeletedBlobs(system, deps, { ownerId: fixture.a })).toEqual({
        removed: 0,
        failed: 0,
      });
      expect(await citationOf(cited.citationId)).toMatchObject({ label: 'source supprimée' });
    });

    it('resumes the cleanup when the deletion is simply repeated', async () => {
      const fixture = await createFixture();
      const flaky = new FlakyRemoveGateway();
      const deps = makeDeps({ gateway: flaky });
      const created = await reserveAndUpload(deps, fixture, {
        mime: 'application/pdf',
        bytes: buildPdf({ pages: 1 }),
      });
      unwrap(await finalizeUpload(contextOf(fixture.a), deps, created.resourceId));
      const ctx = contextOf(fixture.a);
      flaky.failing = true;
      expect(codeOf(await deleteResource(ctx, deps, created.resourceId))).toBe('OK');
      expect(await blobExists(fixture.a, created.resourceId, 'guide.pdf')).toBe(true);
      flaky.failing = false;
      expect(codeOf(await deleteResource(ctx, deps, created.resourceId))).toBe('OK');
      expect(await blobExists(fixture.a, created.resourceId, 'guide.pdf')).toBe(false);
    });
  });
});
