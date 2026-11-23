import { z } from 'zod';


// Rate-limit profiles (ADR-0213) and the demonstration routes of SPEC-208. The profile table lives
// here so the browser demo and the server limiter read the same numbers.
export type RateProfileName = 'default' | 'ai' | 'auth';

export interface RateProfileSpec {
  capacity: number;
  /** Seconds to earn one token (exact in SQL, unlike a fractional rate such as 1/3 per second). */
  secondsPerToken: number;
  refillPerSecond: number;
  /** Who a bucket belongs to: the signed-in learner or the network address. */
  key: 'user' | 'ip';
}

/** 120/min per learner, 20/min for the AI routes, 10 per address for authentication. */
export const RATE_PROFILES: Record<RateProfileName, RateProfileSpec> = {
  default: { capacity: 120, secondsPerToken: 0.5, refillPerSecond: 2, key: 'user' },
  ai: { capacity: 20, secondsPerToken: 3, refillPerSecond: 1 / 3, key: 'user' },
  auth: { capacity: 10, secondsPerToken: 6, refillPerSecond: 1 / 6, key: 'ip' },
};

export const RATE_PROFILE_NAMES = ['default', 'ai', 'auth'] as const;

export const BurstInput = z.object({ profile: z.enum(RATE_PROFILE_NAMES) });
export type BurstInput = z.infer<typeof BurstInput>;

export const BurstOutput = z.object({
  profile: z.enum(RATE_PROFILE_NAMES),
  limit: z.number().int(),
  accepted: z.number().int(),
  refused: z.number().int(),
  remaining: z.number().int(),
  retryAfterSeconds: z.number().int().nullable(),
});
export type BurstOutput = z.infer<typeof BurstOutput>;

export const OriginInput = z.object({ mode: z.enum(['same', 'foreign']) });
export type OriginInput = z.infer<typeof OriginInput>;

export const OriginOutput = z.object({
  status: z.number().int(),
  code: z.string().nullable(),
  detail: z.string().nullable(),
});
export type OriginOutput = z.infer<typeof OriginOutput>;

export const PurgeOutput = z.object({
  idempotencyKeys: z.number().int(),
  rateLimitBuckets: z.number().int(),
});
export type PurgeOutput = z.infer<typeof PurgeOutput>;

