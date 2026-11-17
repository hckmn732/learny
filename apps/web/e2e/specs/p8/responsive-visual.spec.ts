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
  firstContentColumn,
  firstContentRow,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

import { resetDemoRateLimits } from '../../support/demo-exam';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const REFERENCES = fileURLToPath(new URL('../../../../../design/references/', import.meta.url));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(REFERENCES, 'manifest.json'), 'utf8')) as {
  references: Array<{ file: string; width: number; height: number }>;
};
/** Top of the first content of the four mockups (eyebrow line), measured on the PNGs. */
const MOCKUP_CONTENT_TOP = 180;
/** Left edge of the first content of the four mockups (desktop gutter kept at 390 px). */
const MOCKUP_CONTENT_LEFT = 36;
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const EVIDENCE = path.join(ROOT, 'evidence', 'SPEC-802', 'visual');
const COURSE = `/formations/${SAP}/modules/${demoModuleId('sap', 1)}/cours?chapitre=${demoChapterId('sap', 1, 1)}`;

// `ready` is a client-loaded block the mockup shows (SCR-03: pending tutor proposal of the demo
// dataset). `until` ends the compared block where the spec imposes a mobile disposition the
// mockup does not have: the horizontal game rail (EF-6) and the agenda view below the toolbar
// (EF-5, mini-calendar under the view). SCR-12 is opened in the week view of the mockup.
const SCREENS = [
  { id: 'SCR-03', route: '/accueil', ready: 'tutor-proposal-banner', until: null },
  { id: 'SCR-07', route: COURSE, ready: 'tutor-ask-card', until: null },
  { id: 'SCR-10', route: `/formations/${SAP}/quiz-global`, ready: 'gq-rail', until: 'gq-rail' },
  {
    id: 'SCR-12',
    route: '/agenda?vue=semaine&date=2026-11-11',
    ready: 'agenda-calendar',
    until: 'agenda-calendar',
  },
] as const;

let session: TestSession;

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
});

test.beforeEach(async ({ context, baseURL }) => {
  await resetDemoRateLimits();
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
  const ratios: Array<{ screen: string; region: string; ratio: number; windowRatio: number }> =
    [];

  for (const screen of SCREENS) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(screen.route);
    // Hydrated mobile header (search reduced to an icon) and loaded data, no skeleton left.
    await expect(page.getByTestId('header-search-toggle')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(page.getByTestId(screen.ready).first()).toBeVisible();
    await waitForFonts(page);
    await expect(page.getByTestId('sidebar')).toBeHidden();
    const reference = path.join(REFERENCES, `${screen.id}-menu-masque-mobile.png`);
    const relative = `design/references/${screen.id}-menu-masque-mobile.png`;
    const image = MANIFEST.references.find((entry) => entry.file === relative);
    if (image === undefined) throw new Error(`référence absente du manifeste : ${relative}`);

    // Région recadrée (ADR-0201). The mockups have no media queries: at 390 px they keep the
    // desktop gutter (36 px), wrap the search field on three header rows and overflow to the
    // right. Their pixels are CSS pixels of the 390 px window, so nothing is rescaled; both
    // captures are aligned on their first content (top and left edge) and compared over the
    // content width they share.
    // The mobile header itself is checked by the structure and token test above.
    const appHeader = await page.getByTestId('shell-header').boundingBox();
    const appHeaderBottom = Math.ceil((appHeader?.y ?? 0) + (appHeader?.height ?? 0));
    const full = await page.screenshot({ animations: 'disabled', fullPage: true });
    const appTop = firstContentRow(full, appHeaderBottom + 1, { width: 390 });
    const appLeft = firstContentColumn(full, appTop, appTop + 40);
    const margin = Math.min(appLeft, MOCKUP_CONTENT_LEFT);
    // Common content width: the mockup keeps its 36 px desktop gutters on both sides.
    const contentWidth = Math.min(390 - 2 * appLeft, 390 - 2 * MOCKUP_CONTENT_LEFT);
    const width = contentWidth + 2 * margin;
    const windowHeight = Math.min(844 - MOCKUP_CONTENT_TOP, image.height - MOCKUP_CONTENT_TOP);
    // Compared block: the whole window, or up to the first block whose mobile disposition is
    // imposed by the spec and absent from the mockup (EF-5, EF-6).
    let height = windowHeight;
    if (screen.until !== null) {
      const box = await page.getByTestId(screen.until).first().boundingBox();
      if (box === null) throw new Error(`bloc ${screen.until} absent`);
      height = Math.min(windowHeight, Math.max(1, Math.floor(box.y - appTop)));
    }
    const compare = async (h: number, name: string) => {
      const actual = await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        clip: { x: appLeft - margin, y: appTop, width, height: h },
      });
      return compareWithReferenceRegion(
        actual,
        reference,
        { x: MOCKUP_CONTENT_LEFT - margin, y: MOCKUP_CONTENT_TOP, width, height: h },
        testInfo.outputPath('visual'),
        name,
      );
    };
    const comparison = await compare(height, `spec-802-${screen.id}-mobile`);
    const windowComparison =
      height === windowHeight
        ? comparison
        : await compare(windowHeight, `spec-802-${screen.id}-mobile-fenetre`);
    ratios.push({
      screen: screen.id,
      region:
        screen.until === null
          ? `fenêtre ${String(width)}×${String(height)}`
          : `jusqu’à ${screen.until} ${String(width)}×${String(height)}`,
      ratio: comparison.ratio,
      windowRatio: windowComparison.ratio,
    });
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
    if (windowComparison !== comparison) {
      fs.copyFileSync(
        windowComparison.sideBySidePath,
        path.join(EVIDENCE, `${screen.id}-mobile-fenetre-side-by-side.png`),
      );
    }
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
      // Same settled state as the mockup comparison: loaded data, no skeleton, fonts ready.
      await page.waitForLoadState('networkidle');
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await expect(page.getByTestId(screen.ready).first()).toBeVisible();
      await waitForFonts(page);
      await expectScreenshotBaseline(page, `spec-802-${screen.id}-${width.name}.png`, {
        maxDiffPixelRatio: 0.01,
      });
    }
  }
});
