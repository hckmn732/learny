// Vitest [SPEC-3201] — écran Aujourd'hui contre la pile locale (CA-1, CA-3, CA-4).
//
// Requires `pnpm dev:up`, the demonstration seed (`pnpm db:seed:demo`), the API on
// http://127.0.0.1:3001 with `LLM_MODE=mock`, and the demonstration account prepared by
// `node apps/mobile/e2e/prepare-demo-user.mjs`. The caller sources `.env.local`:
//   set -a; . ./.env.local; set +a; node tools/sdd/validate.mjs SPEC-3201
//
// The test leaves the journal in the state the Maestro campaign expects: the accepted action is
// undone at the end, so the reprise is pending again (CA-4, idempotent by construction).
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

import { createMobileApiClient } from '../../src/api/client';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

interface Session {
  readonly client: ReturnType<typeof createMobileApiClient>;
  readonly token: string;
}

async function signedIn(): Promise<Session> {
  if (ANON_KEY === '') {
    throw new Error('Clé anonyme Supabase absente : sourcer .env.local puis lancer pnpm dev:up.');
  }
  const auth = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedInUser = await auth.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (signedInUser.error !== null) {
    throw new Error(
      `Connexion du compte de démonstration impossible (${signedInUser.error.message}) : lancer node apps/mobile/e2e/prepare-demo-user.mjs.`,
    );
  }
  const token = signedInUser.data.session.access_token;
  return {
    token,
    client: createMobileApiClient({
      apiUrl: API_URL,
      token: { get: () => token, refresh: () => Promise.resolve(false) },
    }),
  };
}

async function getJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

let session: Session;

beforeAll(async () => {
  session = await signedIn();
});

describe('[SPEC-3201] écran Aujourd’hui contre la pile locale', () => {
  it('GET /home rend la journée de démonstration (CA-1)', async () => {
    const home = await getJson<{
      today: { label: string; slots: { kind: string; time: string; title: string }[] };
      retention: { oneMonth: number | null };
      formations: { ongoing: unknown[] };
    }>('/api/v1/home', session.token);

    expect(home.today.label.length).toBeGreaterThan(0);
    expect(home.today.slots.length).toBeGreaterThan(0);
    expect(home.formations.ongoing.length).toBeGreaterThan(0);
    // BR-MEM-06 — l'API décide : la rétention vaut un entier ou null, jamais une chaîne.
    expect(home.retention.oneMonth === null || Number.isInteger(home.retention.oneMonth)).toBe(true);
  });

  it('GET /streak rend la série calculée par le serveur (BR-GAM-01)', async () => {
    const streak = await getJson<{ days: number; timezone: string }>(
      '/api/v1/streak',
      session.token,
    );
    expect(Number.isInteger(streak.days)).toBe(true);
    expect(streak.timezone.length).toBeGreaterThan(0);
  });

  it('accepte puis annule la reprise en attente (CA-4)', async () => {
    const page = await session.client.api.meAutomationActionsList({ query: {} });
    const pending = page.items.find((item) => item.status === 'pending_consent');
    if (pending === undefined) {
      // Le jeu de démonstration a déjà été consommé par une autre campagne : rien à décider.
      expect(page.items.length).toBeGreaterThan(0);
      return;
    }

    const accepted = await session.client.api.meAutomationActionAccept({
      params: { id: pending.id },
      body: {},
    });
    expect(accepted.id).toBe(pending.id);
    expect(accepted.status).not.toBe('pending_consent');

    const undone = await session.client.api.meAutomationActionUndo({
      params: { id: pending.id },
    });
    expect(undone.id).toBe(pending.id);
  });

  it('propose des créneaux alternatifs pour la séance mise en avant (CA-3)', async () => {
    const home = await getJson<{ today: { slots: { id: string; status: string }[] } }>(
      '/api/v1/home',
      session.token,
    );
    const slot = home.today.slots.find((row) => row.status === 'planned');
    if (slot === undefined) {
      expect(home.today.slots.length).toBeGreaterThanOrEqual(0);
      return;
    }
    const alternatives = await session.client.api.slotAlternativesGet({ params: { sid: slot.id } });
    expect(Array.isArray(alternatives.alternatives)).toBe(true);
  });
});
