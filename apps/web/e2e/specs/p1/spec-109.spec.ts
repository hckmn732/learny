import type { Page } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['spec-109-inbox', 'spec-109-deliveries'];

const HEADINGS = ['Boîte de réception', 'Livraisons'];

async function textContents(page: Page, testId: string) {
  return page
    .getByTestId(testId)
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
}

test('inspecte les notifications @SPEC-109', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-109');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-109 · Schéma notifications');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-3 / EF-4 / EF-6 — the badge counts the two unread rows, not the three notifications.
  await expect(page.getByTestId('spec-109-count')).toHaveText('2 non lues');

  // EF-4 — newest first: weekly review, new gap, then the already-read digest.
  await expect(page.getByTestId('notification-row')).toHaveCount(3);
  expect(await textContents(page, 'notification-title')).toEqual([
    'Votre bilan de la semaine',
    'Nouvelle lacune : TVA intracommunautaire',
    'Votre programme du jour',
  ]);
  expect(await textContents(page, 'notification-type')).toEqual([
    'bilan de la semaine',
    'nouvelle lacune',
    'programme du jour',
  ]);
  expect(await textContents(page, 'notification-created-at')).toEqual([
    '11/11/2026 11:15',
    '11/11/2026 10:30',
    '11/11/2026 08:00',
  ]);
  expect(await textContents(page, 'notification-state')).toEqual(['non lue', 'non lue', 'lue']);
  const readStates = await page
    .getByTestId('notification-row')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-read')));
  expect(readStates).toEqual(['false', 'false', 'true']);
  const inboxIcons = await textContents(page, 'notification-icon');
  expect(inboxIcons.every((icon) => icon.length > 0)).toBe(true);

  // CA-1 / EF-3 — the journal shows the three requested statuses with a label and an icon, and no
  // delivery address. `deferred_quiet` carries the 08:00 Paris re-evaluation instant.
  await expect(page.getByTestId('delivery-row')).toHaveCount(4);
  expect(await textContents(page, 'delivery-channel')).toEqual([
    'navigateur',
    'navigateur',
    'e-mail',
    'navigateur',
  ]);
  expect(await textContents(page, 'delivery-status')).toEqual([
    '⊘non envoyée (préférence)',
    '⏱reportée (heures calmes)',
    '✓envoyée',
    '⊘non envoyée (préférence)',
  ]);
  expect(await textContents(page, 'delivery-scheduled-for')).toEqual([
    '—',
    '12/11/2026 08:00',
    '—',
    '—',
  ]);
  expect(await textContents(page, 'delivery-sent-at')).toEqual([
    '—',
    '—',
    '11/11/2026 08:00',
    '—',
  ]);
  const statusIcons = await textContents(page, 'delivery-icon');
  expect(statusIcons.every((icon) => icon.length > 0)).toBe(true);
  // ET-5 — no address, endpoint or token reaches the page.
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('@');
  expect(body).not.toContain('https://');

  await axeCheck();
  await captureEvidence('spec-109-notifications');
  expect(consoleErrors).toEqual([]);
});

test('notifications conformes @SPEC-109 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-109');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);
  await expect(page.getByTestId('spec-109-count')).toHaveText('2 non lues');
  await expect(page.getByTestId('notification-row')).toHaveCount(3);
  await expect(page.getByTestId('delivery-row')).toHaveCount(4);

  await expectTokens(page, {
    body: {
      color: PROVISIONAL_TOKENS.color.text,
      'background-color': PROVISIONAL_TOKENS.color.background,
    },
    '[data-testid="sdd-title"]': { color: PROVISIONAL_TOKENS.color.text },
    '[data-testid="spec-109-inbox"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-109-deliveries"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="notification-row"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
    },
    '[data-testid="delivery-status"]': { color: PROVISIONAL_TOKENS.color.text },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the delivery table scrolls inside a named region, never the page.
  const region = page.getByRole('region', { name: 'Livraisons (tableau défilant)' });
  await expect(region).toBeVisible();
  if (page.viewportSize()?.width === 390) {
    const scrolls = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrolls).toBe(true);
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-109-notifications.png', { fullPage: true });
});
