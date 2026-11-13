import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-505';
const TITLE = 'SPEC-505 · Clés personnelles';
const REGIONS = ['cred-form-card', 'cred-list', 'cred-storage', 'cred-raw-card'];
const SECRET = 'sk-test-0000000000a91F'; // learny-test-only

async function addOpenAiKey(page: import('@playwright/test').Page, secret: string): Promise<void> {
  await page.getByTestId('cred-provider').selectOption('openai');
  await page.getByTestId('cred-model').fill('gpt-5-mini');
  await page.getByTestId('cred-key').fill(secret);
  await page.getByTestId('cred-submit').click();
  await expect(page.getByTestId('cred-item')).toHaveCount(1, { timeout: 20_000 });
}

test('ajouter et supprimer une clé personnelle @SPEC-505', async ({
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

  // CA-5 — the note follows the provider; OpenAI is outside the EU.
  await page.getByTestId('cred-provider').selectOption('openai');
  await expect(page.getByTestId('cred-data-note')).toHaveCSS('background-color', 'rgb(255, 237, 224)');
  await expect(page.getByTestId('cred-data-note')).toHaveCSS('color', 'rgb(143, 51, 5)');
  await page.getByTestId('cred-provider').selectOption('mistral');
  await expect(page.getByTestId('cred-data-note')).toHaveCSS('background-color', 'rgb(236, 236, 252)');
  await expect(page.getByTestId('cred-data-note')).toHaveCSS('color', 'rgb(46, 46, 143)');

  // CA-8 — add a key: masked card, « Hors UE » badge and storage panel.
  await addOpenAiKey(page, SECRET);
  await expect(page.getByTestId('cred-title')).toHaveText('OpenAI');
  await expect(page.getByTestId('cred-status')).toHaveText('Non testé');
  await expect(page.getByTestId('cred-masked')).toHaveText('sk-••••••••a91F');
  await expect(page.getByTestId('cred-outside-eu')).toHaveText('Hors UE');
  await expect(page.getByTestId('cred-storage-bytes')).toHaveText(/\d+ octets/);
  await expect(page.getByTestId('cred-storage-iv')).toHaveText(/^[0-9a-f]{16}$/);

  // CA-3 — the key is absent from the raw API answer and from the page HTML.
  await expect(page.getByTestId('cred-raw-json')).toContainText('sk-••••••••a91F');
  await expect(page.getByTestId('cred-raw-json')).not.toContainText('0000000000');
  expect(await page.content()).not.toContain('0000000000');
  expect(await page.content()).not.toContain(SECRET);
  await captureEvidence('spec-505-credential');

  await axeCheck();

  // CA-8 — delete with the confirmation dialog.
  await page.getByTestId('cred-delete').click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByTestId('ui-alert-dialog-confirm').click();
  await expect(page.getByTestId('cred-empty')).toBeVisible();
  await expect(page.getByTestId('cred-item')).toHaveCount(0);
  await expect(page.getByTestId('cred-raw-json')).toHaveText('{}');

  expect(consoleErrors).toEqual([]);
});

test('démonstration des clés, conformité visuelle @SPEC-505 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await addOpenAiKey(page, 'sk-test-1111111111b72C'); // learny-test-only

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="cred-form-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="cred-list"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="cred-data-note"]': {
      'background-color': '#FFEDE0',
      color: '#8F3305',
    },
    '[data-testid="cred-submit"]': { 'background-color': '#C6F432', color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  const regions = await page
    .locator('main section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);
  await expect(page.getByTestId('cred-masked')).toHaveText('sk-••••••••b72C');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-505-demo');
  await expectScreenshotBaseline(page, 'spec-505-demo.png', { fullPage: true });
});
