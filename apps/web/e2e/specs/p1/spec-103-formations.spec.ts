import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['programme-tree', 'constraints-card', 'fts-card'];

const HEADINGS = ['Programme de démonstration', 'Contraintes', 'Recherche plein texte'];

const EXPECTED_SQLSTATES = ['23514', '23514', '23503', '23514', '23514', '23505', '00000'];

test('programme et contraintes @SPEC-103', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-103');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-103 · Formations, programme et notions');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-8 — the programme tree of 2 modules × 2 chapters × 2 notions.
  await expect(page.getByTestId('programme-module')).toHaveCount(2);
  await expect(page.getByTestId('programme-chapter')).toHaveCount(4);
  await expect(page.getByTestId('programme-notion')).toHaveCount(8);
  const modules = await page
    .getByTestId('programme-module')
    .evaluateAll((elements) =>
      elements.map((element) => element.querySelector('p')?.textContent.trim() ?? ''),
    );
  expect(modules).toEqual([
    'Module 1 · Partie 1 · seuil 80 %',
    'Module 2 · Partie 2 · seuil 80 %',
  ]);

  // CA-2 to CA-5 — six refusals and one accepted reorganisation.
  await expect(page.getByTestId('constraint-row')).toHaveCount(7);
  const sqlstates = await page
    .getByTestId('constraint-sqlstate')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(sqlstates).toEqual(EXPECTED_SQLSTATES);
  const results = await page
    .getByTestId('constraint-result')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(results.slice(0, 6)).toEqual(Array(6).fill('Refusé comme attendu'));
  expect(results[6]).toBe('Réorganisation en transaction acceptée');

  // CA-7 — unaccented full-text search finds one notion and uses the expression index.
  await expect(page.getByTestId('fts-query')).toHaveText('ecriture');
  await expect(page.getByTestId('fts-result')).toHaveText('1 résultat · Écriture de régularisation');
  await expect(page.getByTestId('fts-index')).toHaveText('utilisé');
  await expect(page.getByTestId('fts-plan')).toContainText('notions_fts_idx');

  await axeCheck();
  await captureEvidence('spec-103-demo');
  expect(consoleErrors).toEqual([]);
});

test('page programme conforme @SPEC-103 @visual', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-103');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  await expectTokens(page, {
    body: {
      color: PROVISIONAL_TOKENS.color.text,
      'background-color': PROVISIONAL_TOKENS.color.background,
    },
    '[data-testid="sdd-title"]': { color: PROVISIONAL_TOKENS.color.text },
    '[data-testid="programme-tree"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-103-demo.png', {
    fullPage: true,
    // The EXPLAIN plan carries planner costs that vary with the local statistics.
    mask: [page.getByTestId('fts-plan')],
  });
});
