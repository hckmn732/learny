import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sddDemoStore } from '@learny/jobs';

import { POST } from '../../app/api/v1/%5Fdev/demo-job/route';

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/v1/_dev/demo-job', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  sddDemoStore.clear();
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('[SPEC-007] SDD demo job route', () => {
  it('is hidden when SDD pages are disabled', async () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'false');
    expect((await post({ runId: 'r', value: 4 })).status).toBe(404);
  });

  it('runs the shared job and reports both steps and the result (EF-6)', async () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    const res = await post({ runId: 'route-1', value: 4 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'completed',
      steps: [
        { name: 'validate-input', status: 'completed', attempts: 1 },
        { name: 'persist-result', status: 'completed', attempts: 1 },
      ],
      result: { runId: 'route-1', doubledValue: 8 },
      error: null,
    });
    expect(sddDemoStore.writes).toBe(1);
  });

  it('reports a failure by code only, without transport details', async () => {
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    await post({ runId: 'route-2', value: 1 });
    const res = await post({ runId: 'route-2', value: 2 });

    expect(await res.json()).toMatchObject({
      status: 'failed',
      result: null,
      error: { code: 'IDEMPOTENCY_CONFLICT' },
    });
    expect((await post({ value: 'x' })).status).toBe(400);
  });
});
