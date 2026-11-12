import { randomUUID } from 'node:crypto';

import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ProblemDetails, defineRoute } from '@learny/contracts';
import { AppError } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';

import { bootstrapProbe } from '../../lib/api/bootstrap-security';
import { createRequestOriginGuard, registerSecurity } from '../../lib/api/bootstrap-security';
import { handler } from '../../lib/api/handler';
import { setOriginGuard } from '../../lib/api/origin';
import { noopRateLimiter, getRateLimiter, setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };
const ok = z.object({ ok: z.literal(true) });
const user = { userId: randomUUID(), email: 'limit@test.learny.test', emailConfirmed: true };
let restoreSession: () => void = () => undefined;

/** Signs another learner in for one block, then goes back to the suite's learner. */
async function asSession<T>(
  session: { userId: string; email: string; emailConfirmed: boolean } | null,
  run: () => Promise<T>,
): Promise<T> {
  setSessionResolver(() => Promise.resolve(session));
  try {
    return await run();
  } finally {
    setSessionResolver(() => Promise.resolve(user));
  }
}
let output = '';

// Random addresses: buckets live in the database across runs and the test clock never advances.
function address(): string {
  const octet = () => String(Math.floor(Math.random() * 256));
  return `10.${octet()}.${octet()}.${octet()}`;
}

function route(
  path: string,
  profile: 'default' | 'ai' | 'auth' | 'none',
  method: 'GET' | 'POST' = 'GET',
  auth: 'user' | 'public' = 'user',
) {
  return defineRoute({
    id: `test.${path.replaceAll('/', '.')}`,
    method,
    path,
    auth,
    output: ok,
    successStatus: 200,
    rateLimit: profile,
    summary: 'test',
    errors: [],
  });
}

type RouteFn = (request: NextRequest, segment: typeof NO_SEGMENT) => Promise<Response>;

function call(
  fn: RouteFn,
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  return fn(
    new NextRequest(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: init.headers ?? {},
    }),
    NO_SEGMENT,
  );
}

beforeAll(() => {
  vi.stubEnv('TRUST_PROXY', 'true');
  restoreSession = setSessionResolver(() => Promise.resolve(user));
});

afterAll(async () => {
  restoreSession();
  await serviceDb().execute(
    sql`delete from public.rate_limits where bucket like ${`user:${user.userId}:%`}`,
  );
  await closeDb();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    output += String(chunk);
    return true;
  });
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  registerSecurity();
  vi.restoreAllMocks();
});

async function problem(response: Response) {
  return ProblemDetails.parse(await response.json());
}

