import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

import { afterAll, describe, expect, it } from 'vitest';

import { AppError, type Clock } from '@learny/core';
import { closeDb, serviceDb, sql, type Db } from '@learny/db';
import { createTestUser, withRollback } from '@learny/db/testing';

import {
  RATE_PROFILES,
  createPostgresRateLimiter,
  createServiceRateLimiter,
  hashIp,
  purgeSecurityRows,
} from '../../src/security/index';

const SECRET = 'learny-test-only-rate-limit-ip-secret-0000';
const START = new Date('2026-11-11T12:20:00Z');

function clockAt(initial: Date): Clock & { advance(seconds: number): void } {
  let current = initial.getTime();
  return {
    now: () => new Date(current),
    advance(seconds) {
      current += seconds * 1000;
    },
  };
}

const created: string[] = [];
function newUser(): string {
  const id = randomUUID();
  created.push(`user:${id}:`);
  return id;
}
function newIp(): string {
  const octet = () => String(Math.floor(Math.random() * 256));
  return `10.${octet()}.${octet()}.${octet()}`;
}

afterAll(async () => {
  for (const prefix of created) {
    await serviceDb().execute(
      sql`delete from public.rate_limits where bucket like ${`${prefix}%`}`,
    );
  }
  await serviceDb().execute(
    sql`delete from public.rate_limits where bucket like 'ip:%' and updated_at = ${START.toISOString()}::timestamptz`,
  );
  await closeDb();
});

