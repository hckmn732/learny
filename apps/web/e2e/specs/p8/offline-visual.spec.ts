// Visual conformity of the offline screens (SPEC-801 §10, CA-8): tokens and structure of
// `/hors-ligne` with and without a pack, and of the offline revision screen in 1440×900 and
// 390×844. Baselines are compared with a 1 % pixel tolerance.
import { DEMO_USERS, demoFormationId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');

async function ready(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/accueil');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
}

test.beforeAll(async () => {
  await restoreDemoData();
});

test.afterAll(async () => {
  await restoreDemoData();
});

test('conformité visuelle de /hors-ligne avec paquets @SPEC-801 @visual', async ({
  page,
  context,
  baseURL,
  axeCheck,
}) => {
  if (ALEX === undefined) throw new Error('Alex absent');
  const session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3152' })),
  );
  await ready(page);
  await page.goto('/hors-ligne');
  await expect(page.getByTestId('offline-packs')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    'h1': { color: colors.ink, 'font-size': '30.6px' },
    '[data-testid="offline-packs"] li': {
      'background-color': colors.surface,
      'border-color': colors.border,
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="offline-packs"] li a': { 'background-color': colors.lime, color: colors.ink },
    'a[href="/hors-ligne"]': {
      'border-top-color': colors['border-strong'],
      color: colors.ink,
    },
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Space Grotesk/);
  await expect(page.getByTestId('offline-pack-' + SAP)).toBeVisible();
  await axeCheck();
  await expectScreenshotBaseline(page, 'offline-page.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});

test('état vide de /hors-ligne @SPEC-801 @visual', async ({ page, axeCheck }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/hors-ligne');
  await expect(page.getByTestId('offline-empty')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vous êtes hors ligne');
  await expect(page.getByText('Aucune révision disponible hors ligne.')).toBeVisible();
  await axeCheck();
  await expectScreenshotBaseline(page, 'offline-empty.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});

test('écran de révision hors ligne, conformité visuelle @SPEC-801 @visual @mobile', async ({
  page,
  context,
  baseURL,
  axeCheck,
}) => {
  if (ALEX === undefined) throw new Error('Alex absent');
  const session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({
      ...cookie,
      url: baseURL ?? 'http://127.0.0.1:3152',
    })),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await context.setOffline(true);
  await page.goto(`/formations/${SAP}/quiz-global`);
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await expectTokens(page, {
    '[data-testid="offline-banner"]': {
      'background-color': colors['offline-soft'],
      color: colors.ink,
      'border-top-left-radius': '14.4px',
    },
    '[data-testid="gq-game"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
    },
    '[data-testid="offline-indicator"]': {
      'background-color': colors.ink,
      color: colors.white,
    },
  });
  await axeCheck();
  await expectScreenshotBaseline(page, 'offline-quiz.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
  await context.setOffline(false);
});
