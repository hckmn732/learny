// Vitest [SPEC-3003] — client of the API (EF-2, EF-3; CA-1, CA-2; BR-PLA-08).
//
// The whole contract is replayed against an injected transport: headers of a native client (no
// cookie, no `Origin`), single 401 renewal, single replay with the same idempotency key, no retry
// on a 4xx and a `Retry-After` surfaced to the screens.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineRoute } from '@learny/contracts';

import {
  refreshSessionOnce,
  resetSessionTokenState,
  setRenewalHandler,
  setSessionToken,
} from '../auth/session-token';

import { createMobileApiClient, defaultRequestHeaders, type MobileTokenSource } from './client';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const OUTPUT = z.object({ ok: z.boolean(), firstName: z.string().optional() });

interface Call {
  readonly url: string;
  readonly init: { method?: string; headers?: Record<string, string>; credentials?: string };
}

function headersOf(call: Call): Record<string, string> {
  const raw = call.init.headers ?? {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) out[name.toLowerCase()] = value;
  return out;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** RFC 9457 problem+json answer, the only shape the client decodes a code from. */
function problemResponse(code: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: 'about:blank', code, status }), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  });
}

function tokenSource(initial: string | null, renewed: string | null = 'jeton-neuf') {
  let current = initial;
  let renewals = 0;
  const source: MobileTokenSource & { renewals: () => number } = {
    get: () => current,
    refresh: () =>
      new Promise<boolean>((resolve) => {
        renewals += 1;
        setTimeout(() => {
          if (renewed === null) {
            resolve(false);
            return;
          }
          current = renewed;
          resolve(true);
        }, 5);
      }),
    renewals: () => renewals,
  };
  return source;
}

describe('[SPEC-3003] en-têtes du client natif (EF-2, CA-1)', () => {
  it('envoie le Bearer, un X-Request-Id unique, Accept-Language: fr, sans cookie ni Origin', async () => {
    const calls: Call[] = [];
    const fetchImpl = vi.fn((url: string, init: Call['init']) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse({ ok: true }));
    }) as unknown as typeof fetch;
    let sequence = 0;
    const client = createMobileApiClient({
      apiUrl: 'https://api.exemple.test',
      token: tokenSource('jeton-acces'),
      fetchImpl,
      newRequestId: () => `00000000-0000-4000-8000-00000000000${String((sequence += 1) % 10)}`,
    });

    await client.apiFetch({ method: 'GET', path: '/me', output: OUTPUT });
    await client.apiFetch({ method: 'GET', path: '/me', output: OUTPUT });

    expect(calls).toHaveLength(2);
    const first = headersOf(calls[0] as Call);
    expect(first.authorization).toBe('Bearer jeton-acces');
    expect(first['accept-language']).toBe('fr');
    expect(first['x-request-id']).toMatch(uuidPattern);
    expect(headersOf(calls[1] as Call)['x-request-id']).not.toBe(first['x-request-id']);
    for (const call of calls) {
      const headers = headersOf(call);
      expect(headers.origin).toBeUndefined();
      expect(headers.cookie).toBeUndefined();
      // A native client never sends the cookies of a browser (ADR-1005).
      expect(call.init.credentials).toBe('omit');
    }
    expect((calls[0] as Call).url).toBe('https://api.exemple.test/api/v1/me');
  });

  it('construit les en-têtes par défaut avec un identifiant de requête au format UUID v4', () => {
    const headers = defaultRequestHeaders(() => '00000000-0000-4000-8000-000000000001');
    expect(headers).toEqual({
      'X-Request-Id': '00000000-0000-4000-8000-000000000001',
      'Accept-Language': 'fr',
    });
  });
});

