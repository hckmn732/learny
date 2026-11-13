import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_JOB_ID, EVENT_NAMES, INNGEST_APP_ID, JOB_RETRIES, functions } from '@learny/jobs';
import { driveInngestRun } from '@learny/jobs/testing';

import { GET, POST } from '../../app/api/inngest/route';

const SIGNING_KEY = 'signkey-test-learny-test-only-0123456789abcdef';
const URL_BASE = 'http://localhost:3000/api/inngest';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('aucun appel réseau en test'))),
  );
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('[SPEC-007] web /api/inngest', () => {
  it('serves the shared registry through the Next.js adapter (CA-1)', async () => {
    vi.stubEnv('INNGEST_DEV', '1');
    vi.stubEnv('INNGEST_SIGNING_KEY', SIGNING_KEY);
    const res = await GET(new NextRequest(URL_BASE), undefined);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ mode: 'dev', function_count: functions.length });
    expect(functions.map((f) => f.id())).toEqual([
      DEMO_JOB_ID,
      'account-deletion',
      'cron-hourly-tick',
      'cron-nightly',
      'data-export',
      'email-welcome',
      'exports-purge',
      'generate-course',
      'ingest-resource',
      'nightly-outbox-cleanup',
      'notification-delivery',
      'notifications-daily-digest',
      'notifications-deferred-due',
      'plan-programme',
      'prepare-question-bank',
      'question-bank-nightly',
      'sdd-demo-pipeline',
      'security-purge',
    ]);
    expect(text).not.toMatch(/signkey|learny-test-only/);
  });

  it('refuses an unsigned execution request outside dev mode, before the job (CA-4)', async () => {
    // The SDK merges env vars seen on earlier requests: cloud mode is set explicitly.
    vi.stubEnv('INNGEST_DEV', '0');
    vi.stubEnv('INNGEST_SIGNING_KEY', SIGNING_KEY);
    const run = await driveInngestRun({
      handler: (req) => POST(new NextRequest(req), undefined),
      url: URL_BASE,
      fnId: `${INNGEST_APP_ID}-${DEMO_JOB_ID}`,
      event: { name: EVENT_NAMES.sddDemoJobRequested, data: { runId: 'web-1', value: 4 } },
      retries: JOB_RETRIES,
    });

    expect(run).toMatchObject({ status: 'failed', httpStatuses: [401], stepRuns: {} });
    expect(JSON.stringify(run)).not.toMatch(/signkey|learny-test-only/);
  });
});
