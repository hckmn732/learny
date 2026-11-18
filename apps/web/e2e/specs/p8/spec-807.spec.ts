// SPEC-807 §10 — page de démonstration de la matrice des parcours V1 : matrice lue dans
// `docs/quality/v1-journeys.md`, statuts tirés des seuls rapports de `evidence/SPEC-807/`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const PAGE = '/_dev/sdd/SPEC-807';
const TITLE = 'SPEC-807 · Parcours de bout en bout';
const JOURNEYS = ['EF-1', 'EF-2', 'EF-3', 'EF-4', 'EF-5', 'EF-6'];
const REGIONS = [
  'spec-807-run',
  ...JOURNEYS.map((id) => `spec-807-${id.toLowerCase()}`),
  'spec-807-visual',
];
const MATRIX = fs.readFileSync(path.join(ROOT, 'docs', 'quality', 'v1-journeys.md'), 'utf8');
const STEP_COUNT = [...MATRIX.matchAll(/^\| J\d\.\d{2} \|/gm)].length;
const JOURNEY_REPORT = path.join(ROOT, 'evidence', 'SPEC-807', 'journeys.json');
const VISUAL_REPORT = path.join(ROOT, 'evidence', 'SPEC-807', 'visual', 'ratios.json');

test('matrice des parcours V1 @SPEC-807', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('spec-807-count')).toHaveText(
    `6 parcours · ${String(STEP_COUNT)} étapes`,
  );

  // Every journey of the matrix, its three engines and every step of the document.
  for (const id of JOURNEYS) {
    const card = page.getByTestId(`spec-807-${id.toLowerCase()}`);
    await expect(card.getByRole('heading', { level: 2 })).toContainText(id);
    await expect(card.getByTestId('spec-807-engine')).toHaveCount(3);
    await expect(card.getByTestId('spec-807-engine')).toContainText([
      'Chromium',
      'Firefox',
      'WebKit',
    ]);
    await expect(card).toContainText('apps/web/e2e/journeys/');
  }
  await expect(page.getByTestId('spec-807-step')).toHaveCount(STEP_COUNT);
  await expect(
    page.getByTestId('spec-807-step').filter({ hasText: 'J1.01' }),
  ).toContainText('/inscription');
  await expect(page.getByTestId('spec-807-screen')).toHaveCount(5);
  await captureEvidence('spec-807-matrice');

  // Only the three published statuses exist, and « Réussi » never appears without a report.
  const statuses = await page.getByTestId('spec-807-status').allTextContents();
  expect(statuses.length).toBe(JOURNEYS.length * 3 + 5);
  for (const status of statuses) expect(['Réussi', 'Échec', 'Non exécuté']).toContain(status);
  const journeyStatuses = statuses.slice(0, JOURNEYS.length * 3);
  const screenStatuses = statuses.slice(JOURNEYS.length * 3);
  if (!fs.existsSync(JOURNEY_REPORT)) {
    await expect(page.getByTestId('spec-807-report')).toHaveText('Aucun rapport');
    expect(new Set(journeyStatuses)).toEqual(new Set(['Non exécuté']));
  }
  if (!fs.existsSync(VISUAL_REPORT)) {
    await expect(page.getByTestId('spec-807-visual-report')).toHaveText('Aucun rapport');
    expect(new Set(screenStatuses)).toEqual(new Set(['Non exécuté']));
  }

  // The step tables scroll inside a focusable region (keyboard reachable).
  const region = page.getByRole('region', { name: 'Étapes du parcours EF-1 (tableau défilant)' });
  await region.focus();
  await expect(region).toBeFocused();
  await axeCheck();
});

test('matrice des parcours V1 conforme @SPEC-807 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('spec-807-step')).toHaveCount(STEP_COUNT);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-807-run"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-807-ef-1"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-807-visual"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  // Region order: last run, the six journeys, then the visual regression.
  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);
  const boxes = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: Math.round(rect.left), top: Math.round(rect.top) };
      }),
    );
  for (const box of boxes) expect(box.left).toBe(boxes[0]?.left);
  for (let index = 1; index < boxes.length; index += 1) {
    expect(boxes[index]?.top).toBeGreaterThan(boxes[index - 1]?.top ?? 0);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-807-demo-visual');
  // Statuses and report dates depend on the latest run: they are masked in the baseline.
  await expectScreenshotBaseline(page, 'spec-807-demo.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
    mask: [
      page.getByTestId('spec-807-status'),
      page.getByTestId('spec-807-ratio'),
      page.getByTestId('spec-807-report'),
      page.getByTestId('spec-807-visual-report'),
    ],
  });
});
