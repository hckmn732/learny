import { expect, test } from '@learny/testing/playwright';
import {
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const TITLE = 'SPEC-211 — Export des données et suppression du compte';
const REGIONS = ['spec-211-export', 'spec-211-deletion', 'spec-211-execution'];
const RUN_EXPORT = 'Lancer un export';
const SCHEDULE = 'Programmer la suppression';
const CANCEL = 'Annuler la suppression';
const EXECUTE = 'Avancer l’horloge de 30 jours et exécuter';

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

function regionOrder(page: import('@playwright/test').Page) {
  return page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
}

test('export puis suppression complète @SPEC-211', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-211');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');
  expect(await regionOrder(page)).toEqual(REGIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Export',
    'Suppression',
    'Exécution à J+30',
  ]);
  await expect(page.getByTestId('spec-211-status')).toHaveText(
    'Aucun export demandé pour l’instant.',
  );

  // CA-1 — the export of the demo dataset is ready, with its ZIP tree and size.
  await page.getByRole('button', { name: RUN_EXPORT }).click();
  await expect(page.getByTestId('spec-211-announce')).toContainText('Export prêt');
  await expect(page.getByTestId('spec-211-status')).toHaveText('Prêt');
  await expect(page.getByTestId('spec-211-size')).not.toContainText('—');
  await expect(page.getByTestId('spec-211-expires')).toContainText('Expiration : ');
  const tree = page.getByTestId('spec-211-tree');
  await expect(tree).toContainText('README.txt');
  await expect(tree).toContainText('settings.json');
  await expect(tree).toContainText('results.json');
  await expect(tree).toContainText('conversations.json');
  await expect(tree).toContainText('programme.json');
  await expect(tree).toContainText('cours.md');
  await expect(tree).toContainText('Memo partie double.txt');
  await expect(page.getByTestId('spec-211-announce')).toContainText('Export prêt');

  // CA-2 — the authenticated link answers a 302 to a fresh signed URL.
  const href = await page.getByTestId('spec-211-download').getAttribute('href');
  expect(href).toMatch(/^\/api\/v1\/me\/exports\/[0-9a-f-]+\?download=1$/);
  const redirect = await page.request.get(href ?? '', { maxRedirects: 0 });
  expect(redirect.status()).toBe(302);
  expect(redirect.headers()['location']).toMatch(/^http:\/\/127\.0\.0\.1:54321\/storage\/v1\//);

  // CA-3 — schedule, deadline shown with the local date, e-mail preview.
  await page.getByRole('button', { name: SCHEDULE }).click();
  await expect(page.getByTestId('spec-211-scheduled')).toContainText('Échéance : ');
  await expect(page.getByTestId('spec-211-scheduled')).toContainText('11 décembre 2026');
  await expect(page.getByTestId('spec-211-emails')).toContainText('deletion_scheduled');
  await page.getByRole('button', { name: CANCEL }).click();
  await expect(page.getByTestId('spec-211-scheduled')).toHaveText('Aucune suppression programmée.');
  await expect(page.getByTestId('spec-211-announce')).toHaveText('Suppression annulée.');

  // CA-4 — the throwaway account is deleted at J+30, every table is back to zero.
  await page.getByRole('button', { name: EXECUTE }).click();
  await expect(page.getByTestId('spec-211-auth-status')).toHaveText('Compte Auth : supprimé');
  const rows = page.locator('[data-testid^="spec-211-remaining-"]');
  const count = await rows.count();
  expect(count).toBeGreaterThan(10);
  for (let index = 0; index < count; index += 1) {
    await expect(rows.nth(index)).toHaveText('0');
  }
  await expect(page.getByTestId('spec-211-emails')).toContainText('deletion_completed');

  // Keyboard: the export button is reachable and the page never overflows at 390 px.
  const run = page.getByRole('button', { name: RUN_EXPORT });
  await run.focus();
  await expect(run).toBeFocused();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-211-donnees-personnelles');
  expect(consoleErrors.filter((message) => !message.includes('status of 4'))).toEqual([]);
});

test('données personnelles conformes @SPEC-211 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-211');
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  expect(await regionOrder(page)).toEqual(REGIONS);

  await page.getByRole('button', { name: RUN_EXPORT }).click();
  await expect(page.getByTestId('spec-211-announce')).toContainText('Export prêt');
  await expect(page.getByTestId('spec-211-status')).toHaveText('Prêt');
  await expect(page.getByTestId('spec-211-tree')).toContainText('cours.md');

  // §10 tokens: page #F4F4F1, white cards #E7E6E1 with 24 px radius, dark text.
  await expectTokens(page, {
    body: { color: '#111113', 'background-color': '#F4F4F1' },
    '[data-testid="spec-211-export"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-211-deletion"]': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="spec-211-execution"]': { 'border-top-left-radius': '24px' },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[ _]Grotesk/);

  // The e-mail preview carries the session address: masked so the baseline is deterministic.
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-211-demo.png', {
    fullPage: true,
    mask: [page.getByTestId('spec-211-emails')],
  });
});
