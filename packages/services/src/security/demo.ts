// Server-side simulations of the SPEC-208 demonstration page (EF-8): a burst on a profile, a
// mutation from the same or a foreign origin, a purge of synthetic expired rows. They use synthetic
// buckets (deleted afterwards) and never the caller's own ones.
import { randomBytes, randomUUID } from 'node:crypto';

import {
  RATE_PROFILES,
  type BurstOutput,
  type OriginOutput,
  type PurgeOutput,
  type RateProfileName,
} from '@learny/contracts';
import { AppError, type Clock } from '@learny/core';
import { serviceDb, sql } from '@learny/db';

import { createOriginGuard } from './origin-guard';
import { purgeSecurityRows } from './purge';
import { bucketKey, createServiceRateLimiter } from './rate-limit';

export async function runBurst(clock: Clock, profile: RateProfileName): Promise<BurstOutput> {
  const spec = RATE_PROFILES[profile];
  const secret = randomBytes(32).toString('hex');
  const limiter = createServiceRateLimiter(clock, secret);
  const octet = () => String(Math.floor(Math.random() * 256));
  const subject = { userId: randomUUID(), ip: `10.${octet()}.${octet()}.${octet()}` };
  const key = bucketKey(profile, subject, secret);
  try {
    let accepted = 0;
    let refused = 0;
    let remaining = spec.capacity;
    let retryAfterSeconds: number | null = null;
    for (let i = 0; i < spec.capacity + 1; i += 1) {
      const result = await limiter.consume({ profile, ...subject, routeId: 'dev.rateLimit.burst' });
      if (result.allowed) {
        accepted += 1;
        remaining = result.remaining;
      } else {
        refused += 1;
        remaining = 0;
        retryAfterSeconds = result.retryAfterSeconds;
      }
    }
    return { profile, limit: spec.capacity, accepted, refused, remaining, retryAfterSeconds };
  } finally {
    await serviceDb().execute(sql`delete from public.rate_limits where bucket = ${key}`);
  }
}

const DEMO_APP_ORIGIN = 'https://app.learny.example';

/** A mutation checked by the real guard: from the application's own origin, or from a foreign one. */
export function runOriginDemo(mode: 'same' | 'foreign'): OriginOutput {
  const guard = createOriginGuard({ appUrl: DEMO_APP_ORIGIN });
  try {
    guard.check({
      method: 'POST',
      pathname: '/api/v1/formations',
      origin: mode === 'same' ? DEMO_APP_ORIGIN : 'https://evil.example',
      secFetchSite: null,
      requestOrigin: DEMO_APP_ORIGIN,
    });
    return { status: 200, code: null, detail: null };
  } catch (error) {
    if (error instanceof AppError) {
      return { status: 403, code: error.code, detail: error.detail };
    }
    throw error;
  }
}

/** Inserts expired and recent synthetic rows, purges, and reports what the purge removed. */
export async function runPurgeDemo(clock: Clock): Promise<PurgeOutput> {
  const now = clock.now();
  const at = (ageSeconds: number) => new Date(now.getTime() - ageSeconds * 1000).toISOString();
  const day = 24 * 3600;
  const tag = randomUUID().slice(0, 8);
  return serviceDb().transaction(async (tx) => {
    const owner = await tx.execute<{ id: string }>(
      sql`select id::text as id from public.profiles limit 1`,
    );
    const userId = owner[0]?.id;
    if (userId !== undefined) {
      for (const [name, age] of [
        ['expired-1', day + 3600],
        ['expired-2', day + 1],
        ['recent-1', day - 60],
      ] as const) {
        await tx.execute(sql`
          insert into public.idempotency_keys
            (key, user_id, route, request_hash, status_code, created_at, completed_at)
          values (${`demo-${tag}-${name}`}, ${userId}::uuid, '/api/v1/dev/sdd/demo',
                  ${'a'.repeat(64)}, 201, ${at(age)}::timestamptz, ${at(age)}::timestamptz)`);
      }
    }
    for (const [name, age] of [
      ['expired-1', day + 7200],
      ['expired-2', day + 3600],
      ['expired-3', day + 1],
      ['recent-1', day - 60],
    ] as const) {
      await tx.execute(sql`
        insert into public.rate_limits (bucket, tokens, updated_at)
        values (${`user:demo-${tag}:${name}`}, 5, ${at(age)}::timestamptz)`);
    }
    const result = await purgeSecurityRows(tx, now);
    await tx.execute(sql`delete from public.rate_limits where bucket like ${`user:demo-${tag}:%`}`);
    await tx.execute(sql`delete from public.idempotency_keys where key like ${`demo-${tag}-%`}`);
    return result;
  });
}
