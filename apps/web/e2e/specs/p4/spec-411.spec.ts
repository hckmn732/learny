import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-411';
const TITLE = 'SPEC-411 · Services de persistance du moteur';
const REGIONS = ['learning-summary', 'learning-states', 'learning-events', 'learning-slots'];

test('applique un résultat @SPEC-411', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  // CA-1 — one graded attempt, two notions, two review rows, one daily activity.
  await expect(page.getByTestId('learning-attempt-status')).toContainText('graded');
  await expect(page.getByTestId('learning-attempt-status')).toContainText('2 réponses');
  await expect(page.getByTestId('learning-review-count')).toHaveText('2 révision(s), 0 en attente');
  await expect(page.getByTestId('learning-second-call')).toHaveText('already_applied · 0 révision(s)');
  await expect(page.getByTestId('learning-daily')).toContainText('2026-11-11');
  await expect(page.getByTestId('learning-daily')).toContainText('4 min');

  // CA-2 — the wrong notion is a gap and exactly one domain event is written after commit.
  await expect(page.getByTestId('learning-state-row')).toHaveCount(2);
  const before = await page.getByTestId('learning-before').allTextContents();
  const after = await page.getByTestId('learning-after').allTextContents();
  expect(before).toEqual(['0 %', '0 %']);
  expect(after[0]).not.toBe('0 %');
  await expect(page.getByTestId('learning-gap').nth(1)).toHaveText(
    'Lacune misunderstanding active',
  );
  await expect(page.getByTestId('learning-event')).toHaveCount(1);
  await expect(page.getByTestId('learning-event')).toContainText('gap/detected');
  await expect(page.getByTestId('learning-gap-events')).toHaveText('1 gap_event(s)');

  // EF-4 — the planner slots are persisted and visible.
  expect(await page.getByTestId('learning-slot').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('learning-plan-summary')).toContainText('créés');

  await axeCheck();
  await captureEvidence('spec-411-demo');
  expect(consoleErrors).toEqual([]);
});

test('résultat du moteur, conformité visuelle @SPEC-411 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="learning-summary"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="learning-states"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="learning-events"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="learning-slots"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);
  await expect(page.getByTestId('learning-state-row')).toHaveCount(2);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-411-demo-visual');
  await expectScreenshotBaseline(page, 'spec-411-demo.png', { fullPage: true });
});
