import type { Page } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['spec-106-types', 'spec-106-activity', 'spec-106-attempt', 'spec-106-answers'];

const HEADINGS = ['Types de briques', 'Activité', 'Tentative', 'Réponses'];

const TYPES = [
  'text',
  'resource_excerpt',
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
  'instruction',
  'scripted_dialogue',
  'timer',
  'scoring',
];

async function textContents(page: Page, testId: string) {
  return page
    .getByTestId(testId)
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
}

test('inspecte les briques et tentatives @SPEC-106', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-106');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-106 · Briques, activités et tentatives');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-1 — the thirteen brick types of BR-BRI-01, with their purpose and status.
  await expect(page.getByTestId('type-row')).toHaveCount(13);
  expect(await textContents(page, 'type-name')).toEqual(TYPES);
  const statuses = await textContents(page, 'type-status');
  expect(statuses[11]).toBe('reported');
  expect(statuses[12]).toBe('retired');
  expect(statuses.filter((status) => status === 'active')).toHaveLength(11);

  // CA-2 — a ready activity lists three ordered versions; version 4 is available but not used.
  await expect(page.getByTestId('activity-kind')).toHaveText('validation_quiz');
  await expect(page.getByTestId('activity-status')).toHaveText('ready');
  await expect(page.getByTestId('activity-item-row')).toHaveCount(3);
  expect(await textContents(page, 'activity-item-position')).toEqual(['1', '2', '3']);
  expect(await textContents(page, 'activity-item-version')).toEqual(['1', '2', '3']);
  expect(await textContents(page, 'activity-item-type')).toEqual([
    'choice_question',
    'choice_question',
    'choice_question',
  ]);

  // CA-3 — the graded attempt carries its number, score and answer count.
  await expect(page.getByTestId('attempt-number')).toHaveText('1');
  await expect(page.getByTestId('attempt-status')).toHaveText('graded');
  await expect(page.getByTestId('attempt-score')).toHaveText('50');
  await expect(page.getByTestId('attempt-passed')).toHaveText('non');
  await expect(page.getByTestId('attempt-answers')).toHaveText('3');

  // CA-3 — each answer keeps the version it presented after version 4 was published.
  await expect(page.getByTestId('answer-row')).toHaveCount(3);
  expect(await textContents(page, 'answer-position')).toEqual(['1', '2', '3']);
  expect(await textContents(page, 'answer-version')).toEqual(['1', '2', '3']);
  expect(await textContents(page, 'answer-frozen')).toEqual([
    'figée sur la version 1 · version 4 publiée',
    'figée sur la version 2 · version 4 publiée',
    'figée sur la version 3 · version 4 publiée',
  ]);
  expect(await textContents(page, 'answer-grader')).toEqual(['code', 'code', 'tutor']);

  await axeCheck();
  await captureEvidence('spec-106-schema');
  expect(consoleErrors).toEqual([]);
});

test('schéma des briques conforme @SPEC-106 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-106');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  await expectTokens(page, {
    body: {
      color: PROVISIONAL_TOKENS.color.text,
      'background-color': PROVISIONAL_TOKENS.color.background,
    },
    '[data-testid="sdd-title"]': { color: PROVISIONAL_TOKENS.color.text },
    '[data-testid="spec-106-types"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the tables scroll inside a named region.
  const region = page.getByRole('region', { name: 'Types de briques (tableau défilant)' });
  await expect(region).toBeVisible();
  if (page.viewportSize()?.width === 390) {
    const scrolls = await region.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    );
    expect(scrolls).toBe(true);
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-106-schema.png', { fullPage: true });
});
