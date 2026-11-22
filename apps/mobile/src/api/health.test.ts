// Unit tests of the health check (SPEC-3001 EF-2, CL-1): the transport is injected, the API is
// never called.
import { describe, expect, it, vi } from 'vitest';

import { checkApiHealth, UNREACHABLE_CODE } from './health';

const HEALTH_BODY = {
  status: 'ok',
  version: '1.0.0',
  commit: 'abcdef0',
  database: 'ok',
  components: { database: 'ok', build: 'ok' },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('[SPEC-3001] contrôle de santé de l’API', () => {
  it('appelle /api/v1/health et remonte la version du serveur', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(HEALTH_BODY)));

    const result = await checkApiHealth('http://10.0.2.2:3001', fetchImpl);

    expect(result).toEqual({ status: 'ok', version: '1.0.0', database: 'ok' });
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe('http://10.0.2.2:3001/api/v1/health');
  });

  it('signale une API injoignable avec NETWORK_ERROR quand le transport échoue (CL-1)', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.reject(new TypeError('Network request failed')),
    );

    const result = await checkApiHealth('http://10.0.2.2:3001', fetchImpl);

    expect(result).toEqual({ status: 'unreachable', code: UNREACHABLE_CODE });
  });

  it('signale une API injoignable avec le code du problème renvoyé', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            type: 'about:blank',
            title: 'API indisponible',
            status: 502,
            code: 'API_UNAVAILABLE',
          }),
          {
            status: 502,
            headers: { 'content-type': 'application/problem+json' },
          },
        ),
      ),
    );

    const result = await checkApiHealth('http://10.0.2.2:3001', fetchImpl);

    expect(result.status).toBe('unreachable');
    if (result.status !== 'unreachable') return;
    expect(result.code).toBe('API_UNAVAILABLE');
  });

  it('signale une réponse hors contrat sans lever d’exception', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({ status: 'ok' })));

    const result = await checkApiHealth('http://10.0.2.2:3001', fetchImpl);

    expect(result.status).toBe('unreachable');
  });
});
