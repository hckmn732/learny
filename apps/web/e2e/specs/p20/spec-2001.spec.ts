// [SPEC-2001] Demonstration of the inventory, the parity matrix and the reference oracles.
import { expect, test } from '@learny/testing/playwright';

const DEMO = '/_dev/sdd/SPEC-2001';

test('présente l’inventaire du backend et la matrice de parité @SPEC-2001', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Inventaire et parité du backend',
  );
  await expect(page.getByTestId('spec-2001-counts')).toContainText('217');
  await expect(page.getByTestId('spec-2001-counts')).toContainText('50');
  await expect(page.getByTestId('spec-2001-gaps')).toHaveText('132');
  const rows = page.getByTestId('spec-2001-contexts').getByRole('row');
  await expect(rows).not.toHaveCount(1);
  await expect(page.getByTestId('spec-2001-parity')).toContainText('scénarios de lecture');
});

test('conformité visuelle de la démonstration @SPEC-2001 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByTestId('spec-2001-counts')).toBeVisible();
  await axeCheck();
  await captureEvidence('spec-2001-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-2001-mobile');
});