describe('[SPEC-208] protections API — seau Postgres', () => {
  it('accepts exactly 120 requests then refuses the 121st with Retry-After 1 (CA-1, CL-1)', async () => {
    const limiter = createPostgresRateLimiter(serviceDb(), clockAt(START), SECRET);
    const userId = newUser();
    const input = { profile: 'default', userId, ip: null, routeId: 'test' } as const;
    let remaining = -1;
    for (let i = 0; i < 120; i += 1) {
      const result = await limiter.consume(input);
      expect(result.allowed, `requête ${String(i + 1)}`).toBe(true);
      expect(result.limit).toBe(120);
      remaining = result.remaining;
    }
    expect(remaining).toBe(0);
    const refused = await limiter.consume(input);
    expect(refused).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 1, limit: 120 });
  });

  it('counts down the remaining whole tokens on each request (EF-3)', async () => {
    const limiter = createPostgresRateLimiter(serviceDb(), clockAt(START), SECRET);
    const userId = newUser();
    const results = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(await limiter.consume({ profile: 'default', userId, ip: null, routeId: 't' }));
    }
    expect(results.map((r) => r.remaining)).toEqual([119, 118, 117]);
  });

  it('refills 60 tokens in 30 s, never above the capacity (CA-1, CL-2)', async () => {
    const clock = clockAt(START);
    const limiter = createPostgresRateLimiter(serviceDb(), clock, SECRET);
    const userId = newUser();
    const input = { profile: 'default', userId, ip: null, routeId: 'test' } as const;
    for (let i = 0; i < 120; i += 1) await limiter.consume(input);
    expect((await limiter.consume(input)).allowed).toBe(false);

    clock.advance(30);
    let accepted = 0;
    for (let i = 0; i < 70; i += 1) {
      if ((await limiter.consume(input)).allowed) accepted += 1;
    }
    expect(accepted).toBe(60);

    clock.advance(3600);
    accepted = 0;
    for (let i = 0; i < 130; i += 1) {
      if ((await limiter.consume(input)).allowed) accepted += 1;
    }
    expect(accepted).toBe(120);
  });

  it('applies the AI refill of one token every 3 seconds and the auth one every 6 (CA-1)', async () => {
    const clock = clockAt(START);
    const limiter = createPostgresRateLimiter(serviceDb(), clock, SECRET);
    const userId = newUser();
    const ai = { profile: 'ai', userId, ip: null, routeId: 'tutor' } as const;
    for (let i = 0; i < 20; i += 1) await limiter.consume(ai);
    const refusedAi = await limiter.consume(ai);
    expect([refusedAi.allowed, refusedAi.retryAfterSeconds, refusedAi.limit]).toEqual([
      false,
      3,
      20,
    ]);
    clock.advance(3);
    expect((await limiter.consume(ai)).allowed).toBe(true);
    expect((await limiter.consume(ai)).allowed).toBe(false);

    const ip = newIp();
    const auth = { profile: 'auth', userId: null, ip, routeId: 'sign-in' } as const;
    for (let i = 0; i < 10; i += 1) expect((await limiter.consume(auth)).allowed).toBe(true);
    const refusedAuth = await limiter.consume(auth);
    expect([refusedAuth.allowed, refusedAuth.retryAfterSeconds, refusedAuth.limit]).toEqual([
      false,
      6,
      10,
    ]);
    clock.advance(6);
    expect((await limiter.consume(auth)).allowed).toBe(true);
    created.push(`ip:${hashIp(SECRET, ip)}`);
  });

  it('accepts exactly the capacity under 50 concurrent requests, no negative token (CA-2, CL-3)', async () => {
    const limiter = createPostgresRateLimiter(serviceDb(), clockAt(START), SECRET);
    const userId = newUser();
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        limiter.consume({ profile: 'ai', userId, ip: null, routeId: 'tutor' }),
      ),
    );
    const accepted = results.filter((result) => result.allowed).length;
    expect({ accepted, refused: 50 - accepted }).toEqual({ accepted: 20, refused: 30 });
    const rows = await serviceDb().execute<{ tokens: string }>(
      sql`select tokens::text as tokens from public.rate_limits where bucket = ${`user:${userId}:ai`}`,
    );
    expect(Number(rows[0]?.tokens)).toBeGreaterThanOrEqual(0);
    expect(Number(rows[0]?.tokens)).toBeLessThan(1);
    mkdirSync('test-results', { recursive: true });
    writeFileSync(
      'test-results/spec-208-concurrency.json',
      JSON.stringify({ requests: 50, capacity: 20, accepted, refused: 50 - accepted }, null, 2),
    );
  });

  it('keeps learners behind one address apart, but shares the authentication bucket (CL-4)', async () => {
    const limiter = createPostgresRateLimiter(serviceDb(), clockAt(START), SECRET);
    const [alex, camille] = [newUser(), newUser()];
    const ip = newIp();
    for (let i = 0; i < 120; i += 1) {
      await limiter.consume({ profile: 'default', userId: alex, ip, routeId: 'x' });
    }
    expect(
      (await limiter.consume({ profile: 'default', userId: alex, ip, routeId: 'x' })).allowed,
    ).toBe(false);
    expect(
      (await limiter.consume({ profile: 'default', userId: camille, ip, routeId: 'x' })).allowed,
    ).toBe(true);

    const shared = newIp();
    for (let i = 0; i < 10; i += 1) {
      await limiter.consume({
        profile: 'auth',
        userId: i % 2 === 0 ? alex : camille,
        ip: shared,
        routeId: 's',
      });
    }
    expect(
      (await limiter.consume({ profile: 'auth', userId: camille, ip: shared, routeId: 's' }))
        .allowed,
    ).toBe(false);
    created.push(`ip:${hashIp(SECRET, ip)}`, `ip:${hashIp(SECRET, shared)}`);
  });

  it('keeps the profiles apart: exhausting `ai` leaves `default` untouched (EF-4)', async () => {
    const limiter = createPostgresRateLimiter(serviceDb(), clockAt(START), SECRET);
    const userId = newUser();
    for (let i = 0; i < 21; i += 1) {
      await limiter.consume({ profile: 'ai', userId, ip: null, routeId: 'tutor' });
    }
    const other = await limiter.consume({ profile: 'default', userId, ip: null, routeId: 'home' });
    expect(other).toMatchObject({ allowed: true, remaining: 119 });
  });

  it('stores no address in clear, only the keyed hash (CA-5)', async () => {
    const limiter = createPostgresRateLimiter(serviceDb(), clockAt(START), SECRET);
    const ip = '203.0.113.77';
    await limiter.consume({ profile: 'auth', userId: null, ip, routeId: 's' });
    const rows = await serviceDb().execute<{ bucket: string }>(
      sql`select bucket from public.rate_limits where bucket like 'ip:%' and bucket like ${`%${hashIp(SECRET, ip).slice(0, 8)}%`}`,
    );
    expect(rows.map((row) => row.bucket)).toEqual([`ip:${hashIp(SECRET, ip)}:auth`]);
    const clear = await serviceDb().execute<{ count: number }>(
      sql`select count(*)::int as count from public.rate_limits where bucket like '%203.0.113.77%'`,
    );
    expect(clear[0]?.count).toBe(0);
    created.push(`ip:${hashIp(SECRET, ip)}`);
  });

  it('uses one shared bucket when the address is unknown (ET-3)', async () => {
    const limiter = createPostgresRateLimiter(serviceDb(), clockAt(START), SECRET);
    await limiter.consume({ profile: 'auth', userId: null, ip: null, routeId: 's' });
    const rows = await serviceDb().execute<{ bucket: string }>(
      sql`select bucket from public.rate_limits where bucket = 'ip:unknown:auth'`,
    );
    expect(rows).toHaveLength(1);
    await serviceDb().execute(sql`delete from public.rate_limits where bucket = 'ip:unknown:auth'`);
  });

  it('refuses with SERVICE_UNAVAILABLE, never accepts, when the database fails (CA-5, CL-10)', async () => {
    const broken = {
      execute: () => Promise.reject(new Error('connection refused')),
    } as unknown as Db;
    const limiter = createPostgresRateLimiter(broken, clockAt(START), SECRET);
    await expect(
      limiter.consume({ profile: 'default', userId: randomUUID(), ip: null, routeId: 'x' }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof AppError && error.code === 'SERVICE_UNAVAILABLE',
    );
  });

  it('measures the cost of one consumption (ET-8)', async () => {
    const limiter = createServiceRateLimiter(clockAt(START), SECRET);
    const userId = newUser();
    const durations: number[] = [];
    for (let i = 0; i < 520; i += 1) {
      const started = performance.now();
      await limiter.consume({ profile: 'default', userId, ip: null, routeId: 'perf' });
      durations.push(performance.now() - started);
    }
    const sorted = durations.slice(20).sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95) - 1] ?? 0;
    mkdirSync('test-results', { recursive: true });
    writeFileSync(
      'test-results/spec-208-limiter-overhead.json',
      JSON.stringify({ samples: sorted.length, p95Ms: Number(p95.toFixed(3)) }, null, 2),
    );
    expect(p95).toBeLessThan(20);
    expect(RATE_PROFILES.default.capacity).toBe(120);
  });
});

