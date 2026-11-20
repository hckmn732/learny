import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ROUTE_IMPLEMENTATIONS, SPECIAL_HANDLERS } from '@learny/api-routes';
import { ROUTES } from '@learny/contracts';
import { noopOriginGuard, noopRateLimiter, setOriginGuard, setRateLimiter } from '@learny/http';
import { setSessionResolver } from '@learny/http/session';

import { createApp } from '../../src/app';

let restoreSession: () => void = () => undefined;

beforeEach(() => {
  vi.stubEnv('APP_ENV', 'test');
  vi.stubEnv('ENABLE_SDD_PAGES', 'true');
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
  restoreSession = setSessionResolver(() => Promise.resolve(null));
});

afterEach(() => {
  restoreSession();
  vi.unstubAllEnvs();
});

function concrete(path: string): string {
  return path
    .replaceAll(':fid', '00000000-0000-4000-8000-000000000001')
    .replaceAll(/:([A-Za-z][A-Za-z0-9]*)/g, 'placeholder');
}

describe('[SPEC-1101] http coverage', () => {
  it('sert chaque route standard et spéciale sans 404 ni 405 (CA-1)', async () => {
    const app = createApp();
    const failures: string[] = [];
    const standard = Object.keys(ROUTE_IMPLEMENTATIONS) as Array<
      keyof typeof ROUTE_IMPLEMENTATIONS
    >;
    for (const id of standard) {
      const route = ROUTES[id];
      const response = await app.request(concrete(route.path), {
        method: route.method,
        headers: { 'content-type': 'application/json' },
      });
      if (response.status === 404 || response.status === 405) {
        failures.push(`${route.method} ${route.path} -> ${String(response.status)}`);
      }
    }
    for (const entry of Object.values(SPECIAL_HANDLERS)) {
      const methods = entry.method === 'ALL' ? ['GET', 'POST', 'PUT'] : [entry.method];
      for (const method of methods) {
        const response = await app.request(concrete(entry.path), {
          method,
          headers: { 'content-type': 'application/json' },
        });
        if (response.status === 404 || response.status === 405) {
          failures.push(`${method} ${entry.path} -> ${String(response.status)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('répond 401 problem+json à une route utilisateur sans session', async () => {
    const response = await createApp().request('/api/v1/me', { method: 'GET' });
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(await response.json()).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });

  it('conserve les réponses 404 et 405 du transport', async () => {
    const app = createApp();
    const missing = await app.request('/api/v1/inconnue');
    const wrongMethod = await app.request('/api/v1/health', { method: 'POST' });

    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toContain('GET');
    expect(await wrongMethod.json()).toMatchObject({ status: 405 });
  });

  it('refuse un corps JSON supérieur à 1 Mo comme Next', async () => {
    const response = await createApp().request('/api/v1/auth/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.test', password: 'x'.repeat(1024 * 1024) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });
});
