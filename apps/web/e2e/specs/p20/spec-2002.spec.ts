// [SPEC-2002] Demonstration of the contract pipeline and the generated SDK.
import { expect, test } from '@learny/testing/playwright';

const DEMO = '/_dev/sdd/SPEC-2002';

test('présente le contrat source unique et le SDK généré @SPEC-2002', async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contrat OpenAPI et SDK généré');
  await expect(page.getByTestId('spec-2002-counts')).toContainText('217');
  await expect(page.getByTestId('spec-2002-errors')).toHaveText('104');
  await expect(page.getByTestId('spec-2002-sdk')).toContainText('packages/api-sdk');
  await expect(page.getByTestId('spec-2002-compat')).toContainText('contract-exceptions.yaml');
});

test('conformité visuelle du contrat @SPEC-2002 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(DEMO);
  await expect(page.getByTestId('spec-2002-counts')).toBeVisible();
  await axeCheck();
  await captureEvidence('spec-2002-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await axeCheck();
  await captureEvidence('spec-2002-mobile');
});
