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
const PAGE = '/_dev/sdd/SPEC-2301';
const TITLE = 'Déploiement Coolify, bascule progressive et rollback';
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

test('conformité visuelle de la bascule @SPEC-2301 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);

  // CA-1 (local part) — the four counters, read from the committed ownership table.
  const scope = page.getByTestId('spec-2301-scope');
  await expect(scope).toContainText('Opérations servies par Python');
  await expect(scope).toContainText('201 / 217');
  await expect(scope).toContainText('Routes spéciales servies par Python');
  await expect(scope).toContainText('29 / 32');
  await expect(scope).toContainText('Consommateurs Python');
  await expect(scope).toContainText('23 / 23');
  await expect(scope).toContainText('Crons Python');
  await expect(scope).toContainText('2 / 2');
  await expect(page.getByTestId('spec-2301-relayed')).toContainText(
    '16 opérations et 3 routes spéciales restent relayées',
  );

  // EF-2 — the cutover state of every context of the inventory.
  const contexts = page.getByTestId('spec-2301-contexts').locator('li');
  await expect(contexts).toHaveCount(10);
  await expect(page.getByTestId('spec-2301-contexts')).toContainText('learning');
  await expect(page.getByTestId('spec-2301-contexts')).toContainText(
    'lectures 8 / 8 · mutations 7 / 7',
  );
  await expect(page.getByTestId('spec-2301-contexts')).toContainText(
    'partiel : entrées différées',
  );
  await expect(page.getByTestId('spec-2301-states')).toContainText('8 contextes');
  await expect(page.getByTestId('spec-2301-states')).toContainText('dev, identity');

  // EF-2, EF-3 — the guarantees of the tool and of the drain.
  await expect(page.getByTestId('spec-2301-cutover')).toContainText('Canary en lecture');
  await expect(page.getByTestId('spec-2301-cutover')).toContainText('Un seul écrivain');
  await expect(page.getByTestId('spec-2301-cutover')).toContainText('Drain du worker');
  await expect(page.getByTestId('spec-2301-cutover')).toContainText('Rollback');
  await expect(page.getByTestId('spec-2301-proofs')).toContainText('x-served-by: learny-api');
  await expect(page.getByTestId('spec-2301-proofs')).toContainText('ADR-2009');

  await axeCheck();
  await captureEvidence('spec-2301-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await axeCheck();
  await captureEvidence('spec-2301-mobile');
});