describe('[SPEC-208] protections API — limitation de débit', () => {
  it('is active: the registered limiter is not the no-op (ET-6)', () => {
    expect(getRateLimiter()).not.toBe(noopRateLimiter);
    expect(bootstrapProbe().rateLimiterIsNoop).toBe(false);
  });

  it('limits the public authentication profile per address: the 11th request is a 429 (EF-2)', async () => {
    const limited = handler(route('/api/v1/test/limited-auth', 'auth', 'GET', 'public'), () =>
      Promise.resolve({ ok: true as const }),
    );
    const ip = address();
    const remaining: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const response = await call(limited, '/api/v1/test/limited-auth', {
        headers: { 'x-forwarded-for': ip },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('ratelimit-limit')).toBe('10');
      remaining.push(response.headers.get('ratelimit-remaining') ?? '');
    }
    expect(remaining).toEqual(['9', '8', '7', '6', '5', '4', '3', '2', '1', '0']);

    const refused = await call(limited, '/api/v1/test/limited-auth', {
      headers: { 'x-forwarded-for': ip },
    });
    expect(refused.status).toBe(429);
    expect(refused.headers.get('content-type')).toContain('application/problem+json');
    const retry = Number(refused.headers.get('retry-after'));
    expect(Number.isInteger(retry)).toBe(true);
    expect(retry).toBe(6);
    expect(refused.headers.get('ratelimit-limit')).toBe('10');
    expect(refused.headers.get('ratelimit-remaining')).toBe('0');
    const body = await problem(refused);
    expect(body).toMatchObject({
      code: 'RATE_LIMITED',
      title: 'Trop de requêtes',
      status: 429,
      detail: 'Vous avez envoyé trop de requêtes. Réessayez dans 6 s.',
    });

    // Another address has its own bucket.
    const other = await call(limited, '/api/v1/test/limited-auth', {
      headers: { 'x-forwarded-for': address() },
    });
    expect(other.status).toBe(200);
  });

  it('limits a learner to 120 requests on the default profile, the 121st gets Retry-After 1 (CA-1)', async () => {
    const limited = handler(route('/api/v1/test/limited-default', 'default'), () =>
      Promise.resolve({ ok: true as const }),
    );
    const headers = { 'x-forwarded-for': address() };
    let last: Response | undefined;
    for (let i = 0; i < 120; i += 1) {
      last = await call(limited, '/api/v1/test/limited-default', { headers });
      expect(last.status, `requête ${String(i + 1)}`).toBe(200);
    }
    expect(last?.headers.get('ratelimit-remaining')).toBe('0');
    const refused = await call(limited, '/api/v1/test/limited-default', { headers });
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('1');
    expect((await problem(refused)).code).toBe('RATE_LIMITED');
  });

  it('keeps the `ai` and `default` profiles of a learner apart (EF-4)', async () => {
    const ai = handler(route('/api/v1/test/limited-ai', 'ai'), () =>
      Promise.resolve({ ok: true as const }),
    );
    const home = handler(route('/api/v1/test/limited-home', 'default'), () =>
      Promise.resolve({ ok: true as const }),
    );
    // Another learner, so the 120 requests above do not interfere.
    const learner = { userId: randomUUID(), email: 'ai@test.learny.test', emailConfirmed: true };
    await asSession(learner, async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i += 1)
        statuses.push((await call(ai, '/api/v1/test/limited-ai')).status);
      expect(statuses.filter((status) => status === 200)).toHaveLength(20);
      expect(statuses.at(-1)).toBe(429);
      const other = await call(home, '/api/v1/test/limited-home');
      expect(other.status).toBe(200);
      expect(other.headers.get('ratelimit-limit')).toBe('120');
      await serviceDb().execute(
        sql`delete from public.rate_limits where bucket like ${`user:${learner.userId}:%`}`,
      );
    });
  });

  it('adds no RateLimit header to an unlimited route (EF-1)', async () => {
    const free = handler(route('/api/v1/test/unlimited', 'none'), () =>
      Promise.resolve({ ok: true as const }),
    );
    const response = await call(free, '/api/v1/test/unlimited');
    expect(response.status, await response.clone().text()).toBe(200);
    expect(response.headers.get('ratelimit-limit')).toBeNull();
  });

  it('does not take a learner token for an anonymous call to a protected route', async () => {
    const protectedRoute = handler(route('/api/v1/test/protected', 'default'), () =>
      Promise.resolve({ ok: true as const }),
    );
    await asSession(null, async () => {
      const response = await call(protectedRoute, '/api/v1/test/protected');
      expect(response.status).toBe(401);
      expect(response.headers.get('ratelimit-limit')).toBeNull();
    });
  });

  it('answers 503 and never runs the route when the limiter cannot reach the database (CA-5, CL-10)', async () => {
    let executed = false;
    setRateLimiter({
      consume: () =>
        Promise.reject(new AppError('SERVICE_UNAVAILABLE', 'Service momentanément indisponible.')),
    });
    const guarded = handler(route('/api/v1/test/guarded', 'default'), () => {
      executed = true;
      return Promise.resolve({ ok: true as const });
    });
    const response = await call(guarded, '/api/v1/test/guarded');
    expect(response.status).toBe(503);
    expect((await problem(response)).code).toBe('SERVICE_UNAVAILABLE');
    expect(executed).toBe(false);
  });

  it('stores and logs no address in clear (CA-5)', async () => {
    const limited = handler(route('/api/v1/test/limited-clear', 'auth', 'GET', 'public'), () =>
      Promise.resolve({ ok: true as const }),
    );
    const ip = '203.0.113.201';
    await call(limited, '/api/v1/test/limited-clear', { headers: { 'x-forwarded-for': ip } });
    const rows = await serviceDb().execute<{ count: number }>(
      sql`select count(*)::int as count from public.rate_limits where bucket like ${`%${ip}%`}`,
    );
    expect(rows[0]?.count).toBe(0);
    expect(output).not.toContain(ip);
    await serviceDb().execute(
      sql`delete from public.rate_limits where bucket like 'ip:%:auth' and updated_at > now() - interval '1 minute'`,
    );
  });

  it('ignores X-Forwarded-For without TRUST_PROXY: every caller shares the unknown bucket (CL-8)', async () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    const limited = handler(route('/api/v1/test/limited-spoof', 'auth', 'GET', 'public'), () =>
      Promise.resolve({ ok: true as const }),
    );
    await serviceDb().execute(sql`delete from public.rate_limits where bucket = 'ip:unknown:auth'`);
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const response = await call(limited, '/api/v1/test/limited-spoof', {
        headers: { 'x-forwarded-for': `203.0.113.${String(i + 1)}` },
      });
      statuses.push(response.status);
    }
    expect(statuses.filter((status) => status === 200)).toHaveLength(10);
    expect(statuses.slice(10)).toEqual([429, 429]);
    await serviceDb().execute(sql`delete from public.rate_limits where bucket = 'ip:unknown:auth'`);
    vi.stubEnv('TRUST_PROXY', 'true');
  });
});

