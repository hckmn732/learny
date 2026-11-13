import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-513';
const TITLE = 'SPEC-513 · Banques de questions';
const REGIONS = [
  'spec-513-notion-card',
  'spec-513-variants-card',
  'spec-513-exhaustion-card',
  'spec-513-contract-card',
  'spec-513-failure-card',
];

test('Banques de questions @SPEC-513', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.getByTestId('spec-513-notion-label')).toContainText('Écritures comptables');
  await expect(page.getByTestId('spec-513-course-version')).toContainText('version 2');
  await expect(page.getByTestId('spec-513-counter')).toHaveText(
    '0 vue(s) · 4 disponible(s) · 4 requise(s)',
  );

  // CA-1, CA-5 — four distinct masked fingerprints and annotated distractors.
  await expect(page.getByTestId('spec-513-variant-0')).toContainText('Question à choix');
  await expect(page.getByTestId('spec-513-variant-0')).toContainText('Distracteur 1');
  const fingerprints = await page.locator('[data-testid^="spec-513-fingerprint-"]').allTextContents();
  expect(fingerprints).toHaveLength(4);
  for (const fingerprint of fingerprints) {
    expect(fingerprint).toMatch(/^[0-9a-f]{6}…[0-9a-f]{6}$/u);
    expect(fingerprint).not.toMatch(/^[0-9a-f]{64}$/u);
  }
  expect(new Set(fingerprints).size).toBe(4);

  // CA-3, CA-5 — exhaustion then a new generation without reusing a seen fingerprint.
  await expect(page.getByTestId('spec-513-exhaustion-state')).toContainText('0 vue sur 4');
  await page.getByTestId('spec-513-mark-exhausted').click();
  await expect(page.getByTestId('spec-513-exhaustion-state')).toContainText('épuisée');
  await page.getByTestId('spec-513-regenerate').click();
  await expect(page.getByTestId('spec-513-regeneration')).toContainText(
    '0 empreinte déjà vue réutilisée',
  );
  const regenerated = await page
    .locator('[data-testid^="spec-513-fingerprint-"]')
    .allTextContents();
  expect(regenerated).toHaveLength(4);
  expect(regenerated).not.toEqual(fingerprints);
  await captureEvidence('spec-513-regeneration');

  // Contract and safe failure: no private passage, no key, a stable code.
  await expect(page.getByTestId('spec-513-contract-input')).toContainText('"notionId"');
  await expect(page.getByTestId('spec-513-contract-output')).toContainText('"complete": true');
  await expect(page.getByTestId('spec-513-failure-code')).toHaveText('COURSE_NOT_READY');
  await expect(page.getByTestId('spec-513-failure-message')).toContainText(
    'Aucune version de cours privée',
  );
  await expect(page.locator('body')).not.toContainText('sk-ant-');

  await axeCheck();
  await captureEvidence('spec-513-demo');
  expect(consoleErrors).toEqual([]);
});

test('Banques de questions, conformité visuelle @SPEC-513 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-513-notion-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-513-variants-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-513-exhaustion-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-513-contract-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.getByTestId('spec-513-variant-0')).toBeVisible();
  await expect(page.getByTestId('spec-513-counter')).toHaveText(
    '0 vue(s) · 4 disponible(s) · 4 requise(s)',
  );

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-513-demo-visual');
  await expectScreenshotBaseline(page, 'spec-513-demo.png', { fullPage: true });
});
