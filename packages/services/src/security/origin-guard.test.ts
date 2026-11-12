import { describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import {
  createOriginGuard,
  isOriginExempt,
  parseAllowedOrigins,
  type OriginRequest,
} from './origin-guard';

const APP = 'https://app.exemple.fr';

function request(overrides: Partial<OriginRequest> = {}): OriginRequest {
  return {
    method: 'POST',
    pathname: '/api/v1/formations',
    origin: APP,
    secFetchSite: null,
    requestOrigin: APP,
    ...overrides,
  };
}

function refused(run: () => void): AppError {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('une erreur était attendue');
}

describe('[SPEC-208] origine', () => {
  const guard = createOriginGuard({
    appUrl: APP,
    allowedOrigins: 'https://partner.example, https://autre.example:8443',
  });

  it('accepts the application origin and the listed ones', () => {
    for (const origin of [APP, 'https://partner.example', 'https://autre.example:8443']) {
      expect(() => {
        guard.check(request({ origin }));
      }).not.toThrow();
    }
  });

  it('refuses a foreign origin with ORIGIN_REJECTED and the French detail (EF-5)', () => {
    const error = refused(() => {
      guard.check(request({ origin: 'https://evil.example' }));
    });
    expect(error.code).toBe('ORIGIN_REJECTED');
    expect(error.detail).toBe('Requête refusée : origine non autorisée.');
  });

  it.each([
    'https://app.exemple.fr.attaquant.com',
    'https://attaquant.com/https://app.exemple.fr',
    'http://app.exemple.fr',
    'https://app.exemple.fr:8443',
    'https://sub.app.exemple.fr',
    'null',
    '',
    'pas une url',
  ])('refuses the trapped origin %j (CL-6)', (origin) => {
    expect(
      refused(() => {
        guard.check(request({ origin }));
      }).code,
    ).toBe('ORIGIN_REJECTED');
  });

  it('compares normalised origins: trailing path and case do not matter', () => {
    expect(() => {
      guard.check(request({ origin: 'HTTPS://APP.EXEMPLE.FR/' }));
    }).not.toThrow();
  });

  it('without Origin, accepts only Sec-Fetch-Site: same-origin (CL-5)', () => {
    expect(() => {
      guard.check(request({ origin: null, secFetchSite: 'same-origin' }));
    }).not.toThrow();
    for (const secFetchSite of [null, 'same-site', 'cross-site', 'none']) {
      expect(
        refused(() => {
          guard.check(request({ origin: null, secFetchSite }));
        }).code,
      ).toBe('ORIGIN_REJECTED');
    }
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not check the safe method %s', (method) => {
    expect(() => {
      guard.check(request({ method, origin: 'https://evil.example' }));
    }).not.toThrow();
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('checks %s', (method) => {
    expect(
      refused(() => {
        guard.check(request({ method, origin: 'https://evil.example' }));
      }).code,
    ).toBe('ORIGIN_REJECTED');
  });

  it('exempts the webhooks, the job endpoint and the unsubscribe link (CL-7)', () => {
    for (const pathname of [
      '/api/v1/webhooks/stripe',
      '/api/inngest',
      '/api/v1/email/unsubscribe',
    ]) {
      expect(() => {
        guard.check(request({ pathname, origin: null, secFetchSite: null }));
      }).not.toThrow();
    }
    expect(isOriginExempt('GET', '/api/v1/email/unsubscribe')).toBe(false);
    expect(isOriginExempt('POST', '/api/v1/webhooksx/stripe')).toBe(false);
    expect(isOriginExempt('PUT', '/api/v1/email/unsubscribe')).toBe(false);
  });

  it('falls back to the origin of the request when the application URL is not configured', () => {
    const local = createOriginGuard({});
    expect(() => {
      local.check(
        request({ origin: 'http://localhost:3000', requestOrigin: 'http://localhost:3000' }),
      );
    }).not.toThrow();
    expect(
      refused(() => {
        local.check(
          request({ origin: 'http://evil.example', requestOrigin: 'http://localhost:3000' }),
        );
      }).code,
    ).toBe('ORIGIN_REJECTED');
  });

  it('parses ALLOWED_ORIGINS and refuses an invalid list at startup (ET-5)', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('  ')).toEqual([]);
    expect(parseAllowedOrigins('https://a.example/path, HTTPS://B.example:443')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(() => parseAllowedOrigins('https://a.example, pas-une-origine')).toThrow(/invalide/);
  });
});
