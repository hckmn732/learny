import { mkdirSync, writeFileSync } from 'node:fs';

import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ProblemDetails, defineRoute, encodeCursor } from '@learny/contracts';
import { clock, setClock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { devEchoExecutions, resetDevEchoCounter } from '@learny/services';
import {
  createTestSession,
  deleteTestSession,
  supabaseLocalEnv,
  type TestSession,
} from '@learny/testing/supabase';

import { POST as postEcho } from '../../app/api/v1/dev/sdd/echo/route';
import { GET as getItems } from '../../app/api/v1/dev/sdd/items/route';
import { handler } from '../../lib/api/handler';
import { setSessionResolver } from '../../lib/api/session';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };
let session: TestSession;
const sessions: TestSession[] = [];

function request(
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
    cookie?: string | null;
  } = {},
): NextRequest {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  const cookie = init.cookie === undefined ? session.cookieHeader : init.cookie;
  if (cookie !== null) headers.cookie = cookie;
  const body =
    init.body === undefined
      ? undefined
      : typeof init.body === 'string'
        ? init.body
        : JSON.stringify(init.body);
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

const echo = (body: unknown, key?: string, extra: Record<string, string> = {}) =>
  postEcho(
    request('/api/v1/dev/sdd/echo', {
      method: 'POST',
      body,
      headers: { ...(key === undefined ? {} : { 'idempotency-key': key }), ...extra },
    }),
    NO_SEGMENT,
  );

const items = (query = '', cookie?: string | null) =>
  getItems(
    request(`/api/v1/dev/sdd/items${query}`, cookie === undefined ? {} : { cookie }),
    NO_SEGMENT,
  );

let keyCounter = 0;
const newKey = () => `key-${String((keyCounter += 1))}-${Math.random().toString(36).slice(2, 10)}`;

beforeAll(async () => {
  const env = supabaseLocalEnv();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', env.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', env.anonKey);
  session = await createTestSession();
  sessions.push(session);
});

