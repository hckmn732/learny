import type { Page } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = [
  'spec-111-code',
  'spec-111-capacity',
  'spec-111-progress',
  'spec-111-active-count',
];

const HEADINGS = ['Groupe', 'Capacité', 'Progression limitée', 'Formations actives'];

async function textContents(page: Page, testId: string) {
  return page
    .getByTestId(testId)
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
}

test('inspecte la progression de groupe @SPEC-111', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-111');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-111 · Schéma formations à plusieurs');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // §10 — the fake code is labelled as not a real invitation.
  await expect(page.getByTestId('group-code')).toHaveText('LRN-AB23');
  await expect(page.getByTestId('group-code-warning')).toHaveText(
    'Code factice, non valable pour une vraie invitation.',
  );

  // §10 — the gauge shows the three members out of ten, owner included.
  await expect(page.getByTestId('group-capacity')).toHaveText('3 / 10 membres');
  const gauge = page.getByLabel('Membres actifs');
  await expect(gauge).toHaveAttribute('max', '10');
  await expect(gauge).toHaveAttribute('value', '3');

  // EF-4, CA-2 — only the four admitted information columns plus the first name.
  await expect(page.getByTestId('group-progress-row')).toHaveCount(3);
  expect(await textContents(page, 'group-progress-name')).toEqual(['Alice', 'Bob', 'Carol']);
  expect(await textContents(page, 'group-progress-module')).toEqual([
    'Module 2',
    'Module 1',
    'Module 1',
  ]);
  expect(await textContents(page, 'group-progress-validated')).toEqual(['1', '1', '0']);
  expect(await textContents(page, 'group-progress-streak')).toEqual(['0', '7', '3']);

  const headers = await page
    .getByTestId('spec-111-progress')
    .locator('th')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(headers).toEqual(['Prénom', 'Module en cours', 'Modules validés', 'Série (jours)']);

  // CA-2 — no e-mail address, no personal note and no gap leaks into the page.
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  expect(body.toLowerCase()).not.toContain('note');
  expect(body.toLowerCase()).not.toContain('lacune');
  expect(body.toLowerCase()).not.toContain('apport');

  // CA-3 — the owner's active formation is counted once (owner and member of the same group).
  await expect(page.getByTestId('group-active-count')).toHaveText('1 formation active');

  await axeCheck();
  await captureEvidence('spec-111-group');
  expect(consoleErrors).toEqual([]);
});

test('groupe conforme @SPEC-111 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-111');

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
    '[data-testid="spec-111-code"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-111-capacity"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-111-progress"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-111-active-count"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the progress table scrolls inside a named region.
  const region = page.getByRole('region', { name: 'Progression des membres (tableau défilant)' });
  await expect(region).toBeVisible();
  if (page.viewportSize()?.width === 390) {
    const scrolls = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrolls).toBe(true);
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-111-group.png', { fullPage: true });
});