describe('[SPEC-3003] renouvellement après 401 (EF-3, CA-2, CL-1)', () => {
  it('renouvelle une seule fois puis rejoue une seule fois dix requêtes concurrentes (CL-1)', async () => {
    const seen: string[] = [];
    let renewals = 0;
    let currentToken = 'jeton-perime';
    resetSessionTokenState();
    setSessionToken(currentToken);
    // The serialised renewal of the application is the one under test: ten clients share it.
    setRenewalHandler(
      () =>
        new Promise<string>((resolve) => {
          renewals += 1;
          setTimeout(() => {
            currentToken = 'jeton-neuf';
            setSessionToken(currentToken);
            resolve(currentToken);
          }, 5);
        }),
    );
    const fetchImpl = vi.fn((_url: string, init: Call['init']) => {
      const authorization = headersOf({ url: '', init }).authorization ?? '';
      seen.push(authorization);
      return Promise.resolve(
        authorization === 'Bearer jeton-neuf'
          ? jsonResponse({ ok: true })
          : problemResponse('UNAUTHENTICATED', 401),
      );
    }) as unknown as typeof fetch;
    const client = createMobileApiClient({
      apiUrl: 'https://api.exemple.test',
      token: { get: () => currentToken, refresh: refreshSessionOnce },
      fetchImpl,
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        client.apiFetch<never, { ok: boolean }>({ method: 'GET', path: '/me', output: OUTPUT }),
      ),
    );

    expect(results).toHaveLength(10);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(renewals).toBe(1);
    // Ten first attempts with the expired token, ten replays with the renewed one.
    expect(seen.filter((value) => value === 'Bearer jeton-perime')).toHaveLength(10);
    expect(seen.filter((value) => value === 'Bearer jeton-neuf')).toHaveLength(10);
    resetSessionTokenState();
  });

  it('rejoue une seule fois : un second 401 remonte l’erreur (EF-3)', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(problemResponse('UNAUTHENTICATED', 401)),
    ) as unknown as typeof fetch;
    const token = tokenSource('jeton-perime');
    const client = createMobileApiClient({ apiUrl: 'https://api.exemple.test', token, fetchImpl });

    await expect(
      client.apiFetch({ method: 'GET', path: '/me', output: OUTPUT }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(token.renewals()).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('déconnecte quand le renouvellement est refusé (CL-2)', async () => {
    const onSessionExpired = vi.fn();
    const fetchImpl = vi.fn(() =>
      Promise.resolve(problemResponse('UNAUTHENTICATED', 401)),
    ) as unknown as typeof fetch;
    const token = tokenSource('jeton-perime', null);
    const client = createMobileApiClient({
      apiUrl: 'https://api.exemple.test',
      token,
      fetchImpl,
      onSessionExpired,
    });

    await expect(
      client.apiFetch({ method: 'GET', path: '/me', output: OUTPUT }),
    ).rejects.toMatchObject({ status: 401 });
    expect(token.renewals()).toBe(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    // No replay happened: the session is gone.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('[SPEC-3003] limitation de débit et erreurs (EF-7, BR-PLA-08)', () => {
  it('remonte le délai de Retry-After sans réessayer (429)', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(problemResponse('RATE_LIMITED', 429, { 'retry-after': '7' })),
    ) as unknown as typeof fetch;
    const client = createMobileApiClient({
      apiUrl: 'https://api.exemple.test',
      token: tokenSource('jeton'),
      fetchImpl,
    });

    await expect(
      client.apiFetch({ method: 'GET', path: '/home', output: OUTPUT }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429, retryAfterSec: 7 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('ne réessaie jamais une réponse 4xx (EF-4) et n’appelle pas le renouvellement hors 401', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({ code: 'VALIDATION_FAILED', status: 400 }, 400)),
    ) as unknown as typeof fetch;
    const token = tokenSource('jeton');
    const client = createMobileApiClient({ apiUrl: 'https://api.exemple.test', token, fetchImpl });

    await expect(
      client.apiFetch({ method: 'GET', path: '/home', output: OUTPUT }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(token.renewals()).toBe(0);
  });

  it('signale un réseau injoignable par NETWORK_ERROR', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
    const client = createMobileApiClient({
      apiUrl: 'https://api.exemple.test',
      token: tokenSource('jeton'),
      fetchImpl,
    });

    await expect(
      client.apiFetch({ method: 'GET', path: '/home', output: OUTPUT }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('[SPEC-3003] idempotence des créations (ET-3, BR-PLA-08)', () => {
  const createRoute = defineRoute({
    id: 'test.spec3003.create',
    method: 'POST',
    path: '/api/v1/test/spec3003',
    auth: 'user',
    body: z.object({ value: z.number() }),
    output: z.object({ id: z.string() }),
    successStatus: 201,
    idempotent: true,
    summary: 'Route de test de la clé d’idempotence (SPEC-3003).',
    errors: [],
  });

  it('envoie la même Idempotency-Key au renouvellement et à la reprise (ET-3)', async () => {
    const keys: (string | undefined)[] = [];
    const fetchImpl = vi.fn((_url: string, init: Call['init']) => {
      const headers = headersOf({ url: '', init });
      keys.push(headers['idempotency-key']);
      return Promise.resolve(
        headers.authorization === 'Bearer jeton-neuf'
          ? jsonResponse({ id: 'x1' }, 201)
          : jsonResponse({ code: 'UNAUTHENTICATED', status: 401 }, 401),
      );
    }) as unknown as typeof fetch;
    const client = createMobileApiClient({
      apiUrl: 'https://api.exemple.test',
      token: tokenSource('jeton-perime'),
      fetchImpl,
    });

    await client.callApi(createRoute, { body: { value: 1 } });

    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(uuidPattern);
    expect(keys[1]).toBe(keys[0]);
  });

  it('réutilise la clé fournie par l’écran (ET-3)', async () => {
    const keys: (string | undefined)[] = [];
    const fetchImpl = vi.fn((_url: string, init: Call['init']) => {
      keys.push(headersOf({ url: '', init })['idempotency-key']);
      return Promise.resolve(jsonResponse({ id: 'x2' }, 201));
    }) as unknown as typeof fetch;
    const client = createMobileApiClient({
      apiUrl: 'https://api.exemple.test',
      token: tokenSource('jeton'),
      fetchImpl,
    });

    await client.callApi(
      createRoute,
      { body: { value: 2 } },
      { idempotencyKey: 'cle-de-l-intention' },
    );

    expect(keys).toEqual(['cle-de-l-intention']);
  });
});
