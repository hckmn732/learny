import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineRoute } from '@learny/contracts';

import { configureHttp, getHttpReporter } from './configure';
import { handler } from './handler';
import { getOriginGuard, noopOriginGuard, type OriginGuard } from './origin';
import { getRateLimiter, noopRateLimiter, type RateLimiter } from './rate-limit';
import type { HandlerArgs } from './route-handler';

const echoRoute = defineRoute({
  id: 'test.httpEcho',
  method: 'POST',
  path: '/api/v1/test/http-echo',
  auth: 'public',
  body: z.object({ message: z.string().min(1) }),
  output: z.object({ message: z.string() }),
  successStatus: 200,
  summary: 'Route de test du wrapper HTTP.',
  errors: ['VALIDATION_FAILED'],
});

const segment = { params: Promise.resolve({}) };

describe('[SPEC-1003] framework-free handler', () => {
  it('importe un paquet sans enregistrer de protection avant configureHttp (CA-4)', () => {
    expect(getRateLimiter()).toBe(noopRateLimiter);
    expect(getOriginGuard()).toBe(noopOriginGuard);
    expect(getHttpReporter()).toMatchObject({ enabled: false });
  });

  it('configure explicitement les protections et remplace une configuration précédente (CA-4)', () => {
    const firstRateLimiter: RateLimiter = {
      consume: vi.fn(() =>
        Promise.resolve({ allowed: true, limit: 1, remaining: 1, retryAfterSec: null }),
      ),
    };
    const secondRateLimiter: RateLimiter = {
      consume: vi.fn(() =>
        Promise.resolve({ allowed: true, limit: 2, remaining: 2, retryAfterSec: null }),
      ),
    };
    const originGuard: OriginGuard = { check: vi.fn() };
    const boot = vi.fn();

    configureHttp({ rateLimiter: firstRateLimiter, originGuard, onBoot: boot });
    configureHttp({ rateLimiter: secondRateLimiter });

    expect(getRateLimiter()).toBe(secondRateLimiter);
    expect(getOriginGuard()).toBe(originGuard);
    expect(boot).toHaveBeenCalledOnce();

    configureHttp({ rateLimiter: noopRateLimiter, originGuard: noopOriginGuard });
  });

  it('traite un Request standard hors de tout framework (CA-3)', async () => {
    const service = vi.fn((args: HandlerArgs<typeof echoRoute>) =>
      Promise.resolve({ message: args.body.message }),
    );
    const wrapped = handler(echoRoute, service);
    const response = await wrapped(
      new Request('http://127.0.0.1/api/v1/test/http-echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': 'http-test-1234' },
        body: JSON.stringify({ message: 'bonjour' }),
      }),
      segment,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('x-request-id')).toBe('http-test-1234');
    await expect(response.json()).resolves.toEqual({ message: 'bonjour' });
    expect(service).toHaveBeenCalledOnce();
  });

  it('convertit une entrée invalide en problem+json avec le même requestId (CA-3)', async () => {
    const service = vi.fn(() => Promise.resolve({ message: 'non appelé' }));
    const response = await handler(echoRoute, service)(
      new Request('http://127.0.0.1/api/v1/test/http-echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': 'http-test-5678' },
        body: JSON.stringify({ message: '' }),
      }),
      segment,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(response.headers.get('x-request-id')).toBe('http-test-5678');
    await expect(response.json()).resolves.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 400,
      requestId: 'http-test-5678',
    });
    expect(service).not.toHaveBeenCalled();
  });
});
