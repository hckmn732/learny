// SPEC-1002 §12 — createApiClient (EF-1): base URL, header provider, problem+json conversion,
// the single 401 replay (CL-3) and the explicit error when no transport exists (CL-2).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AppError, isAppError } from '@learny/core';

import { createApiClient } from './client';
import { devEcho } from './test-routes';

const Item = z.object({ id: z.string(), title: z.string() });

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function problemResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

const HEALTH_BODY = {
  status: 'ok',
  version: 'dev',
  commit: 'unknown',
  database: 'ok',
  components: { database: 'ok', build: 'not_configured' },
};

async function caught(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (isAppError(error)) return error;
    throw error;
  }
  throw new Error('expected an AppError');
}

describe('[SPEC-1002] api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applique le baseUrl du client aux chemins sous la base (EF-1, CA-4)', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ id: 'a1', title: 'x' })),
    );
    const client = createApiClient({ baseUrl: '/api/v2', fetch: fetchMock });
    await client.apiFetch({ method: 'GET', path: '/items', output: Item });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v2/items');
  });

  it('garde /api/v1 par défaut et envoie les chemins des routes tels quels (EF-1)', async () => {
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(HEALTH_BODY)));
    const client = createApiClient({ baseUrl: '/api/v1', fetch: fetchMock });
    // Les routes enregistrées portent leur chemin complet : pas de préfixe supplémentaire.
    await client.api.health({}, { fetch: fetchMock });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/health');
    // La base du client s'applique aux chemins sous la base (famille apiFetch).
    const fetchItems = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ id: 'a1', title: 'x' })),
    );
    await client.apiFetch({ method: 'GET', path: '/items', output: Item, fetch: fetchItems });
    expect(fetchItems.mock.calls[0]?.[0]).toBe('/api/v1/items');
  });

  it('fusionne les en-têtes du fournisseur, y compris asynchrones (EF-1, CA-4)', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse({ id: 'a1', title: 'x' })),
    );
    const client = createApiClient({
      baseUrl: '/api/v1',
      fetch: fetchMock,
      headers: () => Promise.resolve({ 'X-Session': 'session-1' }),
    });
    await client.apiFetch({ method: 'GET', path: '/items', output: Item });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Accept: 'application/json',
      'X-Session': 'session-1',
    });
  });

  it('convertit problem+json en AppError depuis un client paramétré (EF-1)', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        problemResponse(
          {
            type: 'about:blank',
            title: 'Non autorisé',
            status: 401,
            detail: 'Session expirée.',
            code: 'UNAUTHORIZED',
            requestId: 'req-1002',
          },
          401,
        ),
      ),
    );
    const client = createApiClient({ baseUrl: '/api/v1', fetch: fetchMock });
    const error = await caught(client.apiFetch({ method: 'GET', path: '/items', output: Item }));
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.detail).toBe('Session expirée.');
    expect(error.status).toBe(401);
    expect(error.requestId).toBe('req-1002');
  });

  it('rejoue une seule fois un 401 quand onUnauthorized répond true, avec de nouveaux en-têtes (CL-3, CA-4)', async () => {
    let session = 'session-1';
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(problemResponse({ title: 'Non autorisé', status: 401 }, 401))
      .mockResolvedValueOnce(jsonResponse({ id: 'a1', title: 'Notion' }));
    const client = createApiClient({
      baseUrl: '/api/v1',
      fetch: fetchMock,
      headers: () => ({ 'X-Session': session }),
      onUnauthorized: () => {
        session = 'session-2';
        return Promise.resolve(true);
      },
    });
    const result = await client.apiFetch({ method: 'GET', path: '/items', output: Item });
    expect(result).toEqual({ id: 'a1', title: 'Notion' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    const second = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(first['X-Session']).toBe('session-1');
    expect(second['X-Session']).toBe('session-2');
  });

  it('lève l’erreur 401 telle quelle quand onUnauthorized répond false (CL-3)', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        problemResponse({ title: 'Non autorisé', status: 401, code: 'UNAUTHORIZED' }, 401),
      ),
    );
    const onUnauthorized = vi.fn(() => Promise.resolve(false));
    const client = createApiClient({ baseUrl: '/api/v1', fetch: fetchMock, onUnauthorized });
    const error = await caught(client.apiFetch({ method: 'GET', path: '/items', output: Item }));
    expect(error.status).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne rejoue pas un second 401 (CL-3 : une seule relance)', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        problemResponse({ title: 'Non autorisé', status: 401, code: 'UNAUTHORIZED' }, 401),
      ),
    );
    const client = createApiClient({
      baseUrl: '/api/v1',
      fetch: fetchMock,
      onUnauthorized: () => Promise.resolve(true),
    });
    const error = await caught(client.apiFetch({ method: 'GET', path: '/items', output: Item }));
    expect(error.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejoue un 401 d’une route idempotente avec la même Idempotency-Key (CL-3)', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(problemResponse({ title: 'Non autorisé', status: 401 }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'hi', receivedAt: 'x', counter: 1 }, 201));
    const client = createApiClient({
      baseUrl: '/api/v1',
      fetch: fetchMock,
      onUnauthorized: () => Promise.resolve(true),
    });
    const result = await client.callApi(devEcho, { body: { message: 'hi' } });
    expect(result.counter).toBe(1);
    const keys = fetchMock.mock.calls.map(
      (call) => (call[1]?.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('lève une erreur explicite quand fetch est indisponible (CL-2)', async () => {
    vi.stubGlobal('fetch', undefined);
    const client = createApiClient({ baseUrl: '/api/v1' });
    const error = await caught(client.apiFetch({ method: 'GET', path: '/items', output: Item }));
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.detail).toContain('fetch indisponible');
  });
});
