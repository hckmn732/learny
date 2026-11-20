import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defineRoute, HealthResponse } from '@learny/contracts';
import { noopOriginGuard, noopRateLimiter, setOriginGuard, setRateLimiter } from '@learny/http';
import { routeHandler } from '@learny/http/route-handler';
import { setFreshIdentityResolver, setIdentityResolver } from '@learny/http/session';

const identity = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'learner@example.test',
  emailConfirmed: true,
  claims: { sub: '00000000-0000-4000-8000-000000000001' },
  transport: 'bearer' as const,
};
const me = defineRoute({
  id: 'test.me',
  method: 'GET',
  path: '/api/v1/me',
  auth: 'user',
  output: HealthResponse,
  successStatus: 200,
  summary: 'Route de test',
  errors: [],
});
const sensitive = defineRoute({
  ...me,
  id: 'test.sensitive',
  method: 'POST',
  path: '/api/v1/me/sensitive',
  freshAuth: true,
  output: HealthResponse,
});

let restoreIdentity = (): void => undefined;
let restoreFresh = (): void => undefined;

beforeEach(() => {
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
});

afterEach(() => {
  restoreIdentity();
  restoreFresh();
  vi.restoreAllMocks();
});

function appFor(route: typeof me) {
  const app = new Hono();
  const handler = routeHandler(route, ({ ctx }) =>
    Promise.resolve({
      status: 'ok' as const,
      version: ctx.userId ?? 'anonymous',
      commit: 'test',
      database: 'ok' as const,
      components: { database: 'ok' as const, build: 'ok' as const },
    }),
  );
  app.on(route.method, route.path, (context) =>
    handler(context.req.raw, { params: Promise.resolve({}) }),
  );
  return app;
}

describe('[SPEC-1102] auth transports', () => {
  it('returns the same DTO for cookie and Bearer identities (CA-1)', async () => {
    restoreIdentity = setIdentityResolver((request) =>
      Promise.resolve({
        ...identity,
        transport: request.headers.has('authorization') ? ('bearer' as const) : ('cookie' as const),
      }),
    );
    const app = appFor(me);

    const cookie = await app.request(me.path, { headers: { cookie: 'session=cookie' } });
    const bearer = await app.request(me.path, {
      headers: { authorization: 'Bearer locally.verified.token' },
    });
    expect(await bearer.json()).toEqual(await cookie.json());
  });

  it('calls fresh Auth exactly once for a sensitive Bearer route (CA-2)', async () => {
    restoreIdentity = setIdentityResolver(() => Promise.resolve(identity));
    const fresh = vi.fn(() => Promise.resolve(identity));
    restoreFresh = setFreshIdentityResolver(fresh);

    const response = await appFor(sensitive).request(sensitive.path, {
      method: 'POST',
      headers: { authorization: 'Bearer locally.verified.token' },
    });
    expect(response.status).toBe(200);
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('refuses a deleted account even when its token is locally valid (EF-4)', async () => {
    restoreIdentity = setIdentityResolver(() => Promise.resolve(identity));
    restoreFresh = setFreshIdentityResolver(() => Promise.resolve(null));

    const response = await appFor(sensitive).request(sensitive.path, {
      method: 'POST',
      headers: { authorization: 'Bearer locally.verified.token' },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
