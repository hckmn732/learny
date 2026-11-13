import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-512';
const TITLE = 'SPEC-512 · Recherche web';
const REGIONS = ['search-web-programme', 'search-web-refusal', 'search-web-contract'];

test('Recherche web @SPEC-512', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  // CA-1 — the native route is the default and keeps the provider provenance.
  await expect(page.getByTestId('search-web-provider')).toHaveText('anthropic');
  await expect(page.getByTestId('search-result')).toHaveCount(3);
  await expect(page.getByTestId('search-result-provider').first()).toHaveText('anthropic');
  await expect(page.getByTestId('search-result-url').first()).toContainText('https://');
  await expect(page.getByTestId('search-result-url').first()).not.toContainText('utm_');

  // CA-1, CA-5 — the fallback renders the same schema with its own provenance.
  await page.getByTestId('search-route-tavily').click();
  await expect(page.getByTestId('search-web-provider')).toHaveText('tavily');
  await expect(page.getByTestId('search-result')).toHaveCount(3);
  await expect(page.getByTestId('search-result-provider').first()).toHaveText('tavily');

  // CA-4 — a search result becomes a pending suggestion, then only an explicit import accepts it.
  await page.getByTestId('search-result-suggest').click();
  await expect(page.getByTestId('search-web-suggestion-status')).toContainText(
    'Suggestion en attente',
    { timeout: 20_000 },
  );
  await expect(page.getByTestId('search-web-suggestion-import')).toBeVisible();
  await page.getByTestId('search-web-suggestion-import').click();
  await expect(page.getByTestId('search-web-suggestion-status')).toContainText(
    'Ressource importée dans le chapitre',
    { timeout: 20_000 },
  );
  await expect(page.getByTestId('search-web-suggestion-status')).toContainText(
    'Aucun contenu de cours n’a été créé',
  );

  // CA-2 — the course task is refused and no import button appears in that card.
  await expect(page.getByTestId('search-web-refusal-code')).toHaveText('TOOL_NOT_ALLOWED');
  await expect(page.getByTestId('search-web-refusal-note')).toContainText(
    'Aucun appel fournisseur',
  );
  await expect(page.getByTestId('search-web-refusal').getByRole('button')).toHaveCount(0);

  // Contract and readable failure.
  await expect(page.getByTestId('search-web-input-contract')).toContainText('"purpose"');
  await expect(page.getByTestId('search-web-validated-output')).toContainText('"provider": "anthropic"');
  await expect(page.getByTestId('search-web-unavailable')).toContainText('SEARCH_UNAVAILABLE');

  await axeCheck();
  await captureEvidence('spec-512-demo');
  expect(consoleErrors).toEqual([]);
});

test('Recherche web @SPEC-512 @visual @mobile', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="search-web-programme"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="search-web-refusal"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="search-web-contract"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);
  await expect(page.getByTestId('sdd-title')).toHaveCSS('font-size', '30.6px');

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);
  await expect(page.getByTestId('search-result')).toHaveCount(3);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await captureEvidence('spec-512-demo-visual');
  await expectScreenshotBaseline(page, 'spec-512-demo.png', { fullPage: true });
});
