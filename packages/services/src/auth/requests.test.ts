// Unit tests of the authentication requests (SPEC-202 EF-1 to EF-5, EF-7, CL-10, ET-8): the
// Supabase Auth client is a fake, the first-verification service is mocked (its own tests cover it).
import { randomBytes } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LEGAL_VERSIONS } from '@learny/config';
import type { AppError } from '@learny/core';

import { silentLogger, TestClock } from '../../test/support/fakes';

import { callbackUrl } from './client';
import {
  requestMagicLink,
  resendLink,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from './requests';

const mocks = vi.hoisted(() => ({
  finalize: vi.fn(),
  loadProfile: vi.fn(),
}));

vi.mock('./finalize', () => ({
  finalizeFirstVerification: mocks.finalize,
  loadDestinationProfile: mocks.loadProfile,
}));

const PASSWORD = `pw-${randomBytes(18).toString('hex')}`;
const clock = new TestClock();
const ctx = { userId: null, requestId: 'req-1', db: null, clock, logger: silentLogger() };

function auth(overrides: Record<string, unknown> = {}) {
  return {
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: { id: '11111111-1111-4111-8111-111111111111' } },
      error: null,
    }),
    resend: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getUser: vi.fn(),
    ...overrides,
  };
}

function deps(client = auth()) {
  return { auth: client, appUrl: 'https://learny.test///' };
}

function codeOf(result: { ok: boolean; error?: AppError }): string | undefined {
  return result.ok ? undefined : result.error?.code;
}

beforeEach(() => {
  mocks.finalize.mockReset();
  mocks.loadProfile.mockReset();
  mocks.finalize.mockResolvedValue({ firstTime: true });
  mocks.loadProfile.mockResolvedValue({ onboardingStep: 'done', deletionScheduledFor: null });
  clock.set('2026-11-11T12:20:00Z');
});

