// Magic link, password sign-in and callback of the account (SPEC-3101 EF-1, EF-3, EF-6, ET-1).
import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import {
  MAGIC_LINK_REDIRECT,
  exchangeMagicCode,
  requestMagicLink,
  signInWithPassword,
  verifyMagicLink,
  type EmailAuthClient,
} from './email-auth';

const SESSION = {
  access_token: 'jeton-acces',
  user: { id: 'u-alex', email: 'alex.perrin@demo.learny.test' },
} as unknown as Session;

interface RecordedCall {
  readonly name: string;
  readonly args: unknown;
}

interface FakeResults {
  readonly password?: unknown;
  readonly otp?: unknown;
  readonly verify?: unknown;
  readonly exchange?: unknown;
  readonly session?: unknown;
}

/** Client of Supabase Auth simulated: it records the call and answers the configured error. */
function fakeClient(results: FakeResults = {}): {
  readonly client: EmailAuthClient;
  readonly calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const session = results.session === undefined ? SESSION : results.session;
  return {
    calls,
    client: {
      signInWithPassword(credentials) {
        calls.push({ name: 'signInWithPassword', args: credentials });
        return Promise.resolve({ error: results.password ?? null, data: { session } });
      },
      signInWithOtp(credentials) {
        calls.push({ name: 'signInWithOtp', args: credentials });
        return Promise.resolve({ error: results.otp ?? null });
      },
      verifyOtp(params) {
        calls.push({ name: 'verifyOtp', args: params });
        return Promise.resolve({ error: results.verify ?? null, data: { session } });
      },
      exchangeCodeForSession(code) {
        calls.push({ name: 'exchangeCodeForSession', args: code });
        return Promise.resolve({ error: results.exchange ?? null, data: { session } });
      },
    },
  };
}

describe('[SPEC-3101] lien magique et connexion par mot de passe', () => {
  it('demande un lien d’une heure sans créer de compte, vers le schéma de l’application (EF-3, ET-1)', async () => {
    const fake = fakeClient();

    await expect(requestMagicLink(fake.client, ' alex.perrin@demo.learny.test ')).resolves.toBe(
      'sent',
    );
    expect(fake.calls).toEqual([
      {
        name: 'signInWithOtp',
        args: {
          email: 'alex.perrin@demo.learny.test',
          options: { shouldCreateUser: false, emailRedirectTo: MAGIC_LINK_REDIRECT },
        },
      },
    ]);
    expect(MAGIC_LINK_REDIRECT).toBe('learny://auth/callback');
  });

  it('répond comme pour une adresse connue quand l’adresse est inconnue (CA-4, ADR-0121)', async () => {
    const fake = fakeClient({ otp: { code: 'otp_disabled' } });

    await expect(requestMagicLink(fake.client, 'inconnu@test.learny.test')).resolves.toBe('silent');
  });

  it('remonte les vrais refus du fournisseur (trop de tentatives)', async () => {
    const fake = fakeClient({
      otp: { status: 429, code: 'over_email_send_rate_limit', message: 'after 30 seconds' },
    });

    await expect(
      requestMagicLink(fake.client, 'alex.perrin@demo.learny.test'),
    ).rejects.toMatchObject({ code: 'over_email_send_rate_limit', status: 429 });
  });

  it('vérifie un lien reçu par token_hash et type (EF-6)', async () => {
    const fake = fakeClient();

    const snapshot = await verifyMagicLink(fake.client, 'hash-du-lien', 'magiclink');

    expect(fake.calls).toEqual([
      { name: 'verifyOtp', args: { token_hash: 'hash-du-lien', type: 'magiclink' } },
    ]);
    expect(snapshot).toEqual({
      userId: 'u-alex',
      accessToken: 'jeton-acces',
      email: 'alex.perrin@demo.learny.test',
    });
  });

  it('remonte le refus d’un lien déjà utilisé (CA-3)', async () => {
    const fake = fakeClient({
      verify: { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' },
    });

    await expect(verifyMagicLink(fake.client, 'hash-du-lien', 'magiclink')).rejects.toMatchObject({
      code: 'otp_expired',
      status: 403,
    });
  });

  it('échange le code d’un lien universel contre une session (EF-6)', async () => {
    const fake = fakeClient();

    const snapshot = await exchangeMagicCode(fake.client, 'code-pkce');

    expect(fake.calls).toEqual([{ name: 'exchangeCodeForSession', args: 'code-pkce' }]);
    expect(snapshot.accessToken).toBe('jeton-acces');
  });

  it('refuse une session absente après vérification (ET-1)', async () => {
    const fake = fakeClient({ session: null });

    await expect(verifyMagicLink(fake.client, 'hash-du-lien', 'signup')).rejects.toThrow(
      /Session absente/,
    );
  });

  it('transmet le mot de passe tel quel et remonte l’échec (BR-ACC-01, EF-5)', async () => {
    const fake = fakeClient({
      password: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' },
    });

    await expect(
      signInWithPassword(fake.client, 'alex.perrin@demo.learny.test', 'mot-de-passe'),
    ).rejects.toMatchObject({ code: 'invalid_credentials', status: 400 });
    expect(fake.calls).toEqual([
      {
        name: 'signInWithPassword',
        args: { email: 'alex.perrin@demo.learny.test', password: 'mot-de-passe' },
      },
    ]);
  });
});
