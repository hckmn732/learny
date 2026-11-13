import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const PAGE = '/_dev/sdd/SPEC-511';
const TITLE = 'SPEC-511 · Recherche sémantique et sélection du contexte';
const REGIONS = [
  'spec-511-query-card',
  'spec-511-results-card',
  'spec-511-budget-card',
  'spec-511-context-card',
  'spec-511-trap-card',
  'spec-511-empty-card',
  'spec-511-failure-card',
  'spec-511-contract-card',
];

test('Recherche sémantique et sélection du contexte @SPEC-511', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);
  await expect(page.getByTestId('sdd-title')).toHaveText(TITLE);

  // CA-1 — the fixture query ranks passages by cosine similarity; the second group member is out.
  await expect(page.getByTestId('spec-511-query-vector')).toContainText('vector(1024)');
  const scores = await page.locator('[data-testid^="spec-511-score-"]').allTextContents();
  expect(scores.length).toBeGreaterThan(3);
  const numeric = scores.map((value) => Number.parseFloat(value));
  expect(numeric).toEqual([...numeric].sort((left, right) => right - left));
  expect(numeric[0]).toBeCloseTo(1, 3);
  await expect(page.getByTestId('spec-511-result-0')).toContainText(
    'Guide comptable — écritures et plan de comptes',
  );
  await expect(page.getByTestId('spec-511-member-excluded')).toContainText(
    '1 passage(s) du second membre du groupe exclu(s) par la RLS',
  );

  // CA-2 — the four budgets include tags and identifiers and are never exceeded.
  for (const [task, budget] of [
    ['programme', '6000'],
    ['course', '24000'],
    ['gaps', '8000'],
    ['tutor', '4000'],
  ] as const) {
    await expect(page.getByTestId(`spec-511-budget-budget-${task}`)).toHaveText(budget);
    const used = await page.getByTestId(`spec-511-budget-used-${task}`).textContent();
    const match = /^(\d+) \/ (\d+) jetons$/u.exec(used ?? '');
    expect(match, used ?? '').not.toBeNull();
    expect(Number(match?.[2])).toBe(Number(budget));
    expect(Number(match?.[1])).toBeLessThanOrEqual(Number(budget));
  }
  await expect(page.getByTestId('spec-511-budget-row-programme')).toContainText('Programme');
  expect(
    Number.parseInt((await page.getByTestId('spec-511-budget-omitted-programme').textContent()) ?? '0', 10),
  ).toBeGreaterThan(0);
  const selectionSummary = await page.getByTestId('spec-511-selection-summary').textContent();
  expect(selectionSummary).toMatch(/\d+ passage\(s\) retenu\(s\) · \d+ \/ 6000 jetons/u);

  // CA-3, CA-4 — duplicates are removed and the trapped passage stays inside data tags.
  await expect(page.getByTestId('spec-511-context-preview')).toContainText('&lt;/document&gt;');
  await expect(page.getByTestId('spec-511-context-preview')).not.toContainText('<system>');
  await expect(page.getByTestId('spec-511-context-preview')).not.toContainText(
    '</document><system>',
  );
  await expect(page.getByTestId('spec-511-trap-formatted')).toContainText('&lt;/document&gt;');
  await expect(page.getByTestId('spec-511-trap-formatted')).not.toContainText('<system>');
  await expect(page.getByTestId('spec-511-context-card')).toContainText('doublon(s) écarté(s)');

  // EF-5 — an empty chapter is an honest `no_matches`, and an invalid vector fails before SQL.
  await expect(page.getByTestId('spec-511-no-matches')).toContainText('no_matches');
  await expect(page.getByTestId('spec-511-no-matches')).toContainText('0 passage');
  await expect(page.getByTestId('spec-511-failure-code')).toHaveText('VALIDATION_FAILED');
  await expect(page.getByTestId('spec-511-failure-message')).toContainText('1024 dimensions');
  await expect(page.getByTestId('spec-511-contract-input')).toContainText('vector(1024)');
  await expect(page.getByTestId('spec-511-contract-output')).toContainText('"reason": null');

  await captureEvidence('spec-511-demo');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('Recherche sémantique et sélection du contexte @SPEC-511 @visual @mobile', async ({
  page,
  axeCheck,
}) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="spec-511-query-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-511-context-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-511-trap-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="spec-511-contract-card"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="sdd-title"]': { color: '#111113' },
  });

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText(TITLE);
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  await expect(page.getByTestId('spec-511-budget-row-programme')).toBeVisible();
  await expect(page.getByTestId('spec-511-trap-formatted')).toContainText('&lt;/document&gt;');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-511-demo.png', { fullPage: true });
});
