import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError, type Clock, type SafeSentryEvent } from '@learny/core';
import { createLogCapture, createLogger } from '@learny/core/server';

import { GET as healthRoute } from '../../app/api/v1/health/route';
import { handler, type HandlerOptions } from '../../lib/api/handler';
import { setDatabaseQuery } from '../../lib/health';
import { createServerReporter, resetSentryForTests, sanitizeSentryEvent } from '../../lib/sentry';

const FIXED: Clock = { now: () => new Date('2026-11-11T12:20:00Z') };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const EMAIL = 'sentinel-e2e@example.test';
const API_KEY = 'sk-sentinel-0123456789abcdef'; // learny-test-only
const COOKIE = 'session=sentinel-cookie';
const APPORT = 'apport-sentinel-content';
const PROMPT = 'prompt-sentinel-content';
const SENTINELS = [EMAIL, API_KEY, COOKIE, APPORT, PROMPT];

const DSN = 'https://public@o1.ingest.sentry.io/1';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function options(
  capture: ReturnType<typeof createLogCapture>,
  extra: Partial<HandlerOptions> = {},
): HandlerOptions {
  return {
    route: '/api/v1/test',
    logger: { destination: capture.destination, clock: FIXED, env: { LOG_LEVEL: 'info' } },
    ...extra,
  };
}

afterEach(() => {
  setDatabaseQuery(null);
  resetSentryForTests();
  vi.restoreAllMocks();
});

