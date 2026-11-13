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

  it('allows idempotency only on authenticated write routes', () => {
    for (const route of routes) {
      if (route.idempotent === true) {
        expect(route.auth, route.id).toBe('user');
        expect(['POST', 'PUT', 'PATCH'], route.id).toContain(route.method);
      }
    }
  });

  it('uses a null output exactly for 204 and 302 answers', () => {
    for (const route of routes) {
      // SPEC-610: the tutor answer is a 200 SSE stream, described by no JSON output schema.
      if (route.id === 'conversations.messages') continue;
      const output: unknown = route.output;
      expect(output === null, route.id).toBe(
        route.successStatus === 204 || route.successStatus === 302,
      );
    }
  });

  it('keeps reads at 200, except the redirecting routes of the authentication flow (302)', () => {
    for (const route of routes) {
      if (route.method === 'GET') {
        expect([200, 302], route.id).toContain(route.successStatus);
      }
    }
  });
});
