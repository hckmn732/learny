// Storage access of the file service (SPEC-206 ET-4, ADR-0058).
//
// Paths, signatures and removals go through SPEC-114 (`@learny/db`). This module adds what that
// layer does not offer: measuring and reading an object that was already uploaded (EF-2), and the
// short-lived token presented to Storage on behalf of the caller. Nothing here is logged: a
// signed URL or a token never leaves the call that produced it.
import { createHash, createHmac } from 'node:crypto';

import { AppError, systemClock, type Clock } from '@learny/core';
import type { StorageBucket } from '@learny/db';

export interface ObjectInfo {
  size: number;
  etag: string;
}

export interface ObjectContent {
  bytes: Uint8Array;
  etag: string;
}

/** Reads an uploaded object under the caller's identity (the Storage policies still apply). */
export interface ObjectReader {
  /** `null` when the object does not exist. */
  info(bucket: StorageBucket, path: string, accessToken: string): Promise<ObjectInfo | null>;
  /** `null` when the object does not exist; refuses an object larger than `maxBytes`. */
  read(
    bucket: StorageBucket,
    path: string,
    accessToken: string,
    maxBytes: number,
  ): Promise<ObjectContent | null>;
}

export interface SupabaseObjectReaderOptions {
  /** API origin, for example `http://127.0.0.1:54321`. */
  url: string;
  /** Public anon key sent as `apikey`. */
  apiKey: string;
  fetchImplementation?: typeof fetch;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Storage answers a missing object with 404, or with 400 and a `statusCode: "404"` body. */
async function isMissing(response: Response): Promise<boolean> {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;
  try {
    const body = (await response.clone().json()) as { statusCode?: unknown };
    return String(body.statusCode) === '404';
  } catch {
    return false;
  }
}

function unavailable(status: number): AppError {
  return new AppError('SERVICE_UNAVAILABLE', `Stockage indisponible (${String(status)}).`, {
    status,
  });
}

export class SupabaseObjectReader implements ObjectReader {
  private readonly base: string;
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;

  constructor(options: SupabaseObjectReaderOptions) {
    this.base = `${options.url.replace(/\/+$/, '')}/storage/v1`;
    this.apiKey = options.apiKey;
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  private headers(accessToken: string): Record<string, string> {
    return { apikey: this.apiKey, authorization: `Bearer ${accessToken}` };
  }

  async info(bucket: StorageBucket, path: string, accessToken: string): Promise<ObjectInfo | null> {
    const response = await this.fetchImplementation(
      `${this.base}/object/info/authenticated/${bucket}/${encodePath(path)}`,
      { headers: this.headers(accessToken) },
    );
    if (await isMissing(response)) return null;
    if (!response.ok) throw unavailable(response.status);
    const body = (await response.json()) as { size?: unknown; etag?: unknown };
    if (typeof body.size !== 'number' || typeof body.etag !== 'string') {
      throw new AppError('SERVICE_UNAVAILABLE', 'Réponse de stockage illisible.');
    }
    return { size: body.size, etag: body.etag };
  }

  async read(
    bucket: StorageBucket,
    path: string,
    accessToken: string,
    maxBytes: number,
  ): Promise<ObjectContent | null> {
    const response = await this.fetchImplementation(
      `${this.base}/object/authenticated/${bucket}/${encodePath(path)}`,
      { headers: this.headers(accessToken) },
    );
    if (await isMissing(response)) return null;
    if (!response.ok) throw unavailable(response.status);
    const etag = response.headers.get('etag') ?? '';
    if (response.body === null) return { bytes: new Uint8Array(0), etag };

    // The body is read as a stream and stopped one byte beyond the bound: an object that grew
    // after it was measured can never exhaust the memory of the server.
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AppError('UPLOAD_TOO_LARGE', 'Le fichier dépasse la taille maximale autorisée.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return { bytes, etag };
  }
}

/** Default lifetime of the token presented to Storage: one request, never stored. */
export const ACCESS_TOKEN_TTL_SECONDS = 60;

/**
 * Mints the `authenticated` JWT that Storage evaluates its policies with, for one caller whose
 * session the API wrapper already verified. It is signed with the server-side Supabase JWT
 * secret (never sent to the browser) and uses the real system time: Storage checks `exp` against
 * its own clock, not against the injectable test clock of ADR-0047.
 */
export function mintUserAccessToken(
  userId: string,
  jwtSecret: string,
  clock: Clock = systemClock,
  ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
): string {
  if (jwtSecret === '') {
    throw new AppError(
      'SERVICE_UNAVAILABLE',
      'Accès au stockage indisponible : secret JWT absent.',
    );
  }
  const now = Math.floor(clock.now().getTime() / 1000);
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    iss: 'learny',
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + ttlSeconds,
  });
  const signature = createHmac('sha256', jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** SHA-256 of the measured bytes: the fingerprint stored at finalization (ET-5). */
export function fingerprint(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
