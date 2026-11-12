// Insertion point of the rate limiter (SPEC-201 ET-3 step 2). SPEC-208 registers the real
// implementation with `setRateLimiter`; by default nothing is limited.
import type { RateLimitProfile } from '@learny/contracts';

export interface RateLimitRequest {
  profile: Exclude<RateLimitProfile, 'none'>;
  userId: string | null;
  ip: string;
  routeId: string;
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSec: number };

export interface RateLimiter {
  consume(request: RateLimitRequest): Promise<RateLimitDecision>;
}

export const noopRateLimiter: RateLimiter = {
  consume: () => Promise.resolve({ allowed: true }),
};

let current: RateLimiter = noopRateLimiter;

export function getRateLimiter(): RateLimiter {
  return current;
}

export function setRateLimiter(limiter: RateLimiter): void {
  current = limiter;
}
