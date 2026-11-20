import { afterEach, describe, expect, it, vi } from 'vitest';

import { nextSpecial } from '@learny/api-routes/next';
import { functions } from '@learny/jobs';

import { createApp, getApiHealth } from '../../src/app';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('[SPEC-1101] health and inngest', () => {
  it('expose la santé du processus et des contrôles sûrs (CA-5)', async () => {
    const app = createApp({
      env: { APP_VERSION: '1.2.3', GIT_COMMIT: 'abcdef1' },
    });
    const response = await app.request('/health');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', version: '1.2.3', commit: 'abcdef1' });
    expect(getApiHealth({ APP_VERSION: 'unsafe value', GIT_COMMIT: 'bad' })).toEqual({
      status: 'ok',
      version: 'dev',
      commit: 'unknown',
    });
  });

  it('garde un corps health identique à Next', async () => {
    const request = new Request('http://localhost/api/v1/health');
    const [next, hono] = await Promise.all([
      nextSpecial('health')(request.clone()),
      createApp().request(request),
    ]);
    expect(hono.status).toBe(next.status);
    expect(await hono.json()).toEqual(await next.json());
  });

  it('enregistre exactement les fonctions Inngest du web (CA-4)', async () => {
    vi.stubEnv('INNGEST_DEV', '1');
    const hono = await createApp().request('/api/inngest');
    const next = await nextSpecial('inngest')(new Request('http://localhost/api/inngest'));
    const honoBody = (await hono.json()) as { function_count: number; functions?: unknown[] };
    const nextBody = (await next.json()) as { function_count: number; functions?: unknown[] };
    expect(hono.status).toBe(200);
    expect(hono.status).toBe(next.status);
    expect(honoBody.function_count).toBe(functions.length);
    expect(honoBody.function_count).toBe(nextBody.function_count);
  });
});
