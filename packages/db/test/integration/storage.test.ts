// Integration tests of private Storage and signed URLs (SPEC-114 §12) — CA-1 to CA-4.
//
// Buckets, policies and objects are real: the local Supabase Storage API is reached over HTTP with
// genuine `authenticated` JWTs for A and B (B is a member of A's group). Database fixtures live in
// `withRollback`; storage blobs cannot be rolled back, so every path is removed with the service
// role in `afterAll`. The fixed clock of ADR-0047 is used for unit-level assertions; Storage itself
// validates token expiry against real time, so the gateway receives an injected real-time clock.
import { createHmac, randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { AppError, systemClock, type Clock } from '@learny/core';

import {
  SupabaseStorageGateway,
  closeDb,
  createGroup,
  createReadUrl,
  createUploadUrl,
  deleteStoredObject,
  exportPath,
  joinGroup,
  listOwnedObjects,
  resourcePath,
  serviceDb,
  signedUrlExpiresAt,
  sql,
  type DbTx,
  type SignedUrlRequest,
  type StorageAccess,
  type StorageRuntime,
} from '../../src/index';
import { asUser, createTestProgramme, createTestUser, withRollback } from '../../src/testing';

// Local Supabase values: the URL and JWT secret are the public development defaults printed by
// `supabase start`; real environment variables override them in CI. API keys are minted locally
// with the same secret instead of hard-coding any token.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';

// The only real-time source allowed by ADR-0047: the core system clock, injected explicitly.
const realClock: Clock = systemClock;

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

/** Signs a compact JWT with the local Supabase secret (HS256), as GoTrue/Kong/Storage expect. */
function signedToken(payload: Record<string, unknown>): string {
  const now = Math.floor(realClock.now().getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(
    JSON.stringify({ iss: 'supabase-demo', iat: now, exp: now + 3600, ...payload }),
  );
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? signedToken({ role: 'anon' });
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? signedToken({ role: 'service_role' });

const gateway = new SupabaseStorageGateway({
  url: SUPABASE_URL,
  apiKey: ANON_KEY,
  jwtSecret: JWT_SECRET,
  clock: realClock,
});
const runtime: StorageRuntime = { db: serviceDb(), gateway, clock: realClock };
const created: Array<{ bucket: 'resources' | 'exports'; path: string }> = [];

/** Genuine local JWT: Storage and Postgres read `sub` and `role` exactly as from GoTrue. */
function userToken(userId: string): string {
  return signedToken({ sub: userId, role: 'authenticated', aud: 'authenticated' });
}

function access(userId: string, role: 'user' | 'service' = 'user'): StorageAccess {
  return {
    userId,
    accessToken: role === 'service' ? SERVICE_KEY : userToken(userId),
    role,
  };
}

function remember(request: SignedUrlRequest): void {
  created.push({ bucket: request.bucket, path: request.path });
}

async function putObject(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: { apikey: ANON_KEY, 'content-type': 'application/pdf' },
    body,
  });
}

async function getUrl(url: string): Promise<Response> {
  return fetch(url);
}

function directUrl(bucket: string, path: string): string {
  return `${SUPABASE_URL}/storage/v1/object/${bucket}/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function failure(fn: () => Promise<unknown>): Promise<unknown> {
  return fn().then(
    () => {
      throw new Error('une erreur était attendue');
    },
    (error: unknown) => error,
  );
}

interface Fixture {
  a: { id: string; email: string };
  b: { id: string; email: string };
  formationId: string;
  groupId: string;
  resourceId: string;
  path: string;
  exportId: string;
  exportStoragePath: string;
}

async function createFixture(tx: DbTx): Promise<Fixture> {
  const a = await createTestUser(tx, { firstName: 'Alice' });
  const b = await createTestUser(tx, { firstName: 'Bob' });
  const programme = await createTestProgramme(tx, a.id, {
    modules: 1,
    chaptersPerModule: 1,
    notionsPerChapter: 1,
    title: 'Programme stockage privé',
  });
  const group = await createGroup(tx, {
    formationId: programme.formationId,
    ownerId: a.id,
    now: realClock.now(),
    random: () => 3,
  });
  await joinGroup(tx, { inviteCode: group.inviteCode, userId: b.id, now: realClock.now() });

  const chapterId = programme.chapterIds[0];
  if (chapterId === undefined) throw new Error('chapitre de test absent');
  const resourceId = randomUUID();
  const path = resourcePath(a.id, resourceId, 'guide.pdf');
  await tx.execute(sql`
    insert into public.resources (
      id, owner_id, formation_id, chapter_id, kind, title, storage_path, mime
    )
    values (
      ${resourceId}::uuid, ${a.id}::uuid, ${programme.formationId}::uuid,
      ${chapterId}::uuid, 'pdf', 'Guide privé', ${path}, 'application/pdf'
    )
  `);

  const exportId = randomUUID();
  const exportStoragePath = exportPath(a.id, exportId);
  await tx.execute(sql`
    insert into public.data_exports (id, user_id, status, storage_path, expires_at, size_bytes)
    values (
      ${exportId}::uuid, ${a.id}::uuid, 'done', ${exportStoragePath},
      ${new Date(realClock.now().getTime() + 7 * 24 * 3600 * 1000).toISOString()}::timestamptz,
      1024
    )
  `);

  return {
    a,
    b,
    formationId: programme.formationId,
    groupId: group.id,
    resourceId,
    path,
    exportId,
    exportStoragePath,
  };
}

afterAll(async () => {
  for (const entry of created.splice(0)) {
    const token = SERVICE_KEY;
    try {
      await gateway.remove(entry.bucket, entry.path, token);
    } catch {
      // Best effort: a test may already have removed the blob.
    }
  }
  await closeDb();
});

describe('[SPEC-114] Storage isolation', () => {
  it('keeps both buckets private and refuses anonymous reads', async () => {
    const buckets = await serviceDb().execute<{ id: string; public: boolean }>(sql`
      select id, public from storage.buckets where id in ('resources', 'exports') order by id
    `);
    expect(buckets).toEqual([
      { id: 'exports', public: false },
      { id: 'resources', public: false },
    ]);

    const policies = await serviceDb().execute<{ roles: string[]; qual: string | null }>(sql`
      select roles, qual from pg_catalog.pg_policies where schemaname = 'storage'
    `);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy.roles).not.toContain('anon');
      expect(policy.qual).not.toBe('true');
    }

    // A real object exists, but an anonymous GET and list never expose it.
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      remember({ bucket: 'resources', path: fixture.path });
      const upload = await createUploadUrl(runtime, access(fixture.a.id), {
        bucket: 'resources',
        path: fixture.path,
      });
      expect((await putObject(upload.url, 'contenu privé de A')).status).toBe(200);

      const anonymous = await getUrl(directUrl('resources', fixture.path));
      expect(anonymous.ok).toBe(false);
      const list = await fetch(`${SUPABASE_URL}/storage/v1/object/list/resources`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ prefix: `${fixture.a.id}/`, limit: 100 }),
      });
      if (list.ok) {
        expect(await list.text()).not.toContain(fixture.path);
      }
    });
  });

  it('signs upload and read URLs for A, and B never reads, lists, writes or deletes', async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      remember({ bucket: 'resources', path: fixture.path });

      // EF-3 — upload then read for the owner, with a ten-minute expiration.
      const upload = await asUser(tx, fixture.a.id, async (inner) =>
        createUploadUrl({ ...runtime, db: inner }, access(fixture.a.id), {
          bucket: 'resources',
          path: fixture.path,
        }),
      );
      expect(upload.expiresAt.getTime() - realClock.now().getTime()).toBeLessThanOrEqual(600_000);
      expect(upload.expiresAt.getTime() - realClock.now().getTime()).toBeGreaterThan(599_000);
      expect((await putObject(upload.url, 'contenu privé de A')).status).toBe(200);

      const read = await asUser(tx, fixture.a.id, async (inner) =>
        createReadUrl({ ...runtime, db: inner }, access(fixture.a.id), {
          bucket: 'resources',
          path: fixture.path,
        }),
      );
      const download = await getUrl(read.url);
      expect(download.status).toBe(200);
      expect(await download.text()).toBe('contenu privé de A');

      // CA-3, CL-3 — B belongs to A's group yet sees nothing under A's prefix.
      await expect(
        asUser(tx, fixture.b.id, async (inner) =>
          listOwnedObjects({ ...runtime, db: inner }, access(fixture.b.id), 'resources'),
        ),
      ).resolves.toEqual([]);
      const foreignRead = await failure(() =>
        asUser(tx, fixture.b.id, async (inner) =>
          createReadUrl({ ...runtime, db: inner }, access(fixture.b.id), {
            bucket: 'resources',
            path: fixture.path,
          }),
        ),
      );
      expect((foreignRead as AppError).code).toBe('FORBIDDEN');

      // Direct Storage calls with B's genuine JWT are refused too.
      const directRead = await fetch(directUrl('resources', fixture.path), {
        headers: { apikey: ANON_KEY, authorization: `Bearer ${userToken(fixture.b.id)}` },
      });
      expect(directRead.ok).toBe(false);
      const directWrite = await fetch(directUrl('resources', fixture.path), {
        method: 'PUT',
        headers: {
          apikey: ANON_KEY,
          authorization: `Bearer ${userToken(fixture.b.id)}`,
          'content-type': 'application/pdf',
          'x-upsert': 'true',
        },
        body: 'écriture de B',
      });
      expect(directWrite.ok).toBe(false);
      await gateway.remove('resources', fixture.path, userToken(fixture.b.id));

      // RLS UPDATE from B affects zero rows; a direct Storage delete is refused as well, and the
      // object remains A's.
      await asUser(tx, fixture.b.id, async (inner) => {
        const moved = await inner.execute<{ id: string }>(sql`
          update storage.objects set name = ${`${fixture.b.id}/${fixture.resourceId}/guide.pdf`}
          where bucket_id = 'resources' and name = ${fixture.path}
          returning id
        `);
        expect(moved).toEqual([]);
      });
      await gateway.remove('resources', fixture.path, userToken(fixture.b.id));

      const stillThere = await asUser(tx, fixture.a.id, async (inner) =>
        listOwnedObjects({ ...runtime, db: inner }, access(fixture.a.id), 'resources'),
      );
      expect(stillThere.map((object) => object.name)).toContain(fixture.path);
    });
  });

  it('rejects invalid paths before signing and keeps exports reserved to the owner and the job', async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      const invalid = await failure(() =>
        asUser(tx, fixture.a.id, async (inner) =>
          createUploadUrl({ ...runtime, db: inner }, access(fixture.a.id), {
            bucket: 'resources',
            path: `${fixture.a.id}/${fixture.resourceId}/..%2Fsecret.pdf`,
          }),
        ),
      );
      expect((invalid as AppError).code).toBe('FORBIDDEN');

      // EF-4 — a user never receives an export upload signature; the job does.
      const forbidden = await failure(() =>
        asUser(tx, fixture.a.id, async (inner) =>
          createUploadUrl({ ...runtime, db: inner }, access(fixture.a.id), {
            bucket: 'exports',
            path: fixture.exportStoragePath,
          }),
        ),
      );
      expect((forbidden as AppError).code).toBe('FORBIDDEN');
      remember({ bucket: 'exports', path: fixture.exportStoragePath });
      const jobUpload = await asUser(tx, fixture.a.id, async (inner) =>
        createUploadUrl({ ...runtime, db: inner }, access(fixture.a.id, 'service'), {
          bucket: 'exports',
          path: fixture.exportStoragePath,
        }),
      );
      expect((await putObject(jobUpload.url, 'archive de A')).status).toBe(200);

      const read = await asUser(tx, fixture.a.id, async (inner) =>
        createReadUrl({ ...runtime, db: inner }, access(fixture.a.id), {
          bucket: 'exports',
          path: fixture.exportStoragePath,
        }),
      );
      expect((await getUrl(read.url)).status).toBe(200);

      const foreign = await failure(() =>
        asUser(tx, fixture.b.id, async (inner) =>
          createReadUrl({ ...runtime, db: inner }, access(fixture.b.id), {
            bucket: 'exports',
            path: fixture.exportStoragePath,
          }),
        ),
      );
      expect((foreign as AppError).code).toBe('FORBIDDEN');

      // CA-4 — an expired export row never yields a signature.
      const now = realClock.now().getTime();
      await tx.execute(sql`
        update public.data_exports
        set created_at = ${new Date(now - 8 * 24 * 3600 * 1000).toISOString()}::timestamptz,
            expires_at = ${new Date(now - 24 * 3600 * 1000).toISOString()}::timestamptz
        where id = ${fixture.exportId}::uuid
      `);
      const expired = await failure(() =>
        asUser(tx, fixture.a.id, async (inner) =>
          createReadUrl({ ...runtime, db: inner }, access(fixture.a.id), {
            bucket: 'exports',
            path: fixture.exportStoragePath,
          }),
        ),
      );
      expect((expired as AppError).code).toBe('NOT_FOUND');
    });
  });

  it('expires real signatures, tolerates a missing blob and invalidates deleted rows', async () => {
    await withRollback(async (tx) => {
      const fixture = await createFixture(tx);
      remember({ bucket: 'resources', path: fixture.path });

      const upload = await createUploadUrl(runtime, access(fixture.a.id), {
        bucket: 'resources',
        path: fixture.path,
      });
      expect((await putObject(upload.url, 'à supprimer')).status).toBe(200);

      // CA-4 — Storage really rejects an expired signature. A one-second token stands in for the
      // ten-minute one; the exact 600 s lifetime is asserted on the service and in unit tests.
      const shortLived = await gateway.signRead(
        'resources',
        fixture.path,
        userToken(fixture.a.id),
        1,
      );
      expect((await getUrl(shortLived)).status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect((await getUrl(shortLived)).ok).toBe(false);

      // EF-5, CL-6 — deleting twice is idempotent for the owner.
      await asUser(tx, fixture.a.id, async (inner) =>
        deleteStoredObject({ ...runtime, db: inner }, access(fixture.a.id), {
          bucket: 'resources',
          path: fixture.path,
        }),
      );
      await expect(
        asUser(tx, fixture.a.id, async (inner) =>
          deleteStoredObject({ ...runtime, db: inner }, access(fixture.a.id), {
            bucket: 'resources',
            path: fixture.path,
          }),
        ),
      ).resolves.toBeUndefined();

      // Re-upload, then remove the DB row: no signature is issued although the blob remains (CL-5).
      const again = await createUploadUrl(runtime, access(fixture.a.id), {
        bucket: 'resources',
        path: fixture.path,
      });
      expect((await putObject(again.url, 'orphelin')).status).toBe(200);
      await tx.execute(sql`delete from public.resources where id = ${fixture.resourceId}::uuid`);
      const orphan = await failure(() =>
        asUser(tx, fixture.a.id, async (inner) =>
          createReadUrl({ ...runtime, db: inner }, access(fixture.a.id), {
            bucket: 'resources',
            path: fixture.path,
          }),
        ),
      );
      expect((orphan as AppError).code).toBe('NOT_FOUND');

      // The cleanup job (service role) removes the orphan blob; the path is then genuinely gone.
      await deleteStoredObject(runtime, access(fixture.a.id, 'service'), {
        bucket: 'resources',
        path: fixture.path,
      });
      await expect(
        asUser(tx, fixture.a.id, async (inner) =>
          listOwnedObjects({ ...runtime, db: inner }, access(fixture.a.id), 'resources'),
        ),
      ).resolves.toEqual([]);
    });
  });

  it('computes the exact ten-minute expiration with the injected clock', () => {
    const fixed = { now: () => new Date('2026-11-11T12:20:00Z') };
    expect(signedUrlExpiresAt(fixed).toISOString()).toBe('2026-11-11T12:30:00.000Z');
  });
});
