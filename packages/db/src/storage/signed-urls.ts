// Signed storage access of SPEC-114 (ET-4, ET-5, EF-3 to EF-6, ADR-0249).
//
// Every URL is signed for exactly ten minutes by the injected clock and by the Supabase Storage
// REST API. A read URL is issued only after the linked database row has been checked under the
// caller's user context: a deleted resource or an expired export never produces a signature.
// URLs and their tokens are returned to the caller but never logged here.
import { createHmac } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { AppError, clock as systemClock, type Clock } from '@learny/core';

import type { Db, DbTx } from '../client';

import { parseOwnedPath, type StorageBucket } from './paths';

/** Exact lifetime of an upload or read signature (ADR-0058, ADR-0249). */
export const SIGNED_URL_TTL_SECONDS = 600;
export const SIGNED_URL_TTL_MS = SIGNED_URL_TTL_SECONDS * 1000;

type Queryable = Pick<DbTx, 'execute'>;
/** A full database is assignable to the transaction subset used by the checks. */
export type StorageDb = Queryable | Db;

export interface StorageAccess {
  /** Owner whose prefix and database rows are checked. */
  userId: string;
  /** JWT presented to the Storage API (user session or `service_role` for the export job). */
  accessToken: string;
  /** `service` is required to write the `exports` bucket (EF-4). */
  role?: 'user' | 'service';
}

export interface SignedStorageUrl {
  url: string;
  expiresAt: Date;
}

export interface StorageObject {
  name: string;
  id: string | null;
  updatedAt: string | null;
}

export interface StorageGateway {
  signUpload(
    bucket: StorageBucket,
    path: string,
    accessToken: string,
    expiresInSeconds: number,
  ): Promise<string>;
  signRead(
    bucket: StorageBucket,
    path: string,
    accessToken: string,
    expiresInSeconds: number,
  ): Promise<string>;
  remove(bucket: StorageBucket, path: string, accessToken: string): Promise<void>;
  list(bucket: StorageBucket, prefix: string, accessToken: string): Promise<StorageObject[]>;
}

export interface StorageRuntime {
  db: StorageDb;
  gateway: StorageGateway;
  clock?: Clock;
}

export interface SignedUrlRequest {
  bucket: StorageBucket;
  path: string;
}

function expiry(clock: Clock): Date {
  return new Date(clock.now().getTime() + SIGNED_URL_TTL_MS);
}

/** Exact expiration instant of a signature created now, using the injected clock. */
export function signedUrlExpiresAt(now: Clock): Date {
  return expiry(now);
}

function ownedPath(request: SignedUrlRequest, userId: string): string {
  const owned = parseOwnedPath(request.path, userId);
  if (owned === null) {
    // Same message for malformed and foreign paths: the caller learns nothing about existence.
    throw new AppError('FORBIDDEN', 'Chemin de stockage refusé.');
  }
  return owned.path;
}

function runtimeClock(runtime: StorageRuntime): Clock {
  return runtime.clock ?? systemClock;
}

async function hasReadableRow(
  runtime: StorageRuntime,
  access: StorageAccess,
  request: SignedUrlRequest,
  now: Date,
): Promise<boolean> {
  if (request.bucket === 'resources') {
    const rows = await runtime.db.execute<{ allowed: boolean }>(sql`
      select exists (
        select 1
        from public.resources r
        where r.owner_id = ${access.userId}::uuid
          and r.storage_path = ${request.path}
          and r.deleted_at is null
      ) as allowed
    `);
    return rows[0]?.allowed === true;
  }
  const rows = await runtime.db.execute<{ allowed: boolean }>(sql`
    select exists (
      select 1
      from public.data_exports e
      where e.user_id = ${access.userId}::uuid
        and e.storage_path = ${request.path}
        and e.status = 'done'
        and e.expires_at is not null
        and e.expires_at > ${now.toISOString()}::timestamptz
    ) as allowed
  `);
  return rows[0]?.allowed === true;
}

/**
 * EF-3 — signs an upload for a path under the caller's prefix. Writing `exports` is reserved to
 * the export job (EF-4), so a user-scoped call is refused before any signature is produced.
 */
