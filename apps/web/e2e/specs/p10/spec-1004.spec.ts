import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-1004';

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

test('affiche la couverture des routes @SPEC-1004', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText('Table des routes');
  await expect(page.getByTestId('spec-1004-row')).toHaveCount(5);

  // EF-6 — every line of the coverage table is a number (or the drift, which must stay 0).
  await expect(page.getByTestId('spec-1004-registry')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('spec-1004-implementations')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('spec-1004-specials')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('spec-1004-files')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('spec-1004-drift')).toHaveText('0');

  const registry = Number(await page.getByTestId('spec-1004-registry').innerText());
  const implementations = Number(await page.getByTestId('spec-1004-implementations').innerText());
  const specials = Number(await page.getByTestId('spec-1004-specials').innerText());
  expect(implementations + specials).toBeGreaterThanOrEqual(registry);

  // CA-5 — the verdict states a complete coverage and the special handlers are listed.
  await expect(page.getByTestId('spec-1004-verdict')).toContainText('Couverture complète');
  await page.getByTestId('spec-1004-special').locator('summary').click();
  await expect(page.getByTestId('spec-1004-special-row').first()).toBeVisible();
  expect(await page.getByTestId('spec-1004-special-row').count()).toBeGreaterThan(0);

  await captureEvidence('spec-1004-route-table');
  await axeCheck();
});

test('démonstration de la table des routes @SPEC-1004 @visual', async ({ page, axeCheck }) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('spec-1004-drift')).toHaveText('0');

  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-1004-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-1004-demo.png', { fullPage: true });
});
