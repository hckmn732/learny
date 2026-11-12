import { ENGINE } from '@learny/config/product';
import {
  FSRS_RATINGS,
  addDays,
  createNotionCard,
  gradeReview,
  instantAt,
  previewGrades,
} from '@learny/learning-engine';
import type { BrickFormat, FsrsRating, TimedResponse } from '@learny/learning-engine';
import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-402';
const REGIONS = ['fsrs-inputs', 'fsrs-grades', 'fsrs-recall', 'fsrs-retentions'];
const NOW = '2026-11-11T12:20:00.000Z';
const TZ = 'Europe/Paris';
const LABELS: Readonly<Record<FsrsRating, string>> = {
  again: 'Raté',
  hard: 'Difficile',
  good: 'Bon',
  easy: 'Facile',
};
const FORMAT = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TZ,
  dateStyle: 'medium',
  timeStyle: 'short',
});

function history(): TimedResponse[] {
  return Array.from({ length: 60 }, (_value, index) => {
    const format: BrickFormat = index < 3 ? 'cloze' : 'choice_question';
    const timeMs =
      index < 3 ? 90_000 : index === 3 ? 0 : index === 4 ? -1_000 : 12_000 + (index % 9) * 1_000;
    return {
      answerId: `hist-${String(index).padStart(2, '0')}`,
      answeredAt: instantAt(addDays('2026-09-01', index), '09:00', TZ),
      format,
      timeMs,
    };
  });
}

const CARD = createNotionCard(NOW, ENGINE.fsrs.requestRetention);
const PREVIEW = previewGrades(CARD, NOW, ENGINE.fsrs.requestRetention);
const CURRENT = gradeReview({
  correct: true,
  timeMs: 9_000,
  format: 'choice_question',
  history: history(),
  settings: ENGINE.fsrs,
});

test('Répétition espacée FSRS par notion @SPEC-402', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(
    'SPEC-402 · Répétition espacée FSRS par notion',
  );

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.getByTestId('fsrs-retention')).toContainText('90 %');
  await expect(page.getByTestId('fsrs-history')).toContainText('50 temps retenus');
  await expect(page.getByTestId('fsrs-current-rating')).toHaveText(
    CURRENT.rating === null ? 'incomplète' : LABELS[CURRENT.rating],
  );

  const expected: Readonly<Record<string, FsrsRating>> = {
    false: 'again',
    easy: 'easy',
    half: 'good',
    good: 'good',
    double: 'good',
    hard: 'hard',
  };
  for (const [key, rating] of Object.entries(expected)) {
    await expect(page.getByTestId(`grade-actual-${key}`)).toHaveText(LABELS[rating]);
  }
  const checks = page.locator('[data-testid^="grade-case-"] span[aria-label="Conforme"]');
  await expect(checks).toHaveCount(6);

  for (const rating of FSRS_RATINGS) {
    const due = page.getByTestId(`recall-due-${rating}`);
    await expect(due).toHaveAttribute('datetime', PREVIEW[rating]);
  }
  await page.getByTestId('recall-good').click();
  await expect(page.getByTestId('recall-good')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('recall-result')).toContainText('Note Bon appliquée');
  await expect(page.getByTestId('recall-result')).toContainText(
    FORMAT.format(new Date(PREVIEW.good)),
  );

  for (const percent of [85, 90, 95]) {
    const row = page.getByTestId(`retention-${String(percent)}`);
    const retention = percent / 100;
    const preview = previewGrades(CARD, NOW, retention);
    for (const rating of FSRS_RATINGS) {
      await expect(row.locator(`time[datetime="${preview[rating]}"]`)).toHaveCount(1);
    }
  }

  await axeCheck();
  await captureEvidence('spec-402-demo');
  expect(consoleErrors).toEqual([]);
});

test('Répétition espacée FSRS par notion @SPEC-402 @visual @mobile', async ({
  page,
  axeCheck,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1' },
    '[data-testid="fsrs-inputs"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="fsrs-recall"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
    },
  });
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');
  await expect(page.getByTestId('fsrs-recall').getByRole('button')).toHaveCount(4);
  for (const rating of FSRS_RATINGS) {
    await expect(page.getByTestId(`recall-due-${rating}`)).toBeVisible();
  }

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await axeCheck();
  const mobile = test.info().project.name === 'mobile';
  await expectScreenshotBaseline(
    page,
    mobile ? 'spec-402-demo-mobile.png' : 'spec-402-demo.png',
    { fullPage: true },
  );
});
