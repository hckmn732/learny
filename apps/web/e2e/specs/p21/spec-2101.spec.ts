// [SPEC-2101] Identity resolution through the Python facade: relayed cookie, Bearer, invalid Bearer.
import { randomBytes } from 'node:crypto';

import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';


interface BearerSession {
  userId: string;
  accessToken: string;
}

/** Creates a confirmed account and signs in with the password grant to obtain a Bearer token. */
async function createBearerSession(): Promise<BearerSession> {
  const { url, anonKey, serviceRoleKey } = supabaseLocalEnv();
  const email = `e2e-2101-${randomBytes(4).toString('hex')}@test.learny.test`;
  const password = `pw-${randomBytes(12).toString('hex')}`;
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  expect(created.status, 'admin createUser').toBe(200);
  const user = (await created.json()) as { id: string };
  const granted = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(granted.status, 'password grant').toBe(200);
  const session = (await granted.json()) as { access_token: string };
  return { userId: user.id, accessToken: session.access_token };
}

async function deleteUser(userId: string): Promise<void> {
  const { url, serviceRoleKey } = supabaseLocalEnv();
  await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
  });
}

test('résout l’identité par cookie et par Bearer via la façade @SPEC-2101', async ({ request }) => {
  const session = await createTestSession();
  try {
    // Cookie relayed by the web server to the facade, then to the upstream: same learner.
    const viaCookie = await request.get('/api/v1/me', {
      headers: { cookie: session.cookieHeader },
    });
    expect(viaCookie.status()).toBe(200);
    expect(JSON.stringify(await viaCookie.json())).toContain(session.userId);

    const bearer = await createBearerSession();
    try {
      const viaBearer = await request.get('/api/v1/me', {
        headers: { authorization: `Bearer ${bearer.accessToken}` },
      });
      expect(viaBearer.status()).toBe(200);
      expect(JSON.stringify(await viaBearer.json())).toContain(bearer.userId);
    } finally {
      await deleteUser(bearer.userId);
    }

    // CL-1, CA-2: an invalid Bearer is refused and never falls back to a cookie.
    const forged = await request.get('/api/v1/me', {
      headers: { authorization: 'Bearer not-a-real-token', cookie: session.cookieHeader },
    });
    expect(forged.status()).toBe(401);
    expect((await forged.json()) as { code: string }).toMatchObject({ code: 'UNAUTHENTICATED' });
  } finally {
    await deleteTestSession(session);
  }
});

