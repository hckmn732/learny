import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-404';
const TITLE = 'SPEC-404 · Détection, nature et levée des lacunes';
const REGIONS = ['gap-inputs', 'gap-detection', 'gap-clearance', 'gap-edge'];

test('Détection, nature et levée des lacunes @SPEC-404', async ({
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

  // Region 1 — the two dated attempts and the mastery computed at the detection instant (CA-1).
  await expect(page.locator('[data-testid^="gap-answer-"]')).toHaveCount(3);
  await expect(page.getByTestId('gap-answer-a-1-bad')).toContainText('Distracteur « n-type »');
  await expect(page.getByTestId('gap-answer-a-2-bad')).toContainText('31/10/2026');
  await expect(page.getByTestId('gap-notion')).toContainText('SAP S/4HANA');
  await expect(page.getByTestId('gap-mastery')).toHaveText('32,22\u00a0%');

  // Region 2 — the real detection: confusion, side-by-side remediation and both triggers (CA-1, CA-3).
  await expect(page.getByTestId('gap-detection-status')).toHaveText('Lacune active');
  await expect(page.getByTestId('gap-detection-nature')).toHaveText('Confusion');
  await expect(page.getByTestId('gap-detection-event')).toHaveText('Détection');
  await expect(page.getByTestId('gap-confused-with')).toHaveText('n-type');
  await expect(page.getByTestId('gap-action')).toHaveText(
    'Question d’opposition et comparaison côte à côte',
  );
  await expect(page.getByTestId('gap-triggers')).toHaveText(
    'Tentative qualifiante · Erreur répétée',
  );
  await expect(page.getByTestId('gap-evidence')).toContainText('distracteur « n-type »');
  await expect(page.getByTestId('gap-evidence')).toContainText('répétée sur 2 tentatives');

  // Region 3 — 23 h 59 keeps the gap, 24 h clears it (CA-4).
  await expect(page.getByTestId('clearance-success-success-warmup')).toContainText('Échauffement');
  await expect(page.getByTestId('clearance-success-success-quiz')).toContainText('Quiz global');
  await expect(page.getByTestId('gap-clearance-status')).toHaveText('Lacune maintenue');
  await expect(page.getByTestId('gap-clearance-event')).toHaveText('Aucun');
  await expect(page.getByTestId('gap-clearance-interval')).toHaveText('23,98\u00a0h');
  await expect(page.getByTestId('gap-check-enough')).toHaveText('oui');
  await expect(page.getByTestId('gap-check-spaced')).toHaveText('non');
  await expect(page.getByTestId('gap-check-threshold')).toHaveText('oui');
  await expect(page.getByTestId('gap-clearance-mastery')).toHaveText('100,00\u00a0%');
  await expect(page.getByTestId('gap-clearance-evidence')).toContainText('minimum 24 h');
  await expect(page.getByTestId('gap-cleared-at')).toContainText('—');

  await page.getByTestId('gap-toggle-spacing').click();
  await expect(page.getByTestId('gap-clearance-status')).toHaveText('Lacune levée');
  await expect(page.getByTestId('gap-clearance-event')).toHaveText('Levée');
  await expect(page.getByTestId('gap-clearance-interval')).toHaveText('24,00\u00a0h');
  await expect(page.getByTestId('gap-check-spaced')).toHaveText('oui');
  await expect(page.getByTestId('gap-clearance-evidence')).toContainText('Lacune levée');
  await expect(page.getByTestId('gap-cleared-at')).toContainText('11/11/2026');

  // Region 4 — real edge cases computed by the same pure functions (CL-1, CL-2, CL-3, CL-5).
  await expect(page.getByTestId('gap-edge-low-mastery')).toContainText('Aucune lacune');
  await expect(page.getByTestId('gap-edge-confusion-forgetting')).toContainText('Confusion');
  await expect(page.getByTestId('gap-edge-one-attempt')).toContainText('Aucune lacune');
  await expect(page.getByTestId('gap-edge-nature-changed')).toContainText('Changement de nature');
  await expect(page.getByTestId('gap-edge-nature-changed')).toContainText('Confusion');

  await axeCheck();
  await captureEvidence('spec-404-demo');
  expect(consoleErrors).toEqual([]);
});

test('Détection, nature et levée des lacunes @SPEC-404 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  // Base layout tokens of the SDD demonstrations (SPEC-201 §10, SPEC-301).
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="gap-inputs"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="gap-detection"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="gap-clearance"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="gap-edge"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.getByTestId('gap-mastery')).toHaveText('32,22\u00a0%');
  await expect(page.getByTestId('gap-detection-nature')).toHaveText('Confusion');
  await expect(page.getByTestId('gap-clearance-interval')).toHaveText('23,98\u00a0h');

  await page.getByTestId('gap-toggle-spacing').click();
  await expect(page.getByTestId('gap-clearance-status')).toHaveText('Lacune levée');
  await expect(page.getByTestId('gap-clearance-interval')).toHaveText('24,00\u00a0h');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-404-demo-visual');
  await expectScreenshotBaseline(page, 'spec-404-demo.png', { fullPage: true });
});