afterAll(async () => {
  for (const s of sessions) await deleteTestSession(s);
  await closeDb();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.stubEnv('ENABLE_SDD_PAGES', 'true');
  resetDevEchoCounter();
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
  // Pino writes to stdout; keep the output quiet.
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function problem(response: Response) {
  expect(response.headers.get('content-type')).toContain('application/problem+json');
  const body: unknown = await response.json();
  const parsed = ProblemDetails.parse(body);
  expect(response.headers.get('x-request-id')).toBe(parsed.requestId);
  return parsed;
}

describe('[SPEC-201] handler', () => {
  it('answers 401 UNAUTHENTICATED without a session (CA-5)', async () => {
    const response = await items('', null);
    expect(response.status).toBe(401);
    const body = await problem(response);
    expect(body.code).toBe('UNAUTHENTICATED');
    expect(body.type).toBe('https://learny.app/errors/unauthenticated');
    expect(body.title).toBe('Connexion requise');
  });

  it('answers 401 for a tampered session cookie', async () => {
    const cookie = session.cookies
      .map((c) => `${c.name}=${encodeURIComponent(c.value.slice(0, -4))}AAAA`)
      .join('; ');
    expect((await items('', cookie)).status).toBe(401);
  });

  it('answers 403 EMAIL_NOT_CONFIRMED when the e-mail is not confirmed', async () => {
    const unconfirmed = await createTestSession({ confirmed: false });
    sessions.push(unconfirmed);
    const response = await items('', unconfirmed.cookieHeader);
    expect(response.status).toBe(403);
    expect((await problem(response)).code).toBe('EMAIL_NOT_CONFIRMED');
  });

  it('answers 400 problem+json with prefixed paths on a validation error (CA-1)', async () => {
    const response = await echo({ message: '' }, newKey());
    expect(response.status).toBe(400);
    const body = await problem(response);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors?.[0]?.path).toBe('body.message');
    expect(JSON.stringify(body)).not.toContain('stack');
  });

  it('answers 400 on invalid JSON and 413 above 1 MiB, without calling the service (CL-6)', async () => {
    const invalid = await postEcho(
      request('/api/v1/dev/sdd/echo', {
        method: 'POST',
        body: '{not json',
        headers: { 'idempotency-key': newKey() },
      }),
      NO_SEGMENT,
    );
    expect(invalid.status).toBe(400);
    expect((await problem(invalid)).errors?.[0]?.path).toBe('body');

    const huge = await echo({ message: 'x'.repeat(1024 * 1024 + 10) }, newKey());
    expect(huge.status).toBe(413);
    expect((await problem(huge)).code).toBe('PAYLOAD_TOO_LARGE');
    expect(devEchoExecutions()).toBe(0);
  });

  it('reuses a conforming X-Request-Id and replaces a malicious one (EF-2, CL-8)', async () => {
    const good = await items('', session.cookieHeader);
    expect(good.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);

    const reused = await getItems(
      request('/api/v1/dev/sdd/items', { headers: { 'x-request-id': 'trace-abc-12345678' } }),
      NO_SEGMENT,
    );
    expect(reused.headers.get('x-request-id')).toBe('trace-abc-12345678');

    for (const hostile of ['<script>', 'x'.repeat(500), 'short']) {
      const response = await getItems(
        request('/api/v1/dev/sdd/items', { headers: { 'x-request-id': hostile } }),
        NO_SEGMENT,
      );
      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('answers 422 FORMATION_LIMIT_REACHED for a business error (EF-1)', async () => {
    const response = await echo({ message: 'hello', fail: 'business' }, newKey());
    expect(response.status).toBe(422);
    const body = await problem(response);
    expect(body.code).toBe('FORMATION_LIMIT_REACHED');
    expect(body.title).toBe('Trois formations actives au plus');
  });

  it('answers 500 INTERNAL_ERROR with the request reference for a crash', async () => {
    const response = await echo({ message: 'hello', fail: 'crash' }, newKey());
    expect(response.status).toBe(500);
    const body = await problem(response);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.detail).toBe(`Une erreur inattendue est survenue. Référence : ${body.requestId}.`);
    expect(JSON.stringify(body)).not.toContain('démonstration');
  });

  it('serves no demonstration route when ENABLE_SDD_PAGES is disabled (CA-7, CL-10)', async () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'false');
    const response = await items('', null);
    expect(response.status).toBe(404);
    expect((await problem(response)).code).toBe('NOT_FOUND');
    expect((await echo({ message: 'x' }, newKey())).status).toBe(404);
  });
});

describe('[SPEC-201] idempotence', () => {
  it('requires a valid Idempotency-Key (CA-3)', async () => {
    for (const key of [undefined, 'short', 'bad key with spaces!!']) {
      const response = await echo({ message: 'hello' }, key);
      expect(response.status).toBe(400);
      expect((await problem(response)).code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    }
    expect(devEchoExecutions()).toBe(0);
  });

  it('replays the recorded answer without running the service again (CA-2)', async () => {
    const key = newKey();
    const first = await echo({ message: 'hello' }, key);
    expect(first.status).toBe(201);
    expect(first.headers.get('idempotent-replayed')).toBeNull();
    const firstBody: unknown = await first.json();
    expect(firstBody).toMatchObject({ message: 'hello', counter: 1 });

    const second = await echo({ message: 'hello' }, key);
    expect(second.status).toBe(201);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(await second.json()).toEqual(firstBody);
    expect(devEchoExecutions()).toBe(1);
  });

  it('replays a recorded 4xx answer identically', async () => {
    const key = newKey();
    const first = await echo({ message: 'hello', fail: 'business' }, key);
    const firstBody: unknown = await first.json();
    const second = await echo({ message: 'hello', fail: 'business' }, key);
    expect(second.status).toBe(422);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(await second.json()).toEqual(firstBody);
  });

  it('runs a service once for two concurrent requests with the same key (CA-2)', async () => {
    const key = newKey();
    const responses = await Promise.all([
      echo({ message: 'race' }, key),
      echo({ message: 'race' }, key),
    ]);
    expect(devEchoExecutions()).toBe(1);
    for (const response of responses) expect([201, 409]).toContain(response.status);
    expect(responses.some((response) => response.status === 201)).toBe(true);
  });

  it('refuses a key reused with another body, without calling the service (CL-2, CA-3)', async () => {
    const key = newKey();
    expect((await echo({ message: 'one' }, key)).status).toBe(201);
    const reused = await echo({ message: 'two' }, key);
    expect(reused.status).toBe(422);
    expect((await problem(reused)).code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(devEchoExecutions()).toBe(1);
  });

  it('answers 409 IDEMPOTENCY_IN_PROGRESS with Retry-After while the first call runs (EF-5, CL-1)', async () => {
    let release: () => void = () => undefined;
    let entered: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const started = new Promise<void>((resolve) => (entered = resolve));
    let executions = 0;
    const route = defineRoute({
      id: 'test.slow',
      method: 'POST',
      path: '/api/v1/test/slow',
      auth: 'user',
      body: z.object({ n: z.number() }),
      output: z.object({ done: z.literal(true) }),
      successStatus: 201,
      idempotent: true,
      summary: 'test',
      errors: [],
    });
    const slow = handler(route, async () => {
      executions += 1;
      entered();
      await gate;
      return { done: true as const };
    });
    const call = (key: string) =>
      slow(
        request('/api/v1/test/slow', {
          method: 'POST',
          body: { n: 1 },
          headers: { 'idempotency-key': key },
        }),
        NO_SEGMENT,
      );

    const key = newKey();
    const first = call(key);
    await started;
    const concurrent = await call(key);
    expect(concurrent.status).toBe(409);
    expect(concurrent.headers.get('retry-after')).toBe('1');
    expect((await problem(concurrent)).code).toBe('IDEMPOTENCY_IN_PROGRESS');

    release();
    expect((await first).status).toBe(201);
    const replay = await call(key);
    expect(replay.status).toBe(201);
    expect(replay.headers.get('idempotent-replayed')).toBe('true');
    expect(executions).toBe(1);
  });

  it('releases the key after a 5xx so the same key can run again (CL-3)', async () => {
    let calls = 0;
    const route = defineRoute({
      id: 'test.flaky',
      method: 'POST',
      path: '/api/v1/test/flaky',
      auth: 'user',
      body: z.object({ n: z.number() }),
      output: z.object({ call: z.number() }),
      successStatus: 201,
      idempotent: true,
      summary: 'test',
      errors: [],
    });
    const flaky = handler(route, () => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('boom'));
      return Promise.resolve({ call: calls });
    });
    const call = (key: string) =>
      flaky(
        request('/api/v1/test/flaky', {
          method: 'POST',
          body: { n: 1 },
          headers: { 'idempotency-key': key },
        }),
        NO_SEGMENT,
      );
    const key = newKey();
    expect((await call(key)).status).toBe(500);
    const retry = await call(key);
    expect(retry.status).toBe(201);
    expect(retry.headers.get('idempotent-replayed')).toBeNull();
    expect(await retry.json()).toEqual({ call: 2 });
  });

  it('treats a key older than 24 h as absent (CL-4)', async () => {
    const key = newKey();
    expect((await echo({ message: 'old' }, key)).status).toBe(201);
    const before = clock;
    const later = new Date(before.now().getTime() + (24 * 60 + 1) * 60_000);
    setClock({ now: () => later });
    try {
      const again = await echo({ message: 'old' }, key);
      expect(again.status).toBe(201);
      expect(again.headers.get('idempotent-replayed')).toBeNull();
      expect(devEchoExecutions()).toBe(2);
    } finally {
      setClock(before);
    }
  });

  it('has the request_hash and completed_at columns of idempotency_keys (ADR-0219)', async () => {
    const rows = await serviceDb().execute<{ column_name: string; is_nullable: string }>(sql`
      select column_name, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'idempotency_keys'
      order by column_name`);
    const columns = new Map(rows.map((row) => [row.column_name, row.is_nullable]));
    expect(columns.get('request_hash')).toBe('NO');
    expect(columns.get('completed_at')).toBe('YES');
  });
});

describe('[SPEC-201] pagination', () => {
  it('walks 57 items in pages of 20, 20 and 17 then ends (CA-4)', async () => {
    const sizes: number[] = [];
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await items(cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`);
      expect(response.status).toBe(200);
      const page = (await response.json()) as {
        items: { id: string }[];
        nextCursor: string | null;
      };
      sizes.push(page.items.length);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null);
    expect(sizes).toEqual([20, 20, 17]);
    expect(new Set(seen).size).toBe(57);
    expect(seen[0]).toBe('item-57');
    expect(seen.at(-1)).toBe('item-01');
  });

  it('refuses limit=101, limit=0, a forged cursor and an unreadable cursor (CA-4, CL-9)', async () => {
    const over = await items('?limit=101');
    expect(over.status).toBe(400);
    expect((await problem(over)).errors?.[0]?.path).toBe('query.limit');
    expect((await items('?limit=0')).status).toBe(400);

    const forged = encodeCursor({ k: 5, id: 'x' });
    const noId = Buffer.from(JSON.stringify({ k: 5 })).toString('base64url');
    expect(forged.length).toBeGreaterThan(0);
    const forgedResponse = await items(`?cursor=${noId}`);
    expect(forgedResponse.status).toBe(400);
    expect((await problem(forgedResponse)).errors?.[0]?.path).toBe('query.cursor');
    expect((await items('?cursor=%25%25%25')).status).toBe(400);
  });

  it('gives an empty page, never a 500, for the cursor of another list (CL-9)', async () => {
    const other = encodeCursor({ k: 'abc', id: 'z' });
    const response = await items(`?cursor=${other}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  });
});

describe('[SPEC-201] contrat de sortie', () => {
  const route = defineRoute({
    id: 'test.contract',
    method: 'GET',
    path: '/api/v1/test/contract',
    auth: 'user',
    output: z.object({ name: z.string() }),
    successStatus: 200,
    summary: 'test',
    errors: [],
  });

  it('answers 500 without leaking data when the service breaks the contract (CA-5, CL-7)', async () => {
    const broken = handler(route, () =>
      Promise.resolve({ name: 42, secret: 'top-secret' } as unknown as { name: string }),
    );
    const response = await broken(request('/api/v1/test/contract'), NO_SEGMENT);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain('top-secret');
    expect(text).toContain('INTERNAL_ERROR');
  });

  it('drops fields that are not part of the contract', async () => {
    const extra = handler(route, () =>
      Promise.resolve({ name: 'ok', secret: 'hidden' } as unknown as { name: string }),
    );
    const response = await extra(request('/api/v1/test/contract'), NO_SEGMENT);
    expect(await response.json()).toEqual({ name: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('[SPEC-201] performance du wrapper (ET-11)', () => {
  it('adds less than 15 ms at p95 around the service', async () => {
    const restore = setSessionResolver(() =>
      Promise.resolve({ userId: session.userId, email: session.email, emailConfirmed: true }),
    );
    try {
      const route = defineRoute({
        id: 'test.perf',
        method: 'GET',
        path: '/api/v1/test/perf',
        auth: 'user',
        output: z.object({ ok: z.literal(true) }),
        successStatus: 200,
        summary: 'test',
        errors: [],
      });
      const fast = handler(route, () => Promise.resolve({ ok: true as const }));
      const durations: number[] = [];
      for (let i = 0; i < 205; i += 1) {
        const started = performance.now();
        const response = await fast(request('/api/v1/test/perf'), NO_SEGMENT);
        durations.push(performance.now() - started);
        expect(response.status).toBe(200);
      }
      const sorted = durations.slice(5).sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95) - 1] ?? 0;
      mkdirSync('test-results', { recursive: true });
      writeFileSync(
        'test-results/spec-201-wrapper-overhead.json',
        JSON.stringify({ samples: sorted.length, p95Ms: Number(p95.toFixed(3)) }, null, 2),
      );
      expect(p95).toBeLessThan(15);
    } finally {
      restore();
    }
  });
});
