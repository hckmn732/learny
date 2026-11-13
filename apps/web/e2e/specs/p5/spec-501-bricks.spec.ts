import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-501';
const TITLE = 'SPEC-501 · Briques : schémas et validation';
const REGIONS = ['brick-validation', 'brick-lifecycle', 'brick-public'];

test('validation et cycle de vie d’une brique @SPEC-501', async ({
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

  // 1. Exemple valide du type choice_question : empreinte SHA-256 affichée.
  await page.getByTestId('brick-type-select').selectOption('choice_question');
  await page.getByTestId('brick-validate').click();
  await expect(page.getByTestId('brick-result')).toContainText('Valide');
  await expect(page.getByTestId('brick-fingerprint')).toHaveText(/^[0-9a-f]{64}$/);
  await axeCheck();
  await captureEvidence('spec-501-valid');

  // 2. Exemple invalide : l’erreur interne est lisible et porte son code.
  await page.getByTestId('brick-load-invalid').click();
  await page.getByTestId('brick-validate').click();
  await expect(page.getByTestId('brick-issue').first()).toContainText('CHOICE_SINGLE_NEEDS_ONE');
  await captureEvidence('spec-501-invalid');

  // 3. Cycle de vie réel : création, signalement, correction apprenant.
  await page.getByTestId('brick-create').click();
  await expect(page.getByTestId('brick-status')).toHaveText('active');
  await expect(page.getByTestId('brick-versions')).toContainText('tutor');

  await page.getByTestId('brick-report').click();
  await expect(page.getByTestId('brick-status')).toHaveText('reported');

  await page.getByTestId('brick-correct').click();
  await expect(page.getByTestId('brick-status')).toHaveText('active');
  await expect(page.getByTestId('brick-versions')).toContainText('learner');
  await expect(page.getByTestId('brick-versions')).toContainText('2');

  // 4. La charge publique ne contient aucune bonne réponse.
  await expect(page.getByTestId('brick-public')).toContainText('options');
  await expect(page.getByTestId('brick-public')).not.toContainText('"correct"');
  await captureEvidence('spec-501-corrected');

  expect(consoleErrors).toEqual([]);
});

test('conformité visuelle de la démonstration SPEC-501 @SPEC-501 @visual', async ({
  page,
  axeCheck,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="brick-validation"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="brick-lifecycle"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="brick-public"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="brick-validate"]': { 'background-color': '#C6F432', color: '#111113' },
  });

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  const regions = await page
    .locator('main section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.getByTestId('brick-type-select')).toBeVisible();
  await expect(page.getByTestId('brick-json')).toBeVisible();
  await expect(page.getByTestId('brick-create')).toBeVisible();
  await expect(page.getByTestId('brick-status')).toBeVisible();

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-501-demo.png', { fullPage: true });
});
