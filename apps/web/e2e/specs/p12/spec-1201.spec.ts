import { expect, test } from '@learny/testing/playwright';
import { expectTokens, PROVISIONAL_TOKENS } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-1201';

test('sert l’API par le relai @SPEC-1201', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText("Bascule de l'API");
  await expect(page.getByTestId('spec-1201-served-by')).toContainText('learny-api');
  await expect(page.getByTestId('spec-1201-latency')).toContainText(/\d+\.\d ms/);
  await expect(page.getByTestId('spec-1201-sse')).toContainText(
    /Fragments reçus avant la fin : [2-9]/,
  );
  await axeCheck();
  await captureEvidence('spec-1201-relais-api');
  expect(consoleErrors).toEqual([]);
});

test('démonstration de la bascule @SPEC-1201 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('spec-1201-sse')).toContainText(
    /Fragments reçus avant la fin : [2-9]/,
  );
  await expectTokens(page, {
    body: { 'background-color': PROVISIONAL_TOKENS.color.background },
  });
  await axeCheck();
  await captureEvidence('spec-1201-demo');

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await axeCheck();
  await captureEvidence('spec-1201-demo-mobile');
});
