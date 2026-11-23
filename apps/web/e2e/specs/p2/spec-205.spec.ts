import { closeDb, serviceDb, sql } from '@learny/testing/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

// Same-origin mutations from the API request context (SPEC-208 origin guard).
const ORIGIN = 'http://127.0.0.1:3100';

let session: TestSession;

async function subscriptionRows(userId: string): Promise<{ total: number; failures: number | null; success: boolean }> {
  const rows = await serviceDb().execute<{ total: number; failures: number | null; success: boolean }>(sql`
    select count(*)::int as total, max(failure_count)::int as failures,
           bool_or(last_success_at is not null) as success
    from public.push_subscriptions where user_id = ${userId}::uuid
  `);
  return rows[0] ?? { total: 0, failures: null, success: false };
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test.afterAll(async () => {
  await closeDb();
});

test('parcourt les routes réelles : abonnement, unicité, retrait @SPEC-205', async ({ request }) => {
  const other = await createTestSession();
  const route = '/api/v1/me/push-subscriptions';
  const endpoint = `https://push.mock.learny.test/e2e-${session.userId.slice(0, 8)}/success`;
  const body = { endpoint, expirationTime: null, keys: { p256dh: 'BP256dhE2E', auth: 'authE2E' } };
  try {
    // Without a session: 401. An endpoint the server must not contact: 400 VALIDATION_FAILED.
    const anonymous = await request.post(route, { headers: { origin: ORIGIN, cookie: '' }, data: body });
    expect(anonymous.status()).toBe(401);
    const invalid = await request.post(route, {
      headers: { origin: ORIGIN, cookie: session.cookieHeader },
      data: { ...body, endpoint: 'http://127.0.0.1/push' },
    });
    expect(invalid.status()).toBe(400);
    expect(invalid.headers()['content-type']).toContain('application/problem+json');
    expect(((await invalid.json()) as { code: string }).code).toBe('VALIDATION_FAILED');

    // EF-1 — created once, then refreshed (same id, created: false).
    const created = await request.post(route, { headers: { origin: ORIGIN, cookie: session.cookieHeader }, data: body });
    expect(created.status()).toBe(200);
    const first = (await created.json()) as { id: string; created: boolean };
    expect(first.created).toBe(true);
    const again = await request.post(route, { headers: { origin: ORIGIN, cookie: session.cookieHeader }, data: body });
    const second = (await again.json()) as { id: string; created: boolean };
    expect(second).toMatchObject({ id: first.id, created: false });

    // CL-3 — the same endpoint from another account: neutral 403, no mention of the endpoint.
    const foreign = await request.post(route, { headers: { origin: ORIGIN, cookie: other.cookieHeader }, data: body });
    expect(foreign.status()).toBe(403);
    expect(foreign.headers()['content-type']).toContain('application/problem+json');
    const problem = (await foreign.json()) as { code: string; detail: string };
    expect(problem.code).toBe('FORBIDDEN');
    expect(JSON.stringify(problem)).not.toContain(endpoint);

    // EF-2 — a foreign removal answers 204 and deletes nothing; the owner's removal is idempotent.
    const foreignDelete = await request.delete(route, { headers: { origin: ORIGIN, cookie: other.cookieHeader }, data: { endpoint } });
    expect(foreignDelete.status()).toBe(204);
    expect((await subscriptionRows(session.userId)).total).toBe(1);
    const removed = await request.delete(route, { headers: { origin: ORIGIN, cookie: session.cookieHeader }, data: { endpoint } });
    expect(removed.status()).toBe(204);
    const removedAgain = await request.delete(route, { headers: { origin: ORIGIN, cookie: session.cookieHeader }, data: { endpoint } });
    expect(removedAgain.status()).toBe(204);
    expect((await subscriptionRows(session.userId)).total).toBe(0);
  } finally {
    await deleteTestSession(other);
  }
});
