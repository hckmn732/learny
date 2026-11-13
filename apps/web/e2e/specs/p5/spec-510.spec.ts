import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-510';
const TITLE = 'SPEC-510 · Ingestion : pages web, YouTube et images';

test('Ingestion : pages web, YouTube et images @SPEC-510', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  // CA-1 — the web page keeps its title, main text and anchors, without navigation.
  await expect(page.getByTestId('ingestion-web-status')).toContainText('prêt');
  await expect(page.getByTestId('ingestion-web-panel')).toContainText(
    'Comptabilité de gestion — le compte de résultat',
  );
  await expect(page.locator('[data-testid^="ingestion-web-chunk-"]').first()).toContainText(
    'ancre',
  );
  await expect(page.getByTestId('ingestion-web-panel')).not.toContainText('navigation');
  await captureEvidence('spec-510-page-web');

  // CA-2 — the video tab shows timed segments.
  await page.getByTestId('ingestion-source-youtube').click();
  await expect(page.getByTestId('ingestion-youtube-status')).toContainText('prêt');
  await expect(page.locator('[data-testid^="ingestion-youtube-chunk-"]').first()).toContainText(
    /[0-9]+–[0-9]+ s/,
  );
  await expect(page.getByTestId('ingestion-youtube-panel')).toContainText(
    'Le compte de résultat présente les charges',
  );

  // CA-4 — the image passage is explicitly a model reading.
  await page.getByTestId('ingestion-source-image').click();
  await expect(page.getByTestId('ingestion-image-status')).toContainText('prêt');
  await expect(page.getByTestId('ingestion-image-origin')).toContainText('model');
  await expect(page.getByTestId('ingestion-image-origin')).toContainText('claude-haiku-5-5');
  await expect(page.locator('[data-testid^="ingestion-image-chunk-"]').first()).toContainText(
    'lecture-ia',
  );
  await page.getByTestId('ingestion-source-web').click();
  await captureEvidence('spec-510-trois-sources');

  // CA-3, CL-4 — safe refusals with their codes and no useless retry.
  await expect(page.getByTestId('ingestion-ssrf-status')).toContainText('URL_BLOCKED_HOST');
  await expect(page.getByTestId('ingestion-ssrf-reason')).toContainText('publique');
  await expect(page.getByTestId('ingestion-no-captions-status')).toContainText(
    'YOUTUBE_NO_CAPTIONS',
  );
  await expect(page.getByTestId('ingestion-no-captions-note')).toContainText(
    'Réessayer n’est proposé que si la source peut changer',
  );
  await expect(page.getByTestId('ingestion-no-captions-card').getByRole('button')).toHaveCount(0);
  await captureEvidence('spec-510-erreurs');

  await expect(page.getByTestId('ingestion-contract-card')).toContainText('"kind": "web"');
  await expect(page.getByTestId('ingestion-contract-card')).toContainText('"outcome": "ready"');

  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('Ingestion : pages web, YouTube et images @SPEC-510 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="ingestion-tabs-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="ingestion-web-status"]': {
      'background-color': '#E1F4EF',
      color: '#0B5C4D',
    },
    '[data-testid="ingestion-ssrf-status"]': {
      'background-color': '#FFEDE0',
      color: '#8F3305',
    },
    '[data-testid="ingestion-contract-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  const cards = await page
    .locator('main section[data-testid^="ingestion-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(cards).toEqual([
    'ingestion-tabs-card',
    'ingestion-ssrf-card',
    'ingestion-no-captions-card',
    'ingestion-contract-card',
  ]);

  await expect(page.getByTestId('ingestion-source-web')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('ingestion-source-youtube')).toBeVisible();
  await expect(page.getByTestId('ingestion-source-image')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-510-demo-visual');
  await expectScreenshotBaseline(page, 'spec-510-demo.png', { fullPage: true });
});
