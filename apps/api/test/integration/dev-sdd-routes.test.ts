import { afterEach, describe, expect, it, vi } from 'vitest';

import { ROUTES } from '@learny/contracts';

import { createApp } from '../../src/app';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('[SPEC-1203] dev sdd routes', () => {
  it('répond 404 quand les pages SDD sont désactivées', async () => {
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('ENABLE_SDD_PAGES', 'false');
    const response = await createApp().request('/api/v1/dev/sdd/SPEC-1203/demo');
    expect(response.status).toBe(404);
  });

  it('ne monte aucune route de démonstration en production', async () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    const response = await createApp().request('/api/v1/dev/sdd/SPEC-1203/demo');
    expect(response.status).toBe(404);
  });

  it('exige Idempotency-Key pour les créations de démonstration', async () => {
    vi.stubEnv('APP_ENV', 'test');
    vi.stubEnv('ENABLE_SDD_PAGES', 'true');
    const response = await createApp().request('/api/v1/dev/sdd/SPEC-102/create', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'sec-fetch-site': 'same-origin',
      },
      body: '{}',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(ROUTES.devSddSpec102Create.requiresIdempotencyKey).toBe(true);
  });
});
