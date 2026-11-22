import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));

import { serverApi } from './server-client';

describe('[SPEC-1202] server api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch);
    vi.stubEnv('API_INTERNAL_URL', 'http://api.internal:3001');
    vi.stubEnv('API_PROXY_SECRET', 'test-only-proxy-secret-with-at-least-32-bytes');
    mocks.headers.mockResolvedValue(
      new Headers({
        cookie: 'session=abc',
        host: 'learny.test',
        'x-forwarded-for': '203.0.113.8',
        'x-forwarded-proto': 'https',
        'x-request-id': 'page-request-id',
      }),
    );
    mocks.fetch.mockReset();
  });

  it('transmet les en-têtes de la requête de page à l’API interne', async () => {
    mocks.fetch.mockResolvedValue(
      Response.json({ ok: true }, { headers: { 'x-request-id': 'page-request-id' } }),
    );
    const client = await serverApi();

    await client.apiFetch({
      method: 'GET',
      path: '/probe',
      output: { safeParse: (value: unknown) => ({ success: true, data: value }) },
    });

    const call = mocks.fetch.mock.calls[0] as [unknown, RequestInit] | undefined;
    expect(call?.[0]).toBe('http://api.internal:3001/api/v1/probe');
    const sent = new Headers(call?.[1].headers);
    expect(Object.fromEntries(sent)).toEqual(
      expect.objectContaining({
        cookie: 'session=abc',
        'x-learny-proxy-secret': 'test-only-proxy-secret-with-at-least-32-bytes',
        'x-forwarded-for': '203.0.113.8',
        'x-forwarded-host': 'learny.test',
        'x-forwarded-proto': 'https',
        'x-request-id': 'page-request-id',
      }),
    );
  });

  it('prouve l’origine d’une mutation rendue côté serveur', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ ok: true }));
    const client = await serverApi();

    await client.apiFetch({
      method: 'POST',
      path: '/probe',
      body: {},
      output: { safeParse: (value: unknown) => ({ success: true, data: value }) },
    });

    const call = mocks.fetch.mock.calls[0] as [unknown, RequestInit] | undefined;
    const sent = new Headers(call?.[1].headers);
    // No browser header on a render: the page asserts its own origin from the forwarded host.
    expect(sent.get('origin')).toBe('https://learny.test');
  });

  it('transmet l’origine et le Sec-Fetch-Site du navigateur quand ils existent', async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        host: 'learny.test',
        origin: 'https://app.learny.test',
        'sec-fetch-site': 'same-origin',
      }),
    );
    mocks.fetch.mockResolvedValue(Response.json({ ok: true }));
    const client = await serverApi();

    await client.apiFetch({
      method: 'POST',
      path: '/probe',
      body: {},
      output: { safeParse: (value: unknown) => ({ success: true, data: value }) },
    });

    const call = mocks.fetch.mock.calls[0] as [unknown, RequestInit] | undefined;
    const sent = new Headers(call?.[1].headers);
    expect(sent.get('origin')).toBe('https://app.learny.test');
    expect(sent.get('sec-fetch-site')).toBe('same-origin');
  });

  it('propage le requestId des erreurs problem+json', async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          title: 'Indisponible',
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
          requestId: 'api-request-id',
        }),
        {
          status: 503,
          headers: { 'content-type': 'application/problem+json' },
        },
      ),
    );
    const client = await serverApi();

    await expect(
      client.apiFetch({
        method: 'GET',
        path: '/probe',
        output: { safeParse: (value: unknown) => ({ success: true, data: value }) },
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', requestId: 'api-request-id' });
  });
});
