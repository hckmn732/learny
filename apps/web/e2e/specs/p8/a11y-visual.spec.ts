// SPEC-803 §10, CA-4 — token, structure and baseline checks of the public declaration.
import { closeDb } from '@learny/db';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

test.beforeAll(async () => {
  await restoreDemoData();
});

test.afterAll(async () => {
  await restoreDemoData();
  await closeDb();
});

const SECTIONS = [
  'État de conformité',
  'Résultats des tests',
  'Contenus non accessibles',
  'Établissement de cette déclaration',
  'Retour d’information et contact',
  'Voies de recours',
  'Dérogations',
];

test('déclaration d’accessibilité, jetons et structure @SPEC-803 @visual', async ({
  page,
  axeCheck,
}) => {
  await page.goto('/accessibilite');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Déclaration d’accessibilité');
  await expect(page).toHaveTitle('Déclaration d’accessibilité · Learny');
  await expectTokens(page, {
    'h1': { color: '#111113' },
    '[data-testid="accessibilite-card"]': {
      'background-color': '#FFFFFF',
      'border-color': '#E7E6E1',
    },
    '[data-testid="site-footer"]': { 'background-color': '#F4F4F1' },
  });
  const headings = await page.locator('h2').allTextContents();
  expect(headings.map((heading) => heading.trim())).toEqual(SECTIONS);
  await expect(page.getByTestId('site-footer').getByRole('link')).toHaveCount(4);
  await axeCheck();
  await expectScreenshotBaseline(page, 'accessibilite-desktop.png', { fullPage: true });
});

test('déclaration d’accessibilité mobile @SPEC-803 @visual @mobile', async ({ page, axeCheck }) => {
  test.skip(test.info().project.name !== 'mobile', 'capture mobile');
  await page.goto('/accessibilite');
  await expect(page.getByTestId('accessibilite-card')).toBeVisible();
  await axeCheck();
  await expectScreenshotBaseline(page, 'accessibilite-mobile.png', { fullPage: true });
});
