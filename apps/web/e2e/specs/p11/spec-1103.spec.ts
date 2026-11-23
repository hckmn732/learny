import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-1103';

test("affiche la topologie de déploiement @SPEC-1103", async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText("Déploiement de l'API");
  await expect(page.getByTestId('spec-1103-compose')).toHaveCount(4);
  await expect(page.getByTestId('spec-1103-topology')).toContainText('web');
  await expect(page.getByTestId('spec-1103-topology')).toContainText('dépend de');
  await expect(page.getByTestId('spec-1103-role-value')).toHaveText('all');
  await expect(page.getByTestId('spec-1103-health')).toHaveText('ok');
  // SPEC-2207 retired Inngest: the API exposes no function registry any more.
  await expect(page.getByTestId('spec-1103-functions')).toHaveCount(0);
  await axeCheck();
  await captureEvidence('spec-1103-deploiement-api');
  expect(consoleErrors).toEqual([]);
});

test('démonstration du déploiement @SPEC-1103 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('spec-1103-role')).toContainText('all');
  await expectTokens(page, {
    body: { 'background-color': PROVISIONAL_TOKENS.color.background },
  });
  await axeCheck();
  await captureEvidence('spec-1103-demo');
  await expectScreenshotBaseline(page, 'spec-1103-demo.png', { fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
  await axeCheck();
  await captureEvidence('spec-1103-demo-mobile');
  await expectScreenshotBaseline(page, 'spec-1103-demo-mobile.png', { fullPage: true });
});
