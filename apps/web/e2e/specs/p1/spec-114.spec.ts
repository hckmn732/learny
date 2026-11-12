import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['spec-114-buckets', 'spec-114-path', 'spec-114-ttl', 'spec-114-access'];
const HEADINGS = ['Buckets privés', 'Chemin de stockage', 'Durée de signature', 'Matrice des accès'];
const PATH = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/guide.pdf';

const ACCESS_ROWS = [
  { key: 'list', cells: ['autorisé', 'refusé', 'refusé'] },
  { key: 'upload', cells: ['autorisé', 'refusé', 'refusé'] },
  { key: 'read', cells: ['autorisé', 'refusé', 'refusé'] },
  { key: 'delete', cells: ['autorisé', 'refusé', 'refusé'] },
  { key: 'export', cells: ['autorisé', 'refusé', 'refusé'] },
];

test('inspecte le stockage privé @SPEC-114', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-114');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-114 · Stockage des fichiers');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page.locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // EF-1, EF-7 — exactly two buckets, each explicitly private, without any public link.
  const buckets = page.getByTestId('spec-114-bucket');
  await expect(buckets).toHaveCount(2);
  expect(
    await buckets.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-bucket')),
    ),
  ).toEqual(['resources', 'exports']);
  expect(
    await buckets.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-private')),
    ),
  ).toEqual(['true', 'true']);
  await expect(page.getByTestId('spec-114-bucket-badge')).toHaveText(['Privé', 'Privé']);

  // EF-2, EF-7 — a three-segment fake path, never a real URL or token.
  const path = page.getByTestId('spec-114-path-value');
  await expect(path).toHaveText(PATH);
  const pathText = (await path.textContent()) ?? '';
  expect(pathText.split('/')).toHaveLength(3);
  expect(pathText).not.toContain('token');
  expect(pathText).not.toContain('http');

  // EF-3, EF-7 — the ten-minute lifetime is text, not a real signed URL.
  await expect(page.getByTestId('spec-114-ttl-value')).toHaveText('URL signée : 10 min');
  const body = (await page.locator('main').textContent()) ?? '';
  expect(body).not.toContain('token=');
  expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);

  // EF-4 to EF-6 — the owner, another group member and an anonymous visitor.
  const rows = page.getByTestId('spec-114-access-row');
  await expect(rows).toHaveCount(ACCESS_ROWS.length);
  expect(
    await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-key'))),
  ).toEqual(ACCESS_ROWS.map((row) => row.key));
  for (const [index, expected] of ACCESS_ROWS.entries()) {
    const cells = rows.nth(index).getByTestId('spec-114-access-cell');
    expect(await cells.allTextContents()).toEqual(expected.cells);
    expect(
      await cells.evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-allowed')),
      ),
    ).toEqual(['true', 'false', 'false']);
  }

  await axeCheck();
  await captureEvidence('spec-114-storage');
  expect(consoleErrors).toEqual([]);
});

test('stockage conforme @SPEC-114 @visual @mobile', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-114');

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
    '[data-testid="spec-114-buckets"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-114-path"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-114-ttl"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-114-access"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-114-bucket"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  // §10 — at 390 px the matrix stays inside a horizontally scrollable region.
  if (page.viewportSize()?.width === 390) {
    const region = page.getByTestId('spec-114-access').locator('div.overflow-x-auto').first();
    const scrolls = await region.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(scrolls, 'la matrice doit défiler horizontalement').toBe(true);
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-114-storage.png', { fullPage: true });
});
