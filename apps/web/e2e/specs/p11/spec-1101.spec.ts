import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-1101';

test('montre la santé et la parité de l API @SPEC-1101', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText('API autonome');
  await expect(page.getByTestId('spec-1101-status')).toHaveText('ok');
  await expect(page.getByTestId('spec-1101-parity-value')).toHaveText('Oui');
  const values = await page.getByTestId('spec-1101-coverage-value').allTextContents();
  expect(values).toHaveLength(3);
  expect(values.every((value) => /^\d+$/.test(value))).toBe(true);
  expect(Number(values[1])).toBe(Number(values[0]));

  await captureEvidence('spec-1101-api-autonome');
  await axeCheck();
});

test('démonstration de l API autonome @SPEC-1101 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('spec-1101-parity-value')).toHaveText('Oui');
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-1101-health"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-1101-demo');
  await expectScreenshotBaseline(page, 'spec-1101-demo.png', {
    fullPage: true,
    mask: [page.getByTestId('spec-1101-version'), page.getByTestId('spec-1101-commit')],
  });
});
