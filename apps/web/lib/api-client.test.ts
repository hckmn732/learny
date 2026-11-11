import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AppError } from '@learny/core';

import { apiFetch } from './api-client';

const Item = z.object({ id: z.string(), title: z.string() });

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function mockFetch(response: Response | Error) {
  return vi.fn<typeof fetch>(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
}

async function caught(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError');
}

describe('[SPEC-006] API client', () => {
  it('decodes a 200 response with the output schema and sends a typed JSON request', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 'a1', title: 'Notion' }));
    const result = await apiFetch({
      method: 'POST',
      path: '/items',
      body: { title: 'Notion' },
      input: z.object({ title: z.string().min(1) }),
      output: Item,
      fetch: fetchMock,
    });

    expect(result).toEqual({ id: 'a1', title: 'Notion' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/items');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('same-origin');
    expect(init?.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    expect(init?.body).toBe('{"title":"Notion"}');
  });

  it('sends no Content-Type and no body without a JSON body', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 'a1', title: 'Notion' }));
    await apiFetch({ method: 'GET', path: '/items/a1', output: Item, fetch: fetchMock });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({ Accept: 'application/json' });
    expect(init?.body).toBeUndefined();
  });

  it('returns a typed empty value for 204 without decoding JSON', async () => {
    const response = new Response(null, { status: 204 });
    const json = vi.spyOn(response, 'json');
    await expect(
      apiFetch({
        method: 'DELETE',
        path: '/items/a1',
        output: z.undefined(),
        fetch: mockFetch(response),
      }),
    ).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('maps problem+json to AppError, keeping the business code and the requestId', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Module verrouillé',
      status: 422,
      detail: 'Terminez le module précédent.',
      code: 'MODULE_LOCKED',
      requestId: 'req-123',
      errors: [{ path: 'moduleId', message: 'verrouillé' }],
    };
    const error = await caught(
      apiFetch({
        method: 'GET',
        path: '/modules/m1',
        output: Item,
        fetch: mockFetch(
          new Response(JSON.stringify(problem), {
            status: 422,
            headers: { 'content-type': 'application/problem+json' },
          }),
        ),
      }),
    );
    expect(error.code).toBe('MODULE_LOCKED');
    expect(error.detail).toBe('Terminez le module précédent.');
    expect(error.status).toBe(422);
    expect(error.requestId).toBe('req-123');
    expect(error.errors).toEqual([{ path: 'moduleId', message: 'verrouillé' }]);
  });

  it('falls back to the x-request-id header and to a code derived from the status', async () => {
    const error = await caught(
      apiFetch({
        method: 'GET',
        path: '/items/zz',
        output: Item,
        fetch: mockFetch(
          new Response(JSON.stringify({ title: 'Introuvable', status: 404 }), {
            status: 404,
            headers: { 'content-type': 'application/problem+json', 'x-request-id': 'req-h1' },
          }),
        ),
      }),
    );
    expect(error.code).toBe('NOT_FOUND');
    expect(error.requestId).toBe('req-h1');
  });

  it('turns an invalid JSON body into a controlled AppError with the requestId', async () => {
    const error = await caught(
      apiFetch({
        method: 'GET',
        path: '/items/a1',
        output: Item,
        fetch: mockFetch(
          new Response('{not json', {
            status: 200,
            headers: { 'content-type': 'application/json', 'x-request-id': 'req-bad' },
          }),
        ),
      }),
    );
    expect(error.code).toBe('INVALID_RESPONSE');
    expect(error.requestId).toBe('req-bad');
  });

  it('rejects a success body that does not match the output schema', async () => {
    const error = await caught(
      apiFetch({
        method: 'GET',
        path: '/items/a1',
        output: Item,
        fetch: mockFetch(jsonResponse({ id: 1 })),
      }),
    );
    expect(error.code).toBe('INVALID_RESPONSE');
  });

  it('turns a network failure into NETWORK_ERROR without retrying the mutation', async () => {
    const fetchMock = mockFetch(new TypeError('Failed to fetch'));
    const error = await caught(
      apiFetch({
        method: 'POST',
        path: '/items',
        body: { title: 'x' },
        output: Item,
        fetch: fetchMock,
      }),
    );
    expect(error.code).toBe('NETWORK_ERROR');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries a mutation answered by a server error', async () => {
    const fetchMock = mockFetch(jsonResponse({ oops: true }, 503, { 'x-request-id': 'req-503' }));
    const error = await caught(
      apiFetch({
        method: 'POST',
        path: '/items',
        body: { title: 'x' },
        output: Item,
        fetch: fetchMock,
      }),
    );
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
    expect(error.requestId).toBe('req-503');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates the body before sending anything', async () => {
    const fetchMock = mockFetch(jsonResponse({}));
    const error = await caught(
      apiFetch({
        method: 'POST',
        path: '/items',
        body: { title: '' },
        input: z.object({ title: z.string().min(1) }),
        output: Item,
        fetch: fetchMock,
      }),
    );
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.errors?.[0]?.path).toBe('title');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['items', '//evil.example/x', '/../secret', 'https://evil.example/'])(
    'refuses the path %s outside /api/v1',
    async (path) => {
      const fetchMock = mockFetch(jsonResponse({}));
      const error = await caught(apiFetch({ method: 'GET', path, output: Item, fetch: fetchMock }));
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
