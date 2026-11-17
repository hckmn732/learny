// SPEC-805 CA-1/CA-2 — CSP nonce, static headers, origin guard and rate limit composition.
//
// The middleware is called directly with real NextRequest objects; the API tests go through the
// production route wrapper, the real origin guard and the Postgres token bucket. A refused request
// must never reach the service (no write, no job, no AI call).
import { randomUUID } from 'node:crypto';

import { NextRequest, type NextResponse } from 'next/server';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ProblemDetails, defineRoute } from '@learny/contracts';
import { closeDb, serviceDb, sql } from '@learny/db';

import {
  createRateLimiter,
  createRequestOriginGuard,
  registerSecurity,
} from '../../lib/api/bootstrap-security';
import { handler } from '../../lib/api/handler';
import { setOriginGuard } from '../../lib/api/origin';
import { setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';
import { proxy } from '../../proxy';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };
const ok = z.object({ ok: z.literal(true) });

type RouteFn = (request: NextRequest, segment: typeof NO_SEGMENT) => Promise<Response>;

function route(method: 'GET' | 'POST', profile: 'default' | 'auth' | 'none', id: string) {
  return defineRoute({
    id,
    method,
    path: `/api/v1/test/${id}`,
    auth: 'public',
    output: ok,
    successStatus: 200,
    rateLimit: profile,
    summary: 'test sécurité',
    errors: [],
  });
}

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

function cspDirective(policy: string, name: string): string {
  return (
    policy
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? ''
  );
}

let output = '';

beforeEach(() => {
  output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    output += String(chunk);
    return true;
  });
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
  setSessionResolver(() =>
    Promise.resolve({
      userId: randomUUID(),
      email: 'security@test.learny.test',
      emailConfirmed: true,
    }),
  );
});

afterEach(() => {
  registerSecurity();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from public.rate_limits where bucket like 'ip:%:auth' and updated_at > now() - interval '1 minute'`,
  );
  await closeDb();
});

describe('[SPEC-805] HTTP security', () => {
  it('CA-1 — deux réponses HTML ont des nonces distincts et les en-têtes prescrits', () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('NODE_ENV', 'production');

    const first = proxy(
      new NextRequest('https://learny.test/_dev/sdd/SPEC-805', {
        headers: { 'x-forwarded-proto': 'https' },
      }),
    ) as NextResponse;
    const second = proxy(
      new NextRequest('https://learny.test/_dev/sdd/SPEC-805', {
        headers: { 'x-forwarded-proto': 'https' },
      }),
    ) as NextResponse;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstCsp = first.headers.get('content-security-policy') ?? '';
    const secondCsp = second.headers.get('content-security-policy') ?? '';
    const firstNonce = /'nonce-([^']+)'/.exec(firstCsp)?.[1];
    const secondNonce = /'nonce-([^']+)'/.exec(secondCsp)?.[1];
    expect(firstNonce).toBeTruthy();
    expect(secondNonce).toBeTruthy();
    expect(firstNonce).not.toBe(secondNonce);
    expect(cspDirective(firstCsp, 'script-src')).toContain(`'nonce-${firstNonce ?? ''}'`);
    expect(firstCsp).not.toContain('unsafe-eval');
    expect(firstCsp).not.toContain('unsafe-inline');

    expect(first.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(first.headers.get('x-content-type-options')).toBe('nosniff');
    expect(first.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(first.headers.get('permissions-policy')).toContain('camera=()');
    expect(first.headers.get('permissions-policy')).toContain('geolocation=()');
    expect(output).not.toContain(firstNonce ?? 'missing');
    expect(output).not.toContain(secondNonce ?? 'missing');
  });

  it('EF-2 — une réponse HTTP locale n’annonce pas HSTS', () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('NODE_ENV', 'production');
    const response = proxy(
      new NextRequest('http://localhost/_dev/sdd/SPEC-805', {
        headers: { 'x-forwarded-proto': 'http' },
      }),
    ) as NextResponse;
    expect(response.headers.get('strict-transport-security')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
  });

  it('CA-2 — origine étrangère refusée avant le service, sans écriture', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://learny.test');
    vi.stubEnv('ALLOWED_ORIGINS', '');
    vi.stubEnv('TRUST_PROXY', 'true');
    setOriginGuard(createRequestOriginGuard());

    let executed = 0;
    const guarded = handler(route('POST', 'none', 'test.origin'), () => {
      executed += 1;
      return Promise.resolve({ ok: true as const });
    });

    const foreign = await call(guarded, '/api/v1/test/test.origin', {
      method: 'POST',
      headers: { origin: 'https://evil.test', 'x-forwarded-for': '203.0.113.77' },
    });
    expect(foreign.status).toBe(403);
    expect((ProblemDetails.parse(await foreign.json()) as { code: string }).code).toBe(
      'ORIGIN_REJECTED',
    );
    expect(executed).toBe(0);

    const sameOrigin = await call(guarded, '/api/v1/test/test.origin', {
      method: 'POST',
      headers: { origin: 'https://learny.test', 'x-forwarded-for': '203.0.113.77' },
    });
    expect(sameOrigin.status).toBe(200);
    expect(executed).toBe(1);

    const missing = await call(guarded, '/api/v1/test/test.origin', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site', 'x-forwarded-for': '203.0.113.77' },
    });
    expect(missing.status).toBe(403);
    expect(executed).toBe(1);
  });

  it('CA-2 — quota atteint : 429 et Retry-After, le service ne s’exécute plus', async () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    setRateLimiter(
      createRateLimiter({ RATE_LIMIT_IP_SECRET: process.env.RATE_LIMIT_IP_SECRET ?? randomUUID() }),
    );
    let executed = 0;
    const limited = handler(route('GET', 'auth', 'test.limit'), () => {
      executed += 1;
      return Promise.resolve({ ok: true as const });
    });
    const headers = { 'x-forwarded-for': '198.51.100.205' };
    for (let index = 0; index < 10; index += 1) {
      const response = await call(limited, '/api/v1/test/test.limit', { headers });
      expect(response.status).toBe(200);
    }
    const refused = await call(limited, '/api/v1/test/test.limit', { headers });
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(refused.headers.get('ratelimit-remaining')).toBe('0');
    expect((ProblemDetails.parse(await refused.json()) as { code: string }).code).toBe(
      'RATE_LIMITED',
    );
    expect(executed).toBe(10);
  });
});
