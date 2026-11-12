import type { APIResponse } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import {
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const TITLE = 'SPEC-210 — Abonnement Stripe (service)';
const REGIONS = ['spec-210-status', 'spec-210-actions', 'spec-210-events'];
const SUBSCRIBE = "S'abonner (simulé)";
const FAIL_PAYMENT = 'Simuler un échec de paiement';
const CANCEL = 'Résilier';
const REPLAY = 'Rejouer le dernier webhook';

let session: TestSession;

async function jsonOf(response: APIResponse): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
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

async function subscribeAndPay(page: import('@playwright/test').Page) {
  await page.goto('/_dev/sdd/SPEC-210');
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('spec-210-badge')).toHaveText('Aucun abonnement');
  await page.getByRole('button', { name: SUBSCRIBE }).click();

  // The simulated Checkout page (EF-7).
  await expect(page).toHaveURL(/\/_dev\/stripe\/checkout\?session=cs_mock_\d+$/);
  await expect(page.getByTestId('stripe-mock-title')).toHaveText('Paiement simulé');
  await expect(page.getByTestId('stripe-mock-notice')).toHaveText(
    'Paiement simulé — aucun débit',
  );
  // Keyboard: the button takes the focus and Enter pays.
  const pay = page.getByRole('button', { name: 'Payer' });
  await pay.focus();
  await expect(pay).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/_dev\/sdd\/SPEC-210$/);
  await expect(page.getByTestId('spec-210-badge')).toHaveText('Actif');
}

test("cycle d'abonnement simulé @SPEC-210", async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-210');
  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  // Before anything: no subscription, no provided AI, no event.
  await expect(page.getByTestId('spec-210-badge')).toHaveText('Aucun abonnement');
  await expect(page.getByTestId('spec-210-managed-ai')).toHaveText('IA fournie : indisponible');
  await expect(page.getByTestId('spec-210-period')).toHaveText('Fin de période : —');
  await expect(page.getByTestId('spec-210-event-row')).toHaveCount(0);

  await subscribeAndPay(page);

  // CA-1 — the signed webhook made the subscription active and the provided AI available.
  await expect(page.getByTestId('spec-210-managed-ai')).toHaveText('IA fournie : disponible');
  await expect(page.getByTestId('spec-210-period')).toContainText('Fin de période : ');
  await expect(page.getByTestId('spec-210-period')).not.toHaveText('Fin de période : —');
  let rows = page.getByTestId('spec-210-event-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('checkout.session.completed');
  await expect(page.getByTestId('spec-210-event-result')).toHaveText(['Appliqué']);
  await expect(page.getByRole('button', { name: SUBSCRIBE })).toBeDisabled();

  // CA-2 — the same delivery again changes nothing.
  await page.getByRole('button', { name: REPLAY }).click();
  await expect(page.getByTestId('spec-210-event-result')).toHaveText([
    'Appliqué',
    'Doublon ignoré',
  ]);
  await expect(page.getByTestId('spec-210-badge')).toHaveText('Actif');

  // CL-7 — a failed payment removes the right.
  await page.getByRole('button', { name: FAIL_PAYMENT }).click();
  await expect(page.getByTestId('spec-210-badge')).toHaveText('Paiement en retard');
  await expect(page.getByTestId('spec-210-managed-ai')).toHaveText('IA fournie : indisponible');

  // CA-1 — the cancellation ends it.
  await page.getByRole('button', { name: CANCEL }).click();
  await expect(page.getByTestId('spec-210-badge')).toHaveText('Résilié');
  await expect(page.getByTestId('spec-210-managed-ai')).toHaveText('IA fournie : indisponible');
  rows = page.getByTestId('spec-210-event-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(2)).toContainText('invoice.payment_failed');
  await expect(rows.nth(3)).toContainText('customer.subscription.deleted');
  await expect(page.getByTestId('spec-210-event-result')).toHaveText([
    'Appliqué',
    'Doublon ignoré',
    'Appliqué',
    'Appliqué',
  ]);

  await axeCheck();
  await captureEvidence('spec-210-cycle');
  expect(consoleErrors).toEqual([]);
});

test('annuler le paiement simulé ramène à la page sans abonnement @SPEC-210', async ({ page }) => {
  await page.goto('/_dev/sdd/SPEC-210');
  await page.getByRole('button', { name: SUBSCRIBE }).click();
  await expect(page.getByTestId('stripe-mock-title')).toHaveText('Paiement simulé');
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page).toHaveURL(/\/_dev\/sdd\/SPEC-210$/);
  await expect(page.getByTestId('spec-210-badge')).toHaveText('Aucun abonnement');
  await expect(page.getByTestId('spec-210-event-row')).toHaveCount(0);
});

