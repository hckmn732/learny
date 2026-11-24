// Vitest [SPEC-3003] — integration against the local stack (CA-1, CA-2, CA-3).
//
// Requires `pnpm dev:up`, the demonstration seed (`pnpm db:seed:demo`), the API on
// http://127.0.0.1:3001 with `LLM_MODE=mock`, and the demonstration account prepared by
// `node apps/mobile/e2e/prepare-demo-user.mjs` (password from `MOBILE_DEMO_PASSWORD`).
// The caller sources `.env.local` so the anonymous key of the local Supabase stack is available:
//   set -a; . ./.env.local; set +a; node tools/sdd/validate.mjs SPEC-3003
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { MeDto } from '@learny/contracts';

import { createMobileApiClient } from '../../src/api/client';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';
const DEMO_EMAIL = ENV.MOBILE_DEMO_EMAIL ?? 'alex.perrin@demo.learny.test';
const DEMO_PASSWORD = ENV.MOBILE_DEMO_PASSWORD ?? 'learny-demo-3003';

interface CapturedRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.toString() : input.url;
}

/** Transport that records what the client sent, then delegates to the real `fetch`. */
function recordingFetch(captured: CapturedRequest[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[name.toLowerCase()] = value;
    }
    captured.push({ url: urlOf(input), headers });
    return fetch(input, init);
  });
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

describe('[SPEC-3003] client mobile contre la pile locale', () => {
  it('se connecte au compte de démonstration et lit /me avec le Bearer, sans cookie ni Origin (CA-1)', async () => {
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
    expect(accessToken.length).toBeGreaterThan(20);

    const captured: CapturedRequest[] = [];
    const client = createMobileApiClient({
      apiUrl: API_URL,
      token: { get: () => accessToken, refresh: () => Promise.resolve(false) },
      fetchImpl: recordingFetch(captured),
    });

    const me = await client.apiFetch({ method: 'GET', path: '/me', output: MeDto });

    expect(me.firstName).toBe('Alex');
    expect(me.email).toBe(DEMO_EMAIL);
    expect(me.timezone).toBe('Europe/Paris');

    const request = captured[0];
    expect(request).toBeDefined();
    expect(request?.url).toBe(`${API_URL}/api/v1/me`);
    // ADR-1005 — a native client proves itself with the Bearer only.
    expect(request?.headers.authorization).toMatch(/^Bearer ey/);
    expect(request?.headers.cookie).toBeUndefined();
    expect(request?.headers.origin).toBeUndefined();
    expect(request?.headers['accept-language']).toBe('fr');
    expect(request?.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('renouvelle une seule fois après un 401 puis rejoue la requête (CA-2)', async () => {
    const auth = supabaseClient();
    const signedIn = await auth.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    expect(signedIn.error).toBeNull();

    let current = 'jeton-invalide';
    let renewals = 0;

    const captured: CapturedRequest[] = [];
    const api = createMobileApiClient({
      apiUrl: API_URL,
      token: {
        get: () => current,
        refresh: () => {
          renewals += 1;
          return auth.auth.refreshSession().then(({ data, error }) => {
            if (error !== null || data.session === null) return false;
            current = data.session.access_token;
            return true;
          });
        },
      },
      fetchImpl: recordingFetch(captured),
    });

    const me = await api.apiFetch({ method: 'GET', path: '/me', output: MeDto });

    expect(me.firstName).toBe('Alex');
    expect(renewals).toBe(1);
    // One attempt with the invalid token, one replay with the renewed one.
    expect(captured).toHaveLength(2);
    expect(captured[0]?.headers.authorization).toBe('Bearer jeton-invalide');
    expect(captured[1]?.headers.authorization).toMatch(/^Bearer ey/);
  });
});
