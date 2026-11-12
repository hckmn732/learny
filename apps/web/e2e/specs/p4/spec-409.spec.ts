import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-409';
const REGIONS = ['streak-summary', 'streak-calendar', 'streak-steps', 'streak-milestones'];
const DATES = [
  '2026-10-29',
  '2026-10-30',
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
];

test('Série et jalons @SPEC-409', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-409 · Série et jalons');

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.getByTestId('streak-days')).toContainText('3');
  await expect(page.getByTestId('streak-last-qualifying')).toContainText('2026-11-10');
  await expect(page.getByTestId('streak-reference-day')).toContainText('2026-11-11');
  await expect(page.getByTestId('streak-calendar-size')).toContainText('14');

  const days = page.locator('[data-testid^="streak-day-"]');
  await expect(days).toHaveCount(DATES.length);
  expect(
    await days.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-date')),
    ),
  ).toEqual(DATES);
  await expect(page.getByTestId('streak-day-2026-11-06')).toHaveAttribute(
    'data-status',
    'studied',
  );
  await expect(page.getByTestId('streak-day-2026-11-08')).toHaveAttribute(
    'data-status',
    'neutral',
  );
  await expect(page.getByTestId('streak-day-2026-11-05')).toHaveAttribute(
    'data-status',
    'neutral',
  );
  await expect(page.getByTestId('streak-day-2026-11-04')).toHaveAttribute(
    'data-status',
    'missed',
  );
  await expect(page.getByTestId('streak-day-2026-11-11')).toHaveAttribute(
    'data-status',
    'neutral',
  );

  await expect(page.getByTestId('neutrality-result')).toContainText('0 jour');
  await page.getByTestId('toggle-unplanned-day').click();
  await expect(page.getByTestId('neutrality-result')).toContainText('2 jours');
  await expect(page.getByTestId('neutrality-explanation')).toContainText('série de deux jours');
  await expect(page.locator('[data-testid="streak-steps"] [data-testid="step-2026-11-10"]')).toContainText(
    'neutre',
  );

  await expect(page.locator('[data-testid^="milestone-award-"]')).toHaveCount(4);
  await expect(page.getByTestId('milestone-count')).toContainText('4 nouveaux jalons');
  await expect(page.getByTestId('milestone-recalc')).toContainText('0 nouveau jalon');
  await expect(page.getByTestId('streak-milestones')).toContainText('Module validé · sap-m1');
  await expect(page.getByTestId('streak-milestones')).toContainText('100 notions retenues');
  await expect(page.getByTestId('streak-milestones')).toContainText('30 jours de série');

  await axeCheck();
  await captureEvidence('spec-409-demo');
  expect(consoleErrors).toEqual([]);
});

test('Série et jalons, conformité visuelle @SPEC-409 @visual @mobile', async ({
  page,
  axeCheck,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1' },
    '[data-testid="streak-summary"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="streak-days"]': { 'background-color': '#111113' },
    '[data-testid="streak-days"] span:first-child': { color: '#C6F432' },
    '[data-testid="streak-calendar"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
  });

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.locator('[data-testid^="streak-day-"]')).toHaveCount(DATES.length);
  await expect(page.locator('[data-testid^="milestone-award-"]')).toHaveCount(4);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-409-demo.png', { fullPage: true });
});
