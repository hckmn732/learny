import type { Page } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['spec-107-due', 'spec-107-gap', 'spec-107-history'];

const HEADINGS = ['États de mémorisation', 'Lacune active', 'Historique de révision'];

const NATURES = ['confusion', 'difficulté d’application', 'incompréhension', 'oubli'];

async function textContents(page: Page, testId: string) {
  return page
    .getByTestId(testId)
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
}

test('inspecte les états de mémorisation @SPEC-107', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-107');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-107 · Mémorisation et lacunes');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-2 / EF-5 / CL-7 — two due notions, a suspended or newly created one stays out of the count.
  await expect(page.getByTestId('due-count')).toHaveText('2 notions dues');
  await expect(page.getByTestId('due-card')).toHaveCount(3);
  expect(await textContents(page, 'due-card-label')).toEqual([
    'Notion 1.1.1',
    'Notion 1.1.2',
    'Notion 1.1.3',
  ]);
  // CL-8 — dates are shown in Europe/Paris while due_at stays a UTC instant.
  expect(await textContents(page, 'due-card-due')).toEqual([
    '11/11/2026 10:00',
    '10/11/2026 19:00',
    '—',
  ]);
  expect(await textContents(page, 'due-card-mastery')).toEqual(['82,5 %', '45 %', '0 %']);
  expect(await textContents(page, 'due-card-review')).toEqual([
    'en révision',
    'en révision',
    'hors révision',
  ]);

  // ET-2 — the technical zone shows the serialised FSRS card before/after the last revision.
  await page.getByText('JSON FSRS (zone technique)').click();
  const fsrs = await page.getByTestId('due-fsrs').textContent();
  expect(fsrs).toContain('"reps": 2');
  expect(fsrs).toContain('"state": 1');
  expect(fsrs).toContain('"due": "2026-11-11T09:00:00.000Z"');

  // EF-6, CL-6 — another account owns one due state; none of it is visible here.
  await expect(page.getByTestId('spec-107-isolation')).toHaveText(
    '1 état d’un autre compte, 0 visible',
  );

  // EF-2 / EF-4 — one active confusion, the four possible natures and its evidence.
  await expect(page.getByTestId('gap-nature-option')).toHaveCount(4);
  expect(await textContents(page, 'gap-nature-option')).toEqual(NATURES);
  const active = await page
    .getByTestId('gap-nature-option')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getAttribute('data-active') === 'true')
        .map((element) => element.textContent.trim()),
    );
  expect(active).toEqual(['confusion']);
  await expect(page.getByTestId('gap-state')).toHaveText('confusion');
  await expect(page.getByTestId('gap-confused-with')).toHaveText('Notion 1.1.3');
  await expect(page.getByTestId('gap-detected-at')).toHaveText('09/11/2026 09:01');
  expect(await page.getByTestId('gap-evidence').textContent()).toContain('Compte fournisseur');

  // CA-4 — the history keeps two revisions with the card before and after each one.
  await expect(page.getByTestId('history-row')).toHaveCount(2);
  expect(await textContents(page, 'history-grade')).toEqual(['hard', 'good']);
  expect(await textContents(page, 'history-source')).toEqual(['validation', 'global_quiz']);
  expect(await textContents(page, 'history-correct')).toEqual(['oui', 'oui']);
  expect(await textContents(page, 'history-time')).toEqual(['5,2 s', '3,1 s']);
  expect(await textContents(page, 'history-before')).toEqual([
    'reps 0 · nouvelle · 11/11/2026 13:20',
    'reps 1 · apprentissage · 11/11/2026 08:10',
  ]);
  expect(await textContents(page, 'history-after')).toEqual([
    'reps 1 · apprentissage · 11/11/2026 08:10',
    'reps 2 · apprentissage · 11/11/2026 10:00',
  ]);

  await axeCheck();
  await captureEvidence('spec-107-memory');
  expect(consoleErrors).toEqual([]);
});

test('mémoire conforme @SPEC-107 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-107');

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
    '[data-testid="spec-107-due"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-107-gap"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-107-history"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the history table scrolls inside a named region.
  const region = page.getByRole('region', { name: 'Historique de révision' });
  await expect(region).toBeVisible();
  if (page.viewportSize()?.width === 390) {
    const scrolls = await region.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    );
    expect(scrolls).toBe(true);
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-107-memory.png', { fullPage: true });
});
