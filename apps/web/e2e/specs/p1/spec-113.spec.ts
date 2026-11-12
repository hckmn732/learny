import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['spec-113-count', 'spec-113-categories', 'spec-113-matrix'];
const HEADINGS = ['Isolation des données', 'Catégories', 'Matrice A / B / C'];

const EXPECTED = [
  { key: 'programme-read', cells: ['autorisé', 'autorisé', 'refusé'] },
  { key: 'programme-write', cells: ['autorisé', 'refusé', 'refusé'] },
  { key: 'resources-read', cells: ['autorisé', 'refusé', 'refusé'] },
  { key: 'progress-read', cells: ['autorisé', 'refusé', 'refusé'] },
  { key: 'projection-read', cells: ['autorisé', 'autorisé', 'refusé'] },
  { key: 'service-read', cells: ['refusé', 'refusé', 'refusé'] },
  { key: 'settings-read', cells: ['autorisé', 'refusé', 'refusé'] },
];

test('inspecte la matrice RLS @SPEC-113', async ({ page, axeCheck, captureEvidence, consoleErrors }) => {
  await page.goto('/_dev/sdd/SPEC-113');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-113 · Politiques RLS et tests d’isolation');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page.locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-5 — measured catalogue counts, never invented totals.
  await expect(page.getByTestId('spec-113-summary')).toHaveText(
    /^\d+ tables publiques, \d+ avec RLS activée, \d+ politiques\.$/,
  );
  const summary = (await page.getByTestId('spec-113-summary').textContent()) ?? '';
  expect(summary).toContain('53 tables publiques, 53 avec RLS activée');
  await expect(page.getByTestId('spec-113-forced')).toHaveText('53 tables forcent RLS pour le propriétaire SQL.');

  // Categories: shared programme 7, personal 42, service 4.
  await expect(page.getByTestId('spec-113-category')).toHaveCount(3);
  const categories = await page
    .getByTestId('spec-113-category')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-category')));
  expect(categories).toEqual(['shared-programme', 'personal', 'service']);
  const categoryLabels = await page
    .getByTestId('spec-113-category')
    .locator('span:first-child')
    .allTextContents();
  expect(categoryLabels).toEqual(['Programme partagé', 'Personnel', 'Service']);
  const counts = await page.getByTestId('spec-113-category-count').allTextContents();
  expect(counts).toEqual(['7 tables', '42 tables', '4 tables']);

  // Matrix — each cell is the observed outcome for A, B and C.
  const keys = await page
    .getByTestId('spec-113-matrix-row')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-key')));
  expect(keys).toEqual(EXPECTED.map((row) => row.key));
  for (const [index, row] of EXPECTED.entries()) {
    const cells = page.getByTestId('spec-113-matrix-row').nth(index).getByTestId('spec-113-cell');
    expect(await cells.allTextContents()).toEqual(row.cells);
    const observed = await cells.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-allowed')),
    );
    expect(observed, row.key).toEqual(
      row.cells.map((cell) => (cell === 'autorisé' ? 'true' : 'false')),
    );
  }

  await axeCheck();
  await captureEvidence('spec-113-rls-matrix');
  expect(consoleErrors).toEqual([]);
});

test('matrice RLS conforme @SPEC-113 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-113');

  const ids = await page.locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  await expectTokens(page, {
    body: {
      color: PROVISIONAL_TOKENS.color.text,
      'background-color': PROVISIONAL_TOKENS.color.background,
    },
    '[data-testid="sdd-title"]': { color: PROVISIONAL_TOKENS.color.text },
    '[data-testid="spec-113-count"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-113-categories"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-113-matrix"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-113-category"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the matrix stays inside a horizontally scrollable region.
  if (page.viewportSize()?.width === 390) {
    const region = page.getByTestId('spec-113-matrix').locator('div.overflow-x-auto').first();
    const scrolls = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrolls, 'la matrice doit défiler horizontalement').toBe(true);
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-113-rls-matrix.png', { fullPage: true });
});
