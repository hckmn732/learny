import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-405';
const TITLE = 'SPEC-405 · Tirage des questions d’une tentative';
const REGIONS = ['draw-inputs', 'draw-plan', 'draw-result', 'draw-exhaustion', 'draw-determinism'];

test('Tirage des questions d’une tentative @SPEC-405', async ({
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

  // Region 1 — notions, gaps, size, seed and the real bank diagnostics (CA-1, CA-2).
  await expect(page.getByTestId('draw-notion-count')).toHaveText('8');
  await expect(page.getByTestId('draw-gap-count')).toHaveText('2');
  await expect(page.getByTestId('draw-target')).toHaveText('12');
  await expect(page.getByTestId('draw-seed')).toHaveText('attempt-1');
  await expect(page.getByTestId('draw-bank-size')).toHaveText('47');
  await expect(page.getByTestId('draw-bank-eligible')).toHaveText('41');
  await expect(page.getByTestId('draw-bank-unique')).toHaveText('38');
  await expect(page.getByTestId('draw-seen-excluded')).toHaveText('2');
  await expect(page.getByTestId('draw-duplicates')).toHaveText('1');
  await expect(page.getByTestId('draw-notion-n-cle')).toContainText('Lacune');
  await expect(page.getByTestId('draw-notion-n-piece')).toContainText('Stable');

  // Region 2 — base quota and gap overweight (CA-3).
  await expect(page.getByTestId('draw-quota-sum')).toContainText('12');
  await expect(page.getByTestId('draw-plan-n-cle')).toContainText('Lacune');
  await expect(page.getByTestId('draw-plan-n-cle')).toContainText('3');
  await expect(page.getByTestId('draw-plan-n-equilibre')).toContainText('Lacune');
  await expect(page.getByTestId('draw-plan-n-piece')).toContainText('Stable');
  await expect(page.getByTestId('draw-plan-n-piece')).toContainText('1');

  // Region 3 — coverage, 70/30 mix, points and fingerprints (CA-1, CA-2).
  await expect(page.getByTestId('draw-size-badge')).toHaveText('12 questions');
  await expect(page.getByTestId('draw-covered-badge')).toHaveText('8 notions couvertes');
  await expect(page.getByTestId('draw-open-badge')).toHaveText('4 ouvertes');
  await expect(page.getByTestId('draw-choice-badge')).toHaveText('8 choix');
  await expect(page.getByTestId('draw-minimum-badge')).toHaveText('Taille minimale atteinte');
  await expect(page.getByTestId('draw-points')).toContainText('8.33');
  await expect(page.getByTestId('draw-points')).toContainText('100.00');
  await expect(page.locator('[data-testid^="draw-question-"]')).toHaveCount(12);
  await expect(page.locator('[data-testid^="draw-question-"]:has-text("(Ouverte)")')).toHaveCount(
    4,
  );
  await expect(page.locator('[data-testid^="draw-question-"]:has-text("(Choix)")')).toHaveCount(8);
  await expect(page.getByTestId('draw-question-1')).toContainText('n-');

  // Region 4 — explicit exhaustion, never an invented question (CA-4, CL-1, CL-3, CL-4).
  await expect(page.getByTestId('draw-exhausted-small')).toContainText('Banque épuisée');
  await expect(page.getByTestId('draw-exhausted-small-uncovered')).toContainText('6');
  await expect(page.getByTestId('draw-exhausted-small-formats')).toContainText('Ouverte, Choix');
  await expect(page.getByTestId('draw-exhausted-small-minimum')).toContainText('non atteinte');
  await expect(page.getByTestId('draw-exhausted-many')).toContainText('Limite de couverture');
  await expect(page.getByTestId('draw-exhausted-many-uncovered')).toContainText('1');
  await expect(page.getByTestId('draw-exhausted-many-reasons')).toContainText('Capacité');

  // Region 5 — same seed and permuted input give the same references (CA-3, CL-5).
  await expect(page.getByTestId('draw-determinism-status')).toHaveText('Identique');
  await expect(page.getByTestId('draw-determinism-size')).toHaveText('12 / 12 questions');
  await expect(page.getByTestId('draw-determinism-refs')).not.toContainText('duplicate-brick');

  await axeCheck();
  await captureEvidence('spec-405-demo');
  expect(consoleErrors).toEqual([]);
});

test('Tirage des questions d’une tentative @SPEC-405 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="draw-inputs"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="draw-plan"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="draw-result"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="draw-exhaustion"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="draw-determinism"]': {
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

  await expect(page.getByTestId('draw-size-badge')).toHaveText('12 questions');
  await expect(page.getByTestId('draw-covered-badge')).toHaveText('8 notions couvertes');
  await expect(page.getByTestId('draw-determinism-status')).toHaveText('Identique');
  await expect(page.getByTestId('draw-exhausted-many-reasons')).toContainText('Capacité');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-405-demo-visual');
  await expectScreenshotBaseline(page, 'spec-405-demo.png', { fullPage: true });
});
