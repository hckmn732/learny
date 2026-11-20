import { expect, test } from '@learny/testing/playwright';
import { expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-1202';

test('affiche l inventaire et le budget @SPEC-1202', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Écrans alimentés par l’API');
  await expect(page.getByTestId('spec-1202-loaders').locator('tbody tr')).toHaveCount(15);
  await expect(page.getByTestId('spec-1202-budget')).toContainText('Budget ≤ 25 ms');
  await expect(page.getByTestId('spec-1202-loaders')).toContainText('Non mesuré');
  await axeCheck();
  await captureEvidence('spec-1202-loaders');
});

test('démonstration des écrans alimentés par l API @SPEC-1202 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="sdd-title"]': { color: '#111113' },
    '[data-testid="spec-1202-loaders"]': { color: '#111113' },
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await axeCheck();
  await captureEvidence('spec-1202-demo');
});
