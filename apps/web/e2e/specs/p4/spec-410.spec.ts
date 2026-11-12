import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-410';
const TITLE = 'SPEC-410 · Sélection de l’échauffement';
const REGIONS = ['warmup-inputs', 'warmup-selection', 'warmup-exclusions', 'warmup-dst'];

test('Sélection de l’échauffement @SPEC-410', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  // Region 1 — the local day, the upcoming chapter and the catalogue bounds.
  await expect(page.getByTestId('warmup-local-date')).toContainText('2026-11-11');
  await expect(page.getByTestId('warmup-requested-count')).toContainText('3');
  await expect(page.getByTestId('warmup-selected-count')).toContainText('3');
  await expect(page.getByTestId('warmup-chapter')).toContainText('sap-m3-c2');

  // Region 2 — the two priority picks and the deterministic completion (CA-1, CA-3).
  const choices = page.locator('[data-testid^="warmup-choice-"]');
  await expect(choices).toHaveCount(3);
  await expect(page.getByTestId('warmup-choice-n-variante')).toHaveAttribute(
    'data-reason',
    'prerequisite',
  );
  await expect(page.getByTestId('warmup-choice-n-variante')).toContainText('Prérequis');
  await expect(page.getByTestId('warmup-choice-n-societe')).toHaveAttribute(
    'data-reason',
    'yesterday',
  );
  await expect(page.getByTestId('warmup-choice-n-societe')).toContainText('Vue hier');
  await expect(page.getByTestId('warmup-choice-n-ledger')).toContainText('Vue hier');

  await page.getByTestId('warmup-scope-yesterday').click();
  await expect(page.getByTestId('warmup-selected-count')).toContainText('2');
  await expect(choices).toHaveCount(2);
  await expect(page.getByTestId('warmup-choice-n-variante')).toHaveCount(0);

  await page.getByTestId('warmup-count-5').click();
  await expect(page.getByTestId('warmup-selected-count')).toContainText('2');

  await page.getByTestId('warmup-scope-combined').click();
  await expect(page.getByTestId('warmup-selected-count')).toContainText('4');
  await expect(page.getByTestId('warmup-choice-n-compte')).toContainText('Prérequis');

  await page.getByTestId('warmup-toggle-empty').click();
  await expect(page.getByTestId('warmup-empty')).toContainText('Aucune notion éligible');
  await expect(choices).toHaveCount(0);

  // Region 3 — exclusions of EF-3, even for a linked prerequisite (CA-2).
  await expect(page.locator('[data-testid^="warmup-exclusion-"]')).toHaveCount(5);
  await expect(page.getByTestId('warmup-exclusion-n-type')).toContainText('Suspendue');
  await expect(page.getByTestId('warmup-exclusion-n-partie')).toContainText('Jamais vue');
  await expect(page.getByTestId('warmup-exclusion-n-factf')).toContainText(
    'Chapitre inaccessible',
  );
  await expect(page.getByTestId('warmup-exclusion-n-autre')).toContainText('Hors formation');
  await expect(page.getByTestId('warmup-exclusion-n-poste')).toContainText('Chapitre à venir');

  // Region 4 — the DST edge case computed from the learner's zone (CA-4).
  await expect(page.getByTestId('warmup-dst')).toContainText('2026-10-26');
  await expect(page.getByTestId('warmup-dst')).toContainText('2026-10-25');
  await expect(page.getByTestId('warmup-dst-selection')).toContainText('n-veille');

  await axeCheck();
  await captureEvidence('spec-410-demo');
  expect(consoleErrors).toEqual([]);
});

test('Sélection de l’échauffement, conformité visuelle @SPEC-410 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="warmup-inputs"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="warmup-selection"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="warmup-exclusions"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="warmup-dst"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.locator('[data-testid^="warmup-choice-"]')).toHaveCount(3);
  await expect(page.getByTestId('warmup-local-date')).toContainText('2026-11-11');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-410-demo-visual');
  await expectScreenshotBaseline(page, 'spec-410-demo.png', { fullPage: true });
});
