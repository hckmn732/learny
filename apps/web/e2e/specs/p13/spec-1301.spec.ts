import { expect, test } from '@learny/testing/playwright';

const DEMO = '/_dev/sdd/SPEC-1301';
const STEP_NAMES = [
  'Inscription',
  'Profil',
  'Accueil',
  'Création idempotente',
  'Rejeu idempotent',
  'Discussion en flux',
  'Rafraîchissement du jeton',
];

test('rejoue le client natif simulé @SPEC-1301', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Client natif simulé');
  await expect(page.getByTestId('spec-1301-step')).toHaveCount(7);
  await expect(page.getByTestId('spec-1301-step').locator('strong')).toHaveText(STEP_NAMES);
  await expect(page.getByTestId('spec-1301-result')).toHaveText('Toutes les étapes réussies');

  await page.getByRole('button', { name: 'Rejouer' }).click();
  await expect(page.getByTestId('spec-1301-result')).toHaveText('Toutes les étapes réussies');
});

test('démonstration du client natif @SPEC-1301 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByTestId('spec-1301-result')).toHaveText('Toutes les étapes réussies');
  await page.getByTestId('spec-1301-duration').evaluateAll((durations) => {
    for (const duration of durations) (duration as HTMLElement).style.visibility = 'hidden';
  });
  await axeCheck();
  await captureEvidence('spec-1301-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-1301-mobile');
});
