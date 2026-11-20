import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-1102';

test('rejoue les scénarios d authentification @SPEC-1102', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText('Authentification multi-clients');
  const rows = page.getByTestId('spec-1102-scenario');
  await expect(rows).toHaveCount(5);
  await expect(rows.getByTestId('spec-1102-observed-status')).toHaveText([
    '200',
    '200',
    '401',
    '200',
    '403',
  ]);
  await expect(rows.nth(2).getByTestId('spec-1102-code')).toHaveText('UNAUTHENTICATED');
  await expect(rows.nth(4).getByTestId('spec-1102-code')).toHaveText('ORIGIN_REJECTED');

  await captureEvidence('spec-1102-authentification-multi-clients');
  await axeCheck();
  await page.getByRole('button', { name: 'Rejouer' }).click();
  await expect(rows).toHaveCount(5);
});

test('démonstration de l authentification multi-clients @SPEC-1102 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-1102-scenarios"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await axeCheck();
  await captureEvidence('spec-1102-demo');
  await expectScreenshotBaseline(page, 'spec-1102-demo.png', { fullPage: true });
});
