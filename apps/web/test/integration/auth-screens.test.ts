import { randomBytes } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { closeDb, serviceDb, sql } from '@learny/db';
import { setSignedUpEmitter } from '@learny/services';
import { extractAuthLink, waitForMail } from '@learny/testing/auth';
import { supabaseLocalEnv } from '@learny/testing/supabase';

import { GET as callback } from '../../app/api/v1/auth/callback/route';
import { POST as magicLink } from '../../app/api/v1/auth/magic-link/route';
import { POST as resend } from '../../app/api/v1/auth/resend/route';
import { POST as signUp } from '../../app/api/v1/auth/sign-up/route';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };
const PASSWORD = `pw-${randomBytes(12).toString('hex')}`;
const emails: string[] = [];

function newEmail(): string {
  const email = `screens-${randomBytes(5).toString('hex')}@test.learny.test`;
  emails.push(email);
  return email;
}

let address = 0;
function post(path: string, body: unknown): NextRequest {
  address += 1;
  return new NextRequest(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: BASE,
      'x-forwarded-for': `10.91.${String(address & 255)}.${String(1 + (address % 250))}`,
    },
    body: JSON.stringify(body),
  });
}

type RouteFn = (request: NextRequest, segment: typeof NO_SEGMENT) => Promise<Response>;
const call = (route: RouteFn, path: string, body: unknown) => route(post(path, body), NO_SEGMENT);

beforeAll(() => {
  const env = supabaseLocalEnv();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', env.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', env.anonKey);
  vi.stubEnv('ENABLE_SDD_PAGES', 'true');
  vi.stubEnv('TRUST_PROXY', 'true');
  setSignedUpEmitter(() => Promise.resolve());
});

afterAll(async () => {
  const { url, serviceRoleKey } = supabaseLocalEnv();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  for (const email of emails) {
    const rows = await serviceDb().execute<{ id: string }>(
      sql`select id from auth.users where email = ${email}`,
    );
    for (const row of rows) await admin.auth.admin.deleteUser(row.id);
  }
  await closeDb();
  vi.unstubAllEnvs();
});

describe('[SPEC-601] parcours d’authentification', () => {
  it('inscrit par mot de passe, envoie la confirmation et enregistre les conditions au callback', async () => {
    const email = newEmail();
    const created = await call(signUp, '/api/v1/auth/sign-up', {
      email,
      password: PASSWORD,
      acceptedTerms: true,
      timezone: 'America/New_York',
    });
    expect(created.status).toBe(201);
    expect(created.headers.getSetCookie()).toEqual([]);

    const mail = await waitForMail(email, { subject: 'Confirmez votre adresse e-mail' });
    const link = extractAuthLink(mail);
    expect(link.searchParams.get('type')).toBe('signup');

    // CA-2 — the link opens a session and leads to the first onboarding step.
    const verified = await callback(new NextRequest(`${BASE}${link.pathname}${link.search}`));
    expect(verified.status).toBe(302);
    expect(verified.headers.get('location')).toBe('/premiers-pas/profil');

    // ET-5 — the two legal acceptances, the version and the transmitted time zone.
    const profile = await serviceDb().execute<{
      terms_version: string | null;
      terms_accepted_at: string | null;
      timezone: string;
    }>(
      sql`select terms_version, terms_accepted_at, timezone
            from public.profiles where email = ${email}`,
    );
    expect(profile[0]?.terms_version).toBe('cgu:2026-11-11;privacy:2026-11-11');
    expect(Date.parse(profile[0]?.terms_accepted_at ?? '')).toBe(
      Date.parse('2026-11-11T12:20:00Z'),
    );
    expect(profile[0]?.timezone).toBe('America/New_York');

    const acceptances = await serviceDb().execute<{ document: string; version: string }>(
      sql`select la.document::text as document, la.version
            from public.legal_acceptances la
            join public.profiles p on p.id = la.user_id
           where p.email = ${email}
           order by la.document`,
    );
    expect(acceptances.map((row) => [row.document, row.version])).toEqual([
      ['cgu', '2026-11-11'],
      ['privacy', '2026-11-11'],
    ]);
  });

  it('répond 202 à un lien de connexion pour une adresse inconnue (ET-6)', async () => {
    const unknown = newEmail();
    const response = await call(magicLink, '/api/v1/auth/magic-link', {
      mode: 'sign-in',
      email: unknown,
    });
    expect(response.status).toBe(202);
  });

  it('refuse un second renvoi dans les 60 s avec Retry-After (CA-5)', async () => {
    const email = newEmail();
    const created = await call(signUp, '/api/v1/auth/sign-up', {
      email,
      password: PASSWORD,
      acceptedTerms: true,
    });
    expect(created.status).toBe(201);
    await waitForMail(email, { subject: 'Confirmez votre adresse e-mail' });

    const tooSoon = await call(resend, '/api/v1/auth/resend', { email, kind: 'signup' });
    expect(tooSoon.status).toBe(429);
    const problem = (await tooSoon.json()) as { code: string };
    expect(problem.code).toBe('RESEND_TOO_SOON');
    expect(Number(tooSoon.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
