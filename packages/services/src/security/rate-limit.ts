// Token-bucket rate limiter on Postgres (SPEC-208 EF-1 to EF-4, ET-1 to ET-4; ADR-0213, ADR-0042).
// One atomic statement refills the bucket linearly (capped at its capacity) and takes a token; the
// clock is injected, so tests are deterministic. A database failure refuses the request (503):
// a request is never accepted without control.
import { createHmac } from 'node:crypto';

import {
  RATE_PROFILES,
  type RateProfileName as RateProfile,
  type RateProfileSpec,
} from '@learny/contracts';
import { AppError, type Clock } from '@learny/core';
import { serviceDb, sql, type Db } from '@learny/db';

export { RATE_PROFILES } from '@learny/contracts';
export type { RateProfileName as RateProfile, RateProfileSpec } from '@learny/contracts';

export const UNKNOWN_IP = 'unknown';

/** First 32 hexadecimal characters of HMAC-SHA256(secret, ip): no address is stored in clear. */
export function hashIp(secret: string, ip: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex').slice(0, 32);
}

export interface BucketSubject {
  userId: string | null;
  ip: string | null;
}

/**
 * `user:<uuid>:<profile>` or `ip:<hash>:<profile>`; a user-keyed profile falls back to the address
 * when no learner is known (a public route), and an unknown address shares one bucket (ET-3).
 */
export function bucketKey(profile: RateProfile, subject: BucketSubject, ipSecret: string): string {
  if (RATE_PROFILES[profile].key === 'user' && subject.userId !== null) {
    return `user:${subject.userId}:${profile}`;
  }
  const hash = subject.ip === null || subject.ip === '' ? UNKNOWN_IP : hashIp(ipSecret, subject.ip);
  return `ip:${hash}:${profile}`;
}

/** Tokens a bucket holds after `elapsedSeconds` without consumption (linear, never above the cap). */
export function refilledTokens(
  spec: RateProfileSpec,
  tokens: number,
  elapsedSeconds: number,
): number {
  return Math.min(spec.capacity, tokens + Math.max(0, elapsedSeconds) * spec.refillPerSecond);
}

/** Seconds until one whole token is available (≥ 1). */
export function retryAfterSeconds(spec: RateProfileSpec, tokens: number): number {
  return Math.max(1, Math.ceil((1 - tokens) * spec.secondsPerToken));
}

export interface ConsumeInput {
  profile: RateProfile;
  userId: string | null;
  ip: string | null;
  routeId: string;
}

export interface ConsumeResult {
  allowed: boolean;
  /** Whole tokens left after this request (0 when refused). */
  remaining: number;
  retryAfterSeconds: number | null;
  limit: number;
}

export interface PostgresRateLimiter {
  consume(input: ConsumeInput): Promise<ConsumeResult>;
}

interface TokensRow {
  tokens: string;
  [key: string]: unknown;
}

interface StateRow {
  tokens: string;
  elapsed: string;
  [key: string]: unknown;
}

export function createPostgresRateLimiter(
  db: Db,
  clock: Clock,
  ipSecret: string,
): PostgresRateLimiter {
  return {
    async consume(input) {
      const spec = RATE_PROFILES[input.profile];
      const bucket = bucketKey(input.profile, input, ipSecret);
      const now = clock.now().toISOString();
      const capacity = spec.capacity.toFixed(4);
      const seconds = spec.secondsPerToken.toFixed(4);
      // Column precision is 4 decimals: a token counts as due within 0.0001 of a whole one.
      const epsilon = '0.0001';
      try {
        const refilled = sql`least(${capacity}::numeric, rate_limits.tokens
          + greatest(0, extract(epoch from (${now}::timestamptz - rate_limits.updated_at)))
            / ${seconds}::numeric)`;
        const taken = await db.execute<TokensRow>(sql`
          insert into public.rate_limits (bucket, tokens, updated_at)
          values (${bucket}, ${capacity}::numeric - 1, ${now}::timestamptz)
          on conflict (bucket) do update
            set tokens = greatest(0, ${refilled} - 1), updated_at = ${now}::timestamptz
            where ${refilled} >= 1 - ${epsilon}::numeric
          returning tokens::text as tokens`);
        const row = taken[0];
        if (row !== undefined) {
          return {
            allowed: true,
            remaining: Math.floor(Number(row.tokens)),
            retryAfterSeconds: null,
            limit: spec.capacity,
          };
        }
        const state = await db.execute<StateRow>(sql`
          select tokens::text as tokens,
                 extract(epoch from (${now}::timestamptz - updated_at))::text as elapsed
          from public.rate_limits where bucket = ${bucket}`);
        const current = state[0];
        const tokens = refilledTokens(
          spec,
          Number(current?.tokens ?? '0'),
          Number(current?.elapsed ?? '0'),
        );
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: retryAfterSeconds(spec, tokens),
          limit: spec.capacity,
        };
      } catch (error) {
        throw new AppError('SERVICE_UNAVAILABLE', 'Service momentanément indisponible.', {
          cause: error,
        });
      }
    },
  };
}

/** Limiter on the owner-role client (`rate_limits` has no policy for learners, ET-4). */
export function createServiceRateLimiter(clock: Clock, ipSecret: string): PostgresRateLimiter {
  return {
    consume: (input) => createPostgresRateLimiter(serviceDb(), clock, ipSecret).consume(input),
  };
}