describe('[SPEC-010] observability', () => {
  it('gives each concurrent request its own requestId and userId (CA-1, CL-6)', async () => {
    const capture = createLogCapture();
    const api = handler(
      options(capture, {
        auth: (request) => {
          const userId = request.headers.get('x-user-id');
          return userId === null ? null : { userId };
        },
      }),
      async (context) => {
        // A service called later in the request creates its own logger; the context provides
        // the correlation. One request is slower so the two runs interleave.
        await wait(context.requestId === 'req-a' ? 20 : 5);
        const logger = createLogger({
          route: '/api/v1/service',
          clock: FIXED,
          destination: capture.destination,
        });
        logger.info(`work-${context.requestId}`);
        return { ok: true };
      },
    );

    const [first, second] = await Promise.all([
      api(
        new Request('http://localhost/api/v1/test', {
          headers: { 'x-request-id': 'req-a', 'x-user-id': 'user-a' },
        }),
      ),
      api(
        new Request('http://localhost/api/v1/test', {
          headers: { 'x-request-id': 'req-b', 'x-user-id': 'user-b' },
        }),
      ),
    ]);

    expect(first.headers.get('x-request-id')).toBe('req-a');
    expect(second.headers.get('x-request-id')).toBe('req-b');
    const records = capture.records();
    const expectedUsers: Record<string, string> = { 'req-a': 'user-a', 'req-b': 'user-b' };
    for (const record of records) {
      const requestId = String(record.requestId);
      expect(['req-a', 'req-b']).toContain(requestId);
      expect(record.userId).toBe(expectedUsers[requestId]);
      expect(record.route).toMatch(/^\/api\/v1\//);
    }
    expect(records.filter((record) => record.message === 'work-req-a')).toHaveLength(1);
    expect(records.filter((record) => record.message === 'work-req-b')).toHaveLength(1);
    expect(records.filter((record) => record.message === 'request completed')).toHaveLength(2);
  });

  it('generates a safe identifier when the incoming header is invalid (ET-3, CL-1)', async () => {
    const capture = createLogCapture();
    const api = handler(options(capture), () => ({ ok: true }));

    const response = await api(
      new Request('http://localhost/api/v1/test', {
        headers: { 'x-request-id': 'bad header with spaces' },
      }),
    );
    const requestId = response.headers.get('x-request-id') ?? '';

    expect(requestId).toMatch(UUID);
    expect(requestId).not.toBe('bad header with spaces');
    expect(capture.records()[0]?.requestId).toBe(requestId);
    expect(JSON.stringify(capture.records())).not.toContain('bad header');
  });

  it('answers problem+json with the requestId and no stack (EF-3)', async () => {
    const capture = createLogCapture();
    const api = handler(options(capture), () => {
      throw new AppError('NOT_FOUND', 'Formation introuvable.');
    });
    const response = await api(
      new Request('http://localhost/api/v1/test', {
        headers: { 'x-request-id': 'req-problem' },
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(response.headers.get('x-request-id')).toBe('req-problem');
    expect(body).toMatchObject({
      type: 'about:blank',
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'req-problem',
    });
    expect(JSON.stringify(body)).not.toMatch(/stack|at .*\.ts:/);
  });

  it('never serialises a sentinel in the pino bytes or the safe 500 (CA-2)', async () => {
    const capture = createLogCapture();
    const events: SafeSentryEvent[] = [];
    const reporter = createServerReporter(
      { APP_ENV: 'local', NODE_ENV: 'production', SENTRY_DSN: DSN },
      (event) => events.push(event),
    );
    const api = handler(options(capture, { reporter }), () => {
      const logger = createLogger({ clock: FIXED });
      logger.info('service payload', {
        email: EMAIL,
        apiKey: API_KEY,
        nested: { cookie: COOKIE, apport: APPORT },
      } as unknown as Parameters<typeof logger.info>[1]);
      throw new Error(`panic ${EMAIL} ${API_KEY} ${COOKIE} ${APPORT} ${PROMPT}`);
    });

    const response = await api(
      new Request('http://localhost/api/v1/test', {
        headers: { 'x-request-id': 'req-sentinel', 'x-user-id': 'user-sentinel' },
      }),
    );
    const body = await response.text();
    const bytes = capture.text();
    const sentry = JSON.stringify(events);

    for (const sentinel of SENTINELS) {
      expect(bytes, `pino ${sentinel}`).not.toContain(sentinel);
      expect(body, `http ${sentinel}`).not.toContain(sentinel);
      expect(sentry, `sentry ${sentinel}`).not.toContain(sentinel);
    }
    expect(response.status).toBe(500);
    expect(body).toContain('INTERNAL_ERROR');
    expect(body).toContain('req-sentinel');
    expect(events).toHaveLength(1);
    expect(events[0]?.tags.requestId).toBe('req-sentinel');
    expect(events[0]?.exception.values[0]?.type).toBe('Error');
  });

  it('sends nothing without a DSN and stays inactive in the test environment (CA-3, CL-4)', async () => {
    const transport = vi.fn();
    const empty = createServerReporter(
      { APP_ENV: 'local', NODE_ENV: 'production', SENTRY_DSN: '' },
      transport,
    );
    const tests = createServerReporter(
      { APP_ENV: 'test', NODE_ENV: 'production', SENTRY_DSN: DSN },
      transport,
    );
    expect(empty.enabled).toBe(false);
    expect(tests.enabled).toBe(false);

    const capture = createLogCapture();
    const api = handler(options(capture, { reporter: empty }), () => {
      throw new Error('boom');
    });
    const response = await api(new Request('http://localhost/api/v1/test'));
    expect(response.status).toBe(500);
    expect(transport).not.toHaveBeenCalled();
    expect(empty.capture(new Error('boom'), { requestId: 'req-empty' })).toBeUndefined();
  });

  it('keeps the user response identical while reporting a safe event (CA-3)', async () => {
    const capture = createLogCapture();
    const events: SafeSentryEvent[] = [];
    const reporter = createServerReporter(
      { APP_ENV: 'local', NODE_ENV: 'production', SENTRY_DSN: DSN },
      (event) => events.push(event),
    );
    const api = handler(
      options(capture, {
        reporter,
        auth: (request) => {
          const userId = request.headers.get('x-user-id');
          return userId === null ? null : { userId };
        },
      }),
      () => {
        throw new Error(`panne ${EMAIL}`);
      },
    );
    const response = await api(
      new Request('http://localhost/api/v1/test', {
        headers: { 'x-request-id': 'req-report', 'x-user-id': 'user-report' },
      }),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      code: 'INTERNAL_ERROR',
      requestId: 'req-report',
      detail: 'Erreur interne',
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'error',
      tags: { requestId: 'req-report', route: '/api/v1/test' },
      user: { id: 'user-report' },
    });
    expect(JSON.stringify(events[0])).not.toContain(EMAIL);
  });

  it('filters request, query, cookies and extra data in beforeSend (ET-4, CA-2)', () => {
    const safe = sanitizeSentryEvent(
      {
        platform: 'javascript',
        tags: { requestId: 'req-filter', route: '/api/v1/test' },
        request: {
          headers: { authorization: `Bearer ${API_KEY}`, cookie: COOKIE },
          query_string: `email=${EMAIL}`,
          data: { prompt: PROMPT, apport: APPORT },
        },
        extra: { apiKey: API_KEY, body: APPORT },
        breadcrumbs: [{ message: EMAIL, data: { prompt: PROMPT } }],
        exception: {
          values: [{ type: 'Error', value: `${EMAIL} ${PROMPT}`, stacktrace: { frames: [] } }],
        },
        user: { id: 'user-filter', email: EMAIL },
      },
      FIXED,
    );

    const text = JSON.stringify(safe);
    for (const sentinel of SENTINELS) expect(text).not.toContain(sentinel);
    expect(safe.tags.requestId).toBe('req-filter');
    expect(safe.user).toEqual({ id: 'user-filter' });
  });

  it('keeps the SPEC-006 health fields and reports a failing base without detail (CA-4)', async () => {
    setDatabaseQuery(() =>
      Promise.reject(new Error(`connect ECONNREFUSED postgres://learny:${API_KEY}@db.internal`)),
    );
    const response = await healthRoute(
      new Request('http://localhost/api/v1/health', {
        headers: { 'x-request-id': 'req-health' },
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(response.headers.get('x-request-id')).toBe('req-health');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({
      status: 'degraded',
      version: 'dev',
      commit: 'unknown',
      database: 'unavailable',
      components: { database: 'unavailable', build: 'not_configured' },
    });
    const text = JSON.stringify(body);
    for (const sentinel of [API_KEY, 'db.internal', 'ECONNREFUSED', 'postgres://']) {
      expect(text).not.toContain(sentinel);
    }
  });
});
