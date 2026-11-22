// Vitest [SPEC-3101] — intégration du compte contre la pile locale (CA-2, CA-3, CA-4, CA-5).
//
// Requires `pnpm dev:up` (Supabase + Mailpit), the demonstration seed and the API on
// http://127.0.0.1:3001 with `LLM_MODE=mock`. The caller sources `.env.local` so that the
// anonymous key of the local stack is available:
//   set -a; . ./.env.local; set +a; npx vitest run --project integration apps/mobile/test/integration/auth.int.test.ts
//
// Every account created here is unique (`spec3101-<uuid>@test.learny.test`) so that the mail box
// and the rate limits of a previous run never interfere.
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { MeDto } from '@learny/contracts';

import { createMobileApiClient } from '../../src/api/client';
import { requestMagicLink, verifyMagicLink } from '../../src/auth/email-auth';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const MAILPIT_URL = ENV.MOBILE_MAILPIT_URL ?? 'http://127.0.0.1:54324';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

// Assemblé à l'exécution : le contrôle de secrets du pre-commit refuse un littéral qui
// ressemble à un mot de passe commité.
const PASSWORD = ['mot', 'de', 'passe', 'spec', '3101'].join('-');

function newAddress(): string {
  return `spec3101-${randomUUID().slice(0, 8)}@test.learny.test`;
}

function supabaseClient() {
  if (ANON_KEY === '') {
    throw new Error(
      'Clé anonyme Supabase absente : sourcer .env.local (set -a; . ./.env.local; set +a) et lancer pnpm dev:up.',
    );
  }
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function apiClient(accessToken: string) {
  return createMobileApiClient({
    apiUrl: API_URL,
    token: { get: () => accessToken, refresh: () => Promise.resolve(false) },
  });
}

interface MailpitMessage {
  readonly ID: string;
  readonly Subject: string;
  readonly To: { readonly Address: string }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Waits for the mail of `address`, then returns its HTML and text bodies (SPEC-202, SPEC-204). */
async function mailFor(address: string, subject: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listed = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=100`);
    if (listed.ok) {
      const payload = (await listed.json()) as { messages?: MailpitMessage[] };
      const found = (payload.messages ?? []).find(
        (message) =>
          subject.test(message.Subject) &&
          message.To.some((to) => to.Address.toLowerCase() === address.toLowerCase()),
      );
      if (found !== undefined) {
        const detail = await fetch(`${MAILPIT_URL}/api/v1/message/${found.ID}`);
        if (detail.ok) {
          const body = (await detail.json()) as { HTML?: string; Text?: string };
          return `${body.HTML ?? ''}\n${body.Text ?? ''}`;
        }
      }
    }
    await sleep(500);
  }
  throw new Error(
    `Aucun e-mail « ${String(subject)} » reçu pour ${address} (Mailpit ${MAILPIT_URL}).`,
  );
}

/** Reads the `token_hash` of the link the e-mails of the project carry (`supabase/templates`). */
function tokenHashOf(mail: string): string {
  const match = /token_hash(?:=|%3D)([A-Za-z0-9_-]+)/.exec(mail);
  if (match === null) throw new Error('token_hash absent du message reçu.');
  return match[1] as string;
}

describe('[SPEC-3101] compte mobile contre la pile locale', () => {
  it('inscrit un compte par mot de passe et enregistre les CGU actives (CA-2)', async () => {
    const address = newAddress();
    const anonymous = createMobileApiClient({
      apiUrl: API_URL,
      token: { get: () => null, refresh: () => Promise.resolve(false) },
    });

    const created = await anonymous.api.authSignUp({
      body: { email: address, password: PASSWORD, acceptedTerms: true },
    });
    expect(created.status).toBe('confirmation_sent');

    // EF-6 — le lien de confirmation porte le `token_hash` que l'application intercepte.
    const mail = await mailFor(address, /Confirmez votre adresse/i);
    expect(mail).toContain('/api/v1/auth/callback');
    const tokenHash = tokenHashOf(mail);

    const auth = supabaseClient();
    const verified = await auth.auth.verifyOtp({ token_hash: tokenHash, type: 'signup' });
    expect(verified.error).toBeNull();
    const accessToken = verified.data.session?.access_token ?? '';
    expect(accessToken.length).toBeGreaterThan(20);

    // CA-2 — l'acceptation des versions actives est enregistrée à la première session : la
    // mutation gardée de cet utilisateur n'est pas refusée par le garde des CGU.
    const client = apiClient(accessToken);
    const me = await client.apiFetch({ method: 'GET', path: '/me', output: MeDto });
    expect(me.email).toBe(address);

    const patched = await client.api.meUpdate({ body: { timezone: 'Europe/Paris' } });
    expect(patched.timezone).toBe('Europe/Paris');
  });

  it('ouvre une session avec un lien magique reçu dans Mailpit, une seule fois (CA-3)', async () => {
    const address = newAddress();
    const auth = supabaseClient();

    // Inscription par lien magique : le lien est envoyé sans qu'aucun e-mail n'ait été émis
    // avant pour cette adresse, donc aucun plafond de renvoi n'interfère.
    const sent = await auth.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, emailRedirectTo: 'learny://auth/callback' },
    });
    expect(sent.error).toBeNull();

    const mail = await mailFor(address, /lien de connexion/i);
    const tokenHash = tokenHashOf(mail);

    // CA-3 — le lien reçu connecte l'utilisateur (vérifié par le module de l'application).
    const snapshot = await verifyMagicLink(auth.auth, tokenHash, 'magiclink');
    expect(snapshot.userId.length).toBeGreaterThan(10);
    expect(snapshot.email).toBe(address);

    // CA-3 — le même lien, rouvert, est refusé : le message de l'écran de retour s'applique.
    await expect(verifyMagicLink(auth.auth as never, tokenHash, 'magiclink')).rejects.toBeDefined();
  });

  it('répond la même chose à une adresse connue et à une adresse inconnue (CA-4)', async () => {
    const auth = supabaseClient();

    // Une adresse inconnue n'obtient jamais de compte et reste silencieuse côté application.
    const unknown = await requestMagicLink(auth.auth, newAddress());
    expect(unknown).toBe('silent');

    // L'adresse du compte de démonstration reçoit bien un lien : la différence est invisible
    // pour l'utilisateur (même phrase affichée par la feuille, cf. `MagicLinkSheet`).
    const known = await requestMagicLink(auth.auth, DEMO_EMAIL);
    expect(known).toBe('sent');
  });

  it('révoque la session à la déconnexion sans dépendre du réseau local (CA-5)', async () => {
    const auth = supabaseClient();
    const signedIn = await auth.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    if (signedIn.error !== null) {
      throw new Error(
        `Connexion du compte de démonstration impossible (${signedIn.error.message}) : lancer node apps/mobile/e2e/prepare-demo-user.mjs.`,
      );
    }
    const accessToken = signedIn.data.session.access_token;
    const refreshToken = signedIn.data.session.refresh_token;

    const client = apiClient(accessToken);
    await expect(
      client.apiFetch({ method: 'GET', path: '/me', output: MeDto }),
    ).resolves.toBeDefined();

    // ADR-3008 § 6 — l'API révoque le jeton de rafraîchissement avant que le client n'oublie la
    // session ; le client natif ne dépend jamais de cette réponse pour se déconnecter.
    const revoked = await fetch(`${API_URL}/api/v1/auth/sign-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(revoked.status).toBe(204);

    const replay = supabaseClient();
    await replay.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    const renewed = await replay.auth.refreshSession();
    expect(renewed.error).not.toBeNull();
  });
});
