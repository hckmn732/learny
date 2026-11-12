import type { Locator } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-403';
const TITLE = 'SPEC-403 · Calcul de la maîtrise';
const REGIONS = ['mastery-inputs', 'mastery-result', 'mastery-edge'];

async function fillPercent(bar: Locator): Promise<number> {
  const style = await bar.locator('div').first().getAttribute('style');
  const match = /width:\s*([\d.]+)%/.exec(style ?? '');
  return Number.parseFloat(match?.[1] ?? 'NaN');
}

test('Calcul de la maîtrise @SPEC-403', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  // Region 1 — the two dated answers and their real weights (CA-1).
  await expect(page.locator('[data-testid^="mastery-answer-answer-"]')).toHaveCount(2);
  await expect(page.getByTestId('mastery-answer-answer-old')).toContainText('28/10/2026');
  await expect(page.getByTestId('mastery-answer-answer-old')).toContainText('1,00');
  await expect(page.getByTestId('mastery-weight-answer-old')).toHaveText('0,5000');
  await expect(page.getByTestId('mastery-weight-answer-recent')).toHaveText('1,0000');
  await expect(page.getByTestId('mastery-formula')).toContainText('Σ(poids × score)');

  // Region 2 — the weighted result, its bar and the 80 % threshold (CA-1, CA-2).
  const bar = page.getByTestId('mastery-bar');
  await expect(bar).toHaveAttribute('role', 'progressbar');
  await expect(bar).toHaveAttribute('aria-valuemax', '100');
  await expect(page.getByTestId('mastery-value')).toHaveText('33,33\u00a0%');
  await expect(page.getByTestId('mastery-status')).toHaveText('Non maîtrisée');
  await expect(page.getByTestId('mastery-threshold')).toHaveText('Seuil 80,00\u00a0%');
  await expect(page.getByTestId('mastery-answer-count')).toHaveText('2 réponses retenues');
  await expect(page.getByTestId('mastery-weight-sum')).toHaveText('1,5000');
  await expect(page.getByTestId('mastery-weighted-score')).toHaveText('0,5000');
  const initialFill = await fillPercent(bar);
  expect(initialFill).toBeCloseTo(100 / 3, 2);

  // Region 3 — real edge cases computed by the same pure function (CA-2, CA-4).
  await expect(page.getByTestId('mastery-edge-empty')).toContainText('0,000\u00a0%');
  await expect(page.getByTestId('mastery-edge-empty')).toContainText('Non maîtrisée');
  await expect(page.getByTestId('mastery-edge-below')).toContainText('79,999\u00a0%');
  await expect(page.getByTestId('mastery-edge-below')).toContainText('Non maîtrisée');
  await expect(page.getByTestId('mastery-edge-threshold')).toContainText('80,000\u00a0%');
  await expect(page.getByTestId('mastery-edge-threshold')).toContainText('Maîtrisée');
  await expect(page.getByTestId('mastery-edge-future')).toContainText('INVALID_INPUT');

  // Adding a local answer recomputes the bar and crosses the threshold (CA-1, CA-5).
  const expectedValues = ['60,00', '71,43', '77,78', '81,82'];
  for (const value of expectedValues) {
    await page.getByTestId('mastery-add-answer').click();
    await expect(page.getByTestId('mastery-value')).toHaveText(`${value}\u00a0%`);
  }
  await expect(page.locator('[data-testid^="mastery-answer-answer-added-"]')).toHaveCount(4);
  await expect(page.getByTestId('mastery-answer-count')).toHaveText('6 réponses retenues');
  await expect(page.getByTestId('mastery-weight-sum')).toHaveText('5,5000');
  await expect(page.getByTestId('mastery-weighted-score')).toHaveText('4,5000');
  await expect(page.getByTestId('mastery-status')).toHaveText('Maîtrisée');
  const finalFill = await fillPercent(bar);
  expect(finalFill).toBeCloseTo(81.818, 2);
  expect(finalFill).toBeGreaterThan(initialFill);

  await axeCheck();
  await captureEvidence('spec-403-demo');
  expect(consoleErrors).toEqual([]);
});

test('Calcul de la maîtrise @SPEC-403 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  // Base layout tokens of the SDD demonstrations (SPEC-201 §10, SPEC-301).
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="mastery-inputs"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="mastery-result"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="mastery-edge"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.getByTestId('mastery-weight-answer-old')).toHaveText('0,5000');
  await expect(page.getByTestId('mastery-weight-answer-recent')).toHaveText('1,0000');
  await expect(page.getByTestId('mastery-value')).toHaveText('33,33\u00a0%');
  await expect(page.getByTestId('mastery-edge-below')).toContainText('79,999\u00a0%');
  await expect(page.getByTestId('mastery-edge-threshold')).toContainText('Maîtrisée');

  await page.getByTestId('mastery-add-answer').click();
  await expect(page.getByTestId('mastery-value')).toHaveText('60,00\u00a0%');
  await expect(page.getByTestId('mastery-answer-answer-added-1')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-403-demo-visual');
  await expectScreenshotBaseline(page, 'spec-403-demo.png', { fullPage: true });
});
