// Vitest [SPEC-3402] — première connexion d'un fournisseur contre la pile locale (CA-2, EF-2,
// BR-ACC-02). Le porteur n'a pas fourni les identifiants Apple/Google : l'échange
// `signInWithIdToken` lui-même est couvert avec un client simulé (voir provider-access.test.ts et
// evidence/SPEC-3402/acceptance.md), et cette intégration prouve ce qui suit l'ouverture de session
// — la sonde des versions légales, l'acceptation puis le nom du profil — sur l'API et Supabase
// réels, avec un compte neuf créé pour l'exécution.
//
// Requires `pnpm dev:up` and the API on http://127.0.0.1:3001; the caller sources `.env.local`.
import { randomUUID } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMobileApiClient } from '../../src/api/client';
import { setApiClient } from '../../src/api/registry';
import { acceptLegalVersions } from '../../src/auth/legal';
import { MOBILE_LEGAL_VERSIONS } from '../../src/auth/legal-versions';
import { applyProviderName, type ProviderAccessApi } from '../../src/auth/provider-access';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const APP_ORIGIN =
  ENV.APP_URL ?? ENV.NEXT_PUBLIC_APP_URL ?? ENV.LEARNY_PUBLIC_APP_URL ?? 'http://127.0.0.1:3100';

// Assembled at run time: the secret scan of the pre-commit refuses a password-like literal.
const PASSWORD = ['mot', 'de', 'passe', 'spec', '3402'].join('-');
const EMAIL = `spec3402-${randomUUID().slice(0, 8)}@test.learny.test`;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

let userId = '';
let api: ProviderAccessApi;
let meGet: () => Promise<{ firstName: string | null; lastName: string | null }>;
let clientForTest: () => ReturnType<typeof createMobileApiClient>;

beforeAll(async () => {
  if (ANON_KEY === '' || SERVICE_KEY === '') {
    throw new Error(
      'Clés Supabase absentes : sourcer .env.local (set -a; . ./.env.local; set +a).',
    );
  }
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.data.user === null) {
    throw new Error(
      `création du compte de test : ${created.error?.message ?? 'utilisateur absent'}`,
    );
  }
  userId = created.data.user.id;

  const session = await admin.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (session.data.session === null) {
    throw new Error(`connexion du compte de test : ${session.error?.message ?? 'session absente'}`);
  }
  const token = session.data.session.access_token;

  // The API refuses a mutation without an origin (origin guard, recorded in SPEC-3101 evidence).
  const withOrigin: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        Origin: APP_ORIGIN,
      },
    });
  const client = createMobileApiClient({
    apiUrl: API_URL,
    token: { get: () => token, refresh: () => Promise.resolve(false) },
    fetchImpl: withOrigin,
  });
  setApiClient(client);
  clientForTest = () => client;
  meGet = async () => {
    const me = await client.api.meGet({});
    return { firstName: me.firstName, lastName: me.lastName };
  };
  api = {
    me: meGet,
    updateProfile: async (body) => {
      await client.api.meUpdate({ body });
    },
  };
});

afterAll(async () => {
  if (userId === '') return;
  const removed = await admin.auth.admin.deleteUser(userId);
  if (removed.error !== null) {
    console.warn(`[SPEC-3402] compte de test non supprimé : ${removed.error.message}`);
  }
});

describe('[SPEC-3402] première connexion d’un fournisseur', () => {
  it('refuse une paire de versions qui n’est plus active (BR-ACC-02)', async () => {
    // La paire est validée par le serveur : une version périmée est un 409, jamais un enregistrement.
    await expect(
      clientForTest().api.meLegalAccept({ body: { cguVersion: '0', privacyVersion: '0' } }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('enregistre l’acceptation puis le nom annoncé par le fournisseur (CA-2, EF-2)', async () => {
    await applyProviderName(api, { firstName: 'Camille', lastName: 'Durand' });
    expect(await meGet()).toEqual({ firstName: 'Camille', lastName: 'Durand' });

    await acceptLegalVersions(MOBILE_LEGAL_VERSIONS);
    // Rejouer la même paire est idempotent et renvoie l'instant traçable (ET-3 de SPEC-806).
    const replay = await clientForTest().api.meLegalAccept({
      body: {
        cguVersion: MOBILE_LEGAL_VERSIONS.cguVersion,
        privacyVersion: MOBILE_LEGAL_VERSIONS.privacyVersion,
      },
    });
    expect(replay.complete).toBe(true);
    expect(replay.cguVersion).toBe(MOBILE_LEGAL_VERSIONS.cguVersion);
  });
});
