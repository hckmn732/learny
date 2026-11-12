import { describe, expect, it, vi } from 'vitest';

import { ROUTES } from '@learny/contracts';

import { ApiError, api, callApi } from './api-client';

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function problem(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', 'x-request-id': 'header-req-1234' },
  });
}

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected an ApiError');
}

describe('[SPEC-201] client typé', () => {
  it('returns the typed output and builds the query string', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        json({ items: [{ id: 'item-57', label: 'item-57', position: 57 }], nextCursor: null }, 200),
      ),
    );
    const page = await api.devItems({ query: { limit: 5, cursor: 'a b' } }, { fetch: fetchMock });
    expect(page.items[0]?.position).toBe(57);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/dev/sdd/items?limit=5&cursor=a+b');
    expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin' });
  });

  it('throws an ApiError with status, code, detail, requestId and errors', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        problem(
          {
            type: 'https://learny.app/errors/validation-failed',
            title: 'Données invalides',
            status: 400,
            detail: 'Les données envoyées sont invalides.',
            code: 'VALIDATION_FAILED',
            requestId: 'body-req-12345',
            errors: [{ path: 'body.message', message: 'Requis' }],
          },
          400,
        ),
      ),
    );
    const error = await caught(api.devEcho({ body: { message: '' } }, { fetch: fetchMock }));
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      detail: 'Les données envoyées sont invalides.',
      requestId: 'body-req-12345',
      errors: [{ path: 'body.message', message: 'Requis' }],
    });
  });

  it('answers 204 with undefined', async () => {
    const route = { ...ROUTES.devItems, output: null, successStatus: 204 as const };
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    await expect(callApi(route, { query: {} }, { fetch: fetchMock })).resolves.toBeUndefined();
  });

  it('refuses an answer that breaks the contract', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(json({ items: 'nope' }, 200)));
    expect(await caught(api.devItems({ query: {} }, { fetch: fetchMock }))).toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('generates an Idempotency-Key for an idempotent route and sends the JSON body', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(json({ message: 'hi', receivedAt: 'x', counter: 1 }, 201)),
    );
    await api.devEcho({ body: { message: 'hi' } }, { fetch: fetchMock });
    const init = fetchMock.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['Content-Type']).toBe('application/json');
    expect(init?.body).toBe('{"message":"hi"}');
  });

  it('does not add a key on a non idempotent route', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(json({ items: [], nextCursor: null }, 200)),
    );
    await api.devItems({ query: {} }, { fetch: fetchMock });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });

  it('retries a network failure with the same key, then succeeds (EF-9)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(json({ message: 'hi', receivedAt: 'x', counter: 1 }, 201));
    const result = await api.devEcho({ body: { message: 'hi' } }, { fetch: fetchMock });
    expect(result.counter).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keys = fetchMock.mock.calls.map(
      (call) => (call[1]?.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it('reports NETWORK_ERROR with status 0 once the retries are exhausted', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('down')));
    const error = await caught(api.devEcho({ body: { message: 'hi' } }, { fetch: fetchMock }));
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never retries a read on a network failure', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.reject(new TypeError('down')));
    await caught(api.devItems({ query: {} }, { fetch: fetchMock }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a caller-provided idempotency key', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(json({ message: 'hi', receivedAt: 'x', counter: 1 }, 201)),
    );
    await api.devEcho(
      { body: { message: 'hi' } },
      { fetch: fetchMock, idempotencyKey: 'my-fixed-key-1' },
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('my-fixed-key-1');
  });
});
