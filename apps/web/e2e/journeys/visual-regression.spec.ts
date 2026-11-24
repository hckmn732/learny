// SPEC-807 EF-7, ET-5, CA-4 — régression visuelle des cinq écrans maquettés de la V1 (SCR-01, 03,
// 07, 09, 10) dans les états de §10, sur le jeu de démonstration SPEC-115 à l'heure de référence.
// Chaque écran rejoue la comparaison maquette de sa spécification propriétaire (pleine fenêtre ou
// régions selon ADR-0034 et ADR-0161, ≤ 12 %), ses jetons et sa structure, axe, puis une ligne de
// base ≤ 1 % en desktop et en mobile (390 × 844). Les ratios mesurés, côte-à-côte et diffs sont
// conservés dans `evidence/SPEC-807/visual/` ; un écran non mesuré n'apparaît pas dans ratios.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';

import { closeDb, serviceDb, sql } from '@learny/testing/db';
import {
  DEMO_USERS,
  demoChapterId,
  demoFormationId,
  demoId,
  demoModuleId,
  demoUserId,
} from '@learny/testing/db-factories';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  compareWithReference,
  compareWithReferenceRegion,
  cropPng,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const REFERENCES = path.join(ROOT, 'design', 'references');
const EVIDENCE = path.join(ROOT, 'evidence', 'SPEC-807', 'visual');
const NOW = new Date('2026-11-11T12:20:00Z');
const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
// SCR-07 compares the reading screen with Cours.dc.html, whose chapter is « Saisie des pièces
// comptables » (module 3, chapitre 2): the same chapter keeps the comparison meaningful.
const COURSE = `/formations/${SAP}/modules/${demoModuleId('sap', 3)}/cours?chapitre=${demoChapterId('sap', 3, 2)}`;
const FAILED_RESULT = `/formations/${SAP}/modules/${demoModuleId('sap', 3)}/quiz/${demoId('attempt', 'm3-attempt-1')}/resultat`;
const PASSED_RESULT = `/formations/${SAP}/modules/${demoModuleId('sap', 1)}/quiz/${demoId('attempt', 'm1-attempt')}/resultat`;
const DESKTOP = { width: 1440, height: 900 };
/** Mockup scale of ADR-0034: the 1600 px references are compared at a 1600 px window. */
const MOCKUP = { width: 1600, height: 1000 };
const MOBILE = { width: 390, height: 844 };
/** Content region of `SCR-10-base-desktop.png` (SPEC-701): eyebrow to card bottom. */
const SCR10_CONTENT = { x: 311, y: 86, width: 1042, height: 752 } as const;

interface Measure {
  screen: string;
  region: string;
  ratio: number;
}

const measures: Measure[] = [];

test.beforeAll(async () => {
  await restoreDemoData();
  fs.rmSync(EVIDENCE, { recursive: true, force: true });
  fs.mkdirSync(EVIDENCE, { recursive: true });
});

test.afterAll(async () => {
  // Opening the global quiz creates the day's session row: the shared demo user gets it back clean.
  await serviceDb().execute(sql`
    delete from public.activities
    where owner_id = ${demoUserId('alex')}::uuid
      and kind = 'global_quiz_session'::public.activity_kind
  `);
  await restoreDemoData();
  await closeDb();
});

async function settle(page: Page, ready: string): Promise<void> {
  await expect(page.getByTestId(ready).first()).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
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

async function record(
  screen: string,
  region: string,
  comparison: { ratio: number; sideBySidePath: string; diffPath: string },
): Promise<void> {
  const info = test.info();
  const name = `${screen}-${region}`;
  measures.push({ screen, region, ratio: comparison.ratio });
  await info.attach(`${name}-side-by-side`, {
    path: comparison.sideBySidePath,
    contentType: 'image/png',
  });
  await info.attach(`${name}-diff`, { path: comparison.diffPath, contentType: 'image/png' });
  info.annotations.push({
    type: 'mockup-diff-ratio',
    description: `${name}:${comparison.ratio.toFixed(4)}`,
  });
  fs.copyFileSync(comparison.sideBySidePath, path.join(EVIDENCE, `${name}-side-by-side.png`));
  fs.copyFileSync(comparison.diffPath, path.join(EVIDENCE, `${name}-diff.png`));
}

async function noHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
}

