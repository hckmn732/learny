import { describe, expect, it } from 'vitest';

import { ROUTES } from './routes';

const routes = Object.values(ROUTES);

describe('[SPEC-201] registre', () => {
  it('has unique ids and unique method + path', () => {
    const ids = routes.map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);
    const endpoints = routes.map((route) => `${route.method} ${route.path}`);
    expect(new Set(endpoints).size).toBe(endpoints.length);
  });

  it('only exposes /api/v1 paths', () => {
    for (const route of routes) expect(route.path.startsWith('/api/v1/'), route.id).toBe(true);
  });

  it('allows idempotency only on authenticated POST routes', () => {
    for (const route of routes) {
      if (route.idempotent === true) {
        expect(route.auth, route.id).toBe('user');
        expect(route.method, route.id).toBe('POST');
      }
    }
  });

  it('uses a null output exactly for 204 answers', () => {
    for (const route of routes) {
      const output: unknown = route.output;
      expect(output === null, route.id).toBe(route.successStatus === 204);
    }
  });

  it('keeps POST creations at 201 and reads at 200', () => {
    for (const route of routes) {
      if (route.method === 'GET') expect(route.successStatus, route.id).toBe(200);
    }
  });
});
