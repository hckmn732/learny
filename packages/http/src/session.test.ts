import { describe, expect, it, vi } from 'vitest';

import { resolveIdentity, setSessionResolver, type IdentityDependencies } from './session';

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_JWT_SECRET: 'learny-test-only-jwt-secret-with-at-least-32-bytes',
};
const SESSION = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'learner@example.test',
  emailConfirmed: true,
};

describe('[SPEC-1102] identity transports', () => {
  it('uses a valid Bearer instead of the cookie without an Auth-server request (EF-1, EF-3, CA-2)', async () => {
    const cookies = vi.fn(() => Promise.resolve(SESSION));
    const restore = setSessionResolver(cookies);
    const authFetch = vi.fn<typeof fetch>();
    const verifyToken: NonNullable<IdentityDependencies['verifyToken']> = vi.fn(() =>
      Promise.resolve({
        status: 'valid' as const,
        claims: {
          sub: SESSION.userId,
          aud: 'authenticated',
          email: SESSION.email,
          exp: 1,
          iss: 'issuer',
        },
      }),
    );
    try {
      const identity = await resolveIdentity(
        new Request('http://api.test/api/v1/me', {
          headers: { authorization: 'Bearer locally.valid.token', cookie: 'session=cookie' },
        }),
        { env: ENV, fetcher: authFetch, verifyToken },
      );
      expect(identity).toMatchObject({ userId: SESSION.userId, transport: 'bearer' });
      expect(cookies).not.toHaveBeenCalled();
      expect(authFetch).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('does not fall back to a cookie when the presented Bearer is invalid (EF-3, CL-6)', async () => {
    const cookies = vi.fn(() => Promise.resolve(SESSION));
    const restore = setSessionResolver(cookies);
    try {
      expect(
        await resolveIdentity(
          new Request('http://api.test/api/v1/me', {
            headers: { authorization: 'Bearer invalid', cookie: 'session=cookie' },
          }),
          {
            env: ENV,
            verifyToken: () => Promise.resolve({ status: 'invalid' }),
          },
        ),
      ).toBeNull();
      expect(cookies).not.toHaveBeenCalled();

      const basic = await resolveIdentity(
        new Request('http://api.test/api/v1/me', {
          headers: { authorization: 'Basic ignored', cookie: 'session=cookie' },
        }),
        { env: ENV },
      );
      expect(basic).toMatchObject({ transport: 'cookie', userId: SESSION.userId });
      expect(cookies).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});