test('contrats de facturation et webhook signé @SPEC-210', async ({ page }) => {
  const request = page.request;

  // CA-4 — SPEC-602 reads `{ status }` of the subscription of a learner who never subscribed.
  const fresh = await request.get('/api/v1/billing/subscription');
  expect(fresh.status()).toBe(200);
  expect(await jsonOf(fresh)).toEqual({
    status: 'none',
    currentPeriodEnd: null,
    hasManagedAi: false,
    dailyCapUsd: 1.5,
  });

  // CA-4, CL-5 — external return paths are refused, nothing is created.
  for (const successPath of ['https://evil.example/x', '//evil.example', '/\\evil.example']) {
    const refused = await request.post('/api/v1/billing/checkout', {
      headers: { 'idempotency-key': crypto.randomUUID() },
      data: { successPath, cancelPath: '/ko' },
    });
    expect(refused.status(), successPath).toBe(400);
    expect((await jsonOf(refused)).code).toBe('VALIDATION_FAILED');
  }

  // A portal without a Stripe customer.
  const noPortal = await request.post('/api/v1/billing/portal');
  expect(noPortal.status()).toBe(404);

  // Checkout answers `{ url }` only, and the same key replays the same session.
  const key = crypto.randomUUID();
  const body = { successPath: '/_dev/sdd/SPEC-210', cancelPath: '/_dev/sdd/SPEC-210' };
  const first = await request.post('/api/v1/billing/checkout', {
    headers: { 'idempotency-key': key },
    data: body,
  });
  expect(first.status()).toBe(200);
  const firstJson = await jsonOf(first);
  expect(Object.keys(firstJson)).toEqual(['url']);
  expect(String(firstJson.url)).toMatch(/^\/_dev\/stripe\/checkout\?session=cs_mock_\d+$/);
  const replay = await request.post('/api/v1/billing/checkout', {
    headers: { 'idempotency-key': key },
    data: body,
  });
  expect(await jsonOf(replay)).toEqual(firstJson);
  expect(replay.headers()['idempotent-replayed']).toBe('true');
  const portal = await request.post('/api/v1/billing/portal');
  expect(portal.status()).toBe(200);
  expect((await jsonOf(portal)).url).toBe('/_dev/stripe/portal?return=%2Fparametres%23ia');

  // CA-2 — the webhook is public but signed: a missing or wrong signature is a 400.
  for (const headers of [{}, { 'stripe-signature': 't=1,v1=00' }]) {
    const rejected = await request.post('/api/v1/webhooks/stripe', {
      headers: { 'content-type': 'application/json', ...headers },
      data: '{"id":"evt_x","type":"customer.subscription.deleted","created":1,"data":{"object":{}}}',
    });
    expect(rejected.status()).toBe(400);
    const problem = await jsonOf(rejected);
    expect(problem.code).toBe('INVALID_SIGNATURE');
    expect(rejected.headers()['content-type']).toContain('application/problem+json');
  }

  // CA-5 — no Stripe identifier or key in any answer.
  const texts = [JSON.stringify(firstJson), await fresh.text()];
  for (const text of texts) expect(text).not.toMatch(/(cus|sub|sk|whsec|pk)_/);
});

test('abonnement conforme @SPEC-210 @visual @mobile', async ({ page, axeCheck }) => {
  await subscribeAndPay(page);
  await page.getByRole('button', { name: REPLAY }).click();
  await expect(page.getByTestId('spec-210-event-result')).toHaveText([
    'Appliqué',
    'Doublon ignoré',
  ]);

  // Regions in order: status, actions, events.
  const ids = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(REGIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Statut',
    'Actions',
    'Événements',
  ]);
  await expect(page.getByRole('status')).toHaveAttribute('data-testid', 'spec-210-status');
  await expect(page.getByRole('button')).toHaveText([SUBSCRIBE, FAIL_PAYMENT, CANCEL, REPLAY]);
  await expect(page.locator('[data-testid="spec-210-events-table"] th[scope="col"]')).toHaveText([
    'Type',
    'Date',
    'Résultat',
  ]);

  // Tokens of §10: page #F4F4F1, white cards #E7E6E1 with a 24 px radius, active dot #0F9F7F.
  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-210-status"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-210-actions"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-210-events"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-210-badge-dot"]': { 'background-color': '#0F9F7F' },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-210-demo.png', { fullPage: true });
});
