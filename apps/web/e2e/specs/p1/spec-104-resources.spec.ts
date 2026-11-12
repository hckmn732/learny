import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['resource-card', 'vector-search', 'limits-card', 'soft-delete-card'];

const HEADINGS = [
  'Apport de démonstration',
  'Recherche vectorielle',
  'Limites',
  'Suppression logique',
];

const LIMIT_CODES = [
  'resources_note_shape',
  'resource_pdf_limit',
  'chapter_resource_limit',
  'resources_link_shape',
];

test('apports, passages et recherche vectorielle @SPEC-104', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-104');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-104 · Ressources et passages');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-3 — the demonstration note is split into three located passages.
  await expect(page.getByTestId('resource-content')).toHaveText(
    'Clés de comptabilisation : 40 = débit, 50 = crédit ? À vérifier',
  );
  await expect(page.getByTestId('chunk-row')).toHaveCount(3);
  const positions = await page
    .getByTestId('chunk-position')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(positions).toEqual(['0', '1', '2']);
  const locations = await page
    .getByTestId('chunk-location')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(locations).toEqual(['0–24', '27–50', '51–63']);

  // CA-5 — three passages ranked by cosine distance, using the HNSW index.
  await expect(page.getByTestId('vector-query')).toHaveText('clé débit');
  await expect(page.getByTestId('neighbour-row')).toHaveCount(3);
  const distanceTexts = await page
    .getByTestId('neighbour-distance')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(distanceTexts.every((distance) => /^-?\d+\.\d{4}$/.test(distance))).toBe(true);
  const distances = distanceTexts.map(Number);
  expect(distances).toEqual([...distances].sort((left, right) => left - right));
  await expect(page.getByTestId('vector-index')).toHaveText('utilisé');
  await expect(page.getByTestId('vector-plan')).toContainText(
    'resource_chunks_embedding_hnsw_idx',
  );

  // CA-2 — CL-1, CL-2, CL-3 and CL-8 are refused with their expected code.
  await expect(page.getByTestId('limit-row')).toHaveCount(4);
  const sqlstates = await page
    .getByTestId('limit-sqlstate')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(sqlstates).toEqual(Array(4).fill('23514'));
  const codes = await page
    .getByTestId('limit-code')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(codes).toEqual(LIMIT_CODES);
  const results = await page
    .getByTestId('limit-result')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(results).toEqual(Array(4).fill('Refusé comme attendu'));

  // CA-3 — soft deletion empties the passages and erases the content, the line survives.
  await expect(page.getByTestId('soft-delete-before')).toHaveText('3 passages');
  await expect(page.getByTestId('soft-delete-after')).toHaveText('0 passage');
  await expect(page.getByTestId('soft-delete-retained')).toHaveText('oui');
  await expect(page.getByTestId('soft-delete-content')).toHaveText('effacé');
  await expect(page.getByTestId('soft-delete-title')).toHaveText('Clés de comptabilisation');

  await axeCheck();
  await captureEvidence('spec-104-demo');
  expect(consoleErrors).toEqual([]);
});

test('page ressources conforme @SPEC-104 @visual', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-104');

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
    '[data-testid="resource-card"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-104-demo.png', {
    fullPage: true,
    // Distances and the EXPLAIN plan vary with statistics; identifiers are never rendered.
    mask: [page.getByTestId('neighbour-distance'), page.getByTestId('vector-plan')],
  });
});
