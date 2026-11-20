import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetJwtVerificationCache, verifyAccessToken } from './jwt';

const ISSUER = 'https://auth.example.test/auth/v1';
const NOW = new Date('2026-11-11T12:20:00Z');
const SECRET = 'learny-test-only-jwt-secret-with-at-least-32-bytes';
const encoder = new TextEncoder();

async function hsToken(
  options: {
    audience?: string;
    expiresAt?: number;
    issuer?: string;
    algorithm?: 'HS256';
  } = {},
) {
  return new SignJWT({ email: 'learner@example.test' })
    .setProtectedHeader({ alg: options.algorithm ?? 'HS256' })
    .setSubject('00000000-0000-4000-8000-000000000001')
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? 'authenticated')
    .setIssuedAt(Math.floor(NOW.getTime() / 1000) - 5)
    .setExpirationTime(options.expiresAt ?? Math.floor(NOW.getTime() / 1000) + 300)
    .sign(encoder.encode(SECRET));
}

beforeEach(() => {
  resetJwtVerificationCache();
});

describe('[SPEC-1102] local token verification', () => {
  it('accepts a valid HS256 token at the injected instant (CA-1)', async () => {
    const token = await hsToken();
    const result = await verifyAccessToken(token, {
      jwtSecret: SECRET,
      issuer: ISSUER,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      status: 'valid',
      claims: { sub: '00000000-0000-4000-8000-000000000001', aud: 'authenticated' },
    });
  });

  it.each([
    ['expired', () => hsToken({ expiresAt: Math.floor(NOW.getTime() / 1000) - 1 })],
    ['wrong audience', () => hsToken({ audience: 'anon' })],
    ['wrong issuer', () => hsToken({ issuer: 'https://other.example/auth/v1' })],
    [
      'bad signature',
      async () => {
        const parts = (await hsToken()).split('.');
        const signature = parts[2] ?? '';
        parts[2] = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
        return parts.join('.');
      },
    ],
    ['algorithm none', () => Promise.resolve('eyJhbGciOiJub25lIn0.e30.')],
  ])('rejects %s tokens locally (CA-1)', async (_label, makeToken) => {
    expect(
      await verifyAccessToken(await makeToken(), {
        jwtSecret: SECRET,
        issuer: ISSUER,
        now: () => NOW,
      }),
    ).toEqual({ status: 'invalid' });
  });

  it('rejects malformed tokens locally (CA-1)', async () => {
    expect(
      await verifyAccessToken('not-a-jwt', {
        jwtSecret: SECRET,
        issuer: ISSUER,
        now: () => NOW,
      }),
    ).toEqual({ status: 'invalid' });
  });

  it('caches JWKS for ten minutes and reloads an unknown kid (CL-2, ET-1)', async () => {
    const oldKeys = await generateKeyPair('ES256');
    const freshKeys = await generateKeyPair('ES256');
    const publicOld = { ...(await exportJWK(oldKeys.publicKey)), kid: 'old' };
    const publicFresh = { ...(await exportJWK(freshKeys.publicKey)), kid: 'fresh' };
    const makeToken = (key: CryptoKey, kid: string) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid })
        .setSubject('00000000-0000-4000-8000-000000000002')
        .setIssuer(ISSUER)
        .setAudience('authenticated')
        .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 300)
        .sign(key);
    const oldToken = await makeToken(oldKeys.privateKey, 'old');
    const freshToken = await makeToken(freshKeys.privateKey, 'fresh');
    let document = { keys: [publicOld] };
    const fetcher = vi.fn(() => Promise.resolve(Response.json(document)));

    expect(
      (
        await verifyAccessToken(oldToken, {
          jwksUrl: 'https://auth.example.test/jwks',
          issuer: ISSUER,
          now: () => NOW,
          fetcher,
        })
      ).status,
    ).toBe('valid');
    expect(
      (
        await verifyAccessToken(oldToken, {
          jwksUrl: 'https://auth.example.test/jwks',
          issuer: ISSUER,
          now: () => NOW,
          fetcher,
        })
      ).status,
    ).toBe('valid');
    document = { keys: [publicFresh] };
    expect(
      (
        await verifyAccessToken(freshToken, {
          jwksUrl: 'https://auth.example.test/jwks',
          issuer: ISSUER,
          now: () => NOW,
          fetcher,
        })
      ).status,
    ).toBe('valid');

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports an unreachable JWKS as unavailable for the Auth-server fallback (CL-1)', async () => {
    const keys = await generateKeyPair('ES256');
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'offline' })
      .setSubject('00000000-0000-4000-8000-000000000003')
      .setIssuer(ISSUER)
      .setAudience('authenticated')
      .setExpirationTime(Math.floor(NOW.getTime() / 1000) + 300)
      .sign(keys.privateKey);
    const result = await verifyAccessToken(token, {
      jwksUrl: 'https://auth.example.test/jwks',
      issuer: ISSUER,
      now: () => NOW,
      fetcher: () => Promise.reject(new Error('offline')),
    });
    expect(result).toEqual({ status: 'unavailable' });
  });
});