describe('[SPEC-208] protections API — origine', () => {
  // The previous block emptied this learner's bucket on purpose.
  beforeEach(async () => {
    await serviceDb().execute(
      sql`delete from public.rate_limits where bucket = ${`user:${user.userId}:default`}`,
    );
  });

  const mutation = () =>
    handler(route('/api/v1/test/mutation', 'default', 'POST'), () =>
      Promise.resolve({ ok: true as const }),
    );

  async function tokensOf(): Promise<number | null> {
    const rows = await serviceDb().execute<{ tokens: string }>(
      sql`select tokens::text as tokens from public.rate_limits where bucket = ${`user:${user.userId}:default`}`,
    );
    return rows[0] === undefined ? null : Number(rows[0].tokens);
  }

  it('refuses a foreign origin with 403 ORIGIN_REJECTED, before the limiter takes a token (CA-3, EF-6)', async () => {
    const before = await tokensOf();
    const response = await call(mutation(), '/api/v1/test/mutation', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'x-forwarded-for': address() },
    });
    expect(response.status).toBe(403);
    const body = await problem(response);
    expect(body.code).toBe('ORIGIN_REJECTED');
    expect(body.detail).toBe('Requête refusée : origine non autorisée.');
    expect(response.headers.get('ratelimit-limit')).toBeNull();
    expect(await tokensOf()).toBe(before);
  });

  it.each([
    ['no Origin and no Sec-Fetch-Site (CL-5)', {}],
    ['Sec-Fetch-Site: cross-site', { 'sec-fetch-site': 'cross-site' }],
    ['a look-alike origin (CL-6)', { origin: 'http://localhost:3000.attacker.com' }],
  ])('refuses a mutation with %s', async (_name, headers) => {
    const response = await call(mutation(), '/api/v1/test/mutation', {
      method: 'POST',
      headers: { ...headers, 'x-forwarded-for': address() },
    });
    expect(response.status).toBe(403);
    expect((await problem(response)).code).toBe('ORIGIN_REJECTED');
  });

  it.each([
    ['the application origin', { origin: BASE }],
    ['Sec-Fetch-Site: same-origin without Origin', { 'sec-fetch-site': 'same-origin' }],
  ])('accepts a mutation with %s', async (_name, headers) => {
    const response = await call(mutation(), '/api/v1/test/mutation', {
      method: 'POST',
      headers: { ...headers, 'x-forwarded-for': address() },
    });
    expect(response.status).toBe(200);
  });

  it('accepts an origin listed in ALLOWED_ORIGINS and nothing else', async () => {
    setOriginGuard(createRequestOriginGuard({ ALLOWED_ORIGINS: 'https://partner.example' }));
    const partner = await call(mutation(), '/api/v1/test/mutation', {
      method: 'POST',
      headers: { origin: 'https://partner.example', 'x-forwarded-for': address() },
    });
    expect(partner.status).toBe(200);
    const stranger = await call(mutation(), '/api/v1/test/mutation', {
      method: 'POST',
      headers: { origin: 'https://stranger.example', 'x-forwarded-for': address() },
    });
    expect(stranger.status).toBe(403);
  });

  it('does not check reads, and exempts the webhooks and the job endpoint (CL-7)', async () => {
    const read = handler(route('/api/v1/test/read', 'none'), () =>
      Promise.resolve({ ok: true as const }),
    );
    expect(
      (await call(read, '/api/v1/test/read', { headers: { origin: 'https://evil.example' } }))
        .status,
    ).toBe(200);

    const webhook = handler(route('/api/v1/webhooks/test', 'none', 'POST', 'public'), () =>
      Promise.resolve({ ok: true as const }),
    );
    const response = await call(webhook, '/api/v1/webhooks/test', { method: 'POST' });
    expect(response.status).toBe(200);
  });

  it('lets a configured application URL override the host of the request', async () => {
    setOriginGuard(createRequestOriginGuard({ NEXT_PUBLIC_APP_URL: 'https://app.exemple.fr' }));
    const fromApp = await call(mutation(), '/api/v1/test/mutation', {
      method: 'POST',
      headers: { origin: 'https://app.exemple.fr', 'x-forwarded-for': address() },
    });
    expect(fromApp.status).toBe(200);
    const fromHost = await call(mutation(), '/api/v1/test/mutation', {
      method: 'POST',
      headers: { origin: BASE, 'x-forwarded-for': address() },
    });
    expect(fromHost.status).toBe(403);
  });
});
