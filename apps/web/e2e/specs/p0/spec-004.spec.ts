import { expect, expectServerTimeMatchesPage, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens, PROVISIONAL_TOKENS } from '@learny/testing/visual';

const SECTIONS = [
  'spec-004-clock',
  'spec-004-projects',
  'spec-004-tokens',
  'spec-004-diff',
  'spec-004-artifacts',
];

test('inspecte le socle de tests @SPEC-004', async ({ page, axeCheck, captureEvidence, consoleErrors }) => {
  await page.goto('/_dev/sdd/SPEC-004');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Socle de tests et preuves');

  const serverNow = page.getByTestId('spec-004-server-now');
  await expect(serverNow).toHaveText('2026-11-11 13:20 Europe/Paris');
  const serverIso = await serverNow.getAttribute('datetime');
  expect(serverIso).toBe('2026-11-11T12:20:00.000Z');
  await expectServerTimeMatchesPage(page, serverIso ?? '');
  await expect(page.getByTestId('spec-004-clock')).toContainText(
    'Serveur (CLOCK_FIXED_AT) = 2026-11-11T12:20:00Z',
  );

  await expect(page.getByTestId('spec-004-projects').getByRole('row')).toHaveText([
    'ProjetFenêtreUsage',
    'desktop1440 × 900Tous les tests',
    'mobile390 × 844Tests @mobile',
    'cross-browser1440 × 900Checkpoints CP-6 à CP-9 (Firefox, WebKit)',
  ]);
  await expect(page.getByTestId('spec-004-diff')).toContainText('Exemple statique');
  await expect(page.getByTestId('spec-004-artifacts').getByRole('listitem')).toHaveCount(6);

  await axeCheck();
  await captureEvidence('spec-004-final');
  expect(consoleErrors).toEqual([]);
});

test('démonstration de tests conforme @SPEC-004 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-004');
  const ids = await page
    .locator('section[data-testid^="spec-004-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Horloge de test',
    'Navigateurs',
    'Contrôle des jetons',
    'Comparaison visuelle',
    'Artefacts',
  ]);

  await expectTokens(page, {
    '[data-testid="spec-004-token-sample"]': {
      color: PROVISIONAL_TOKENS.color.text,
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-004-tokens"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    body: { color: PROVISIONAL_TOKENS.color.text },
  });
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-004-demo.png', { fullPage: true });
});
