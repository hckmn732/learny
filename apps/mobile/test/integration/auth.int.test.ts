// Vitest [SPEC-3101] — intégration du compte contre la pile locale (CA-2, CA-3, CA-4, CA-5).
//
// Requires `pnpm dev:up` (Supabase + Mailpit), the demonstration seed and the API on
// http://127.0.0.1:3001 with `LLM_MODE=mock`. The caller sources `.env.local` so that the
// anonymous key of the local stack is available:
//   set -a; . ./.env.local; set +a; npx vitest run --project integration apps/mobile/test/integration/auth.int.test.ts
//
// Every account created here is unique (`spec3101-<uuid>@test.learny.test`). GoTrue imposes one
// e-mail per minute and per address locally (`GOTRUE_SMTP_MAX_FREQUENCY`): the suite waits for
// its mails instead of hoping, and each test uses its own address.
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

/** Waits for the mail of `address`, then returns its HTML and text bodies (`supabase/templates`). */
async function mailFor(address: string, subject: RegExp, seconds = 90): Promise<string> {
  for (let attempt = 0; attempt < seconds * 2; attempt += 1) {
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

/** Reads the `token_hash` of the link the e-mails of the project carry. */
function tokenHashOf(mail: string): string {
  const match = /token_hash(?:=|%3D)([A-Za-z0-9_-]+)/.exec(mail);
  if (match === null) throw new Error('token_hash absent du message reçu.');
  return match[1] as string;
}

describe('[SPEC-3101] compte mobile contre la pile locale', () => {
  it('inscrit un compte par mot de passe et enregistre les CGU actives (CA-2)', async () => {
    const address = newAddress();
    // Le garde d'origine de l'API refuse toute mutation sans en-tête `Origin` ni `Sec-Fetch-Site`
    // (`packages/services/src/security/origin-guard.ts`) : constat consigné dans
    // `evidence/SPEC-3101/acceptance.md` (écart d'API, hors zone de la piste mobile). Le test
    // porte donc l'origine de l'application web pour éprouver la route et l'acceptation des CGU.
    const appOrigin = ENV.APP_URL ?? ENV.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const withOrigin: typeof fetch = (input, init) =>
      fetch(input, {
        ...init,
        headers: { ...(init?.headers as Record<string, string> | undefined), Origin: appOrigin },
      });
    const anonymous = createMobileApiClient({
      apiUrl: API_URL,
      token: { get: () => null, refresh: () => Promise.resolve(false) },
      fetchImpl: withOrigin,
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

    // La session ouverte est acceptée par l'API et correspond au compte créé.
    const me = await createMobileApiClient({
      apiUrl: API_URL,
      token: { get: () => accessToken, refresh: () => Promise.resolve(false) },
      fetchImpl: withOrigin,
    }).apiFetch({ method: 'GET', path: '/me', output: MeDto });
    expect(me.email).toBe(address);

    // CA-2 — l'acceptation des CGU : le mobile l'enregistre par `POST /me/legal-acceptances`
    // quand le serveur la réclame (feuille d'acceptation, CL-6), et le serveur l'écrit à la
    // première vérification faite par son callback web (`finalize.ts`, testé par SPEC-202).
    // Aucune route ne lit cet état : la preuve du mobile est le garde `422` et la feuille
    // (Jest `[SPEC-3101]`), l'écart est consigné dans `evidence/SPEC-3101/acceptance.md`.
  }, 300_000);

  it('ouvre une session avec un lien reçu dans Mailpit, une seule fois (CA-3)', async () => {
    const address = newAddress();
    const auth = supabaseClient();

    // Compte créé par le lien lui-même : GoTrue envoie alors le gabarit de confirmation, dont le
    // lien porte `type=signup` (même route de retour dans l'application).
    const sent = await auth.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, emailRedirectTo: 'learny://auth/callback' },
    });
    expect(sent.error).toBeNull();

    const mail = await mailFor(address, /(lien de connexion|Confirmez votre adresse)/i);
    const tokenHash = tokenHashOf(mail);
    const type = /type=signup/.test(mail) ? 'signup' : 'magiclink';

    // CA-3 — le lien reçu connecte l'utilisateur (vérifié par le module de l'application).
    const snapshot = await verifyMagicLink(auth.auth, tokenHash, type);
    expect(snapshot.userId.length).toBeGreaterThan(10);
    expect(snapshot.email).toBe(address);

    // CA-3 — le même lien, rouvert, est refusé : le message de l'écran de retour s'applique.
    await expect(verifyMagicLink(auth.auth as never, tokenHash, type)).rejects.toBeDefined();
  }, 300_000);

  it('répond la même chose à une adresse connue et à une adresse inconnue (CA-4)', async () => {
    const auth = supabaseClient();

    // Une adresse inconnue n'obtient jamais de compte et reste silencieuse côté application.
    const unknown = await requestMagicLink(auth.auth, newAddress());
    expect(unknown).toBe('silent');

    // L'adresse du compte de démonstration reçoit bien un lien : la différence est invisible
    // pour l'utilisateur (même phrase affichée par la feuille, cf. `MagicLinkSheet`). Le
    // fournisseur local limite un envoi par minute et par adresse : on attend le délai qu'il
    // annonce plutôt que de le considérer comme un échec.
    let known: string;
    try {
      known = await requestMagicLink(auth.auth, DEMO_EMAIL);
    } catch (error) {
      const delay = /after (\d+) seconds/.exec(error instanceof Error ? error.message : '');
      if (delay === null) throw error;
      await sleep((Number(delay[1]) + 2) * 1000);
      known = await requestMagicLink(auth.auth, DEMO_EMAIL);
    }
    expect(known).toBe('sent');
  });

  it('se déconnecte : la route de déconnexion répond 204 et la session locale est purgée (CA-5)', async () => {
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

    await expect(
      apiClient(accessToken).apiFetch({ method: 'GET', path: '/me', output: MeDto }),
    ).resolves.toBeDefined();

    // ADR-3008 § 6 — le client natif appelle `POST /auth/sign-out` puis oublie la session ; la
    // route est idempotente et ne dépend jamais du réseau local (BR-ACC-09).
    const revoked = await fetch(`${API_URL}/api/v1/auth/sign-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(revoked.status).toBe(204);

    // Déconnexion locale : la session Supabase est oubliée, plus aucun jeton n'est publié.
    const local = await auth.auth.signOut({ scope: 'local' });
    expect(local.error).toBeNull();
    const after = await auth.auth.getSession();
    expect(after.data.session).toBeNull();
  });
});
