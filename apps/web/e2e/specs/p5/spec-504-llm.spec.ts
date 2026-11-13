import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-504';
const TITLE = 'SPEC-504 · Modèles et modèle simulé';
const REGIONS = ['llm-resolution', 'llm-call-form', 'llm-request-preview-card'];

async function chooseScenario(
  page: import('@playwright/test').Page,
  task: string,
  scenario: string,
  expected: string,
): Promise<void> {
  await page.getByTestId('llm-task').selectOption(task);
  await page.getByTestId('llm-scenario').selectOption(scenario);
  await page.getByTestId('llm-call').click();
  await expect(page.getByTestId('llm-result')).toContainText(expected, { timeout: 20_000 });
  await expect(page.getByTestId('llm-last-call')).not.toHaveText('—');
}

test('résolution et scénarios simulés @SPEC-504', async ({
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

  // CA-1 — subscriber, qualified BYOK on tutor, no entitlement.
  for (const task of ['programme', 'course', 'gaps']) {
    await expect(page.getByTestId(`llm-resolution-subscriber-${task}`)).toContainText(
      'claude-opus-5-5',
    );
  }
  await expect(page.getByTestId('llm-resolution-subscriber-tutor')).toContainText(
    'claude-sonnet-5-5',
  );
  await expect(page.getByTestId('llm-resolution-subscriber-light')).toContainText(
    'claude-haiku-5-5',
  );
  await expect(page.getByTestId('llm-resolution-byok-tutor')).toContainText('openai · gpt-demo');
  await expect(page.getByTestId('llm-resolution-byok-programme')).toContainText('Indisponible');
  for (const task of ['programme', 'course', 'gaps', 'tutor', 'light']) {
    await expect(page.getByTestId(`llm-resolution-none-${task}`)).toContainText('Indisponible');
  }

  // CA-7 — the six scenarios, with the journal line of each call.
  await chooseScenario(page, 'tutor', 'demo', 'Bonjour !');
  await expect(page.getByTestId('llm-last-call')).toContainText('claude-sonnet-5-5');
  await expect(page.getByTestId('llm-last-call')).toContainText('ok');
  await chooseScenario(page, 'tutor', 'demo-tool-call', 'read_resources');
  await chooseScenario(page, 'tutor', 'demo-refusal', 'AI_REFUSED');
  await expect(page.getByTestId('llm-last-call')).toContainText('refused');
  await chooseScenario(page, 'tutor', 'demo-timeout', 'AI_TIMEOUT');
  await chooseScenario(page, 'light', 'demo-object', 'Société et écritures');
  await chooseScenario(page, 'light', 'demo-invalid-object', 'INVALID_OUTPUT');

  // The preview follows the selected task and carries the Anthropic contract.
  await expect(page.getByTestId('llm-request-preview')).toContainText('"thinking"');
  await expect(page.getByTestId('llm-request-preview')).toContainText('"effort": "low"');
  await expect(page.getByTestId('llm-request-preview')).not.toContainText('budget_tokens');

  await axeCheck();
  await captureEvidence('spec-504-demo');
  expect(consoleErrors).toEqual([]);
});

test('démonstration llm, conformité visuelle @SPEC-504 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="llm-resolution"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="llm-call-form"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="llm-request-preview-card"]': {
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
  await expect(page.getByTestId('llm-resolution-row')).toHaveCount(3);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-504-demo-visual');
  await expectScreenshotBaseline(page, 'spec-504-demo.png', { fullPage: true });
});
