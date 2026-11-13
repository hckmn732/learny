import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-506';
const TITLE = 'SPEC-506 · Qualification des modèles personnels';
const REGIONS = ['spec-506-demo', 'spec-506-steps', 'spec-506-bricks', 'spec-506-contract'];

test('Qualification des modèles personnels @SPEC-506', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  const regions = await page
    .locator('main section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);
  await expect(page.getByTestId('spec-506-steps-empty')).toBeVisible();
  await expect(page.getByTestId('spec-506-bricks-empty')).toBeVisible();

  // CA-1 — the complete mock battery qualifies and details the four stages and thirteen bricks.
  await page.getByTestId('spec-506-run-success').click();
  await expect(page.getByTestId('spec-506-status')).toHaveText('Qualifié', { timeout: 30_000 });
  await expect(page.getByTestId('spec-506-step-row')).toHaveCount(4);
  await expect(page.getByTestId('spec-506-brick-row')).toHaveCount(13);
  await expect(page.getByTestId('spec-506-step-row').getByText('Réussi')).toHaveCount(4);
  await expect(page.getByTestId('spec-506-brick-row').getByText('Réussi')).toHaveCount(13);
  await expect(page.getByTestId('spec-506-contract-result')).toContainText('"status": "qualified"');
  await expect(page.getByTestId('spec-506-contract-result')).toContainText('"bricks"');
  expect(await page.content()).not.toContain('0000000000');
  await captureEvidence('spec-506-success');

  // CA-2, CA-5 — one invalid brick fails the model while the other twelve stay green.
  await page.getByTestId('spec-506-run-invalid').click();
  await expect(page.getByTestId('spec-506-status')).toHaveText('Échec de qualification', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('spec-506-brick-row')).toHaveCount(13);
  await expect(page.getByTestId('spec-506-brick-row').getByText('Réussi')).toHaveCount(12);
  await expect(page.getByTestId('spec-506-brick-row').getByText('Échec')).toHaveCount(1);
  await expect(page.getByTestId('spec-506-contract-result')).toContainText(
    'CRITERIA_POINTS_MISMATCH',
  );
  await expect(page.getByTestId('spec-506-contract-result')).toContainText('"status": "failed"');
  expect(await page.content()).not.toContain('0000000000');
  await captureEvidence('spec-506-invalid');

  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('démonstration de qualification, conformité visuelle @SPEC-506 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-506-demo"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-506-steps"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
    '[data-testid="spec-506-bricks"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
    '[data-testid="spec-506-contract"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
    '[data-testid="spec-506-run-success"]': { 'background-color': '#C6F432', color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  const regions = await page
    .locator('main section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-506-demo-visual');
  await expectScreenshotBaseline(page, 'spec-506-demo.png', { fullPage: true });
});