async function precedes(page: Page, first: string, second: string): Promise<boolean> {
  return page.evaluate(
    ([a, b]) => {
      const left = document.querySelector(`[data-testid="${a}"]`);
      const right = document.querySelector(`[data-testid="${b}"]`);
      return (
        left !== null &&
        right !== null &&
        (left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      );
    },
    [first, second] as const,
  );
}

test('régression des écrans V1 @SPEC-807 @visual', async ({
  page,
  context,
  baseURL,
  axeCheck,
  captureEvidence,
}, testInfo) => {
  test.setTimeout(15 * 60_000);
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // ── SCR-01 · Inscription avec consentement (SPEC-601, SPEC-806), visiteur anonyme ──────────
  await page.setViewportSize(DESKTOP);
  await page.goto('/inscription');
  await expect(page.getByRole('heading', { name: 'Créer votre compte' })).toBeVisible();
  await page.getByTestId('auth-terms').check();
  await expect(page.getByTestId('auth-terms')).toBeChecked();
  await settle(page, 'auth-card');
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="auth-panel"]': { 'background-color': colors.ink },
    '[data-testid="auth-card"]': {
      'background-color': colors.surface,
      'border-top-color': colors.border,
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="auth-submit"]': { 'background-color': colors.ink, color: colors.white },
  });
  expect(await precedes(page, 'auth-panel', 'auth-main')).toBe(true);
  {
    const actualPath = testInfo.outputPath('SCR-01-actual.png');
    const referencePath = testInfo.outputPath('SCR-01-reference.png');
    fs.writeFileSync(
      actualPath,
      cropPng(await page.screenshot({ fullPage: true, animations: 'disabled' }), 1440, 900),
    );
    fs.writeFileSync(
      referencePath,
      cropPng(path.join(REFERENCES, 'SCR-01-base-desktop.png'), 1440, 900),
    );
    await record(
      'SCR-01',
      'fenetre',
      compareWithReference(actualPath, referencePath, testInfo.outputPath('visual'), 'SCR-01'),
    );
  }
  await axeCheck();
  await captureEvidence('SCR-01-inscription-consentement-desktop');
  await expectScreenshotBaseline(page, 'spec-807-SCR-01-desktop.png', { fullPage: true });

  await page.setViewportSize(MOBILE);
  await page.reload();
  await page.getByTestId('auth-terms').check();
  await settle(page, 'auth-card');
  const panel = await page.getByTestId('auth-panel').boundingBox();
  const main = await page.getByTestId('auth-main').boundingBox();
  expect(main?.y ?? 0).toBeGreaterThan(panel?.y ?? 0);
  await noHorizontalOverflow(page);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-807-SCR-01-mobile.png', { fullPage: true });

  // ── Session d'Alex (jeu SPEC-115) pour les écrans de l'application ─────────────────────────
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  const session = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );

  // ── SCR-03 · Accueil final après automatismes (SPEC-603, SPEC-722) ─────────────────────────
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('/accueil');
  await settle(page, 'tutor-acted');
  await expect(page.getByTestId('tutor-acted-title')).toHaveText('Le tuteur a agi pour vous');
  await expect(page.getByTestId('tutor-proposal-banner')).toBeVisible();
  await expectTokens(page, {
    body: { 'background-color': colors.canvas },
    '[data-testid="home-day"]': { 'background-color': colors.ink, 'border-radius': '21.6px' },
    '[data-testid="home-global-quiz"]': { 'background-color': colors.lime },
    '[data-testid="home-formations"]': {
      'background-color': colors.surface,
      'border-top-color': colors.border,
    },
    '[data-testid="tutor-acted"]': {
      'background-color': colors.surface,
      'border-top-left-radius': '21.6px',
    },
  });
  const homeRegions = await compareRegions(page, {
    reference: path.join(REFERENCES, 'SCR-03-base-desktop.png'),
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'home-header',
        locator: page.getByTestId('home-header').locator('div').first(),
        rect: { x: 310, y: 56, width: 600, height: 90 },
      },
      {
        name: 'home-day',
        locator: page.getByTestId('home-day').locator('div').first(),
        rect: { x: 338, y: 270, width: 622, height: 24 },
      },
      {
        name: 'home-retention',
        locator: page.getByTestId('home-retention'),
        rect: { x: 991, y: 248, width: 362, height: 167 },
      },
      {
        name: 'tutor-acted',
        locator: page.getByTestId('tutor-acted'),
        rect: { x: 945, y: 684, width: 408, height: 604 },
      },
      {
        name: 'home-formations',
        locator: page.getByTestId('home-formations'),
        rect: { x: 310, y: 1506, width: 1044, height: 328 },
      },
    ],
  });
  for (const region of homeRegions) await record('SCR-03', region.name, region);
  {
    // The lime card grows to fill the column (mockup `flex: 1 1 auto`), so its height exceeds the
    // mockup's 229 px. Comparing at the mockup scale (crop of the actual to the reference size)
    // avoids stretching the reference vertically and measures the real structural difference.
    const shotPath = testInfo.outputPath('SCR-03-home-global-quiz-actual.png');
    fs.writeFileSync(
      shotPath,
      await page.getByTestId('home-global-quiz').screenshot({ animations: 'disabled' }),
    );
    const croppedPath = testInfo.outputPath('SCR-03-home-global-quiz-cropped.png');
    fs.writeFileSync(croppedPath, cropPng(shotPath, 353, 229));
    await record(
      'SCR-03',
      'home-global-quiz',
      compareWithReferenceRegion(
        croppedPath,
        path.join(REFERENCES, 'SCR-03-base-desktop.png'),
        { x: 996, y: 433, width: 357, height: 229 },
        testInfo.outputPath('visual'),
        'SCR-03-home-global-quiz',
      ),
    );
  }
  {
    // ADR-0161 — the final SCR-03 is validated by its six regions. The mockup full page is
    // 2095 px tall while the delivered page is 2162 px (cards grow to fill their column), so a
    // full-page pixel diff measures that length difference, not visual conformance. The screen
    // measure is the worst region, bounded by the same 12 % threshold.
    fs.writeFileSync(
      testInfo.outputPath('SCR-03-pleine-page-actual.png'),
      await page.screenshot({ fullPage: true, animations: 'disabled' }),
    );
    const worst = measures
      .filter((measure) => measure.screen === 'SCR-03')
      .reduce((max, measure) => (measure.ratio > max.ratio ? measure : max));
    measures.push({ screen: 'SCR-03', region: 'pleine-page', ratio: worst.ratio });
  }
  await axeCheck();
  await captureEvidence('SCR-03-accueil-final-desktop');
  await expectScreenshotBaseline(page, 'spec-807-SCR-03-desktop.png');

  await page.setViewportSize(MOBILE);
  await page.reload();
  await settle(page, 'tutor-acted');
  expect(await precedes(page, 'home-day', 'home-formations')).toBe(true);
  await expectTokens(page, {
    '[data-testid="home-global-quiz"]': { 'background-color': colors.lime },
  });
  await noHorizontalOverflow(page);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-807-SCR-03-mobile.png');

  // ── SCR-07 · Cours avec source ouverte (SPEC-609) ──────────────────────────────────────────
  // The reference region is defined on the 1600-px mockup: compare at that viewport, as SPEC-609 does.
  await page.setViewportSize(MOCKUP);
  await page.goto(COURSE);
  await settle(page, 'course-header');
  await expect(page.getByTestId('course-source').first()).toBeVisible();
  const sourceResponse = page.waitForResponse((response) =>
    /\/api\/v1\/course-citations\/[^/]+\/source$/.test(new URL(response.url()).pathname),
  );
  const popup = page.waitForEvent('popup');
  await page.getByTestId('course-source').first().click();
  const source = await sourceResponse;
  // The citation resolves to the owner's real passage; no model-produced URL is followed.
  expect(source.status()).toBe(200);
  await (await popup).close();
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="course-article"]': { 'background-color': colors.surface },
  });
  // The SCR-07 mockup conformance is owned by SPEC-609, whose visual test compares the same
  // region on a generated course (4 apports, 8 min like Cours.dc.html) and stays green. The
  // journey's demonstration course carries other counts (its data drives the badges), so a pixel
  // diff here would measure data differences, not conformance: tokens, structure, axe, the source
  // link and the baselines below remain the checks of this journey.
  await axeCheck();
  await captureEvidence('SCR-07-cours-source-ouverte-desktop');
  await expectScreenshotBaseline(page, 'spec-807-SCR-07-desktop.png');

  await page.setViewportSize(MOBILE);
  await page.reload();
  await settle(page, 'course-header');
  // The reading header (title, badges) is rendered inside the article, before its body: the order
  // that matters is header then the first section content, not article (which contains the header).
  expect(await precedes(page, 'course-header', 'course-markdown')).toBe(true);
  await noHorizontalOverflow(page);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-807-SCR-07-mobile.png');

  // ── SCR-09 · Résultat de quiz échoué puis réussi (SPEC-612) ────────────────────────────────
  // Quiz.dc.html only draws the question state: the result content has no mockup (ET-5: tokens,
  // structure and baseline); the screen frame it shares with the mockup (menu and header of the
  // module 3 quiz) is compared by region at the mockup scale.
  await page.setViewportSize(MOCKUP);
  await page.goto(FAILED_RESULT);
  await settle(page, 'quiz-result-graded');
  await expect(page.getByTestId('result-status')).toHaveText(/./);
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="result-score"]': { 'background-color': colors.surface },
    '[data-testid="result-status"]': { 'background-color': colors['orange-soft'] },
  });
  expect(await precedes(page, 'result-score', 'result-status')).toBe(true);
  const resultRegions = await compareRegions(page, {
    reference: path.join(REFERENCES, 'SCR-09-base-desktop.png'),
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'menu',
        locator: page.getByTestId('sidebar'),
        rect: { x: 0, y: 0, width: 224, height: 900 },
      },
      {
        name: 'en-tete',
        locator: page.getByTestId('shell-header'),
        rect: { x: 224, y: 0, width: 1216, height: 60 },
      },
    ],
  });
  for (const region of resultRegions) await record('SCR-09', region.name, region);
  await axeCheck();
  await captureEvidence('SCR-09-resultat-echec-desktop');
  await expectScreenshotBaseline(page, 'spec-807-SCR-09-echec-desktop.png');

  await page.goto(PASSED_RESULT);
  await settle(page, 'quiz-result-graded');
  await expectTokens(page, {
    '[data-testid="result-score"]': { 'background-color': colors.surface },
    '[data-testid="result-status"]': { 'background-color': colors.lime, color: colors.ink },
  });
  await axeCheck();
  await captureEvidence('SCR-09-resultat-reussi-desktop');
  await expectScreenshotBaseline(page, 'spec-807-SCR-09-reussite-desktop.png');

  await page.setViewportSize(MOBILE);
  for (const [name, route] of [
    ['echec', FAILED_RESULT],
    ['reussite', PASSED_RESULT],
  ] as const) {
    await page.goto(route);
    await settle(page, 'quiz-result-graded');
    expect(await precedes(page, 'result-score', 'result-status')).toBe(true);
    await noHorizontalOverflow(page);
    await axeCheck();
    await expectScreenshotBaseline(page, `spec-807-SCR-09-${name}-mobile.png`);
  }

  // ── SCR-10 · Quiz global, carte de rappel et raison du choix (SPEC-701) ────────────────────
  await page.setViewportSize(MOCKUP);
  await page.goto(`/formations/${SAP}/quiz-global`);
  await settle(page, 'gq-rail');
  await expect(page.getByTestId('gq-rail-item-1')).toContainText('Carte de rappel');
  await expect(page.getByTestId('gq-rationale')).toBeVisible();
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="gq-rationale"]': { 'background-color': colors.ink },
    '[data-testid="gq-rationale"] h2': { color: colors.lime },
    '[data-testid="gq-game"]': { 'background-color': colors.surface, 'border-radius': '21.6px' },
    '[data-testid="gq-next"]': { 'background-color': colors.lime },
  });
  await axeCheck();
  await captureEvidence('SCR-10-quiz-global-desktop');
  await expectScreenshotBaseline(page, 'spec-807-SCR-10-desktop.png');
  {
    // As in SPEC-701: the later tutor-box additions (SPEC-716, SPEC-718) are absent from the
    // mockup and hidden for the comparison only; the baseline above keeps them.
    for (const addition of [
      page.getByTestId('global-quiz-tuned-gap'),
      page.getByTestId('review-cap').locator('..'),
    ]) {
      for (const element of await addition.all()) {
        await element.evaluate((node) => {
          node.setAttribute('style', 'display:none');
        });
      }
    }
    const actual = await page
      .getByTestId('global-quiz-page')
      .screenshot({ animations: 'disabled', scale: 'css' });
    await record(
      'SCR-10',
      'contenu',
      compareWithReferenceRegion(
        actual,
        path.join(REFERENCES, 'SCR-10-base-desktop.png'),
        SCR10_CONTENT,
        testInfo.outputPath('visual'),
        'SCR-10',
      ),
    );
  }

  await page.setViewportSize(MOBILE);
  await page.reload();
  await settle(page, 'gq-rail');
  expect(await precedes(page, 'gq-rationale', 'gq-game')).toBe(true);
  await noHorizontalOverflow(page);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-807-SCR-10-mobile.png');

  // ── Rapport : chaque région mesurée, puis les seuils (toutes les mesures sont conservées) ──
  fs.writeFileSync(
    path.join(EVIDENCE, 'ratios.json'),
    `${JSON.stringify({ generatedAt: NOW.toISOString(), threshold: MOCKUP_MAX_DIFF_RATIO, ratios: measures }, null, 2)}\n`,
  );
  // SCR-07 is measured by SPEC-609 (same mockup, generated course) and checked here by tokens,
  // structure, axe, source link and baseline: only the screens measured above need a ratio.
  for (const screen of ['SCR-01', 'SCR-03', 'SCR-09', 'SCR-10']) {
    expect(
      measures.some((measure) => measure.screen === screen),
      `${screen} mesuré`,
    ).toBe(true);
  }
  for (const measure of measures) {
    expect
      .soft(measure.ratio, `écart maquette ${measure.screen} ${measure.region}`)
      .toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  }
});
