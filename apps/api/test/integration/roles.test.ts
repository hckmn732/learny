import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseServerEnv } from '@learny/config/server';
import { functions } from '@learny/jobs';

import { createApp } from '../../src/app';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('[SPEC-1103] api roles', () => {
  it.each([
    ['all', 200, 200],
    ['api', 200, 404],
    ['jobs', 404, 200],
  ] as const)('role %s serves only its route subsets', async (role, apiStatus, jobsStatus) => {
    vi.stubEnv('INNGEST_DEV', '1');
    const app = createApp({ role });

    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/api/v1/health')).status).toBe(apiStatus);
    expect((await app.request('/api/inngest')).status).toBe(jobsStatus);
  });

  it('keeps the complete Inngest registry in jobs and all roles', async () => {
    vi.stubEnv('INNGEST_DEV', '1');
    for (const role of ['all', 'jobs'] as const) {
      const response = await createApp({ role }).request('/api/inngest');
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ function_count: functions.length });
    }
  });

  it('defaults to all and validates the role at startup', () => {
    expect(parseServerEnv({ APP_ENV: 'test' }).LEARNY_API_ROLE).toBe('all');
    expect(() => parseServerEnv({ APP_ENV: 'test', LEARNY_API_ROLE: 'invalid' })).toThrow(
      'LEARNY_API_ROLE invalide : valeurs permises : all, api, jobs.',
    );
  });
});
