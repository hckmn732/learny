import type { Page } from '@playwright/test';

import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = [
  'spec-112-search',
  'spec-112-export',
  'spec-112-acceptance',
  'spec-112-idempotency',
];

const HEADINGS = ['Recherche privée', 'Export', 'Documents acceptés', 'Idempotence'];

async function textContents(page: Page, testId: string) {
  return page
    .getByTestId(testId)
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
}

test('inspecte la recherche privée @SPEC-112', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-112');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-112 · Données personnelles, idempotence et recherche');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page.locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // EF-7 / §10 — the query is prefilled, labelled and its three groups are visible.
  const query = page.getByLabel('Rechercher');
  await expect(query).toHaveValue('tresorerie');
  await expect(page.getByTestId('spec-112-result-count')).toHaveText('3 résultats');
  const groups = await page
    .getByTestId('spec-112-group')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-kind')));
  expect(groups).toEqual(['formation', 'notion', 'section']);
  await expect(page.getByRole('heading', { level: 3 })).toHaveText([
    'Formations',
    'Notions',
    'Cours',
  ]);

  expect(await textContents(page, 'spec-112-result-title')).toEqual([
    'SAP S/4HANA Finance',
    'Trésorerie prévisionnelle',
    'Le cycle de trésorerie',
  ]);
  const snippets = await textContents(page, 'spec-112-result-snippet');
  expect(snippets).toHaveLength(3);
  // EF-6 — the course HTML is stripped; the meaningful text remains.
  expect(snippets[2]).toContain('La trésorerie suit les encaissements');
  for (const snippet of snippets) {
    expect(snippet).not.toContain('<');
    expect(snippet).not.toContain('>');
    expect(snippet).not.toContain('script');
  }

  // CA-4 — a second learner owns the same words but never appears in the results.
  await expect(page.getByTestId('spec-112-isolation')).toHaveText(
    'Un autre compte possède « Trésorerie confidentielle de Bob » : 0 résultat visible ici.',
  );
  await expect(page.getByText('Le secret de Bob')).toHaveCount(0);

  // EF-1 / CL-2 — one downloadable export and one expired export kept for audit.
  await expect(page.getByTestId('spec-112-export-row')).toHaveCount(2);
  expect(await textContents(page, 'spec-112-export-state')).toEqual(['prêt', 'expiré']);
  const links = await page
    .getByTestId('spec-112-export-row')
    .locator('td:last-child')
    .allTextContents();
  expect(links.map((text) => text.trim())).toEqual(['lien signé disponible', 'aucun lien']);
  await expect(page.getByText('2,5 Mo')).toBeVisible();
  await expect(page.getByText('1,2 Mo')).toBeVisible();

  // EF-2 / CL-1 — three acceptance rows: the duplicated CGU 1.2 stayed a single row.
  await expect(page.getByTestId('spec-112-acceptance-row')).toHaveCount(3);
  expect(await textContents(page, 'spec-112-acceptance-document')).toEqual([
    'Confidentialité',
    'CGU',
    'CGU',
  ]);
  expect(await textContents(page, 'spec-112-acceptance-version')).toEqual(['3.0', '1.3', '1.2']);
  await expect(page.getByTestId('spec-112-latest-cgu')).toHaveText(
    'Dernière version des CGU acceptée : 1.3.',
  );

  // EF-3 / CL-3 — replayed, in progress and refused reuse are all distinguishable with text.
  await expect(page.getByTestId('spec-112-idempotency-row')).toHaveCount(3);
  expect(await textContents(page, 'spec-112-idempotency-state')).toEqual([
    'en cours',
    'rejouée',
    'refusée (422)',
  ]);
  const codes = await page
    .getByTestId('spec-112-idempotency-row')
    .locator('td:nth-child(3)')
    .allTextContents();
  expect(codes.map((text) => text.trim())).toEqual(['0', '202', '422']);

  await axeCheck();
  await captureEvidence('spec-112-privacy-search');
  expect(consoleErrors).toEqual([]);
});

test('recherche conforme @SPEC-112 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-112');

  const ids = await page.locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  await expectTokens(page, {
    body: {
      color: PROVISIONAL_TOKENS.color.text,
      'background-color': PROVISIONAL_TOKENS.color.background,
    },
    '[data-testid="sdd-title"]': { color: PROVISIONAL_TOKENS.color.text },
    '[data-testid="spec-112-search"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-112-export"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-112-acceptance"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-112-idempotency"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-112-search"] input': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the result and export tables stay inside scrollable regions.
  if (page.viewportSize()?.width === 390) {
    for (const testId of ['spec-112-export', 'spec-112-acceptance', 'spec-112-idempotency']) {
      const region = page.getByTestId(testId).locator('div.overflow-x-auto').first();
      const scrolls = await region.evaluate(
        (element) => element.scrollWidth > element.clientWidth,
      );
      expect(scrolls, `${testId} doit défiler horizontalement`).toBe(true);
    }
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-112-privacy-search.png', { fullPage: true });
});
