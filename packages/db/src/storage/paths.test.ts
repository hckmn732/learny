// Unit tests of the private storage layout and signed URL expiry (SPEC-114 §12, CA-2).
//
// The clock is fixed at 2026-11-11T12:20:00Z (ADR-0047); the gateway and database are injected so
// no network or real database is touched. URLs are opaque here: only their validity and the exact
// ten-minute expiration are asserted, never a token.
import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import {
  MAX_STORAGE_FILE_NAME_LENGTH,
  STORAGE_BUCKETS,
  SIGNED_URL_TTL_MS,
  SIGNED_URL_TTL_SECONDS,
  SupabaseStorageGateway,
  createReadUrl,
  createUploadUrl,
  deleteStoredObject,
  exportPath,
  listOwnedObjects,
  normalizeStorageFileName,
  parseOwnedPath,
  resourcePath,
  signedUrlExpiresAt,
  type SignedUrlRequest,
  type StorageAccess,
  type StorageGateway,
  type StorageObject,
  type StorageRuntime,
} from '../index';

const FIXED = new Date('2026-11-11T12:20:00Z');
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const RESOURCE = '33333333-3333-4333-8333-333333333333';
const EXPORT = '44444444-4444-4444-8444-444444444444';

const clock = { now: () => new Date(FIXED) };

function access(overrides: Partial<StorageAccess> = {}): StorageAccess {
  return { userId: OWNER, accessToken: 'user-token', role: 'user', ...overrides };
}

class FakeGateway implements StorageGateway {
  readonly calls: string[] = [];
  readonly tokens: string[] = [];
  objects: StorageObject[] = [];

  signUpload(bucket: string, path: string, token: string, seconds: number): Promise<string> {
    this.tokens.push(token);
    this.calls.push(`upload:${bucket}:${path}:${String(seconds)}`);
    return Promise.resolve('https://storage.test/upload-token');
  }

  signRead(bucket: string, path: string, token: string, seconds: number): Promise<string> {
    this.tokens.push(token);
    this.calls.push(`read:${bucket}:${path}:${String(seconds)}`);
    return Promise.resolve('https://storage.test/read-token');
  }

  remove(bucket: string, path: string, token: string): Promise<void> {
    this.tokens.push(token);
    this.calls.push(`remove:${bucket}:${path}`);
    return Promise.resolve();
  }

  list(bucket: string, prefix: string, token: string): Promise<StorageObject[]> {
    this.tokens.push(token);
    this.calls.push(`list:${bucket}:${prefix}`);
    return Promise.resolve(this.objects);
  }
}

function runtime(allowed = true): StorageRuntime {
  const rows = [{ allowed }];
  return {
    gateway: new FakeGateway(),
    clock,
    // The signed URL helpers only run one `exists` query; the injected answer is enough.
    db: { execute: () => Promise.resolve(rows) } as unknown as StorageRuntime['db'],
  };
}

function failureOf(fn: () => Promise<unknown>): Promise<unknown> {
  return fn().then(
    () => {
      throw new Error('une erreur était attendue');
    },
    (error: unknown) => error,
  );
}

