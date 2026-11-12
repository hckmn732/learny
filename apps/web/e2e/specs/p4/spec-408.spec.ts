import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-408';
const REGIONS = [
  'retention-summary',
  'retention-horizons',
  'retention-inputs',
  'progress-summary',
  'progress-slots',
  'progress-notions',
];

test('Rétention et indicateurs de progression @SPEC-408', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-408 · Rétention et indicateurs de progression');

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  // Two retention indicators with their numerator and denominator (CA-1, CA-2).
  await expect(page.getByTestId('retention-30')).toContainText('75\u00a0%');
  await expect(page.getByTestId('retention-30')).toContainText('6 / 8 notions');
  await expect(page.getByTestId('retention-60')).toContainText('80\u00a0%');
  await expect(page.getByTestId('retention-60')).toContainText('4 / 5 notions');
  await expect(page.getByTestId('retention-unmeasurable')).toContainText('Pas encore mesurable');
  await expect(page.getByTestId('retention-unmeasurable')).not.toContainText('0\u00a0%');

  await expect(page.getByTestId('retention-horizon-30')).toContainText('J+27..J+33');
  await expect(page.getByTestId('retention-horizon-30')).toContainText('75\u00a0%');
  await expect(page.getByTestId('retention-horizon-60')).toContainText('J+57..J+63');
  await expect(page.getByTestId('retention-horizon-60')).toContainText('80\u00a0%');
  await expect(page.getByTestId('retention-horizon-edge')).toContainText('Pas encore mesurable');
  await expect(page.getByTestId('retention-denominator')).toContainText('6 / 8 notions');

  // The reviewer sees the real inputs, including an out-of-window review (CA-1, CL-2).
  await expect(page.locator('[data-testid^="review-"]')).toHaveCount(15);
  await expect(page.getByTestId('review-r-n14-out')).toContainText('J+26');
  await expect(page.getByTestId('review-r-n1')).toContainText('J+60');
  await expect(page.getByTestId('review-r-n10-late')).toContainText('J+30');

  // Progress bar, planned/done hours and mastered notions (CA-3, CA-4).
  await expect(page.getByTestId('progress-percent')).toHaveText('42,86\u00a0%');
  await expect(page.getByTestId('progress-modules')).toContainText('3 / 7');
  const bar = page.getByTestId('progress-bar');
  await expect(bar).toHaveAttribute('role', 'progressbar');
  await expect(bar).toHaveAttribute('aria-valuemax', '100');
  expect(Number.parseFloat((await bar.getAttribute('aria-valuenow')) ?? 'NaN')).toBeCloseTo(
    42.857142857,
    6,
  );
  await expect(page.getByTestId('progress-planned')).toContainText('4 h 55');
  await expect(page.getByTestId('progress-completed')).toContainText('1 h 30');
  await expect(page.getByTestId('progress-mastered')).toContainText('12');

  // Moved, cancelled and missed slots never count twice or as accomplished (CA-4, CL-5).
  await expect(page.getByTestId('slot-s4')).toContainText('exclu');
  await expect(page.getByTestId('slot-s5')).toContainText('prévu');
  await expect(page.getByTestId('slot-s6')).toContainText('exclu');
  await expect(page.getByTestId('slot-s8')).toContainText('exclu');
  await expect(page.getByTestId('slot-s7')).toContainText('prévu');
  await expect(page.getByTestId('slot-s2')).toContainText('prévu et fait');
  await expect(page.getByTestId('slots-totals')).toContainText('4 h 55');
  await expect(page.getByTestId('slots-totals')).toContainText('1 h 30');

  // Threshold 80 included, 79.99 excluded, and the no-module status (CA-3, CL-4).
  await expect(page.getByTestId('progress-edge-threshold')).toContainText('12 notions retenues');
  await expect(page.getByTestId('progress-edge-below')).toContainText('0 notion retenue');
  await expect(page.getByTestId('progress-edge-empty')).toContainText('0\u00a0%');
  await expect(page.getByTestId('progress-edge-empty')).toContainText('aucun module');

  await axeCheck();
  await captureEvidence('spec-408-demo');
  expect(consoleErrors).toEqual([]);
});

test('Rétention et indicateurs de progression, conformité visuelle @SPEC-408 @visual @mobile', async ({
  page,
  axeCheck,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1' },
    '[data-testid="retention-summary"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="retention-30"]': { 'background-color': '#111113' },
    '[data-testid="retention-30"] span:first-child': { color: '#C6F432' },
    '[data-testid="progress-summary"]': {
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

  await expect(page.locator('[data-testid^="retention-horizon-"]')).toHaveCount(3);
  await expect(page.locator('[data-testid^="review-"]')).toHaveCount(15);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-408-demo.png', { fullPage: true });
});
