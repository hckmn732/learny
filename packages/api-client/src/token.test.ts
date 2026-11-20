import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApiClient } from './client';

function problem401(): Response {
  return new Response(
    JSON.stringify({ title: 'Session expirée', status: 401, code: 'UNAUTHENTICATED' }),
    { status: 401, headers: { 'content-type': 'application/problem+json' } },
  );
}

describe('[SPEC-1301] token mode', () => {
  it('ajoute Authorization Bearer et omet les cookies pour les routes enregistrées', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const client = createApiClient({
      baseUrl: 'https://api.learny.example/api/v1',
      fetch: fetchMock,
      getAccessToken: () => 'native-token',
    });

    await client.apiFetch({
      method: 'GET',
      path: '/probe',
      output: z.object({ ok: z.boolean() }),
    });

    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe('https://api.learny.example/api/v1/probe');
    expect(call?.[1]?.credentials).toBe('omit');
    expect(new Headers(call?.[1]?.headers).get('authorization')).toBe('Bearer native-token');
  });

  it('rafraîchit une seule fois puis rejoue avec le nouveau jeton', async () => {
    let token = 'expired-token';
    const refreshAccessToken = vi.fn(() => {
      token = 'fresh-token';
      return Promise.resolve(token);
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(problem401())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    const client = createApiClient({
      baseUrl: '/api/v1',
      fetch: fetchMock,
      getAccessToken: () => token,
      refreshAccessToken,
    });

    await expect(
      client.apiFetch({
        method: 'GET',
        path: '/probe',
        output: z.object({ ok: z.boolean() }),
      }),
    ).resolves.toEqual({ ok: true });

    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondHeaders = fetchMock.mock.calls[1]?.[1]?.headers as Record<string, string>;
    expect(secondHeaders.Authorization).toBe('Bearer fresh-token');
  });

  it('remonte le 401 initial quand le rafraîchissement échoue', async () => {
    const refreshAccessToken = vi.fn(() => Promise.reject(new Error('session absente')));
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(problem401()));
    const client = createApiClient({
      baseUrl: '/api/v1',
      fetch: fetchMock,
      getAccessToken: () => 'expired',
      refreshAccessToken,
    });

    await expect(
      client.apiFetch({
        method: 'GET',
        path: '/probe',
        output: z.object({ ok: z.boolean() }),
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
