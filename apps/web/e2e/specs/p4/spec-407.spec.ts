import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-407';
const REGIONS = ['planner-inputs', 'planner-calendar', 'planner-capacity', 'planner-options'];

test('Planificateur @SPEC-407', async ({ page, axeCheck, captureEvidence, consoleErrors }) => {
  await page.goto(PAGE);

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-407 · Planificateur');
  await expect(title).toHaveCSS('font-size', '30.6px');

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  // Entrées : deux formations, rythme et jour férié.
  await expect(page.locator('[data-testid^="planner-formation-"]')).toHaveCount(2);
  await expect(page.getByTestId('planner-formation-sap')).toContainText('2026-11-25');
  await expect(page.getByTestId('planner-rhythm')).toContainText('240 min/jour');
  await expect(page.getByTestId('planner-holidays')).toHaveText('2026-11-11');

  // Calendrier : créneaux ordonnés, quiz global, marges, aucun 11 novembre.
  const slots = page.locator('[data-testid^="planner-slot-"]');
  await expect(slots.first()).toBeVisible();
  expect(await slots.count()).toBeGreaterThan(20);
  await expect(page.getByTestId('planner-day-2026-11-11')).toHaveCount(0);
  await expect(page.getByTestId('planner-calendar')).toContainText('Quiz global');
  await expect(page.getByTestId('planner-calendar')).toContainText('Marge');
  await expect(page.getByTestId('planner-calendar')).toContainText('Examen blanc');

  // Capacité : le 12 novembre utilise exactement 4 h.
  await expect(page.getByTestId('planner-capacity-2026-11-12')).toContainText('4 h 00');
  await expect(page.getByTestId('planner-conflicts-empty')).toHaveText('Aucun conflit détecté.');

  // Aucune option tant que l'échéance tient.
  await expect(page.getByTestId('planner-options-empty')).toBeVisible();
  await expect(page.getByTestId('planner-options-list')).toHaveCount(0);

  // Séance manquée : l'historique reste, l'échéance devient intenable, trois options chiffrées.
  await page.getByTestId('planner-miss-session').click();
  await expect(page.getByTestId('planner-status')).toContainText('Séance manquée simulée');
  await expect(page.getByTestId('planner-missed-history')).toContainText('demo-missed-quiz');
  await expect(page.getByTestId('planner-options-list')).toBeVisible();
  const options = page.locator('[data-testid^="planner-option-"]');
  expect(await options.count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId('planner-option-sap-shift_end')).toContainText('Décaler la fin');
  await expect(page.getByTestId('planner-option-sap-increase_volume')).toContainText(
    'Augmenter le volume',
  );
  await expect(page.getByTestId('planner-option-sap-lighten')).toContainText('Alléger');

  await axeCheck();
  await captureEvidence('spec-407-demo');
  expect(consoleErrors).toEqual([]);
});

test('Planificateur @SPEC-407 @visual', async ({ page, axeCheck }) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1' },
    '[data-testid="planner-inputs"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="planner-options"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
  });
  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-407-demo.png', { fullPage: true });
});

test('Planificateur mobile @SPEC-407 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await axeCheck();
  await captureEvidence('spec-407-demo-mobile');
  await expectScreenshotBaseline(page, 'spec-407-demo-mobile.png', { fullPage: true });
});
