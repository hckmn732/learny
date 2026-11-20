import { expect, test } from '@learny/testing/playwright';

const DEMO = '/_dev/sdd/SPEC-1203';

test('montre un web sans dépendance serveur @SPEC-1203', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Web sans dépendance serveur',
  );
  await expect(page.getByTestId('spec-1203-coupling').locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('spec-1203-coupling').locator('td')).toHaveText([
    '0',
    '0',
    '0',
    '0',
    '0',
    '0',
  ]);
  await expect(page.getByTestId('spec-1203-bundle')).toContainText(
    'Modules serveur dans la construction : 0',
  );
  await expect(page.getByTestId('spec-1203-dependencies')).toContainText(
    '@learny/api-client',
  );
});

test('démonstration du web client pur @SPEC-1203 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByTestId('spec-1203-bundle')).toBeVisible();
  await axeCheck();
  await captureEvidence('spec-1203-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-1203-mobile');
});
