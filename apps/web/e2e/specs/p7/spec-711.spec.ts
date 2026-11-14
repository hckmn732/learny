import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-711';
const TITLE = 'SPEC-711 · Moteur d’automatismes';
const REGIONS = ['automation-registry', 'automation-state', 'automation-journal'];

const KEYS = [
  'reprise',
  'micro_seance',
  'echauffement',
  'remediation',
  'jeu_lacune',
  'questions_cartes',
  'plafond_quiz',
  'sprint',
  'bilan',
  'pause',
];

test('parcours SPEC-711 @SPEC-711', async ({
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

  // CA-1 — les dix clés autorisées, une seule définition livrée par cette spécification.
  await expect(page.getByTestId('automation-key')).toHaveCount(10);
  await expect(page.getByTestId('automation-key-name')).toHaveText(KEYS);
  await expect(page.getByTestId('automation-key-registered').first()).toHaveText('enregistrée');
  await expect(page.getByTestId('automation-key-registered').nth(1)).toContainText(
    'définition livrée par SPEC-712 à 721',
  );

  // CA-2 — proposition, rejeu ignoré, acceptation unique, consommation et annulation refusée.
  await expect(page.getByTestId('automation-step')).toHaveCount(7);
  await expect(page.getByTestId('automation-step-result')).toHaveText([
    '1 action créée',
    'aucune nouvelle action',
    'effet appliqué une seule fois',
    'aucun second effet (idempotence)',
    'plus d’annulation possible',
    'refusée (AUTOMATION_ACTION_CONSUMED)',
    'refusée (NOT_FOUND) : aucune existence révélée',
  ]);
  await expect(page.getByTestId('automation-effect-count')).toHaveText('1 effet appliqué');
  await expect(page.getByTestId('automation-refusal')).toContainText(
    'AUTOMATION_ACTION_CONSUMED',
  );

  // BR-AUT-12 — le journal de la semaine : appliquée et annulable, annulée, consommée.
  await expect(page.getByTestId('automation-week-count')).toHaveText('3 actions cette semaine');
  await expect(page.getByTestId('automation-journal-row')).toHaveCount(3);
  const rows = page.getByTestId('automation-journal-row');
  await expect(rows.nth(0)).toContainText('sprint avant un jalon');
  await expect(rows.nth(0)).toContainText('annulée');
  await expect(rows.nth(1)).toContainText('bilan de la semaine');
  await expect(rows.nth(1)).toContainText('appliquée');
  await expect(rows.nth(1).getByRole('button', { name: 'Annuler' })).toBeVisible();
  await expect(rows.nth(2)).toContainText('reprise après décrochage');
  await expect(rows.nth(2)).toContainText('consommée');
  await expect(rows.nth(2)).toContainText('Annulation indisponible');

  // Le rechargement rejoue le scénario sur un compte isolé : même état, aucune dérive.
  await page.reload();
  await expect(page.getByTestId('automation-step-result')).toHaveText([
    '1 action créée',
    'aucune nouvelle action',
    'effet appliqué une seule fois',
    'aucun second effet (idempotence)',
    'plus d’annulation possible',
    'refusée (AUTOMATION_ACTION_CONSUMED)',
    'refusée (NOT_FOUND) : aucune existence révélée',
  ]);
  await expect(page.getByTestId('automation-week-count')).toHaveText('3 actions cette semaine');

  await axeCheck();
  await captureEvidence('spec-711-demo');
  expect(consoleErrors).toEqual([]);
});

test('démonstration du moteur, conformité visuelle @SPEC-711 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="automation-registry"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="automation-state"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="automation-journal"]': {
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
  await expect(page.getByTestId('automation-key')).toHaveCount(10);
  await expect(page.getByTestId('automation-journal-row')).toHaveCount(3);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-711-demo-visual');
  await expectScreenshotBaseline(page, 'spec-711-demo.png', { fullPage: true });
});
