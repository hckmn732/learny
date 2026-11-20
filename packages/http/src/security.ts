// Registers the real protections of /api/v1 at server start (SPEC-208 ET-6): the Postgres token
// bucket and the origin guard. Imported by the route wrapper, so no route can run without them.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { clock } from '@learny/core';
import {
  createOriginGuard,
  createServiceRateLimiter,
  type OriginGuard as ServicesOriginGuard,
} from '@learny/services';

import { setOriginGuard, type OriginGuard } from './origin';
import { noopRateLimiter, setRateLimiter, type RateLimiter, getRateLimiter } from './rate-limit';

/**
 * Outside production, without `RATE_LIMIT_IP_SECRET`, each process draws its own secret: buckets of
 * addresses are then only comparable inside that process, which is all a local run needs.
 */
const PROCESS_SECRET = randomBytes(32).toString('hex');

type Env = Readonly<Record<string, string | undefined>>;

export function createRateLimiter(env: Env = process.env): RateLimiter {
  // QA only (ADR-0336) : with a frozen clock the buckets never refill, so the demonstration stack
  // swaps the limiter for the no-op. The mode is refused in production by the environment check.
  if (env.RATE_LIMIT_MODE === 'off') return noopRateLimiter;
  const secret = env.RATE_LIMIT_IP_SECRET ?? PROCESS_SECRET;
  const limiter = createServiceRateLimiter({ now: () => clock.now() }, secret);
  return {
    async consume(request) {
      const result = await limiter.consume(request);
      return {
        allowed: result.allowed,
        limit: result.limit,
        remaining: result.remaining,
        retryAfterSec: result.retryAfterSeconds,
      };
    },
  };
}

function firstForwarded(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim();
  return first === undefined || first === '' ? null : first;
}

function sameSecret(expected: string, received: string): boolean {
  const expectedDigest = createHash('sha256').update(expected).digest();
  const receivedDigest = createHash('sha256').update(received).digest();
  return timingSafeEqual(expectedDigest, receivedDigest);
}

export function isTrustedProxy(request: Request, env: Env = process.env): boolean {
  const expected = env.API_PROXY_SECRET;
  if (expected === undefined || expected === '') return false;
  const received = request.headers.get('x-learny-proxy-secret');
  return received !== null && sameSecret(expected, received);
}

/** Reconstructs the browser-facing origin only through a cryptographically trusted relay. */
export function requestOrigin(request: Request, env: Env = process.env): string {
  const url = new URL(request.url);
  const trusted = isTrustedProxy(request, env);
  const host = trusted
    ? (firstForwarded(request.headers.get('x-forwarded-host')) ??
      request.headers.get('host') ??
      url.host)
    : (request.headers.get('host') ?? url.host);
  const forwardedProto = trusted
    ? firstForwarded(request.headers.get('x-forwarded-proto'))
    : env.API_PROXY_SECRET === undefined && env.TRUST_PROXY === 'true'
      ? firstForwarded(request.headers.get('x-forwarded-proto'))
      : null;
  const protocol =
    forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : url.protocol.slice(0, -1);
  return `${protocol}://${host}`;
}

/**
 * The legacy TRUST_PROXY mode is retained only when no API relay secret is configured. Production
 * configures API_PROXY_SECRET, so a forged Forwarded header can never become trusted there.
 */
export function clientAddress(request: Request, env: Env = process.env): string | null {
  const acceptsForwarded =
    isTrustedProxy(request, env) ||
    (env.API_PROXY_SECRET === undefined && env.TRUST_PROXY === 'true');
  if (!acceptsForwarded) return null;
  return firstForwarded(request.headers.get('x-forwarded-for'));
}

function bearerWithoutOrigin(request: Request): boolean {
  if (request.headers.get('origin') !== null) return false;
  return /^Bearer[ \t]+\S+$/i.test(request.headers.get('authorization') ?? '');
}

export function createRequestOriginGuard(env: Env = process.env): OriginGuard {
  const guard: ServicesOriginGuard = createOriginGuard({
    appUrl: env.NEXT_PUBLIC_APP_URL,
    allowedOrigins: env.ALLOWED_ORIGINS,
  });
  return {
    check(request) {
      if (bearerWithoutOrigin(request)) return;
      guard.check({
        method: request.method,
        pathname: new URL(request.url).pathname,
        origin: request.headers.get('origin'),
        secFetchSite: request.headers.get('sec-fetch-site'),
        requestOrigin: requestOrigin(request, env),
      });
    },
  };
}

/** Registers both protections; also exported so a test can restore them after replacing one. */
export function registerSecurity(env: Env = process.env): void {
  setRateLimiter(createRateLimiter(env));
  setOriginGuard(createRequestOriginGuard(env));
}

/** For the test that checks the active limiter is not the no-op (ET-6). */
export function bootstrapProbe(): { rateLimiterIsNoop: boolean } {
  return { rateLimiterIsNoop: getRateLimiter() === noopRateLimiter };
}
