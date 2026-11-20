import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { clientAddress, createRequestOriginGuard, requestOrigin } from './security';

const SECRET = 'learny-test-only-api-proxy-secret-value';
const env = { API_PROXY_SECRET: SECRET, NEXT_PUBLIC_APP_URL: 'https://learny.example' };

describe('[SPEC-1102] trusted proxy', () => {
  it('uses forwarded origin and the first address only with the proxy secret (CA-3, CA-4)', () => {
    const request = new Request('http://api.internal/api/v1/me/deletion', {
      method: 'POST',
      headers: {
        host: 'api.internal',
        'x-learny-proxy-secret': SECRET,
        'x-forwarded-host': 'learny.example',
        'x-forwarded-proto': 'https',
        'x-forwarded-for': '198.51.100.7, 10.0.0.4',
      },
    });

    expect(requestOrigin(request, env)).toBe('https://learny.example');
    expect(clientAddress(request, env)).toBe('198.51.100.7');
  });

  it('ignores forwarded data when the proxy secret is absent or wrong (CA-3, CA-4)', () => {
    for (const secret of [null, `${SECRET}x`]) {
      const request = new Request('http://api.internal/api/v1/me/deletion', {
        method: 'POST',
        headers: {
          host: 'api.internal',
          ...(secret === null ? {} : { 'x-learny-proxy-secret': secret }),
          'x-forwarded-host': 'evil.example',
          'x-forwarded-proto': 'https',
          'x-forwarded-for': '198.51.100.9',
        },
      });
      expect(requestOrigin(request, env)).toBe('http://api.internal');
      expect(clientAddress(request, env)).toBeNull();
    }
  });

  it('accepts a mutation forwarded by the relay but rejects a spoofed request (CA-3)', async () => {
    const localEnv = { API_PROXY_SECRET: SECRET };
    const headers = {
      origin: 'https://learny.example',
      host: 'api.internal',
      'x-forwarded-host': 'learny.example',
      'x-forwarded-proto': 'https',
      'x-learny-proxy-secret': SECRET,
    };
    const trusted = new Request('http://api.internal/api/v1/me/deletion', {
      method: 'POST',
      headers,
    });
    await createRequestOriginGuard(localEnv).check(trusted);

    const spoofed = new Request('http://other.example/api/v1/me/deletion', {
      method: 'POST',
      headers: { ...headers, 'x-learny-proxy-secret': 'wrong', host: 'other.example' },
    });
    try {
      await createRequestOriginGuard(localEnv).check(spoofed);
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: 'ORIGIN_REJECTED' });
    }
  });

  it('exempts an origin-less Bearer mutation but not a cookie mutation (EF-6)', () => {
    const guard = createRequestOriginGuard(env);
    const bearer = new Request('http://api.internal/api/v1/me/deletion', {
      method: 'POST',
      headers: { authorization: 'Bearer abc.def.ghi' },
    });
    const cookie = new Request('http://api.internal/api/v1/me/deletion', {
      method: 'POST',
      headers: { cookie: 'session=value' },
    });
    expect(() => guard.check(bearer)).not.toThrow();
    expect(() => guard.check(cookie)).toThrow(AppError);
  });
});
