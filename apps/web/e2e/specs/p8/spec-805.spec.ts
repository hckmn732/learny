import { randomUUID } from 'node:crypto';

import { closeDb, serviceDb, sql } from '@learny/db';
import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-805';
const PASSWORD = `pw-${randomUUID()}`;
const TITLE = 'SPEC-805 · Contrôles de sécurité';
const CATEGORIES = [
  'spec-805-headers',
  'spec-805-api',
  'spec-805-rls',
  'spec-805-ai',
  'spec-805-ssrf',
  'spec-805-dependencies',
];
const STATUSES = ['Vérifié', 'Échec', 'Non exécuté'];

test.afterAll(async () => {
  await closeDb();
});

test('parcours protégé @SPEC-805', async ({
  page,
  request,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  // CA-1 — two HTML responses carry distinct nonces and the static headers; local HTTP has no HSTS.
  const first = await page.goto('/connexion');
  const firstHeaders = first?.headers() ?? {};
  const firstCsp = firstHeaders['content-security-policy'] ?? '';
  const firstNonce = /'nonce-([^']+)'/.exec(firstCsp)?.[1];
  expect(firstNonce).toBeTruthy();
  expect(firstCsp).toContain("default-src 'self'");
  expect(firstCsp).not.toContain('unsafe-eval');
  expect(firstCsp).not.toContain('unsafe-inline');
  expect(firstHeaders['x-content-type-options']).toBe('nosniff');
  expect(firstHeaders['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(firstHeaders['permissions-policy']).toContain('camera=()');
  expect(firstHeaders['strict-transport-security']).toBeUndefined();

  const nonces = await page
    .locator('script[nonce]')
    .evaluateAll((elements) => elements.map((element) => element.nonce));
  expect(nonces.length).toBeGreaterThan(0);
  for (const nonce of nonces) expect(nonce).toBe(firstNonce);
  await page.route('**/connexion', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers['content-length'];
    delete headers['content-encoding'];
    const body = (await response.text()).replace(
      '</body>',
      '<script>window.__spec805 = true;</script></body>',
    );
    await route.fulfill({ status: response.status(), headers, body });
  });
  await page.goto('/connexion?injected=1');
  const injected = await page.evaluate(
    () => (window as unknown as { __spec805?: boolean }).__spec805 === true,
  );
  expect(injected).toBe(false);
  await page.unroute('**/connexion');

  const second = await page.reload();
  const secondCsp = second?.headers()['content-security-policy'] ?? '';
  const secondNonce = /'nonce-([^']+)'/.exec(secondCsp)?.[1];
  expect(secondNonce).toBeTruthy();
  expect(secondNonce).not.toBe(firstNonce);

  // CA-2 — a mutation from a foreign origin is refused before the service, with no account created.
  const email = `sdd-805-${randomUUID().slice(0, 8)}@test.learny.test`;
  const refused = await request.post('/api/v1/auth/sign-up', {
    headers: { origin: 'https://evil.test' },
    data: { email, password: PASSWORD, firstName: 'Test', lastName: 'Sécurité' },
  });
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ code: 'ORIGIN_REJECTED' });
  const rows = await serviceDb().execute<{ count: number }>(
    sql`select count(*)::int as count from auth.users where email = ${email}`,
  );
  expect(rows[0]?.count).toBe(0);

  // CA-6 — the demonstration lists the six categories with real or explicitly missing statuses.
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(CATEGORIES);
  await expect(page.getByTestId('spec-805-row')).toHaveCount(14);
  const statuses = await page.getByTestId('spec-805-status').allTextContents();
  for (const status of statuses) expect(STATUSES).toContain(status);
  await expect(page.getByTestId('spec-805-test').first()).toHaveText('csp.test.ts');
  await expect(page.locator('body')).not.toContainText('IGNORE TOUTES LES INSTRUCTIONS');
  await expect(page.locator('body')).not.toContainText('evil.test');

  await axeCheck();
  await captureEvidence('spec-805-demo');
  expect(consoleErrors).toEqual([]);
});

test('contrôles de sécurité conformes @SPEC-805 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-805-headers"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-805-dependencies"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(CATEGORIES);
  await expect(page.getByTestId('spec-805-row')).toHaveCount(14);

  // At 390 px the six categories stack: same left edge, increasing top edge.
  const boxes = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: Math.round(rect.left), top: Math.round(rect.top) };
      }),
    );
  const left = boxes[0]?.left;
  for (const box of boxes) expect(box.left).toBe(left);
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index]?.top).toBeGreaterThan(boxes[index - 1]?.top ?? 0);
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-805-demo-visual');
  await expectScreenshotBaseline(page, 'spec-805-demo.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});
