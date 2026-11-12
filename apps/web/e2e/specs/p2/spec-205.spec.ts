import { closeDb, serviceDb, sql } from '@learny/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

// Same-origin mutations from the API request context (SPEC-208 origin guard).
const ORIGIN = 'http://127.0.0.1:3100';

const SECTIONS = [
  'spec-205-permission',
  'spec-205-subscription',
  'spec-205-preview',
  'spec-205-delivery',
];
const TITLE = 'SPEC-205 — Notifications navigateur';
const ENABLE = 'Activer les notifications du navigateur';
const RECEIVE = 'Recevoir une notification';

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

test('simule les permissions push @SPEC-205', async ({ page, axeCheck, captureEvidence, consoleErrors }) => {
  await page.goto('/_dev/sdd/SPEC-205');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Permission du navigateur',
    'Abonnement',
    'Aperçu de la notification',
    'Journal de livraison',
  ]);
  await expect(page.getByTestId('spec-205-inapp')).toContainText('Canal application : toujours actif');

  // No real permission prompt is involved: the page never calls Notification.requestPermission.
  await page.evaluate(() => {
    (window as unknown as { __prompts: number }).__prompts = 0;
    const original = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = () => {
      (window as unknown as { __prompts: number }).__prompts += 1;
      return original();
    };
  });

  // CL-1, CA-4 — permission refused: no subscription, in-app still available, nothing sent.
  const denied = page.getByRole('radio', { name: 'Refusée (denied)' });
  await denied.focus();
  await page.keyboard.press('Space');
  await expect(denied).toBeChecked();
  await page.getByRole('button', { name: ENABLE }).click();
  await expect(page.getByTestId('spec-205-subscription-message')).toHaveText(
    'Permission refusée : les notifications in-app restent disponibles.',
  );
  await expect(page.getByTestId('spec-205-subscription-state')).toHaveAttribute('data-state', 'none');
  await expect(page.getByTestId('spec-205-permission-requests')).toHaveText('Demandes de permission : 1');
  expect((await subscriptionRows(session.userId)).total).toBe(0);
  await page.getByRole('button', { name: RECEIVE }).click();
  await expect(page.getByTestId('spec-205-delivery-status-1')).toHaveAttribute('data-status', 'skipped_pref');
  await expect(page.getByTestId('spec-205-delivery-status-1')).toContainText('no_subscription');
  await expect(page.getByTestId('spec-205-preview-inapp')).toHaveText(
    'Sans abonnement, la notification reste dans la boîte in-app.',
  );
  await expect(page.getByTestId('spec-205-delivery-announce')).toHaveText(
    'Livraison : Ignorée. Abonnements restants : 0.',
  );

  // CL-2 — a browser without the Push API: the button is disabled with an explanation.
  const support = page.getByRole('switch', { name: 'Navigateur sans API Push' });
  await support.click();
  await expect(page.getByRole('button', { name: ENABLE })).toBeDisabled();
  await expect(page.getByTestId('spec-205-support-missing')).toContainText('ne prend pas en charge');
  await support.click();
  await expect(page.getByRole('button', { name: ENABLE })).toBeEnabled();

  // EF-3 — permission granted: the real flow registers a subscription through the real route.
  const granted = page.getByRole('radio', { name: 'Accordée (granted)' });
  await granted.focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: ENABLE }).click();
  await expect(page.getByTestId('spec-205-subscription-message')).toHaveText('Abonnement enregistré.');
  await expect(page.getByTestId('spec-205-subscription-state')).toHaveAttribute('data-state', 'active');
  expect((await subscriptionRows(session.userId)).total).toBe(1);

  // EF-5 — a send through the mock service: `sent`, counter reset, last_success_at stamped.
  await page.getByRole('button', { name: RECEIVE }).click();
  await expect(page.getByTestId('spec-205-delivery-status-2')).toHaveAttribute('data-status', 'sent');
  await expect(page.getByTestId('spec-205-delivery-row-2')).toContainText('success · 201 · échecs 0');
  await expect(page.getByTestId('spec-205-preview-title')).toHaveText('Votre quiz global du jour est prêt');
  await expect(page.getByTestId('spec-205-preview-url')).toContainText('/quiz/global');
  await expect(page.getByTestId('spec-205-preview-inapp')).toHaveCount(0);
  const afterSend = await subscriptionRows(session.userId);
  expect(afterSend).toEqual({ total: 1, failures: 0, success: true });

  // EF-2 — removal, then a 410 scenario: the subscription is removed at the first answer (CL-4).
  await page.getByRole('button', { name: 'Retirer l’abonnement' }).click();
  await expect(page.getByTestId('spec-205-subscription-state')).toHaveAttribute('data-state', 'none');
  expect((await subscriptionRows(session.userId)).total).toBe(0);
  await page.getByTestId('spec-205-scenario').selectOption('gone');
  await page.getByRole('button', { name: ENABLE }).click();
  await expect(page.getByTestId('spec-205-subscription-state')).toHaveAttribute('data-state', 'active');
  await page.getByRole('button', { name: RECEIVE }).click();
  await expect(page.getByTestId('spec-205-delivery-status-3')).toHaveAttribute('data-status', 'failed');
  await expect(page.getByTestId('spec-205-delivery-row-3')).toContainText('gone · 410 · abonnement supprimé');
  await expect(page.getByTestId('spec-205-subscription-state')).toHaveAttribute('data-state', 'none');
  expect((await subscriptionRows(session.userId)).total).toBe(0);

  // The whole scenario asked the browser nothing (EF-7).
  expect(await page.evaluate(() => (window as unknown as { __prompts: number }).__prompts)).toBe(0);

  await axeCheck();
  await captureEvidence('spec-205-notifications-navigateur');
  expect(consoleErrors.filter((message) => !message.includes('status of 4'))).toEqual([]);
});

test('push conforme @SPEC-205 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-205');
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);

  await page.getByRole('radio', { name: 'Accordée (granted)' }).check();
  await page.getByRole('button', { name: ENABLE }).click();
  await expect(page.getByTestId('spec-205-subscription-state')).toHaveAttribute('data-state', 'active');
  await page.getByRole('button', { name: RECEIVE }).click();
  await expect(page.getByTestId('spec-205-delivery-status-1')).toHaveAttribute('data-status', 'sent');

  // Tokens of the base layout (SPEC-201 §10): page #F4F4F1, white cards, #E7E6E1 border, 24 px.
  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-205-permission"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-205-subscription"]': { 'border-top-left-radius': '24px' },
    '[data-testid="spec-205-preview"]': { 'border-top-color': '#E7E6E1' },
    '[data-testid="spec-205-delivery"]': { 'border-top-left-radius': '24px' },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-205-demo.png', { fullPage: true });
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
