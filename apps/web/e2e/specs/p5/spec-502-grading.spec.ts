import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-502';
const TITLE = 'SPEC-502 · Correction par le code';

test('correction par le code des six types @SPEC-502', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  // 1. Question à choix : bonne option, correction immédiate.
  await page.getByTestId('grade-choice-option-a').check();
  await page.getByTestId('grade-check-choice_question').click();
  await expect(page.getByTestId('grade-result-choice_question')).toContainText('Exact.');
  await expect(page.getByTestId('grade-result-choice_question')).toContainText('100 %');

  // 2. Association : une erreur entre deux notions affiche la confusion.
  await page.getByTestId('grade-matching-pair-a').selectOption({ label: 'Cycle des salaires' });
  await page.getByTestId('grade-check-matching').click();
  await expect(page.getByTestId('grade-result-matching')).toContainText('Pas tout à fait.');
  await expect(page.getByTestId('grade-result-matching')).toContainText('Confusion');
  await captureEvidence('spec-502-matching-confusion');

  // 3. Texte à trous : « Universel » est accepté (casse et ponctuation ignorées).
  await page.getByTestId('grade-cloze-gap-1').fill('Universel');
  await page.getByTestId('grade-check-cloze').click();
  await expect(page.getByTestId('grade-result-cloze')).toContainText('Exact.');

  // 4. Remise en ordre : l’ordre attendu donne 100 %.
  await page.getByTestId('grade-ordering-position-0').selectOption({ label: 'Enregistrer les écritures de l’exercice' });
  await page.getByTestId('grade-ordering-position-1').selectOption({ label: 'Justifier les soldes des comptes' });
  await page.getByTestId('grade-ordering-position-2').selectOption({ label: 'Arrêter et présenter les états financiers' });
  await page.getByTestId('grade-check-ordering').click();
  await expect(page.getByTestId('grade-result-ordering')).toContainText('Exact.');

  // 5. Classement : l’exemple est prérempli juste.
  await page.getByTestId('grade-check-categorization').click();
  await expect(page.getByTestId('grade-result-categorization')).toContainText('Exact.');

  // 6. Carte de rappel : l’auto-évaluation « Bon » est une réussite.
  await page.getByTestId('grade-recall-good').click();
  await expect(page.getByTestId('grade-result-recall_card')).toContainText('Exact.');

  // 7. Tableau : 120 / 120 équilibré, puis 120 / 100 montre l’écart.
  await page.getByTestId('grade-table-row-0-sens').selectOption('Débit');
  await page.getByTestId('grade-table-row-0-montant').fill('120');
  await page.getByTestId('grade-table-row-1-sens').selectOption('Crédit');
  await page.getByTestId('grade-table-row-1-montant').fill('120');
  await expect(page.getByTestId('grade-table-totals')).toContainText('Débit 120 € · Crédit 120 €');
  await expect(page.getByTestId('grade-table-state')).toHaveText('✓ Pièce équilibrée');
  await captureEvidence('spec-502-table-balanced');

  await page.getByTestId('grade-table-row-1-montant').fill('100');
  await expect(page.getByTestId('grade-table-state')).toHaveText('Écart : 20 €');

  // 8. Minuteur : 20:00 restantes à l’horloge figée.
  await expect(page.getByTestId('grade-timer')).toHaveText('20:00');

  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('démonstration de correction @SPEC-502 @visual', async ({ page, axeCheck }) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="grade-card-choice_question"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="grade-token-success"]': {
      'background-color': '#E1F4EF',
      color: '#0B5C4D',
    },
    '[data-testid="grade-token-error"]': {
      'background-color': '#FFEDE0',
      color: '#8F3305',
    },
    '[data-testid="grade-check-choice_question"]': {
      'background-color': '#C6F432',
      color: '#111113',
    },
  });

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  const cards = await page
    .locator('main section[data-testid^="grade-card-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(cards).toEqual([
    'grade-card-choice_question',
    'grade-card-cloze',
    'grade-card-matching',
    'grade-card-ordering',
    'grade-card-categorization',
    'grade-card-recall_card',
    'grade-card-table',
    'grade-card-timer',
  ]);

  await expect(page.getByTestId('grade-table-state')).toBeVisible();
  await expect(page.getByTestId('grade-timer')).toHaveText('20:00');

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-502-demo.png', { fullPage: true });
});
