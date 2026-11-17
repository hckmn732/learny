// SPEC-803 §10, CA-4, CA-7 — token, structure and baseline checks of the public declaration plus
// the visible focus ring on a lemon button, a dark navigation link and a form field.
import { closeDb } from '@learny/db';
import { DEMO_USERS, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const FOCUS_LIGHT = 'rgb(58, 58, 168)';
const FOCUS_DARK = 'rgb(198, 244, 50)';

let session: TestSession;

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
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

test('états de focus visibles des composants principaux @SPEC-803 @visual', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/_dev/ui/actions');
  await expect(page.getByTestId('ui-button-lime-md')).toBeVisible();
  await page.keyboard.press('Tab');
  await page.getByTestId('ui-button-lime-md').focus();
  const button = page.getByTestId('ui-button-lime-md');
  await expect(button).toHaveCSS('outline-width', '2px');
  await expect(button).toHaveCSS('outline-color', FOCUS_LIGHT);
  await expect(button).toHaveCSS('outline-offset', '2px');

  await page.goto('/_dev/ui/saisie');
  const field = page.getByTestId('ui-textfield-form').locator('input');
  await page.keyboard.press('Tab');
  await field.focus();
  await expect(field).toHaveCSS('outline-width', '2px');
  await expect(field).toHaveCSS('outline-color', FOCUS_LIGHT);

  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
  await page.goto('/accueil');
  const darkLink = page.getByTestId('sidebar-home');
  await expect(darkLink).toBeVisible();
  await page.keyboard.press('Tab');
  await darkLink.focus();
  await expect(darkLink).toHaveCSS('outline-width', '2px');
  await expect(darkLink).toHaveCSS('outline-color', FOCUS_DARK);
});
