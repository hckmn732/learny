import { createHash } from 'node:crypto';

import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { relayToApi } from '../../../web/lib/api/relay';
import { createApp } from '../../src/app';

type RelayRequest = Parameters<typeof relayToApi>[0];

function request(path: string, init: RequestInit = {}): RelayRequest {
  const target = new URL(path, 'https://learny.example');
  const value = new Request(target, init);
  Object.defineProperty(value, 'nextUrl', { value: target });
  return value as RelayRequest;
}

function serveWith(app: Hono): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' || input instanceof URL ? input : input.url;
    return app.request(url, init);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('[SPEC-1201] web relay', () => {
  it('sert X-Served-By et conserve les réponses de l’API réelle', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:3001');
    serveWith(createApp());

    const response = await relayToApi(request('/api/v1/health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-served-by')).toBe('learny-api');
    expect(await response.json()).toMatchObject({ status: 'degraded' });
  });

  it('transmet le SSE par fragments et les cookies sans les recomposer', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:3001');
    const api = new Hono()
      .get('/api/v1/stream', () => {
        const encoder = new TextEncoder();
        let chunk = 0;
        return new Response(
          new ReadableStream({
            pull(controller) {
              chunk += 1;
              if (chunk <= 2) {
                controller.enqueue(encoder.encode(`data: ${String(chunk)}\n\n`));
              } else {
                controller.close();
              }
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        );
      })
      .post('/api/v1/auth/sign-in', (context) => {
        context.header('set-cookie', 'session=value; Path=/; HttpOnly; SameSite=Lax; Secure');
        return context.json({ ok: true });
      });
    serveWith(api);

    const stream = await relayToApi(request('/api/v1/stream'));
    const reader = stream.body?.getReader();
    const fragments: string[] = [];
    while (reader !== undefined) {
      const value = await reader.read();
      if (value.done) break;
      fragments.push(new TextDecoder().decode(value.value));
    }
    const auth = await relayToApi(request('/api/v1/auth/sign-in', { method: 'POST', body: '{}' }));

    expect(fragments).toEqual(['data: 1\n\n', 'data: 2\n\n']);
    expect(auth.headers.getSetCookie()).toEqual([
      'session=value; Path=/; HttpOnly; SameSite=Lax; Secure',
    ]);
  });

  it('conserve le corps brut et la signature Stripe', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:3001');
    const api = new Hono().post('/api/v1/webhooks/stripe', async (context) => {
      const body = await context.req.text();
      const signature = createHash('sha256').update(body).digest('hex');
      if (context.req.header('stripe-signature') !== signature) {
        return context.json({ code: 'INVALID_SIGNATURE', status: 400 }, 400);
      }
      return context.json({ received: true });
    });
    serveWith(api);
    const payload = '{"id":"evt_mock","type":"invoice.payment_succeeded"}';
    const validSignature = createHash('sha256').update(payload).digest('hex');

    const accepted = await relayToApi(
      request('/api/v1/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': validSignature },
        body: payload,
      }),
    );
    const refused = await relayToApi(
      request('/api/v1/webhooks/stripe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': validSignature },
        body: `${payload}\n`,
      }),
    );

    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ received: true });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({ code: 'INVALID_SIGNATURE' });
  });

  it('répond 502 si apps/api n’est plus joignable', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:3001');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('connection refused'));
    const response = await relayToApi(request('/api/v1/health'));

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'API_UNAVAILABLE', status: 502 });
  });
});
