import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';

// Every specification that registers routes grows the document: the count follows the registry.

let session: TestSession;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test('refuse un appel sans session @SPEC-201', async ({ request }) => {
  // CA-5 — without a session cookie the API answers 401 problem+json.
  const response = await request.get('/api/v1/me', { headers: { cookie: '' } });
  expect(response.status()).toBe(401);
  expect(response.headers()['content-type']).toContain('application/problem+json');
  const body = (await response.json()) as { code: string; requestId: string };
  expect(body.code).toBe('UNAUTHENTICATED');
  expect(response.headers()['x-request-id']).toBe(body.requestId);
});