export async function createUploadUrl(
  runtime: StorageRuntime,
  access: StorageAccess,
  request: SignedUrlRequest,
): Promise<SignedStorageUrl> {
  if (request.bucket === 'exports' && access.role !== 'service') {
    throw new AppError('FORBIDDEN', 'Seul le job d’export peut déposer une archive.');
  }
  const path = ownedPath(request, access.userId);
  const url = await runtime.gateway.signUpload(
    request.bucket,
    path,
    access.accessToken,
    SIGNED_URL_TTL_SECONDS,
  );
  return { url, expiresAt: expiry(runtimeClock(runtime)) };
}

/**
 * EF-3, EF-4, CL-5 — signs a read only after the linked row proves ownership (and, for exports,
 * a done and unexpired archive). A removed row or a foreign path yields `NOT_FOUND`/`FORBIDDEN`.
 */
export async function createReadUrl(
  runtime: StorageRuntime,
  access: StorageAccess,
  request: SignedUrlRequest,
): Promise<SignedStorageUrl> {
  const path = ownedPath(request, access.userId);
  const now = runtimeClock(runtime).now();
  const readable = await hasReadableRow(runtime, access, { ...request, path }, now);
  if (!readable) {
    throw new AppError('NOT_FOUND', 'Fichier introuvable.');
  }
  const url = await runtime.gateway.signRead(
    request.bucket,
    path,
    access.accessToken,
    SIGNED_URL_TTL_SECONDS,
  );
  return { url, expiresAt: new Date(now.getTime() + SIGNED_URL_TTL_MS) };
}

/**
 * EF-5, CL-6 — removes one object under the owner's prefix. Missing blobs are a success (the
 * Storage API answers 404 and the gateway treats it as already removed). A user call additionally
 * requires the linked row, so a guessed path can never delete another learner's object.
 */
export async function deleteStoredObject(
  runtime: StorageRuntime,
  access: StorageAccess,
  request: SignedUrlRequest,
): Promise<void> {
  const path = ownedPath(request, access.userId);
  if (access.role !== 'service') {
    const now = runtimeClock(runtime).now();
    if (!(await hasReadableRow(runtime, access, { ...request, path }, now))) {
      throw new AppError('NOT_FOUND', 'Fichier introuvable.');
    }
  }
  await runtime.gateway.remove(request.bucket, path, access.accessToken);
}

/**
 * EF-6 — lists only objects under the caller's exact prefix, then filters defensively so a
 * misbehaving backend cannot leak another user's path.
 */
export async function listOwnedObjects(
  runtime: StorageRuntime,
  access: StorageAccess,
  bucket: StorageBucket,
): Promise<StorageObject[]> {
  const prefix = `${access.userId}/`;
  const objects = await runtime.gateway.list(bucket, prefix, access.accessToken);
  return objects.filter((object) => object.name.startsWith(prefix));
}

// ---------------------------------------------------------------------------------------------
// Supabase Storage REST gateway. The API key is the public anon key; the Authorization header is
// the user JWT (or the service role token for the export job). Kept injectable for unit tests.
// ---------------------------------------------------------------------------------------------

export interface SupabaseStorageOptions {
  /** API origin, for example `http://127.0.0.1:54321`. */
  url: string;
  /** Public anon key sent as `apikey`. */
  apiKey: string;
  /**
   * Server-side Supabase JWT secret (`SUPABASE_JWT_SECRET`). Required for upload signatures: the
   * Storage API itself hard-codes a two-hour upload token, so the service mints a scoped `upload`
   * token with the exact ten-minute lifetime fixed by ADR-0249. Never sent to the browser.
   */
  jwtSecret?: string;
  /** Injectable for tests; defaults to the environment-aware core clock. */
  clock?: Clock;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImplementation?: typeof fetch;
}

interface StorageErrorBody {
  error?: string;
  message?: string;
  statusCode?: string | number;
}

