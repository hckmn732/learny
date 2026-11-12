// Registers the real protections of /api/v1 at server start (SPEC-208 ET-6): the Postgres token
// bucket and the origin guard. Imported by the route wrapper, so no route can run without them.
import { randomBytes } from 'node:crypto';

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

function hostOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const protocol =
    forwardedProto === 'https' || forwardedProto === 'http'
      ? forwardedProto
      : url.protocol.slice(0, -1);
  return `${protocol}://${host}`;
}

export function createRequestOriginGuard(env: Env = process.env): OriginGuard {
  const guard: ServicesOriginGuard = createOriginGuard({
    appUrl: env.NEXT_PUBLIC_APP_URL,
    allowedOrigins: env.ALLOWED_ORIGINS,
  });
  return {
    check(request) {
      guard.check({
        method: request.method,
        pathname: new URL(request.url).pathname,
        origin: request.headers.get('origin'),
        secFetchSite: request.headers.get('sec-fetch-site'),
        requestOrigin: hostOrigin(request),
      });
    },
  };
}

/** Registers both protections; also exported so a test can restore them after replacing one. */
export function registerSecurity(env: Env = process.env): void {
  setRateLimiter(createRateLimiter(env));
  setOriginGuard(createRequestOriginGuard(env));
}

registerSecurity();

/** For the test that checks the active limiter is not the no-op (ET-6). */
export function bootstrapProbe(): { rateLimiterIsNoop: boolean } {
  return { rateLimiterIsNoop: getRateLimiter() === noopRateLimiter };
}
