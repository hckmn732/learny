import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEMO_JOB_ID,
  EVENT_NAMES,
  INNGEST_APP_ID,
  JOB_RETRIES,
  createFunctions,
  createLearnyClient,
  createMemoryDemoStore,
  functions,
  inngest,
} from '@learny/jobs';
import { driveInngestRun } from '@learny/jobs/testing';

import { DEFAULT_PORT, createApp, getWorkerHealth, parsePort, startServer } from '../../src/server';

// Fake key for tests only: never a real Inngest signing key.
const SIGNING_KEY = 'signkey-test-learny-test-only-0123456789abcdef';
const FIXED_TIME = new Date('2026-11-11T12:20:00Z');
const FN_ID = `${INNGEST_APP_ID}-${DEMO_JOB_ID}`;
const EVENT = { name: EVENT_NAMES.sddDemoJobRequested, data: { runId: 'w-1', value: 4 } };

// RFC 8785 style canonical JSON (sorted keys), as signed by Inngest.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sign(body: string, ts: number): string {
  const key = SIGNING_KEY.replace(/^signkey-\w+-/, '');
  const mac = createHmac('sha256', key)
    .update(canonical(JSON.parse(body)))
    .update(String(ts));
  return `t=${String(ts)}&s=${mac.digest('hex')}`;
}

function productionHost() {
  const client = createLearnyClient({
    APP_ENV: 'production',
    INNGEST_DEV: '1',
    INNGEST_SIGNING_KEY: SIGNING_KEY,
  });
  const store = createMemoryDemoStore();
  const app = createApp({ client, functions: createFunctions(client, { demoStore: store }) });
  return { app, store };
}

const outbound = vi.fn(() => Promise.reject(new Error('aucun appel réseau en test')));

beforeEach(() => {
  vi.stubGlobal('fetch', outbound);
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  expect(outbound).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('[SPEC-007] worker', () => {
  it('answers GET /health with status, version and commit only (EF-3)', async () => {
    const app = createApp({ env: { APP_VERSION: '1.2.3', GIT_COMMIT: 'abcdef1' } });
    const res = await app.request('/health');

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'ok', version: '1.2.3', commit: 'abcdef1' });
    expect(getWorkerHealth({ APP_VERSION: 'postgres://u:p@h/db', GIT_COMMIT: 'x y' })).toEqual({
      status: 'ok',
      version: 'dev',
      commit: 'unknown',
    });
  });

  it('serves the shared registry at /api/inngest without exposing any key (CA-1)', async () => {
    vi.stubEnv('INNGEST_DEV', '1');
    vi.stubEnv('INNGEST_SIGNING_KEY', SIGNING_KEY);
    const res = await createApp().request('/api/inngest');
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ mode: 'dev', function_count: functions.length });
    expect(functions.map((f) => f.id(INNGEST_APP_ID))).toEqual([
      FN_ID,
      `${INNGEST_APP_ID}-account-deletion`,
      `${INNGEST_APP_ID}-cron-hourly-tick`,
      `${INNGEST_APP_ID}-cron-nightly`,
      `${INNGEST_APP_ID}-data-export`,
      `${INNGEST_APP_ID}-email-welcome`,
      `${INNGEST_APP_ID}-exports-purge`,
      `${INNGEST_APP_ID}-nightly-outbox-cleanup`,
      `${INNGEST_APP_ID}-notification-delivery`,
      `${INNGEST_APP_ID}-notifications-daily-digest`,
      `${INNGEST_APP_ID}-notifications-deferred-due`,
      `${INNGEST_APP_ID}-sdd-demo-pipeline`,
      `${INNGEST_APP_ID}-security-purge`,
    ]);
    expect(text).not.toContain('learny-test-only');
    expect(text).not.toMatch(/signkey/i);
  });

  it('executes the shared demo job through the Hono adapter (CA-1)', async () => {
    vi.stubEnv('INNGEST_DEV', '1');
    const store = createMemoryDemoStore();
    const app = createApp({ functions: createFunctions(inngest, { demoStore: store }) });
    const run = await driveInngestRun({
      handler: (req) => Promise.resolve(app.request(req)),
      fnId: FN_ID,
      event: EVENT,
      retries: JOB_RETRIES,
    });

    expect(run).toMatchObject({ status: 'completed', output: { runId: 'w-1', doubledValue: 8 } });
    expect(store.writes).toBe(1);
  });

  it('never runs in Dev Server mode in production, even with INNGEST_DEV set (EF-2)', () => {
    expect(createLearnyClient({ APP_ENV: 'production', INNGEST_DEV: '1' }).mode).toBe('cloud');
  });

  it('refuses a missing or invalid signature in production before the job (CA-4, CL-6)', async () => {
    vi.useFakeTimers({ now: FIXED_TIME, toFake: ['Date'] });
    const { app, store } = productionHost();
    const ts = Math.floor(FIXED_TIME.getTime() / 1000);

    const unsigned = await driveInngestRun({
      handler: (req) => Promise.resolve(app.request(req)),
      fnId: FN_ID,
      event: EVENT,
      retries: JOB_RETRIES,
    });
    const forged = await driveInngestRun({
      handler: (req) => Promise.resolve(app.request(req)),
      fnId: FN_ID,
      event: EVENT,
      retries: JOB_RETRIES,
      headers: () => ({ 'x-inngest-signature': `t=${String(ts)}&s=${'0'.repeat(64)}` }),
    });

    for (const run of [unsigned, forged]) {
      expect(run.status).toBe('failed');
      expect(run.httpStatuses).toEqual([401]);
      expect(run.stepRuns).toEqual({});
    }
    expect(store.writes).toBe(0);

    const introspection = await app.request('/api/inngest');
    expect(introspection.status).toBe(401);
  });

  it('accepts a correctly signed request in production (control of CA-4)', async () => {
    vi.useFakeTimers({ now: FIXED_TIME, toFake: ['Date'] });
    const { app, store } = productionHost();
    const ts = Math.floor(FIXED_TIME.getTime() / 1000);

    const run = await driveInngestRun({
      handler: (req) => Promise.resolve(app.request(req)),
      fnId: FN_ID,
      event: EVENT,
      retries: JOB_RETRIES,
      headers: (body) => ({ 'x-inngest-signature': sign(body, ts) }),
    });

    expect(run).toMatchObject({ status: 'completed', output: { doubledValue: 8 } });
    expect(store.writes).toBe(1);
  });

  it('parses PORT with an explicit local default', () => {
    expect(parsePort(undefined)).toBe(DEFAULT_PORT);
    expect(parsePort('8080')).toBe(8080);
    expect(() => parsePort('http')).toThrow('PORT invalide : http');
    expect(() => parsePort('70000')).toThrow('PORT invalide : 70000');
  });

  it('fails with a readable error when PORT is already taken (CL-7)', async () => {
    const blocker: Server = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    try {
      await expect(startServer(createApp(), port, '127.0.0.1')).rejects.toThrow(
        `Le port ${String(port)} est déjà utilisé : le worker ne démarre pas.`,
      );
      // The worker itself can start on a free port and be stopped cleanly.
      const server = await startServer(createApp(), 0, '127.0.0.1');
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    } finally {
      await new Promise<void>((resolve) =>
        blocker.close(() => {
          resolve();
        }),
      );
    }
  });
});