describe('[SPEC-208] protections API — purge', () => {
  it('removes keys and buckets older than 24 h and keeps those of 23 h 59 (CA-4, CL-9)', async () => {
    const counts = await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const now = START.getTime();
      const at = (ageSeconds: number) => new Date(now - ageSeconds * 1000).toISOString();
      const keys: [string, number][] = [
        ['key-old-0001', 24 * 3600 + 1],
        ['key-edge-001', 24 * 3600],
        ['key-recent-1', 24 * 3600 - 60],
        ['key-new-0001', 10],
      ];
      for (const [key, age] of keys) {
        await tx.execute(sql`
          insert into public.idempotency_keys (key, user_id, route, request_hash, status_code, created_at, completed_at)
          values (${key}, ${user.id}::uuid, '/api/v1/x', ${'a'.repeat(64)}, 201, ${at(age)}::timestamptz, ${at(age)}::timestamptz)`);
      }
      const buckets: [string, number][] = [
        ['user:purge-test:old', 24 * 3600 + 1],
        ['user:purge-test:edge', 24 * 3600],
        ['user:purge-test:recent', 24 * 3600 - 60],
      ];
      for (const [bucket, age] of buckets) {
        await tx.execute(sql`
          insert into public.rate_limits (bucket, tokens, updated_at)
          values (${bucket}, 5, ${at(age)}::timestamptz)`);
      }
      const result = await purgeSecurityRows(tx, START);
      const keysLeft = await tx.execute<{ key: string }>(
        sql`select key from public.idempotency_keys where user_id = ${user.id}::uuid order by key`,
      );
      const bucketsLeft = await tx.execute<{ bucket: string }>(
        sql`select bucket from public.rate_limits where bucket like 'user:purge-test:%' order by bucket`,
      );
      return {
        result,
        keysLeft: keysLeft.map((row) => row.key),
        bucketsLeft: bucketsLeft.map((row) => row.bucket),
      };
    });
    expect(counts.keysLeft).toEqual(['key-edge-001', 'key-new-0001', 'key-recent-1']);
    expect(counts.bucketsLeft).toEqual(['user:purge-test:edge', 'user:purge-test:recent']);
    expect(counts.result.idempotencyKeys).toBeGreaterThanOrEqual(1);
    expect(counts.result.rateLimitBuckets).toBeGreaterThanOrEqual(1);
  });
});
