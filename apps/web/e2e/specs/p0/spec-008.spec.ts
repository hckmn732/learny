import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens, PROVISIONAL_TOKENS } from '@learny/testing/visual';

const SECTIONS = ['spec-008-services', 'spec-008-extensions', 'spec-008-commands'];

test('consulte la pile locale @SPEC-008', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-008');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Environnement local');

  await expect(page.getByTestId('spec-008-services').getByRole('row')).toHaveCount(6);
  await expect(page.getByTestId('spec-008-demo')).toHaveText(
    'Démonstration : état simulé, les preuves réelles viennent de pnpm dev:check.',
  );
  await expect(page.getByTestId('spec-008-extensions').getByRole('listitem')).toHaveCount(4);
  const commands = page.getByTestId('spec-008-commands').locator('code');
  await expect(commands).toContainText('pnpm dev:up');
  await expect(commands).toContainText('pnpm dev:check');
  await expect(commands).toContainText('pnpm dev:down');
  await expect(commands).toContainText('pnpm db:reset --yes');
  await expect(commands).toContainText('pnpm db:seed:demo');

  await axeCheck();
  await captureEvidence('spec-008-final');
  expect(consoleErrors).toEqual([]);
});

test('pile locale conforme @SPEC-008 @visual', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-008');

  const ids = await page
    .locator('section[data-testid^="spec-008-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Services locaux',
    'Extensions SQL',
    'Commandes',
  ]);

  await expectTokens(page, {
    '[data-testid="spec-008-services"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    body: { color: PROVISIONAL_TOKENS.color.text },
  });
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-008-demo.png', { fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  ]);
  for (const width of widths) expect(width).toBeLessThanOrEqual(390);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-008-demo-mobile.png', { fullPage: true });
});
