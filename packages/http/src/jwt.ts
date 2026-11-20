import { decodeProtectedHeader, importJWK, jwtVerify, type JWK, type JWTPayload } from 'jose';

import type { Clock } from '@learny/core';
import { clock } from '@learny/core';
import { createLogger } from '@learny/core/server';

const JWKS_MAX_AGE_MS = 10 * 60 * 1000;
const ASYMMETRIC_ALGORITHMS = new Set(['RS256', 'ES256', 'EdDSA']);

interface CachedJwks {
  keys: JWK[];
  loadedAt: number;
}

const jwksCache = new Map<string, CachedJwks>();
let lastUnavailableWarningMinute = -1;

export interface JwtVerificationOptions {
  jwtSecret?: string;
  jwksUrl?: string;
  issuer?: string;
  now?: () => Date;
  fetcher?: typeof fetch;
}

export type JwtVerification =
  { status: 'valid'; claims: JWTPayload } | { status: 'invalid' } | { status: 'unavailable' };

class JwksUnavailableError extends Error {}

function verifyOptions(options: JwtVerificationOptions) {
  return {
    audience: 'authenticated',
    currentDate: options.now === undefined ? clock.now() : options.now(),
    requiredClaims: ['sub', 'aud', 'exp', 'iss'],
    ...(options.issuer === undefined ? {} : { issuer: options.issuer }),
  };
}

async function loadJwks(
  url: string,
  options: { fetcher: typeof fetch; now: (() => Date) | undefined },
  force = false,
): Promise<JWK[]> {
  const now = options.now === undefined ? clock.now().getTime() : options.now().getTime();
  const cached = jwksCache.get(url);
  if (!force && cached !== undefined && now - cached.loadedAt < JWKS_MAX_AGE_MS) {
    return cached.keys;
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      cache: 'no-store',
      headers: { accept: 'application/jwk-set+json, application/json' },
    });
  } catch {
    throw new JwksUnavailableError();
  }
  if (!response.ok) throw new JwksUnavailableError();
  let document: unknown;
  try {
    document = await response.json();
  } catch {
    throw new JwksUnavailableError();
  }
  if (
    typeof document !== 'object' ||
    document === null ||
    !('keys' in document) ||
    !Array.isArray(document.keys)
  ) {
    throw new JwksUnavailableError();
  }
  const keys = document.keys.filter(
    (value): value is JWK => typeof value === 'object' && value !== null,
  );
  jwksCache.set(url, { keys, loadedAt: now });
  return keys;
}

async function verifyWithJwks(
  token: string,
  options: JwtVerificationOptions & { jwksUrl: string },
): Promise<JwtVerification> {
  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    return { status: 'invalid' };
  }
  if (
    typeof header.kid !== 'string' ||
    header.kid.length === 0 ||
    header.alg === undefined ||
    !ASYMMETRIC_ALGORITHMS.has(header.alg)
  ) {
    return { status: 'invalid' };
  }

  const fetcher = options.fetcher ?? fetch;
  let keys: JWK[];
  try {
    keys = await loadJwks(options.jwksUrl, { fetcher, now: options.now });
    if (!keys.some((key) => key.kid === header.kid)) {
      keys = await loadJwks(options.jwksUrl, { fetcher, now: options.now }, true);
    }
  } catch (error) {
    if (error instanceof JwksUnavailableError) return { status: 'unavailable' };
    return { status: 'invalid' };
  }
  const jwk = keys.find((key) => key.kid === header.kid);
  if (jwk === undefined) return { status: 'invalid' };

  try {
    const key = await importJWK(jwk, header.alg);
    const { payload } = await jwtVerify(token, key, {
      ...verifyOptions(options),
      algorithms: [header.alg],
    });
    return { status: 'valid', claims: payload };
  } catch {
    return { status: 'invalid' };
  }
}

/** Locally verifies a Supabase access token without contacting the Auth server. */
export async function verifyAccessToken(
  token: string,
  options: JwtVerificationOptions,
): Promise<JwtVerification> {
  if (options.jwksUrl !== undefined)
    return verifyWithJwks(token, { ...options, jwksUrl: options.jwksUrl });
  if (options.jwtSecret === undefined) return { status: 'unavailable' };

  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'HS256') return { status: 'invalid' };
    const { payload } = await jwtVerify(token, new TextEncoder().encode(options.jwtSecret), {
      ...verifyOptions(options),
      algorithms: ['HS256'],
    });
    return { status: 'valid', claims: payload };
  } catch {
    return { status: 'invalid' };
  }
}

export function warnJwtVerificationUnavailable(at: Date = clock.now()): void {
  const minute = Math.floor(at.getTime() / 60_000);
  if (minute === lastUnavailableWarningMinute) return;
  lastUnavailableWarningMinute = minute;
  createLogger({
    route: 'jwt-verification',
    clock: { now: () => new Date(at.getTime()) } satisfies Clock,
  }).warn('JWKS unavailable; using fresh Auth verification', {
    code: 'SERVICE_UNAVAILABLE',
    outcome: 'fresh-auth-fallback',
  });
}

export function resetJwtVerificationCache(): void {
  jwksCache.clear();
  lastUnavailableWarningMinute = -1;
}
