// Vitest [SPEC-3501] — abonnements natifs contre la pile locale (CA-1, CA-5 ; EF-1, EF-3).
//
// Requires `pnpm dev:up`, the API on http://127.0.0.1:3001 with `PUSH_MODE=mock` and the service-role
// key of `.env.local` for the ephemeral account this suite creates. The caller sources `.env.local`:
//   set -a; . ./.env.local; set +a; node tools/sdd/validate.mjs SPEC-3501
//
// The demonstration account is never written: only the ephemeral account of this suite is, and it
// is deleted at the end (the deletion cascades to its push subscriptions). The suite registers a
// device token, refreshes it, removes it twice (idempotent) and checks that the historical Web Push
// body of SPEC-205 still passes the contract untouched (CA-5).
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';

const TOKEN = `learny-int-3501-${crypto.randomUUID()}`;
const ENDPOINT = `https://push.mock.learny.app/spec-3501-${crypto.randomUUID()}/success`;

interface Account {
  readonly userId: string;
  readonly email: string;
  readonly password: string;
  readonly token: string;
}

let account: Account | null = null;

function admin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function call(
  method: 'POST' | 'DELETE',
  path: string,
  body: unknown,
): Promise<{ status: number; data: unknown }> {
  if (account === null) throw new Error('compte éphémère absent');
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${account.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: text === '' ? null : JSON.parse(text) };
}

beforeAll(async () => {
  if (ANON_KEY === '' || SERVICE_KEY === '') {
    throw new Error('Clés Supabase absentes : sourcer .env.local puis lancer pnpm dev:up.');
  }
  const email = `sdd-3501-${crypto.randomUUID().slice(0, 12)}@test.learny.test`;
  const password = `pw-${crypto.randomUUID().slice(0, 16)}`;
  const created = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { timezone: 'Europe/Paris' },
  });
  if (created.error !== null) throw new Error(`createUser : ${created.error.message}`);
  const auth = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = await auth.auth.signInWithPassword({ email, password });
  if (signedIn.error !== null) throw new Error(`signIn : ${signedIn.error.message}`);
  account = {
    userId: created.data.user.id,
    email,
    password,
    token: signedIn.data.session.access_token,
  };
});

afterAll(async () => {
  if (account === null) return;
  await admin().auth.admin.deleteUser(account.userId);
  account = null;
});

describe('[SPEC-3501] abonnements natifs contre la pile locale', () => {
  it('inscrit un jeton natif puis rafraîchit le même appareil (EF-1, CL-3)', async () => {
    const created = (await call('POST', '/api/v1/me/push-subscriptions', {
      kind: 'fcm',
      token: TOKEN,
      platform: 'android',
      deviceName: 'Émulateur Android',
    })) as { status: number; data: { id: string; created: boolean } };
    const refreshed = (await call('POST', '/api/v1/me/push-subscriptions', {
      kind: 'fcm',
      token: TOKEN,
      platform: 'android',
      deviceName: 'Pixel 8',
    })) as { status: number; data: { id: string; created: boolean } };

    expect(created.status).toBe(200);
    expect(created.data.created).toBe(true);
    expect(refreshed.status).toBe(200);
    expect(refreshed.data.created).toBe(false);
    expect(refreshed.data.id).toBe(created.data.id);
  });

  it('refuse un jeton dont la forme est invalide (EF-3)', async () => {
    const refused = (await call('POST', '/api/v1/me/push-subscriptions', {
      kind: 'fcm',
      token: 'court',
    })) as { status: number; data: { code: string } };

    expect(refused.status).toBe(400);
    expect(refused.data.code).toBe('VALIDATION_FAILED');
  });

  it('désinscrit le jeton de façon idempotente (EF-1)', async () => {
    const first = await call('DELETE', '/api/v1/me/push-subscriptions', {
      kind: 'fcm',
      token: TOKEN,
    });
    const replay = await call('DELETE', '/api/v1/me/push-subscriptions', {
      kind: 'fcm',
      token: TOKEN,
    });

    expect(first.status).toBe(204);
    expect(replay.status).toBe(204);
  });

  it('accepte encore le corps Web Push de SPEC-205 sans kind (EF-3, CA-5)', async () => {
    const created = (await call('POST', '/api/v1/me/push-subscriptions', {
      endpoint: ENDPOINT,
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      userAgent: 'Firefox',
    })) as { status: number; data: { created: boolean } };
    const removed = await call('DELETE', '/api/v1/me/push-subscriptions', { endpoint: ENDPOINT });

    expect(created.status).toBe(200);
    expect(created.data.created).toBe(true);
    expect(removed.status).toBe(204);
  });
});
