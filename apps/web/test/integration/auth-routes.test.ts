import { randomBytes } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetails } from '@learny/contracts';
import { closeDb, serviceDb, sql } from '@learny/db';
import { setSignedUpEmitter, type SignedUpEvent } from '@learny/services';
import { extractAuthLink, listMail, mailCount, waitForMail } from '@learny/testing/auth';
import { createTestSession, deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';

import { GET as callback } from '../../app/api/v1/auth/callback/route';
import { POST as magicLink } from '../../app/api/v1/auth/magic-link/route';
import { POST as resend } from '../../app/api/v1/auth/resend/route';
import { POST as signIn } from '../../app/api/v1/auth/sign-in/route';
import { POST as signOut } from '../../app/api/v1/auth/sign-out/route';
import { POST as signUp } from '../../app/api/v1/auth/sign-up/route';
import { GET as getItems } from '../../app/api/v1/dev/sdd/items/route';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };
// Generated at run time: no credential literal lives in the repository.
const PASSWORD = `pw-${randomBytes(12).toString('hex')}`;
const WRONG = `wrong-${randomBytes(12).toString('hex')}`;
const emails: string[] = [];
let events: SignedUpEvent[] = [];
let restoreEmitter: () => void = () => undefined;

function newEmail(): string {
  const email = `auth-${randomBytes(5).toString('hex')}@test.learny.test`;
  emails.push(email);
  return email;
}

// Each request comes from its own address (the proxy header is trusted in this suite), so the
// IP-keyed `auth` bucket of SPEC-208 never runs dry between unrelated tests.
let addressCounter = 0;
function nextAddress(): string {
  addressCounter += 1;
  return `10.${String((addressCounter >> 8) & 255)}.${String(addressCounter & 255)}.${String(1 + (addressCounter % 250))}`;
}

function post(path: string, body: unknown, cookie?: string): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: BASE,
      'x-forwarded-for': nextAddress(),
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: JSON.stringify(body),
  });
}

type RouteFn = (request: NextRequest, segment: typeof NO_SEGMENT) => Promise<Response>;
const call = (route: RouteFn, path: string, body: unknown, cookie?: string) =>
  route(post(path, body, cookie), NO_SEGMENT);

