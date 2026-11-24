// Vitest [SPEC-3401] — profil, notifications, pause, export et suppression contre la pile locale
// (CA-2, CA-3, CA-4).
//
// Requires `pnpm dev:up`, the API on http://127.0.0.1:3001 with `LLM_MODE=mock` and the service-role
// key of `.env.local` for the ephemeral account this suite creates. The caller sources `.env.local`:
//   set -a; . ./.env.local; set +a; node tools/sdd/validate.mjs SPEC-3401
//
// The demonstration account is **never** written: only the ephemeral account of this suite is, and
// it is deleted at the end (the deletion cascades to its rows). This is the same rule as the web
// suites of SPEC-721: a pause freezes the planning and a resume replans it, so it can never run on
// the demonstration dataset.
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { NotificationSettingsDto, PauseStateDto, SettingsState } from '@learny/contracts';

const ENV = process.env as Record<string, string | undefined>;
const SUPABASE_URL =
  ENV.MOBILE_SUPABASE_URL ?? ENV.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY = ENV.MOBILE_SUPABASE_ANON_KEY ?? ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const SERVICE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? '';
const API_URL = ENV.MOBILE_API_URL ?? 'http://127.0.0.1:3001';

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
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  if (account === null) throw new Error('compte éphémère absent');
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${account.token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(method === 'GET' || method === 'DELETE'
        ? {}
        : { 'idempotency-key': crypto.randomUUID() }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, data: text === '' ? null : JSON.parse(text) };
}

beforeAll(async () => {
  if (ANON_KEY === '' || SERVICE_KEY === '') {
    throw new Error('Clés Supabase absentes : sourcer .env.local puis lancer pnpm dev:up.');
  }
  const email = `sdd-3401-${crypto.randomUUID().slice(0, 12)}@test.learny.test`;
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

describe('[SPEC-3401] profil et rythme', () => {
  it('lit le profil et son rythme avec la version attendue (CA-2)', async () => {
    const { status, data } = (await call('GET', '/api/v1/me/profile')) as {
      status: number;
      data: SettingsState;
    };
    expect(status).toBe(200);
    expect(data.me.timezone).toBe('Europe/Paris');
    expect(data.rhythm.hoursPerDay).toBeGreaterThanOrEqual(1);
    expect(data.rhythm.hoursPerDay).toBeLessThanOrEqual(6);
    expect(data.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    expect(data.deletionScheduledFor).toBeNull();
  });

  it('enregistre le ton et le rythme en une transaction (CA-2, BR-SET-02)', async () => {
    const read = (await call('GET', '/api/v1/me/profile')) as { data: SettingsState };
    const saved = (await call('PATCH', '/api/v1/me/profile', {
      firstName: 'Camille',
      tutorTone: 'tu',
      rhythm: { hoursPerDay: 3, studyDays: [2, 4], preferredSlots: ['matin'] },
      expectedUpdatedAt: read.data.updatedAt,
    })) as { status: number; data: SettingsState };
    expect(saved.status).toBe(200);
    expect(saved.data.me.firstName).toBe('Camille');
    expect(saved.data.me.tutorTone).toBe('tu');
    expect(saved.data.rhythm).toEqual({
      hoursPerDay: 3,
      studyDays: [2, 4],
      preferredSlots: ['matin'],
    });

    const reread = (await call('GET', '/api/v1/me/profile')) as { data: SettingsState };
    expect(reread.data.me.tutorTone).toBe('tu');
    expect(reread.data.rhythm.hoursPerDay).toBe(3);
  });

  it('refuse une version périmée (CL-1)', async () => {
    const read = (await call('GET', '/api/v1/me/profile')) as { data: SettingsState };
    const stale = (await call('PATCH', '/api/v1/me/profile', {
      tutorTone: 'vous',
      expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
    })) as { status: number; data: { code: string } };
    expect(stale.status).toBe(409);
    expect(stale.data.code).toBe('CONFLICT');
    const unchanged = (await call('GET', '/api/v1/me/profile')) as { data: SettingsState };
    expect(unchanged.data.me.tutorTone).toBe('tu');
    expect(unchanged.data.updatedAt).toBe(read.data.updatedAt);
  });
});

describe('[SPEC-3401] réglages de notifications', () => {
  it('enregistre un patch partiel et son compteur (CA-3, BR-SET-03)', async () => {
    const read = (await call('GET', '/api/v1/me/notification-settings')) as {
      status: number;
      data: NotificationSettingsDto;
    };
    expect(read.status).toBe(200);
    expect(read.data.channels.app).toBe(true);

    const saved = (await call('PATCH', '/api/v1/me/notification-settings', {
      types: { gap: false },
      expectedUpdatedAt: read.data.updatedAt,
    })) as { status: number; data: NotificationSettingsDto };
    expect(saved.status).toBe(200);
    expect(saved.data.types.gap).toBe(false);
    expect(saved.data.activeTypeCount).toBeLessThan(read.data.activeTypeCount);

    const restored = (await call('PATCH', '/api/v1/me/notification-settings', {
      types: { gap: true },
      expectedUpdatedAt: saved.data.updatedAt,
    })) as { data: NotificationSettingsDto };
    expect(restored.data.types.gap).toBe(true);
  });
});

describe('[SPEC-3401] pause et reprise', () => {
  it('met le compte en pause puis le reprend (CA-4, BR-AUT-10)', async () => {
    const initial = (await call('GET', '/api/v1/me/pause')) as {
      status: number;
      data: PauseStateDto;
    };
    expect(initial.status).toBe(200);
    expect(initial.data.status).toBe('none');

    const started = (await call('POST', '/api/v1/me/pause', {
      endDate: '2026-11-20',
      diagnosticEnabled: true,
    })) as { status: number; data: PauseStateDto };
    expect(started.status).toBe(200);
    expect(started.data.status).toBe('active');
    expect(started.data.endsOn).toBe('2026-11-20');

    const resumed = (await call('DELETE', '/api/v1/me/pause')) as {
      status: number;
      data: PauseStateDto;
    };
    expect(resumed.status).toBe(200);
    expect(resumed.data.status).toBe('ended');
  });
});

describe('[SPEC-3401] données et confidentialité', () => {
  it('demande l’export et suit son état (CA-4, BR-ACC-10)', async () => {
    const requested = (await call('POST', '/api/v1/me/export')) as {
      status: number;
      data: { exportId: string; status: string };
    };
    expect(requested.status).toBe(202);
    expect(requested.data.status).toBe('queued');

    const read = (await call('GET', `/api/v1/me/exports/${requested.data.exportId}`)) as {
      status: number;
      data: { id: string; status: string };
    };
    expect(read.status).toBe(200);
    expect(read.data.id).toBe(requested.data.exportId);
    expect(['queued', 'running', 'done']).toContain(read.data.status);
  });

  it('annule une suppression non programmée sans erreur (CA-4, BR-ACC-11)', async () => {
    const cancelled = (await call('DELETE', '/api/v1/me/deletion')) as { status: number };
    expect(cancelled.status).toBe(204);
    const profile = (await call('GET', '/api/v1/me/profile')) as { data: SettingsState };
    expect(profile.data.deletionScheduledFor).toBeNull();
  });
});
