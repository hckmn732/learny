import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineRoute, Empty } from '@learny/contracts';
import { setOriginGuard, setRateLimiter, type RateLimitRequest } from '@learny/http';
import { routeHandler } from '@learny/http/route-handler';
import { createRequestOriginGuard } from '@learny/http/security';
import { setIdentityResolver } from '@learny/http/session';

const SECRET = 'learny-test-only-api-proxy-secret-value';
const identity = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'learner@example.test',
  emailConfirmed: true,
  claims: { sub: '00000000-0000-4000-8000-000000000001' },
  transport: 'bearer' as const,
};
const mutation = defineRoute({
  id: 'test.proxyMutation',
  method: 'POST',
  path: '/api/v1/proxy-mutation',
  auth: 'user',
  output: Empty,
  successStatus: 200,
  rateLimit: 'none',
  summary: 'Route de test du relais',
  errors: [],
});

let restoreIdentity = (): void => undefined;
afterEach(() => {
  restoreIdentity();
  vi.unstubAllEnvs();
});

describe('[SPEC-1102] proxy trust', () => {
  it('accepts an application-origin mutation only behind the trusted relay (CA-3)', async () => {
    restoreIdentity = setIdentityResolver(() => Promise.resolve(identity));
    setOriginGuard(
      createRequestOriginGuard({
        API_PROXY_SECRET: SECRET,
      }),
    );
    setRateLimiter({
      consume: () =>
        Promise.resolve({ allowed: true, limit: 0, remaining: 0, retryAfterSec: null }),
    });
    const app = new Hono();
    const handler = routeHandler(mutation, () => Promise.resolve(undefined));
    app.post(mutation.path, (context) =>
      handler(context.req.raw, { params: Promise.resolve(context.req.param()) }),
    );
    const accepted = await app.request(`http://api.internal${mutation.path}`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        origin: 'https://learny.example',
        host: 'api.internal',
        'x-learny-proxy-secret': SECRET,
        'x-forwarded-host': 'learny.example',
        'x-forwarded-proto': 'https',
      },
    });
    expect(accepted.status).toBe(200);

    const refused = await app.request(`http://api.internal${mutation.path}`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        origin: 'https://learny.example',
        host: 'api.internal',
      },
    });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'ORIGIN_REJECTED' });
  });

  it('keys public-route limiting by the forwarded address behind the relay (CA-4)', async () => {
    vi.stubEnv('API_PROXY_SECRET', SECRET);
    const consumed: RateLimitRequest[] = [];
    setOriginGuard(
      createRequestOriginGuard({
        API_PROXY_SECRET: SECRET,
      }),
    );
    setRateLimiter({
      consume(request) {
        consumed.push(request);
        return Promise.resolve({ allowed: true, limit: 10, remaining: 9, retryAfterSec: null });
      },
    });
    const publicRoute = defineRoute({
      id: 'test.publicProxy',
      method: 'POST',
      path: '/api/v1/public-proxy',
      auth: 'public',
      output: Empty,
      successStatus: 200,
      summary: 'Route de test publique',
      errors: [],
    });
    const app = new Hono();
    const handler = routeHandler(publicRoute, () => Promise.resolve(undefined));
    app.post(publicRoute.path, (context) =>
      handler(context.req.raw, { params: Promise.resolve(context.req.param()) }),
    );
    const response = await app.request(`http://api.internal${publicRoute.path}`, {
      method: 'POST',
      headers: {
        origin: 'https://learny.example',
        host: 'api.internal',
        'x-learny-proxy-secret': SECRET,
        'x-forwarded-host': 'learny.example',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '198.51.100.22, 10.0.0.1',
      },
    });
    expect(response.status).toBe(200);
    expect(consumed[0]?.ip).toBe('198.51.100.22');
  });
});
