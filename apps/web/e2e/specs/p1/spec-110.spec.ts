import type { Page } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = [
  'spec-110-credentials',
  'spec-110-tasks',
  'spec-110-spend',
  'spec-110-subscription',
];

const HEADINGS = ['Clé personnelle', 'Modèle par tâche', 'Dépense du jour', 'Abonnement'];

async function textContents(page: Page, testId: string) {
  return page
    .getByTestId(testId)
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
}

test('inspecte les coûts IA @SPEC-110', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-110');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-110 · Schéma IA et facturation');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-1 / CA-3 / ET-5 — two keys, masked to their last four characters; a failed key and an
  // outside-EU key are visible without ever exposing the ciphertext.
  await expect(page.getByTestId('credential-card')).toHaveCount(2);
  expect(await textContents(page, 'credential-label')).toEqual([
    'Clé Anthropic d’Alex',
    'Clé DeepSeek (hors UE)',
  ]);
  expect(await textContents(page, 'credential-provider')).toEqual(['Anthropic', 'DeepSeek']);
  expect(await textContents(page, 'credential-last4')).toEqual(['•••• a1b2', '•••• c3d4']);
  expect(await textContents(page, 'credential-status')).toEqual(['qualifiée', 'en échec']);
  expect(await textContents(page, 'credential-region')).toEqual(['UE', 'hors UE']);

  const bodyText = await page.locator('body').textContent();
  for (const forbidden of [
    'learny-test-only',
    'encrypted_key',
    'encryptedKey',
    'Uint8Array',
  ]) {
    expect(bodyText ?? '').not.toContain(forbidden);
  }
  expect(bodyText ?? '').toContain('iv‖tag‖ciphertext');

  // EF-2 — five tasks; the failed DeepSeek key is never selected and falls back to provided AI.
  await expect(page.getByTestId('task-row')).toHaveCount(5);
  expect(await textContents(page, 'task-name')).toEqual([
    'programme',
    'cours',
    'lacunes',
    'tuteur',
    'tâches légères',
  ]);
  expect(await textContents(page, 'task-model')).toEqual([
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-5-20250929',
    'deepseek-chat',
    'claude-haiku-4-5-20251001',
    'claude-haiku-4-5-20251001',
  ]);
  expect(await textContents(page, 'task-source')).toEqual([
    'clé personnelle · Clé Anthropic d’Alex',
    'clé personnelle · Clé Anthropic d’Alex',
    'IA fournie · Clé DeepSeek (hors UE) non qualifiée',
    'clé personnelle · Clé Anthropic d’Alex',
    'IA fournie',
  ]);

  // CA-2 / EF-5 — the provided-AI spend of the Paris day is 0.42 + 0.17 = 0.59 USD; the BYOK
  // call and the zero-cost refusal stay out of the cap.
  await expect(page.getByTestId('spend-amount')).toHaveText('$0.59');
  await expect(page.getByTestId('spend-day')).toHaveText('11/11/2026');
  await expect(page.getByTestId('spend-cap')).toHaveText('$1.50');
  await expect(page.getByTestId('spend-calls')).toHaveText('2 facturé(s) · 1 BYOK exclu(s)');
  await expect(page.getByTestId('spend-note')).toContainText('ne consomment pas le plafond');

  // CA-4 — an active subscription, a 1.50 USD cap and no real payment.
  await expect(page.getByTestId('subscription-status')).toHaveText('actif');
  await expect(page.getByTestId('subscription-cap')).toHaveText('$1.50');
  await expect(page.getByTestId('subscription-period-end')).toHaveText('11/12/2026');
  await expect(page.getByTestId('subscription-note')).toContainText('aucun paiement réel');

  await axeCheck();
  await captureEvidence('spec-110-ai-billing');
  expect(consoleErrors).toEqual([]);
});

test('coûts IA conformes @SPEC-110 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-110');

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
    '[data-testid="spec-110-credentials"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-110-tasks"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-110-spend"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-110-subscription"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the task table scrolls inside a named region.
  const region = page.getByRole('region', { name: 'Modèles par tâche (tableau défilant)' });
  await expect(region).toBeVisible();
  if (page.viewportSize()?.width === 390) {
    const scrolls = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrolls).toBe(true);
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-110-ai-billing.png', { fullPage: true });
});
