// Insertion point of the rate limiter (SPEC-201 ET-3, SPEC-208): the handler asks this registry,
// `bootstrap-security.ts` registers the Postgres implementation, tests can replace it.
import type { RateLimitProfile } from '@learny/contracts';

export interface RateLimitRequest {
  profile: Exclude<RateLimitProfile, 'none'>;
  userId: string | null;
  ip: string | null;
  routeId: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Capacity of the bucket; 0 when nothing is limited (no `RateLimit-*` header then). */
  limit: number;
  remaining: number;
  /** Seconds to wait when refused. */
  retryAfterSec: number | null;
}

export interface RateLimiter {
  consume(request: RateLimitRequest): Promise<RateLimitDecision>;
}

export const noopRateLimiter: RateLimiter = {
  consume: () => Promise.resolve({ allowed: true, limit: 0, remaining: 0, retryAfterSec: null }),
};

let current: RateLimiter = noopRateLimiter;

export function getRateLimiter(): RateLimiter {
  return current;
}

export function setRateLimiter(limiter: RateLimiter): void {
  current = limiter;
}