/** Cookie header a browser would send back after these answers (expired cookies dropped). */
function cookieHeader(...responses: Response[]): string {
  const jar = new Map<string, string>();
  for (const response of responses) {
    for (const line of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = line.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
      if (expired || value === '') jar.delete(name);
      else jar.set(name, value);
    }
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function problem(response: Response) {
  expect(response.headers.get('content-type')).toContain('application/problem+json');
  return ProblemDetails.parse(await response.json());
}

function verify(token: URL): NextRequest {
  return new NextRequest(`${BASE}${token.pathname}${token.search}`);
}

async function profileOf(email: string) {
  const rows = await serviceDb().execute<{
    id: string;
    onboarding_step: string;
    terms_version: string | null;
    timezone: string;
  }>(
    sql`select id, onboarding_step::text, terms_version, timezone from public.profiles where email = ${email}`,
  );
  return rows[0];
}

/** Signs a new password account up and confirms it through its e-mail link. */
async function confirmedAccount(timezone?: string) {
  const email = newEmail();
  const created = await call(signUp, '/api/v1/auth/sign-up', {
    email,
    password: PASSWORD,
    acceptedTerms: true,
    ...(timezone === undefined ? {} : { timezone }),
  });
  expect(created.status).toBe(201);
  const mail = await waitForMail(email, { subject: 'Confirmez votre adresse e-mail' });
  const verified = await callback(verify(extractAuthLink(mail)));
  return { email, verified };
}

beforeAll(() => {
  const env = supabaseLocalEnv();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', env.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', env.anonKey);
  vi.stubEnv('ENABLE_SDD_PAGES', 'true');
  vi.stubEnv('TRUST_PROXY', 'true');
});

beforeEach(() => {
  events = [];
  restoreEmitter = setSignedUpEmitter((event) => {
    events.push(event);
    return Promise.resolve();
  });
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  restoreEmitter();
  vi.restoreAllMocks();
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

describe('[SPEC-202] authentification — mot de passe', () => {
  it('refuses a password shorter than 12 characters (CA-2)', async () => {
    const response = await call(signUp, '/api/v1/auth/sign-up', {
      email: newEmail(),
      password: 'a'.repeat(11),
      acceptedTerms: true,
    });
    expect(response.status).toBe(400);
    expect((await problem(response)).errors?.[0]?.path).toBe('body.password');
  });

  it('requires the acceptance of the terms and a known time zone (CL-9)', async () => {
    const noTerms = await call(signUp, '/api/v1/auth/sign-up', {
      email: newEmail(),
      password: PASSWORD,
      acceptedTerms: false,
    });
    expect(noTerms.status).toBe(400);
    const badZone = await call(signUp, '/api/v1/auth/sign-up', {
      email: newEmail(),
      password: PASSWORD,
      acceptedTerms: true,
      timezone: 'Mars/Phobos',
    });
    expect(badZone.status).toBe(400);
    expect((await problem(badZone)).errors?.[0]?.path).toBe('body.timezone');
  });

  it('sign-up, confirmation, then sign-in with cookies (CA-1, CA-2, EF-10)', async () => {
    const email = newEmail();
    const created = await call(signUp, '/api/v1/auth/sign-up', {
      email,
      password: PASSWORD,
      acceptedTerms: true,
      timezone: 'America/New_York',
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ status: 'confirmation_sent' });
    expect(created.headers.getSetCookie()).toEqual([]);
    expect(await mailCount(email)).toBe(1);

    // BR-ACC-03 — no session before the e-mail is verified.
    const early = await call(signIn, '/api/v1/auth/sign-in', { email, password: PASSWORD });
    expect(early.status).toBe(403);
    const refused = await problem(early);
    expect(refused.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(refused.detail).toBe('Vérifiez votre adresse e-mail avant de vous connecter.');
    expect(early.headers.getSetCookie()).toEqual([]);

    const mail = await waitForMail(email, { subject: 'Confirmez votre adresse e-mail' });
    const link = extractAuthLink(mail);
    expect(link.searchParams.get('type')).toBe('signup');
    const verified = await callback(verify(link));
    expect(verified.status).toBe(302);
    expect(verified.headers.get('location')).toBe('/premiers-pas/profil');
    const sessionCookies = verified.headers.getSetCookie().filter((line) => line.startsWith('sb-'));
    expect(sessionCookies.length).toBeGreaterThan(0);
    for (const line of sessionCookies) {
      expect(line).toMatch(/HttpOnly/i);
      expect(line).toMatch(/SameSite=Lax/i);
      expect(line).toMatch(/Path=\//i);
      expect(line).not.toMatch(/;\s*Secure/i);
    }

    // EF-10 — legal acceptances, time zone and one event.
    const profile = await profileOf(email);
    expect(profile?.terms_version).toBe('cgu:2026-11-11;privacy:2026-11-11');
    expect(profile?.timezone).toBe('America/New_York');
    const acceptances = await serviceDb().execute<{ document: string }>(
      sql`select document::text from public.legal_acceptances where user_id = ${profile?.id ?? ''}::uuid order by document`,
    );
    expect(acceptances.map((row) => row.document)).toEqual(['cgu', 'privacy']);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: `user-signed-up:${profile?.id ?? ''}`,
      name: 'user/signed-up',
      data: { userId: profile?.id, method: 'password' },
    });

    const login = await call(signIn, '/api/v1/auth/sign-in', { email, password: PASSWORD });
    expect(login.status).toBe(200);
    expect(await login.json()).toEqual({ destination: '/premiers-pas/profil' });
    expect(login.headers.getSetCookie().some((line) => line.startsWith('sb-'))).toBe(true);
    expect(events).toHaveLength(1);
  });

  it('answers 401 INVALID_CREDENTIALS for a wrong pair, known or unknown (CA-7)', async () => {
    const { email } = await confirmedAccount();
    const wrong = await call(signIn, '/api/v1/auth/sign-in', {
      email,
      password: WRONG,
    });
    const unknown = await call(signIn, '/api/v1/auth/sign-in', {
      email: newEmail(),
      password: WRONG,
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const first = await problem(wrong);
    const second = await problem(unknown);
    expect(first.code).toBe('INVALID_CREDENTIALS');
    expect(first.detail).toBe('Adresse e-mail ou mot de passe incorrect.');
    expect({ ...first, requestId: '' }).toEqual({ ...second, requestId: '' });
  });

  it('gives the same answer for an address already registered (CA-7)', async () => {
    const { email } = await confirmedAccount();
    const again = await call(signUp, '/api/v1/auth/sign-up', {
      email,
      password: PASSWORD,
      acceptedTerms: true,
    });
    expect(again.status).toBe(201);
    expect(await again.json()).toEqual({ status: 'confirmation_sent' });
    const rows = await serviceDb().execute<{ count: number }>(
      sql`select count(*)::int as count from auth.users where email = ${email}`,
    );
    expect(rows[0]?.count).toBe(1);
  });
});

describe('[SPEC-202] authentification — lien magique', () => {
  it('signs a new account up through its e-mail, once only (CA-1, CA-4, CL-1)', async () => {
    const email = newEmail();
    const sent = await call(magicLink, '/api/v1/auth/magic-link', {
      mode: 'sign-up',
      email,
      acceptedTerms: true,
      timezone: 'Europe/Paris',
    });
    expect(sent.status).toBe(202);
    expect(await sent.text()).toBe('');
    const mail = await waitForMail(email);
    expect(mail.subject).toBe('Confirmez votre adresse e-mail');

    const link = extractAuthLink(mail);
    const first = await callback(verify(link));
    expect(first.status).toBe(302);
    expect(first.headers.get('location')).toBe('/premiers-pas/profil');
    expect(first.headers.getSetCookie().some((line) => line.startsWith('sb-'))).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.data.method).toBe('magic_link');

    const second = await callback(verify(link));
    expect(second.status).toBe(302);
    expect(second.headers.get('location')).toBe('/connexion?erreur=lien-invalide');
    expect(second.headers.getSetCookie().some((line) => line.startsWith('sb-'))).toBe(false);
    expect(events).toHaveLength(1);
  });

  it('sends the sign-in template to an address that already exists (EF-1)', async () => {
    const existing = await createTestSession();
    try {
      const sent = await call(magicLink, '/api/v1/auth/magic-link', {
        mode: 'sign-up',
        email: existing.email,
        acceptedTerms: true,
      });
      expect(sent.status).toBe(202);
      const mail = await waitForMail(existing.email, {
        subject: 'Votre lien de connexion à Learny',
      });
      expect(extractAuthLink(mail).searchParams.get('type')).toBe('magiclink');
    } finally {
      await deleteTestSession(existing);
    }
  });

  it('does not reveal whether an address has an account on sign-in (CA-7, EF-2)', async () => {
    const existing = await createTestSession();
    const unknownEmail = newEmail();
    try {
      const known = await call(magicLink, '/api/v1/auth/magic-link', {
        mode: 'sign-in',
        email: existing.email,
      });
      const unknown = await call(magicLink, '/api/v1/auth/magic-link', {
        mode: 'sign-in',
        email: unknownEmail,
      });
      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(await known.text()).toBe(await unknown.text());
      await waitForMail(existing.email);
      expect(await mailCount(unknownEmail)).toBe(0);
    } finally {
      await deleteTestSession(existing);
    }
  });

  it('refuses a second sending within 60 seconds with Retry-After (CA-3, CL-3)', async () => {
    const email = newEmail();
    const body = { mode: 'sign-up', email, acceptedTerms: true };
    expect((await call(magicLink, '/api/v1/auth/magic-link', body)).status).toBe(202);
    await waitForMail(email);
    const second = await call(magicLink, '/api/v1/auth/magic-link', body);
    expect(second.status).toBe(429);
    const retry = Number(second.headers.get('retry-after'));
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
    const detail = await problem(second);
    expect(detail.code).toBe('RESEND_TOO_SOON');
    expect(detail.detail).toMatch(/^Vous pourrez renvoyer le lien dans \d+ secondes\.$/);
    expect(await mailCount(email)).toBe(1);

    const again = await call(resend, '/api/v1/auth/resend', { email, kind: 'signup' });
    expect(again.status).toBe(429);
    expect(await mailCount(email)).toBe(1);
  });

  it('redirects an invalid, missing or forged token to the invalid-link page (CA-4)', async () => {
    for (const query of [
      '?token_hash=nope&type=magiclink',
      '?type=magiclink',
      '?token_hash=abc&type=recovery',
      '',
    ]) {
      const response = await callback(new NextRequest(`${BASE}/api/v1/auth/callback${query}`));
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/connexion?erreur=lien-invalide');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('keeps a safe next in a cookie and ignores an external one (CL-4)', async () => {
    const existing = await createTestSession();
    try {
      await serviceDb().execute(
        sql`update public.profiles set onboarding_step = 'rappels' where id = ${existing.userId}::uuid`,
      );
      const sent = await call(magicLink, '/api/v1/auth/magic-link', {
        mode: 'sign-in',
        email: existing.email,
        next: '/agenda',
      });
      expect(sent.status).toBe(202);
      const nextCookie = cookieHeader(sent);
      expect(nextCookie).toContain('lr-next=%2Fagenda');
      const mail = await waitForMail(existing.email);
      const link = extractAuthLink(mail);
      const followed = await callback(
        new NextRequest(`${BASE}${link.pathname}${link.search}`, {
          headers: { cookie: nextCookie },
        }),
      );
      expect(followed.headers.get('location')).toBe('/agenda');

      const external = await callback(
        new NextRequest(
          `${BASE}/api/v1/auth/callback?token_hash=x&type=magiclink&next=//evil.example`,
        ),
      );
      expect(external.headers.get('location')).toBe('/connexion?erreur=lien-invalide');
    } finally {
      await deleteTestSession(existing);
    }
  });
});

describe('[SPEC-202] destination et déconnexion', () => {
  it.each([
    ['profil', null, undefined, '/premiers-pas/profil'],
    ['rythme', null, '/agenda', '/premiers-pas/rythme'],
    ['ia', null, undefined, '/premiers-pas/ia'],
    ['rappels', null, '/agenda', '/agenda'],
    ['done', null, undefined, '/accueil'],
    ['done', null, '//evil.example', '/accueil'],
    ['done', null, 'https://evil.example', '/accueil'],
    ['done', '2026-12-01T00:00:00Z', '/agenda', '/parametres#profil'],
  ])('step %s, deletion %s, next %s → %s (CL-5, CL-6)', async (step, deletion, next, expected) => {
    const { email } = await confirmedAccount();
    await serviceDb().execute(sql`
        update public.profiles set onboarding_step = ${step}::onboarding_step,
          deletion_requested_at = ${deletion === null ? null : '2026-11-11T12:20:00Z'}::timestamptz,
          deletion_scheduled_for = ${deletion}::timestamptz where email = ${email}`);
    const response = await call(signIn, '/api/v1/auth/sign-in', {
      email,
      password: PASSWORD,
      ...(next === undefined ? {} : { next }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ destination: expected });
  });

  it('finalizes a first verification once, even concurrently (CL-8)', async () => {
    const email = newEmail();
    await call(signUp, '/api/v1/auth/sign-up', { email, password: PASSWORD, acceptedTerms: true });
    const mail = await waitForMail(email);
    const link = extractAuthLink(mail);
    // Two tabs follow the same link at once: GoTrue may accept both, the finalization must not run twice.
    const [a, b] = await Promise.all([callback(verify(link)), callback(verify(link))]);
    expect([a, b].some((r) => r.headers.getSetCookie().some((l) => l.startsWith('sb-')))).toBe(
      true,
    );
    const profile = await profileOf(email);
    const rows = await serviceDb().execute<{ count: number }>(
      sql`select count(*)::int as count from public.legal_acceptances where user_id = ${profile?.id ?? ''}::uuid`,
    );
    expect(rows[0]?.count).toBe(2);
    expect(events).toHaveLength(1);
  });

  it('closes the session, clears the cookies and refuses the old token (CA-6, CL-10)', async () => {
    const { email, verified } = await confirmedAccount();
    const cookies = cookieHeader(verified);
    expect(
      (
        await getItems(
          new NextRequest(`${BASE}/api/v1/dev/sdd/items`, { headers: { cookie: cookies } }),
          NO_SEGMENT,
        )
      ).status,
    ).toBe(200);

    const out = await call(
      signOut,
      '/api/v1/auth/sign-out',
      {},
      `${cookies}; lr-onboarded=1; lr-next=%2Fagenda`,
    );
    expect(out.status).toBe(204);
    const cleared = out.headers.getSetCookie();
    expect(cleared.some((line) => /^sb-.*Max-Age=0/i.test(line))).toBe(true);
    expect(cleared.some((line) => /^lr-onboarded=;.*Max-Age=0/i.test(line))).toBe(true);
    expect(cleared.some((line) => /^lr-next=;.*Max-Age=0/i.test(line))).toBe(true);

    const withOldToken = await getItems(
      new NextRequest(`${BASE}/api/v1/dev/sdd/items`, { headers: { cookie: cookies } }),
      NO_SEGMENT,
    );
    expect(withOldToken.status).toBe(401);
    const withoutCookies = await getItems(
      new NextRequest(`${BASE}/api/v1/dev/sdd/items`),
      NO_SEGMENT,
    );
    expect(withoutCookies.status).toBe(401);
    expect(email).toContain('@');

    // CL-10 — signing out again, or without any session, is still a 204.
    expect((await call(signOut, '/api/v1/auth/sign-out', {})).status).toBe(204);
  });

  it('answers 503 and sets no cookie when the Auth server is unreachable (CL-7)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:1');
    const response = await call(signIn, '/api/v1/auth/sign-in', {
      email: newEmail(),
      password: PASSWORD,
    });
    expect(response.status).toBe(503);
    expect((await problem(response)).code).toBe('SERVICE_UNAVAILABLE');
    expect(response.headers.getSetCookie()).toEqual([]);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseLocalEnv().url);
  });

  it('lists no message for an address that never asked (sanity of the mail helper)', async () => {
    expect(await listMail(newEmail())).toEqual([]);
  });
});
