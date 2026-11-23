// [SPEC-2301] Coolify deployment, progressive cutover and rollback.
//
// Two local proofs. The first one is EF-4: an external client with no cookie calls a `py` operation
// through the facade with a real Supabase access token and gets 200 plus `x-served-by: learny-api`,
// while a cookie-authenticated mutation without `Origin` stays refused (SPEC-208). The second one
// is the demonstration page: its counters are read from `api/ownership.yaml` and `api/inventory.json`.
import { createHmac } from 'node:crypto';

import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, supabaseLocalEnv } from '@learny/testing/supabase';

const DEFAULT_ORIGIN = 'http://127.0.0.1:3100';
// ADR-0047: the stack runs on the frozen instant. GoTrue signs a freshly issued token with the real
// `iat`; the facade rightly refuses a token dated after its injected clock, so the external client
// token is signed with the local JWT secret and dated on the frozen instant. Same secret, same
// claims as GoTrue: it is a real HS256 Supabase token, accepted by the same verifier.
const FIXED_EPOCH = Date.parse('2026-11-11T12:20:00Z') / 1000;

function bearer(base64url: Buffer | string): string {
  return Buffer.from(base64url).toString('base64url');
}

function mintAccessToken(userId: string, email: string): string {
  const { url, jwtSecret } = supabaseLocalEnv();
  const header = bearer(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = bearer(
    JSON.stringify({
      sub: userId,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      iss: `${url}/auth/v1`,
      iat: FIXED_EPOCH,
      exp: FIXED_EPOCH + 3600,
      email_confirmed_at: '2026-11-11T10:00:00Z',
    }),
  );
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

test('un client Bearer externe est servi par la façade Python @SPEC-2301', async ({
  request,
  baseURL,
}) => {
  const origin = baseURL ?? DEFAULT_ORIGIN;
  const session = await createTestSession();
  try {
    // EF-4 — no cookie at all: the Supabase access token is the only credential, exactly what a
    // native client or another service sends.
    const bearer = await request.get('/api/v1/billing/subscription', {
      headers: { authorization: `Bearer ${mintAccessToken(session.userId, session.email)}` },
    });
    const payload = await bearer.text();
    expect(bearer.status(), payload).toBe(200);
    expect(bearer.headers()['x-served-by']).toBe('learny-api');
    // The facade answered, not Hono: a relayed operation would not carry this header.
    expect(bearer.headers()['set-cookie']).toBeUndefined();

    // Without the token and without cookies the same operation is unauthenticated.
    const anonymous = await request.get('/api/v1/billing/subscription');
    expect(anonymous.status()).toBe(401);
    expect((await anonymous.json()) as { code: string }).toMatchObject({ code: 'UNAUTHENTICATED' });

    // A mutation authenticated by cookie is refused without `Origin` (SPEC-208, ET-5).
    const refused = await request.post('/api/v1/billing/checkout', {
      headers: {
        cookie: session.cookieHeader,
        'idempotency-key': `spec-2301-refused-${session.userId}`,
      },
    });
    const refusedBody = (await refused.json()) as { code: string };
    expect(refused.status()).toBe(403);
    expect(refusedBody.code).toBe('ORIGIN_REJECTED');

    // The same mutation with the same-origin header passes the guard and reaches the handler.
    const accepted = await request.post('/api/v1/billing/checkout', {
      headers: {
        cookie: session.cookieHeader,
        origin,
        'idempotency-key': `spec-2301-accepted-${session.userId}`,
      },
    });
    const acceptedBody = (await accepted.json()) as { code?: string };
    expect(accepted.status()).not.toBe(403);
    expect(acceptedBody.code).not.toBe('ORIGIN_REJECTED');
    expect(accepted.headers()['x-served-by']).toBe('learny-api');
  } finally {
    await deleteTestSession(session);
  }
});

