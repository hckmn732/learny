import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { setClock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createFixedClock } from '@learny/testing';

import { executeFunctionInline, securityPurge, type InlineEvent } from '../../src';

const NOW = '2026-11-11T12:20:00Z';
const tag = randomUUID().slice(0, 8);
let userId = '';

const tick = (tickAt: string): InlineEvent => ({
  id: `hourly-tick:${tickAt}`,
  name: 'cron/hourly-tick',
  data: { tickAt },
  ts: Date.parse(tickAt),
});

beforeAll(async () => {
  setClock(createFixedClock(NOW));
  const user = await serviceDb().transaction((tx) => createTestUser(tx));
  userId = user.id;
});

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from public.rate_limits where bucket like ${`user:purge-${tag}:%`}`,
  );
  await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
  await closeDb();
});

const at = (ageSeconds: number) => new Date(Date.parse(NOW) - ageSeconds * 1000).toISOString();

describe('[SPEC-208] purge horaire', () => {
  it('removes keys and buckets older than 24 h after the hourly tick, keeps the rest (CA-4, EF-7)', async () => {
    const day = 24 * 3600;
    for (const [name, age] of [
      ['old', day + 1],
      ['edge', day],
      ['recent', day - 60],
    ] as const) {
      await serviceDb().execute(sql`
        insert into public.idempotency_keys
          (key, user_id, route, request_hash, status_code, created_at, completed_at)
        values (${`purge-${tag}-${name}`}, ${userId}::uuid, '/api/v1/x', ${'b'.repeat(64)}, 201,
                ${at(age)}::timestamptz, ${at(age)}::timestamptz)`);
      await serviceDb().execute(sql`
        insert into public.rate_limits (bucket, tokens, updated_at)
        values (${`user:purge-${tag}:${name}`}, 3, ${at(age)}::timestamptz)`);
    }

    const result = await executeFunctionInline(securityPurge, tick('2026-11-11T12:00:00Z'));
    expect(result.status).toBe('completed');
    const removed = result.output as { idempotencyKeys: number; rateLimitBuckets: number };
    expect(removed.idempotencyKeys).toBeGreaterThanOrEqual(1);
    expect(removed.rateLimitBuckets).toBeGreaterThanOrEqual(1);

    const keys = await serviceDb().execute<{ key: string }>(
      sql`select key from public.idempotency_keys where key like ${`purge-${tag}-%`} order by key`,
    );
    expect(keys.map((row) => row.key)).toEqual([`purge-${tag}-edge`, `purge-${tag}-recent`]);
    const buckets = await serviceDb().execute<{ bucket: string }>(
      sql`select bucket from public.rate_limits where bucket like ${`user:purge-${tag}:%`} order by bucket`,
    );
    expect(buckets.map((row) => row.bucket)).toEqual([
      `user:purge-${tag}:edge`,
      `user:purge-${tag}:recent`,
    ]);
  });
});
