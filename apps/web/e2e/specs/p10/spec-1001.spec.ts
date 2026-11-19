// SPEC-1001 §12 — démonstration de la piste de migration : les trois régions de la page
// affichent exactement les valeurs de `progress/migration.json`, régénéré par
// `pnpm migration:report` (EF-6) ; rendu serveur, aucun état de chargement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const PAGE = '/_dev/sdd/SPEC-1001';
const TITLE = 'Piste de migration';
const REGIONS = ['spec-1001-coupling', 'spec-1001-routes', 'spec-1001-client-components'];
const REPORT = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'progress', 'migration.json'), 'utf8'),
) as {
  coupling: Record<string, number>;
  routes: { registry: number; routeFiles: number };
  clientComponents: string[];
};

test('affiche le couplage du web @SPEC-1001', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('spec-1001-report')).toHaveText(
    'Rapport : progress/migration.json',
  );

  // One row per category, with the exact value of the report.
  const rows = page.getByTestId('spec-1001-category-row');
  await expect(rows).toHaveCount(Object.keys(REPORT.coupling).length);
  for (const [category, value] of Object.entries(REPORT.coupling)) {
    const row = page.locator(
      `[data-testid="spec-1001-category-row"][data-category="${category}"]`,
    );
    await expect(row.getByTestId('spec-1001-category-count')).toHaveText(String(value));
  }

  // The registry and the route file counts.
  await expect(page.getByTestId('spec-1001-routes-registry')).toHaveText(
    String(REPORT.routes.registry),
  );
  await expect(page.getByTestId('spec-1001-routes-files')).toHaveText(
    String(REPORT.routes.routeFiles),
  );

  // Every coupled client component, and nothing else.
  const items = page.getByTestId('spec-1001-client-component');
  await expect(items).toHaveCount(REPORT.clientComponents.length);
  for (const file of REPORT.clientComponents) {
    await expect(items.filter({ hasText: file })).toHaveCount(1);
  }

  await captureEvidence('spec-1001-coupling');
  await axeCheck();
});

test('démonstration de la piste conforme @SPEC-1001 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-1001-coupling"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-1001-routes"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-1001-client-components"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  // Region order: coupling, routes, then the client components.
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
  await captureEvidence('spec-1001-demo');
  // Toutes les valeurs viennent du JSON versionné : aucun masque nécessaire (contrairement à
  // spec-807) ; l'horloge de la coquille est figée par le fixture fixedTime.
  await expectScreenshotBaseline(page, 'spec-1001-demo.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});