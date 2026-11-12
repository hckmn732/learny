import type { Page } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['spec-108-slots', 'spec-108-action', 'spec-108-daily', 'spec-108-milestones'];

const HEADINGS = ['Créneaux', 'Action du tuteur', 'Activité du jour', 'Jalons'];

const STATUSES = ['prévu', 'fait', 'manqué', 'déplacé', 'annulé'];

async function textContents(page: Page, testId: string) {
  return page
    .getByTestId(testId)
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
}

test('inspecte le schéma du planning @SPEC-108', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-108');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-108 · Agenda, automatismes et série');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-1 / BR-AGE-04 — the five statuses are listed with French labels, not only colours, and
  // each one is represented by a row.
  expect(await textContents(page, 'slot-status-legend')).toEqual(STATUSES);
  const unused = await page
    .getByTestId('slot-status-legend')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getAttribute('data-used') !== 'true')
        .map((element) => element.textContent.trim()),
    );
  expect(unused).toEqual([]);

  // CA-2 / EF-2 — the agenda shows the moved origin, its linked successor and every status.
  await expect(page.getByTestId('slot-row')).toHaveCount(5);
  expect(await textContents(page, 'slot-title')).toEqual([
    'Révision du soir',
    'Exercice pratique',
    'Quiz de validation · module 1',
    'Lecture du cours',
    'Lecture du cours',
  ]);
  expect(await textContents(page, 'slot-status')).toEqual([
    'annulé',
    'manqué',
    'fait',
    'déplacé',
    'prévu',
  ]);
  expect(await textContents(page, 'slot-kind')).toEqual([
    'révision',
    'exercice',
    'quiz de validation',
    'cours',
    'cours',
  ]);
  expect(await textContents(page, 'slot-start')).toEqual([
    '08/11/2026 19:00',
    '09/11/2026 18:00',
    '10/11/2026 18:00',
    '11/11/2026 18:00',
    '12/11/2026 18:00',
  ]);
  expect(await textContents(page, 'slot-end')).toEqual([
    '08/11/2026 19:30',
    '09/11/2026 18:30',
    '10/11/2026 18:30',
    '11/11/2026 19:00',
    '12/11/2026 19:00',
  ]);
  expect(await textContents(page, 'slot-creator')).toEqual([
    'planificateur',
    'planificateur',
    'planificateur',
    'planificateur',
    'apprenant',
  ]);
  expect(await textContents(page, 'slot-origin')).toEqual([
    '—',
    '—',
    '—',
    '—',
    'Déplacé depuis le 11/11/2026 18:00',
  ]);

  // EF-3 / BR-AUT-11 — one action, its status, its consent and its explanation.
  await expect(page.getByTestId('action-summary')).toHaveText(
    'Votre séance d’hier est proposée demain à 18 h : un accord est attendu.',
  );
  await expect(page.getByTestId('action-automation')).toHaveText('reprise après décrochage');
  await expect(page.getByTestId('action-kind')).toHaveText('slot_rescheduled');
  await expect(page.getByTestId('action-status')).toHaveText('en attente d’accord');
  await expect(page.getByTestId('action-consent')).toHaveText('accord demandé');
  await expect(page.getByTestId('action-created-at')).toHaveText('11/11/2026 13:20');
  await page.getByText('Charge JSON (zone technique)').click();
  const payload = await page.getByTestId('action-payload').textContent();
  expect(payload).toContain('"slotId"');
  expect(payload).toContain('"to": "2026-11-12T17:00:00.000Z"');

  // EF-4 / CL-5 — 30 + 15 minutes, one row, de-duplicated sources.
  await expect(page.getByTestId('daily-day')).toHaveText('11/11/2026');
  await expect(page.getByTestId('daily-minutes')).toHaveText('45 min');
  await expect(page.getByTestId('daily-qualifying')).toHaveText('oui');
  await expect(page.getByTestId('daily-sources')).toHaveText('attempt:1 · slot:2');

  // EF-5 / CL-6 — two milestones, newest first, including a null reference.
  await expect(page.getByTestId('milestone-row')).toHaveCount(2);
  expect(await textContents(page, 'milestone-key')).toEqual([
    'série de 30 jours',
    'module validé',
  ]);
  expect(await textContents(page, 'milestone-achieved')).toEqual([
    '10/11/2026 08:00',
    '09/11/2026 18:31',
  ]);
  const references = await textContents(page, 'milestone-reference');
  expect(references[0]).toBe('—');
  expect(references[1]).toMatch(/^[0-9a-f-]{36}$/);

  await axeCheck();
  await captureEvidence('spec-108-planning');
  expect(consoleErrors).toEqual([]);
});

test('planning conforme @SPEC-108 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-108');

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
    '[data-testid="spec-108-slots"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-108-action"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-108-daily"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-108-milestones"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the slots table scrolls inside a named region.
  const region = page.getByRole('region', { name: 'Créneaux (tableau défilant)' });
  await expect(region).toBeVisible();
  if (page.viewportSize()?.width === 390) {
    const scrolls = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrolls).toBe(true);
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-108-planning.png', { fullPage: true });
});
