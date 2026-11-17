// SPEC-802 — mobile visual conformity (ET-5, CA-6, §10): mockup comparison on the « menu masqué »
// mobile references (≤ 12 %), tokens and structure, plus 360/390/768 baselines.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDb } from '@learny/db';
import { DEMO_USERS, demoChapterId, demoFormationId, demoModuleId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReferenceRegion,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const REFERENCES = fileURLToPath(new URL('../../../../../design/references/', import.meta.url));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(REFERENCES, 'manifest.json'), 'utf8')) as {
  references: Array<{ file: string; width: number; height: number }>;
};
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const EVIDENCE = path.join(ROOT, 'evidence', 'SPEC-802', 'visual');
const COURSE = `/formations/${SAP}/modules/${demoModuleId('sap', 1)}/cours?chapitre=${demoChapterId('sap', 1, 1)}`;

const SCREENS = [
  { id: 'SCR-03', route: '/accueil' },
  { id: 'SCR-07', route: COURSE },
  { id: 'SCR-10', route: `/formations/${SAP}/quiz-global` },
  { id: 'SCR-12', route: '/agenda' },
] as const;

let session: TestSession;

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterAll(async () => {
  await closeDb();
});

async function waitForFonts(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

test('jetons et structure mobile @SPEC-802 @visual', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/accueil');
  await waitForFonts(page);

  // Header: menu trigger, search icon, notification bell and avatar are all present.
  await expect(page.getByTestId('sidebar-show')).toBeVisible();
  await expect(page.getByTestId('header-search-toggle')).toBeVisible();
  await expect(page.getByTestId('header-notifications')).toBeVisible();
  await expect(page.getByTestId('header-account-trigger')).toBeVisible();

  await page.getByTestId('sidebar-show').click();
  await expectTokens(page, {
    '[data-testid="sidebar"]': { 'background-color': colors.ink },
    '[data-testid="sidebar-backdrop"]': { 'background-color': colors.overlay },
    '[data-testid="sidebar-quiz-badge"]': {
      'background-color': colors.lime,
      color: colors.ink,
    },
  });
  await page.keyboard.press('Escape');
});

test('comparaison aux références menu masqué 390×844 @SPEC-802 @visual', async ({
  page,
}, testInfo) => {
  test.setTimeout(20 * 60_000);
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const ratios: Array<{ screen: string; ratio: number }> = [];

  for (const screen of SCREENS) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(screen.route);
    // Hydrated mobile header (search reduced to an icon) and loaded data, no skeleton left.
    await expect(page.getByTestId('header-search-toggle')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await waitForFonts(page);
    await expect(page.getByTestId('sidebar')).toBeHidden();
    const reference = path.join(REFERENCES, `${screen.id}-menu-masque-mobile.png`);
    const relative = `design/references/${screen.id}-menu-masque-mobile.png`;
    const image = MANIFEST.references.find((entry) => entry.file === relative);
    if (image === undefined) throw new Error(`référence absente du manifeste : ${relative}`);
    // The reference pixels are CSS pixels of a 390 px window: the mockup overflows to the right
    // (no media queries), so only the visible 390 × 844 window is compared, without rescaling.
    const regionWidth = Math.min(image.width, 390);
    const regionHeight = Math.min(image.height, 844);
    const actual = await page.screenshot({ animations: 'disabled' });
    const comparison = compareWithReferenceRegion(
      actual,
      reference,
      { x: 0, y: 0, width: regionWidth, height: regionHeight },
      testInfo.outputPath('visual'),
      `spec-802-${screen.id}-mobile`,
    );
    ratios.push({ screen: screen.id, ratio: comparison.ratio });
    await testInfo.attach(`${screen.id}-side-by-side`, {
      path: comparison.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach(`${screen.id}-diff`, {
      path: comparison.diffPath,
      contentType: 'image/png',
    });
    fs.copyFileSync(
      comparison.sideBySidePath,
      path.join(EVIDENCE, `${screen.id}-mobile-side-by-side.png`),
    );
    fs.copyFileSync(comparison.diffPath, path.join(EVIDENCE, `${screen.id}-mobile-diff.png`));
  }

  fs.writeFileSync(
    path.join(EVIDENCE, 'ratios.json'),
    `${JSON.stringify({ generatedAt: '2026-11-11T12:20:00Z', ratios }, null, 2)}\n`,
  );
  // Every screen is measured before asserting, so one run records the four rates (CA-6).
  for (const { screen, ratio } of ratios) {
    expect.soft(ratio, `écart maquette ${screen}`).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  }
});

test('lignes de base 360, 390 et 768 @SPEC-802 @visual', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  for (const width of [
    { name: '360', width: 360, height: 740 },
    { name: '390', width: 390, height: 844 },
    { name: '768', width: 768, height: 1024 },
  ]) {
    await page.setViewportSize({ width: width.width, height: width.height });
    for (const screen of SCREENS) {
      await page.goto(screen.route);
      await waitForFonts(page);
      await expectScreenshotBaseline(page, `spec-802-${screen.id}-${width.name}.png`, {
        maxDiffPixelRatio: 0.01,
      });
    }
  }
});