function storageBase(url: string): string {
  return `${url.replace(/\/+$/, '')}/storage/v1`;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

export class SupabaseStorageGateway implements StorageGateway {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly jwtSecret: string | undefined;
  private readonly clock: Clock;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: SupabaseStorageOptions) {
    this.base = storageBase(options.url);
    this.apiKey = options.apiKey;
    this.jwtSecret = options.jwtSecret;
    this.clock = options.clock ?? systemClock;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  private async request(
    method: string,
    path: string,
    accessToken: string,
    body?: unknown,
    allowNotFound = false,
  ): Promise<unknown> {
    const response = await this.fetchImplementation(joinUrl(this.base, path), {
      method,
      headers: {
        apikey: this.apiKey,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 404 && allowNotFound) return null;
    if (!response.ok) {
      let detail = `Stockage indisponible (${String(response.status)}).`;
      try {
        const parsed = (await response.json()) as StorageErrorBody;
        const message = parsed.message ?? parsed.error;
        if (message !== undefined && message !== '') detail = message;
      } catch {
        // The body is optional; the status remains the actionable information.
      }
      throw new AppError('SERVICE_UNAVAILABLE', detail, { status: response.status });
    }
    if (response.status === 204) return null;
    const text = await response.text();
    if (text === '') return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  }

  signUpload(
    bucket: StorageBucket,
    path: string,
    accessToken: string,
    expiresInSeconds: number,
  ): Promise<string> {
    if (accessToken === '') {
      throw new AppError('FORBIDDEN', 'Jeton d’accès absent.');
    }
    // The public Storage API signs upload URLs for two hours and ignores `expiresIn`. The service
    // therefore mints the same scoped token itself, with the ten-minute lifetime required by
    // ADR-0058/ADR-0249. The secret never leaves the server.
    if (this.jwtSecret === undefined || this.jwtSecret === '') {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Signature d’envoi indisponible : secret JWT Supabase absent.',
      );
    }
    const now = Math.floor(this.clock.now().getTime() / 1000);
    const owner = path.split('/')[0] ?? '';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        owner,
        url: `${bucket}/${path}`,
        upsert: false,
        scope: 'upload',
        iat: now,
        exp: now + expiresInSeconds,
      }),
    ).toString('base64url');
    const signature = createHmac('sha256', this.jwtSecret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    return Promise.resolve(
      `${this.base}/object/upload/sign/${bucket}/${encodePath(path)}?token=${header}.${payload}.${signature}`,
    );
  }

  async signRead(
    bucket: StorageBucket,
    path: string,
    accessToken: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const payload = (await this.request(
      'POST',
      `/object/sign/${bucket}/${encodePath(path)}`,
      accessToken,
      { expiresIn: expiresInSeconds },
    )) as { signedURL?: string } | null;
    if (payload?.signedURL === undefined || payload.signedURL === '') {
      throw new AppError('SERVICE_UNAVAILABLE', 'URL de lecture indisponible.');
    }
    return joinUrl(this.base, payload.signedURL);
  }

  async remove(bucket: StorageBucket, path: string, accessToken: string): Promise<void> {
    await this.request('DELETE', `/object/${bucket}`, accessToken, { prefixes: [path] }, true);
  }

  async list(bucket: StorageBucket, prefix: string, accessToken: string): Promise<StorageObject[]> {
    const objects: StorageObject[] = [];
    const walk = async (folder: string, depth: number): Promise<void> => {
      if (depth > 4) return;
      let offset = 0;
      for (;;) {
        const payload = (await this.request('POST', `/object/list/${bucket}`, accessToken, {
          prefix: folder,
          limit: 1000,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        })) as Array<{
          name?: unknown;
          id?: unknown;
          updated_at?: unknown;
          metadata?: unknown;
        }> | null;
        if (!Array.isArray(payload)) return;
        for (const entry of payload) {
          if (typeof entry.name !== 'string') continue;
          // The Storage list endpoint is one level deep: a folder has no id and no metadata.
          if (entry.id === null && (entry.metadata === null || entry.metadata === undefined)) {
            await walk(`${folder}${entry.name}/`, depth + 1);
            continue;
          }
          objects.push({
            name: `${folder}${entry.name}`,
            id: typeof entry.id === 'string' ? entry.id : null,
            updatedAt: typeof entry.updated_at === 'string' ? entry.updated_at : null,
          });
        }
        if (payload.length < 1000) return;
        offset += 1000;
      }
    };
    await walk(prefix, 0);
    return objects;
  }
}
