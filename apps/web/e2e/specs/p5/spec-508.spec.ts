import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-508';
const TITLE = 'SPEC-508 · Paquet tutor : actions, boucle et consignes';
const REGIONS = ['tutor-registry', 'tutor-prompts', 'tutor-run', 'tutor-injection'];

test('Paquet tutor : actions, boucle et consignes @SPEC-508', async ({
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

  // CA-1 — exactly ten declared actions, each guarded and transactional.
  await expect(page.getByTestId('tutor-action-row')).toHaveCount(10);

  // CA-4 — the tone/language of the mock output, while fixed labels stay French.
  await expect(page.getByTestId('tutor-tone-output')).toContainText('You are going to learn');
  await expect(page.getByTestId('tutor-prompts')).toContainText('Libellés fixes de l’interface');

  // CA-1/CA-5 — one validated tool path then a final answer.
  await page.getByTestId('tutor-run-success').click();
  await expect(page.getByTestId('tutor-run-status')).toContainText('terminé');
  await expect(page.getByTestId('tutor-tool-row')).toHaveCount(2);
  await expect(page.getByTestId('tutor-tool-status').first()).toContainText('exécutée');
  await captureEvidence('spec-508-success');

  // CL-1 — an unknown tool is refused before any write.
  await page.getByTestId('tutor-run-refusal').click();
  await expect(page.getByTestId('tutor-tool-status').first()).toContainText('outil inconnu');

  // CA-3 — two corrections then INVALID_OUTPUT and a human choice.
  await page.getByTestId('tutor-run-invalid').click();
  await expect(page.getByTestId('tutor-run-status')).toContainText('invalid_output');
  await expect(page.getByTestId('tutor-corrections')).toContainText('2/3');
  await expect(page.getByTestId('tutor-notification')).toContainText('ai_task_failed');

  // CA-2 — the poisoned apport stays escaped data and triggers no action.
  await expect(page.getByTestId('tutor-injection-block')).toContainText('&lt;/document&gt;');
  await expect(page.getByTestId('tutor-injection-count')).toContainText(
    'Actions exécutées : 0',
  );
  await expect(page.getByTestId('tutor-injection-block')).not.toContainText(
    '<document source="pirate">',
  );

  await axeCheck();
  await captureEvidence('spec-508-demo');
  expect(consoleErrors).toEqual([]);
});

test('démonstration tutor, conformité visuelle @SPEC-508 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="tutor-registry"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="tutor-prompts"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="tutor-run"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="tutor-run-success"]': { 'background-color': '#0F9F7F', color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  await expect(title).toHaveCSS('font-size', '30.6px');

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);
  await expect(page.getByTestId('tutor-action-row')).toHaveCount(10);
  await expect(page.getByTestId('tutor-tool-row').first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-508-demo-visual');
  await expectScreenshotBaseline(page, 'spec-508-demo.png', { fullPage: true });
});
