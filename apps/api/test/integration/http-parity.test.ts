import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { devEcho as devEchoRoute } from '@learny/contracts';
import { devOnly, handler } from '@learny/http';
import {
  getOriginGuard,
  getRateLimiter,
  noopOriginGuard,
  noopRateLimiter,
  setOriginGuard,
  setRateLimiter,
  setSessionResolver,
  type OriginGuard,
  type RateLimiter,
  type SessionResolver,
} from '@learny/http';
import { devEcho, resetDevEchoCounter } from '@learny/services';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

import { honoRoute } from './hono-route';

const nextEcho = honoRoute('/api/v1/dev/sdd/echo', 'POST');

const NO_SEGMENT = { params: Promise.resolve({}) };
const REQUEST_ID = 'http-parity-1234';
const enable = process.env.ENABLE_SDD_PAGES;
const appEnv = process.env.APP_ENV;

function request(body: unknown, key?: string): Request {
  return new Request('http://127.0.0.1/api/v1/dev/sdd/echo', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-request-id': REQUEST_ID,
      ...(key === undefined ? {} : { 'idempotency-key': key }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function describeResponse(response: Response) {
  const body = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    body,
    contentType: response.headers.get('content-type'),
    requestId: response.headers.get('x-request-id'),
    cacheControl: response.headers.get('cache-control'),
    hasServerTiming: response.headers.has('server-timing'),
    bodyRequestId: body.requestId,
  };
}

let session: TestSession;
let restoreSession: (() => void) | undefined;
let previousRateLimiter: RateLimiter;
let previousOriginGuard: OriginGuard;

beforeEach(async () => {
  process.env.ENABLE_SDD_PAGES = 'true';
  process.env.APP_ENV = 'test';
  session = await createTestSession();
  const resolver: SessionResolver = () =>
    Promise.resolve({
      userId: session.userId,
      email: session.email,
      emailConfirmed: true,
    });
  restoreSession = setSessionResolver(resolver);
  previousRateLimiter = getRateLimiter();
  previousOriginGuard = getOriginGuard();
  setRateLimiter(noopRateLimiter);
  setOriginGuard(noopOriginGuard);
});

afterEach(async () => {
  restoreSession?.();
  setRateLimiter(previousRateLimiter);
  setOriginGuard(previousOriginGuard);
  if (enable === undefined) delete process.env.ENABLE_SDD_PAGES;
  else process.env.ENABLE_SDD_PAGES = enable;
  if (appEnv === undefined) delete process.env.APP_ENV;
  else process.env.APP_ENV = appEnv;
  await deleteTestSession(session);
});

describe('[SPEC-1003] parity', () => {
  it('produit les mêmes réponses avec @learny/http direct et l’adaptateur Next (CA-2, CA-3)', async () => {
    const direct = devOnly(
      handler(devEchoRoute, ({ ctx, body }) => Promise.resolve(devEcho(ctx, body))),
    );

    const cases = [
      { name: 'valide', body: { message: 'bonjour' }, key: randomUUID() },
      { name: 'invalide', body: { message: '' }, key: randomUUID() },
      { name: 'clé absente', body: { message: 'bonjour' }, key: undefined },
    ];

    for (const item of cases) {
      resetDevEchoCounter();
      const directResponse = await direct(request(item.body, item.key ?? undefined), NO_SEGMENT);
      resetDevEchoCounter();
      const nextResponse = await nextEcho(
        request(item.body, item.key === undefined ? undefined : randomUUID()),
        NO_SEGMENT,
      );
      expect(await describeResponse(directResponse), `${item.name} : transport direct`).toEqual(
        await describeResponse(nextResponse),
      );
    }
  });
});
