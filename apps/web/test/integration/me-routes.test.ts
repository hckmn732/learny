import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, serviceDb, sql, userDb } from '@learny/db';
import {
  createTestSession,
  deleteTestSession,
  supabaseLocalEnv,
  type TestSession,
} from '@learny/testing/supabase';

import {
  GET as getPreferences,
  PATCH as patchPreferences,
} from '../../app/api/v1/me/preferences/route';
import { GET as getMe, PATCH as patchMe } from '../../app/api/v1/me/route';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };
const sessions: TestSession[] = [];

beforeAll(() => {
  const env = supabaseLocalEnv();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', env.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', env.anonKey);
  vi.stubEnv('TRUST_PROXY', 'true');
});

beforeEach(() => {
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
});

afterEach(async () => {
  vi.restoreAllMocks();
  while (sessions.length > 0) {
    const session = sessions.pop();
    if (session !== undefined) await deleteTestSession(session);
  }
});

afterAll(async () => {
  await closeDb();
  vi.unstubAllEnvs();
});

async function session(): Promise<TestSession> {
  const created = await createTestSession();
  sessions.push(created);
  return created;
}

function request(method: 'GET' | 'PATCH', cookie: string, path: string, body?: unknown) {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: { cookie, origin: BASE, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function problem(response: Response): Promise<{ code: string; status: number }> {
  const json = (await response.json()) as { code: string; status: number };
  return json;
}

describe('[SPEC-602] routes /me', () => {
  it('CA-6 — refuse 0 h et 7 h, un jour vide et un fuseau inconnu', async () => {
    const current = await session();
    const zero = await patchPreferences(
      request('PATCH', current.cookieHeader, '/api/v1/me/preferences', {
        hoursPerDay: 0,
        studyDays: [1],
        preferredSlots: ['soir'],
      }),
      NO_SEGMENT,
    );
    expect(zero.status).toBe(400);
    expect((await problem(zero)).code).toBe('VALIDATION_FAILED');

    const seven = await patchPreferences(
      request('PATCH', current.cookieHeader, '/api/v1/me/preferences', {
        hoursPerDay: 7,
        studyDays: [1],
        preferredSlots: ['soir'],
      }),
      NO_SEGMENT,
    );
    expect(seven.status).toBe(400);

    const empty = await patchPreferences(
      request('PATCH', current.cookieHeader, '/api/v1/me/preferences', {
        hoursPerDay: 2,
        studyDays: [],
        preferredSlots: ['soir'],
      }),
      NO_SEGMENT,
    );
    expect(empty.status).toBe(400);

    const zone = await patchMe(
      request('PATCH', current.cookieHeader, '/api/v1/me', { timezone: 'Mars/Olympus' }),
      NO_SEGMENT,
    );
    expect(zone.status).toBe(400);
  });

  it('CA-2 — enregistre le profil et le rythme, relus par GET', async () => {
    const current = await session();
    const patched = await patchMe(
      request('PATCH', current.cookieHeader, '/api/v1/me', {
        firstName: 'Alex',
        tutorTone: 'tu',
        courseLanguage: 'en',
        timezone: 'Europe/Paris',
      }),
      NO_SEGMENT,
    );
    expect(patched.status).toBe(200);
    const me = await getMe(request('GET', current.cookieHeader, '/api/v1/me'), NO_SEGMENT);
    const body = (await me.json()) as {
      firstName: string;
      tutorTone: string;
      courseLanguage: string;
    };
    expect(body).toMatchObject({ firstName: 'Alex', tutorTone: 'tu', courseLanguage: 'en' });

    const rhythm = await patchPreferences(
      request('PATCH', current.cookieHeader, '/api/v1/me/preferences', {
        hoursPerDay: 5,
        studyDays: [1, 2, 3, 4, 5],
        preferredSlots: ['matin', 'apres_midi'],
      }),
      NO_SEGMENT,
    );
    expect(rhythm.status).toBe(200);
    const read = await getPreferences(
      request('GET', current.cookieHeader, '/api/v1/me/preferences'),
      NO_SEGMENT,
    );
    expect(await read.json()).toMatchObject({
      hoursPerDay: 5,
      preferredSlots: ['matin', 'apres_midi'],
    });
  });

  it('refuse la lecture du profil d’un autre apprenant (RLS)', async () => {
    const first = await session();
    const second = await session();
    const rows = await userDb({ userId: first.userId }).run((tx) =>
      tx.execute<{ id: string }>(
        sql`select id::text as id from public.profiles where id = ${second.userId}::uuid`,
      ),
    );
    expect(rows).toHaveLength(0);

    const own = await getMe(request('GET', first.cookieHeader, '/api/v1/me'), NO_SEGMENT);
    expect((await own.json()) as { id: string }).toMatchObject({ id: first.userId });
    await serviceDb().execute(sql`select 1`);
  });
});
