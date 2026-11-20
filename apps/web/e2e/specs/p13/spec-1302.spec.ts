import { expect, test } from '@learny/testing/playwright';

const DEMO = '/_dev/sdd/SPEC-1302';

test('affiche la synthèse de la migration @SPEC-1302', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Migration terminée');
  await expect(page.getByTestId('spec-1302-apps').locator('tbody tr')).toHaveCount(2);
  await expect(page.getByTestId('spec-1302-apps')).toContainText('apps/api');
  await expect(page.getByTestId('spec-1302-apps')).toContainText('apps/web');
  await expect(page.getByTestId('spec-1302-packages').locator('tbody tr')).toHaveCount(5);
  await expect(page.getByTestId('spec-1302-routes')).toContainText('0 manquante');
  await expect(page.getByTestId('spec-1302-coupling')).toContainText('0');
  await expect(page.getByTestId('spec-1302-checkpoints').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('spec-1302-checkpoints').locator('li')).toContainText([
    'CP-10',
    'CP-11',
    'CP-12',
  ]);
});

test('démonstration de fin de migration @SPEC-1302 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByTestId('spec-1302-coupling')).toBeVisible();
  await axeCheck();
  await captureEvidence('spec-1302-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-1302-mobile');
});
