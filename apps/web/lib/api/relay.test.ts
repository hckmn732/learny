import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { relayToApi } from './relay';

const SECRET = 'learny-test-only-api-proxy-secret-value';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('[SPEC-1201] relay', () => {
  it('cible apps/api et remplace les en-têtes de confiance', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4011');
    vi.stubEnv('API_PROXY_SECRET', SECRET);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-request-id': 'relay-123' },
      }),
    );
    const request = new NextRequest('https://learny.example/api/v1/echo?source=web', {
      method: 'POST',
      headers: {
        host: 'learny.example',
        origin: 'https://learny.example',
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.12',
        'x-learny-proxy-secret': 'forged',
        'x-request-id': 'relay-123',
      },
      body: '{"message":"bonjour"}',
    });

    const response = await relayToApi(request);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);

    expect(url).toBeInstanceOf(URL);
    expect((url as URL).href).toBe('http://127.0.0.1:4011/api/v1/echo?source=web');
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBe(request.signal);
    expect(headers.get('x-learny-proxy-secret')).toBe(SECRET);
    expect(headers.get('x-forwarded-host')).toBe('learny.example');
    expect(headers.get('x-forwarded-proto')).toBe('https');
    expect(headers.get('x-forwarded-for')).toBe('198.51.100.12');
    expect(headers.get('origin')).toBe('https://learny.example');
    expect(await new Response(init?.body).text()).toBe('{"message":"bonjour"}');
    expect(await response.json()).toEqual({ ok: true });
  });

  it('préserve le flux, les cookies et le statut amont', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4011');
    const encoder = new TextEncoder();
    const upstream = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('data: un\n\n'));
          controller.enqueue(encoder.encode('data: deux\n\n'));
          controller.close();
        },
      }),
      {
        status: 201,
        headers: {
          'content-type': 'text/event-stream',
          'set-cookie': 'session=value; Path=/; HttpOnly; SameSite=Lax; Secure',
        },
      },
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream);
    const response = await relayToApi(
      new NextRequest('https://learny.example/api/v1/conversations/1/messages'),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.getSetCookie()).toEqual([
      'session=value; Path=/; HttpOnly; SameSite=Lax; Secure',
    ]);
    expect(await response.text()).toBe('data: un\n\ndata: deux\n\n');
  });

  it.each(['HEAD', 'OPTIONS'])('relaie %s sans corps', async (method) => {
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:4011');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    const response = await relayToApi(
      new NextRequest('https://learny.example/api/v1/health', { method }),
    );
    const init = fetchMock.mock.calls[0]?.[1];

    expect(response.status).toBe(204);
    expect(init?.method).toBe(method);
    expect(init?.body).toBeUndefined();
  });

  it('répond 502 API_UNAVAILABLE si l’API est inaccessible', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:1');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('connection refused'));
    const response = await relayToApi(
      new NextRequest('https://learny.example/api/v1/health', {
        headers: { 'x-request-id': 'relay-unavailable' },
      }),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({
      status: 502,
      code: 'API_UNAVAILABLE',
      requestId: 'relay-unavailable',
    });
  });
});