describe('[SPEC-202] demandes d’authentification', () => {
  it('construit toujours le même callback, sans double slash', () => {
    expect(callbackUrl('https://learny.test///')).toBe('https://learny.test/api/v1/auth/callback');
    expect(callbackUrl('http://localhost:3000')).toBe('http://localhost:3000/api/v1/auth/callback');
  });

  it('lien magique d’inscription : création du compte et métadonnées légales (EF-1)', async () => {
    const client = auth();
    await expect(
      requestMagicLink(
        ctx,
        {
          email: 'new@test.learny.test',
          mode: 'sign-up',
          acceptedTerms: true,
          timezone: 'Europe/Paris',
        },
        deps(client),
      ),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(client.signInWithOtp).toHaveBeenCalledWith({
      email: 'new@test.learny.test',
      options: {
        shouldCreateUser: true,
        emailRedirectTo: 'https://learny.test/api/v1/auth/callback',
        data: {
          signup: {
            termsAcceptedAt: '2026-11-11T12:20:00.000Z',
            cguVersion: LEGAL_VERSIONS.cgu,
            privacyVersion: LEGAL_VERSIONS.privacy,
            method: 'magic_link',
            timezone: 'Europe/Paris',
          },
        },
      },
    });
  });

  it('lien magique de connexion : ne crée jamais de compte, sans métadonnées (EF-2)', async () => {
    const client = auth();
    await requestMagicLink(ctx, { email: 'known@test.learny.test', mode: 'sign-in' }, deps(client));
    expect(client.signInWithOtp).toHaveBeenCalledWith({
      email: 'known@test.learny.test',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://learny.test/api/v1/auth/callback',
      },
    });
  });

  it('reste silencieux pour une adresse inconnue, mais renvoie les vrais refus (ET-8)', async () => {
    const silent = auth({
      signInWithOtp: vi.fn().mockResolvedValue({
        error: { code: 'otp_disabled', message: 'Signups not allowed' },
      }),
    });
    const logger = { ...silentLogger(), info: vi.fn() };
    await expect(
      requestMagicLink(
        { ...ctx, logger },
        { email: 'unknown@test.learny.test', mode: 'sign-in' },
        deps(silent),
      ),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(logger.info).toHaveBeenCalled();

    const rateLimited = auth({
      signInWithOtp: vi.fn().mockResolvedValue({
        error: {
          code: 'over_email_send_rate_limit',
          message: 'only request this after 42 seconds',
        },
      }),
    });
    const result = await requestMagicLink(
      ctx,
      { email: 'x@test.learny.test', mode: 'sign-up', acceptedTerms: true },
      deps(rateLimited),
    );
    expect(codeOf(result)).toBe('RESEND_TOO_SOON');
  });

  it('inscription par mot de passe : succès, adresse déjà prise, mot de passe faible (EF-3)', async () => {
    const client = auth();
    await expect(
      signUpWithPassword(
        ctx,
        {
          email: 'new@test.learny.test',
          password: PASSWORD,
          acceptedTerms: true,
          timezone: 'Europe/Paris',
        },
        deps(client),
      ),
    ).resolves.toEqual({ ok: true, value: { status: 'confirmation_sent' } });
    expect(client.signUp).toHaveBeenCalled();
    const signUpCalls = client.signUp.mock.calls as unknown as Array<
      [
        {
          email: string;
          password: string;
          options: { data: { signup: Record<string, unknown> } };
        },
      ]
    >;
    expect(signUpCalls[0]?.[0]).toMatchObject({
      email: 'new@test.learny.test',
      password: PASSWORD,
    });
    expect(signUpCalls[0]?.[0]?.options.data.signup).toMatchObject({
      method: 'password',
      timezone: 'Europe/Paris',
    });

    const existing = auth({
      signUp: vi.fn().mockResolvedValue({ error: { code: 'user_already_exists' } }),
    });
    await expect(
      signUpWithPassword(
        ctx,
        { email: 'known@test.learny.test', password: 'x'.repeat(12), acceptedTerms: true },
        deps(existing),
      ),
    ).resolves.toEqual({ ok: true, value: { status: 'confirmation_sent' } });

    const weak = auth({ signUp: vi.fn().mockResolvedValue({ error: { code: 'weak_password' } }) });
    expect(
      codeOf(
        await signUpWithPassword(
          ctx,
          { email: 'new@test.learny.test', password: 'court', acceptedTerms: true },
          deps(weak),
        ),
      ),
    ).toBe('VALIDATION_FAILED');
  });

  it('connexion par mot de passe : finalise puis calcule la destination (EF-4)', async () => {
    const client = auth();
    await expect(
      signInWithPassword(
        ctx,
        { email: 'known@test.learny.test', password: PASSWORD, next: '/agenda' },
        deps(client),
      ),
    ).resolves.toEqual({ ok: true, value: { destination: '/agenda' } });
    expect(mocks.finalize).toHaveBeenCalledWith(
      ctx,
      '11111111-1111-4111-8111-111111111111',
      'password',
    );
    expect(mocks.loadProfile).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');

    mocks.loadProfile.mockResolvedValueOnce({
      onboardingStep: 'profil',
      deletionScheduledFor: null,
    });
    await expect(
      signInWithPassword(
        ctx,
        { email: 'known@test.learny.test', password: PASSWORD, next: '/agenda' },
        deps(client),
      ),
    ).resolves.toEqual({ ok: true, value: { destination: '/premiers-pas/profil' } });
  });

  it('connexion par mot de passe : erreurs traduites, jamais de session (EF-4)', async () => {
    const invalid = auth({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: null }, error: { code: 'invalid_credentials' } }),
    });
    expect(
      codeOf(
        await signInWithPassword(
          ctx,
          { email: 'known@test.learny.test', password: 'faux', next: undefined },
          deps(invalid),
        ),
      ),
    ).toBe('INVALID_CREDENTIALS');
    expect(mocks.finalize).not.toHaveBeenCalled();

    const down = auth({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: null }, error: { code: 'unexpected' } }),
    });
    expect(
      codeOf(
        await signInWithPassword(
          ctx,
          { email: 'known@test.learny.test', password: 'x', next: undefined },
          deps(down),
        ),
      ),
    ).toBe('SERVICE_UNAVAILABLE');
  });

  it('renvoie le lien d’inscription ou de connexion et gère le délai GoTrue (EF-5)', async () => {
    const signup = auth();
    await expect(
      resendLink(ctx, { kind: 'signup', email: 'a@test.learny.test' }, deps(signup)),
    ).resolves.toEqual({ ok: true, value: undefined });
    expect(signup.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'a@test.learny.test',
      options: { emailRedirectTo: 'https://learny.test/api/v1/auth/callback' },
    });

    const signin = auth();
    await resendLink(ctx, { kind: 'magic_link', email: 'a@test.learny.test' }, deps(signin));
    expect(signin.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@test.learny.test',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: 'https://learny.test/api/v1/auth/callback',
      },
    });

    const unknown = auth({
      resend: vi.fn().mockResolvedValue({ error: { code: 'otp_disabled' } }),
    });
    await expect(
      resendLink(ctx, { kind: 'signup', email: 'a@test.learny.test' }, deps(unknown)),
    ).resolves.toEqual({ ok: true, value: undefined });

    const limited = auth({
      resend: vi.fn().mockResolvedValue({ error: { code: 'over_email_send_rate_limit' } }),
    });
    expect(
      codeOf(await resendLink(ctx, { kind: 'signup', email: 'a@test.learny.test' }, deps(limited))),
    ).toBe('RESEND_TOO_SOON');
  });

  it('ferme la session, même sans session ouverte (EF-7, CL-10)', async () => {
    const client = auth();
    await signOut(deps(client));
    expect(client.signOut).toHaveBeenCalledTimes(1);
  });
});
