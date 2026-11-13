import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-509';
const TITLE = 'SPEC-509 · Ingestion : notes et PDF';

test('Ingestion : notes et PDF, découpage, embeddings @SPEC-509', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  // 1. The note is extracted, split and embedded: located passages and 1024-dim vectors.
  await expect(page.getByTestId('ingestion-note-status')).toContainText('prêt');
  const noteRows = page.locator('[data-testid^="ingestion-note-chunk-"]');
  await expect(noteRows.first()).toBeVisible();
  expect(await noteRows.count()).toBeGreaterThan(0);
  await expect(noteRows.first()).toContainText(/·\s*[0-9]+ jetons/);
  const noteVector = page.locator('[data-testid^="ingestion-note-vector-"]').first();
  await expect(noteVector).toContainText('1024 dims');
  await expect(noteVector).toContainText('norme 1.000000');
  const noteDigest = (await noteVector.textContent())?.split(' · ').at(-1) ?? '';
  expect(noteDigest.length).toBe(16);

  // 2. The PDF keeps page numbers and exact character offsets.
  await expect(page.getByTestId('ingestion-pdf-status')).toContainText('prêt');
  await expect(page.getByTestId('ingestion-pdf-card')).toContainText('Pages : 2');
  await expect(page.getByTestId('ingestion-pdf-card')).toContainText('file_mock_spec509');
  const pageOne = page.locator('[data-testid^="ingestion-pdf-chunk-"][data-page="1"]');
  const pageTwo = page.locator('[data-testid^="ingestion-pdf-chunk-"][data-page="2"]');
  await expect(pageOne.first()).toBeVisible();
  await expect(pageTwo.first()).toBeVisible();
  await captureEvidence('spec-509-note-et-pdf');

  // 3. Same text, same vector: a reload gives the same digest (CA-2).
  await page.reload();
  await expect(page.getByTestId('ingestion-note-status')).toContainText('prêt');
  const reloadedVector = page.locator('[data-testid^="ingestion-note-vector-"]').first();
  await expect(reloadedVector).toContainText(noteDigest);

  // 4. A PDF without text is failed with a readable reason; Réessayer makes it ready.
  await expect(page.getByTestId('ingestion-failure-status')).toContainText('échec');
  await expect(page.getByTestId('ingestion-failure-status')).toContainText('PDF_EMPTY_TEXT');
  await expect(page.getByTestId('ingestion-failure-reason')).toContainText('aucun texte lisible');
  await captureEvidence('spec-509-echec-lisible');
  await page.getByTestId('ingestion-retry').click();
  await expect(page.getByTestId('ingestion-failure-status')).toContainText('prêt');
  await expect(page.getByTestId('ingestion-retry-success')).toContainText('Deuxième tentative');
  await expect(page.locator('[data-testid^="ingestion-failure-chunk-"]').first()).toBeVisible();
  await expect(page.getByTestId('ingestion-retry-attempts')).toHaveText('Tentatives : 1');

  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('Ingestion : notes et PDF, découpage, embeddings @SPEC-509 @visual', async ({
  page,
  axeCheck,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="ingestion-note-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '24px',
    },
    '[data-testid="ingestion-note-status"]': {
      'background-color': '#E1F4EF',
      color: '#0B5C4D',
    },
    '[data-testid="ingestion-failure-status"]': {
      'background-color': '#FFEDE0',
      color: '#8F3305',
    },
    '[data-testid="ingestion-retry"]': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
  });

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  const cards = await page
    .locator('main section[data-testid^="ingestion-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(cards).toEqual([
    'ingestion-steps-card',
    'ingestion-note-card',
    'ingestion-pdf-card',
    'ingestion-failure-card',
    'ingestion-contract-card',
  ]);

  await expect(page.getByTestId('ingestion-steps')).toBeVisible();
  await expect(page.getByTestId('ingestion-note-status')).toBeVisible();
  await expect(page.getByTestId('ingestion-retry')).toBeEnabled();

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-509-demo.png', { fullPage: true });
});