describe('[SPEC-114] storage paths', () => {
  it('builds an owner-prefixed path with a cleaned name', () => {
    expect(resourcePath(OWNER, RESOURCE, '  Guide   PDF.pdf ')).toBe(
      `${OWNER}/${RESOURCE}/Guide PDF.pdf`,
    );
    expect(exportPath(OWNER, EXPORT)).toBe(`${OWNER}/${EXPORT}/export.zip`);
    expect(STORAGE_BUCKETS).toEqual({ resources: 'resources', exports: 'exports' });
  });

  it('rejects traversal, separators, encoded separators and empty names', () => {
    const invalid = [
      '../secret.pdf',
      '..\\secret.pdf',
      'dossier/secret.pdf',
      'dossier\\secret.pdf',
      'secret%2Fpdf',
      'secret%5Cpdf',
      'secret%00.pdf',
      '%2e%2e%2fsecret.pdf',
      '%252fsecret.pdf',
      'secret\u0000.pdf',
      '   ',
      '.',
      '..',
    ];
    for (const name of invalid) {
      expect(() => normalizeStorageFileName(name), name).toThrow(AppError);
      let thrown: unknown;
      try {
        resourcePath(OWNER, RESOURCE, name);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, name).toBeInstanceOf(AppError);
      expect((thrown as AppError).code, name).toBe('VALIDATION_FAILED');
    }
    expect(() => resourcePath(OWNER, 'not-a-uuid', 'guide.pdf')).toThrow(AppError);
    expect(() => resourcePath('not-a-uuid', RESOURCE, 'guide.pdf')).toThrow(AppError);
  });

  it('bounds the cleaned name and removes forbidden characters', () => {
    expect(normalizeStorageFileName('rap|port<final>.pdf')).toBe('rap-port-final-.pdf');
    expect(() => normalizeStorageFileName('a'.repeat(MAX_STORAGE_FILE_NAME_LENGTH + 1))).toThrow(
      AppError,
    );
  });

  it('parses a path only for its exact owner', () => {
    const path = resourcePath(OWNER, RESOURCE, 'guide.pdf');
    expect(parseOwnedPath(path, OWNER)).toEqual({
      userId: OWNER,
      objectId: RESOURCE,
      name: 'guide.pdf',
      path,
    });
    expect(parseOwnedPath(path, OTHER)).toBeNull();
    expect(parseOwnedPath(`${OWNER}/${RESOURCE}`, OWNER)).toBeNull();
    expect(parseOwnedPath(`${OTHER}/${RESOURCE}/guide.pdf`, OWNER)).toBeNull();
    expect(parseOwnedPath(`${OWNER}/not-a-uuid/guide.pdf`, OWNER)).toBeNull();
    expect(parseOwnedPath(`${OWNER}/${RESOURCE}/../secret.pdf`, OWNER)).toBeNull();
    expect(parseOwnedPath(`${OWNER}/${RESOURCE}/a%2Fb.pdf`, OWNER)).toBeNull();
    expect(parseOwnedPath('', OWNER)).toBeNull();
  });

  it('computes an exact ten-minute expiration with the injected clock', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(600);
    expect(SIGNED_URL_TTL_MS).toBe(600_000);
    expect(signedUrlExpiresAt(clock).toISOString()).toBe('2026-11-11T12:30:00.000Z');
  });

  it('signs an upload for an owned path with a 600-second TTL', async () => {
    const rt = runtime();
    const result = await createUploadUrl(rt, access(), {
      bucket: 'resources',
      path: resourcePath(OWNER, RESOURCE, 'guide.pdf'),
    });
    expect(result.expiresAt.toISOString()).toBe('2026-11-11T12:30:00.000Z');
    expect((rt.gateway as FakeGateway).calls).toEqual([
      `upload:resources:${OWNER}/${RESOURCE}/guide.pdf:600`,
    ]);
  });

  it('refuses an invalid or foreign upload path before calling Storage', async () => {
    const rt = runtime();
    const request: SignedUrlRequest = { bucket: 'resources', path: `${OTHER}/${RESOURCE}/x.pdf` };
    const error = await failureOf(() => createUploadUrl(rt, access(), request));
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('FORBIDDEN');
    expect((rt.gateway as FakeGateway).calls).toEqual([]);
  });

  it('reserves export uploads to the export job and never signs them for a user', async () => {
    const rt = runtime();
    const request: SignedUrlRequest = {
      bucket: 'exports',
      path: exportPath(OWNER, EXPORT),
    };
    const error = await failureOf(() => createUploadUrl(rt, access(), request));
    expect((error as AppError).code).toBe('FORBIDDEN');
    expect((rt.gateway as FakeGateway).calls).toEqual([]);

    const job = await createUploadUrl(rt, access({ role: 'service' }), request);
    expect(job.expiresAt.toISOString()).toBe('2026-11-11T12:30:00.000Z');
    expect((rt.gateway as FakeGateway).calls).toEqual([
      `upload:exports:${OWNER}/${EXPORT}/export.zip:600`,
    ]);
  });

  it('requires an owned database row before signing a read', async () => {
    const rt = runtime(true);
    const result = await createReadUrl(rt, access(), {
      bucket: 'resources',
      path: resourcePath(OWNER, RESOURCE, 'guide.pdf'),
    });
    expect(result.expiresAt.toISOString()).toBe('2026-11-11T12:30:00.000Z');
    expect((rt.gateway as FakeGateway).calls[0]).toContain('read:resources:');

    const missing = runtime(false);
    const error = await failureOf(() =>
      createReadUrl(missing, access(), {
        bucket: 'exports',
        path: exportPath(OWNER, EXPORT),
      }),
    );
    expect((error as AppError).code).toBe('NOT_FOUND');
    expect((missing.gateway as FakeGateway).calls).toEqual([]);
  });

  it('deletes idempotently for the owner and refuses a foreign path', async () => {
    const rt = runtime(true);
    const request: SignedUrlRequest = {
      bucket: 'resources',
      path: resourcePath(OWNER, RESOURCE, 'guide.pdf'),
    };
    await deleteStoredObject(rt, access(), request);
    await deleteStoredObject(rt, access(), request);
    expect((rt.gateway as FakeGateway).calls).toEqual([
      `remove:resources:${OWNER}/${RESOURCE}/guide.pdf`,
      `remove:resources:${OWNER}/${RESOURCE}/guide.pdf`,
    ]);

    const foreign = await failureOf(() =>
      deleteStoredObject(rt, access({ userId: OTHER }), request),
    );
    expect((foreign as AppError).code).toBe('FORBIDDEN');
  });

  it('lists and filters only the caller prefix', async () => {
    const rt = runtime();
    (rt.gateway as FakeGateway).objects = [
      { name: `${OWNER}/${RESOURCE}/guide.pdf`, id: '1', updatedAt: null },
      { name: `${OTHER}/${RESOURCE}/guide.pdf`, id: '2', updatedAt: null },
    ];
    const objects = await listOwnedObjects(rt, access(), 'resources');
    expect(objects.map((object) => object.name)).toEqual([`${OWNER}/${RESOURCE}/guide.pdf`]);
    expect((rt.gateway as FakeGateway).calls).toEqual([`list:resources:${OWNER}/`]);
  });

  it('builds encoded Storage API requests and accepts an already missing object', async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImplementation = (
      url: string | URL | Request,
      init?: RequestInit,
    ): Promise<Response> => {
      const target = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      requests.push({ url: target, init });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            signedURL: '/object/sign/resources/path?token=opaque',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    };
    const gateway = new SupabaseStorageGateway({
      url: 'http://127.0.0.1:54321/',
      apiKey: 'anon-test',
      jwtSecret: 'learny-test-only-jwt-secret',
      clock,
      fetchImplementation,
    });
    // Uploads are signed locally with an exact 600-second token: the Storage API would use 2 h.
    const upload = await gateway.signUpload(
      'resources',
      `${OWNER}/${RESOURCE}/guide final.pdf`,
      'jwt',
      600,
    );
    expect(upload).toContain(
      `http://127.0.0.1:54321/storage/v1/object/upload/sign/resources/${OWNER}/${RESOURCE}/guide%20final.pdf?token=`,
    );
    const token = upload.split('token=')[1] ?? '';
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    ) as { exp: number; iat: number; scope: string; owner: string; url: string };
    expect(payload).toMatchObject({
      owner: OWNER,
      scope: 'upload',
      url: `resources/${OWNER}/${RESOURCE}/guide final.pdf`,
    });
    expect(payload.exp - payload.iat).toBe(600);

    const read = await gateway.signRead('resources', `${OWNER}/${RESOURCE}/guide.pdf`, 'jwt', 600);
    expect(read).toBe(`http://127.0.0.1:54321/storage/v1/object/sign/resources/path?token=opaque`);
    expect(requests[0]?.url).toContain('/object/sign/resources/');
    expect(requests[0]?.init?.headers).toMatchObject({
      apikey: 'anon-test',
      authorization: 'Bearer jwt',
    });

    const failing = new SupabaseStorageGateway({
      url: 'http://127.0.0.1:54321',
      apiKey: 'anon-test',
      fetchImplementation: () => Promise.resolve(new Response('', { status: 404 })),
    });
    await expect(failing.remove('resources', `${OWNER}/${RESOURCE}/x.pdf`, 'jwt')).resolves.toBe(
      undefined,
    );
  });
});
