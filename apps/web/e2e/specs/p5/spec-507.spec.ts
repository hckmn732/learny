import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-507';
const TITLE = 'SPEC-507 · Garde-fou de coût et journal des appels';
const REGIONS = ['spec-507-budget', 'spec-507-calls', 'spec-507-contract'];

test('Garde-fou de coût et journal des appels @SPEC-507', async ({
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

  // CA-5 — the simulated spend changes the decision without any provider call.
  await expect(page.getByTestId('spec-507-decision')).toHaveText('Appel autorisé');
  await expect(page.getByTestId('spec-507-model')).toHaveText('claude-sonnet-5-5');
  await expect(page.getByTestId('spec-507-alert')).toContainText('Aucune alerte');

  await page.getByTestId('spec-507-spend').fill('1.2');
  await expect(page.getByTestId('spec-507-alert')).toContainText('Alerte à 80 %');
  await expect(page.getByTestId('spec-507-decision')).toHaveText('Appel autorisé');
  await expect(page.getByTestId('spec-507-spend-value')).toContainText('1.200000 USD');

  await page.getByTestId('spec-507-task').selectOption('programme');
  await page.getByTestId('spec-507-spend').fill('1.5');
  await expect(page.getByTestId('spec-507-decision')).toHaveText('Reporté');
  await expect(page.getByTestId('spec-507-model')).toHaveText('claude-opus-5-5');

  await page.getByTestId('spec-507-task').selectOption('tutor');
  await expect(page.getByTestId('spec-507-decision')).toHaveText('Bascule sur Haiku');
  await expect(page.getByTestId('spec-507-model')).toHaveText('claude-haiku-5-5');
  await expect(page.getByTestId('spec-507-resets')).toContainText('12 novembre 2026');

  // CA-4 — the journal and its aggregates are visible and complete.
  await expect(page.getByTestId('spec-507-call-row')).toHaveCount(4);
  await expect(page.getByTestId('spec-507-aggregates')).toContainText('SAP S/4HANA Finance');
  await expect(page.getByTestId('spec-507-aggregates')).toContainText('Hors formation');

  // ET-4 — the validated contract and a readable Zod failure, with no secret.
  await expect(page.getByTestId('spec-507-contract-input')).toContainText('"capUsd"');
  await expect(page.getByTestId('spec-507-contract-result')).toContainText('"decision"');
  await expect(page.getByTestId('spec-507-contract-error')).toContainText('VALIDATION_FAILED');
  await expect(page.locator('body')).not.toContainText('sk-ant');
  await expect(page.locator('body')).not.toContainText('apiKey');

  await axeCheck();
  await captureEvidence('spec-507-demo');
  expect(consoleErrors).toEqual([]);
});

test('démonstration du garde-fou, conformité visuelle @SPEC-507 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-507-budget"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-507-calls"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-507-contract"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);
  await expect(page.getByTestId('spec-507-call-row')).toHaveCount(4);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-507-demo-visual');
  await expectScreenshotBaseline(page, 'spec-507-demo.png', { fullPage: true });
});
