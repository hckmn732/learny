import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = [
  'db-extensions',
  'db-migrations',
  'db-functions',
  'db-enums',
  'db-rls-identity',
];

const HEADINGS = [
  'Extensions',
  'Migrations appliquées',
  'Fonctions partagées',
  'Énumérations',
  'Identité RLS',
];

test('page de démonstration du paquet db @SPEC-101', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-101');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-101 · Paquet db');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  const ids = await page
    .locator('section[data-testid^="db-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // Quatre extensions, chacune avec sa version et son badge conforme.
  await expect(page.getByTestId('db-extensions').getByRole('row')).toHaveCount(5);
  await expect(page.getByTestId('db-extensions').getByTestId('check-extension-pgcrypto')).toHaveText(
    'Conforme',
  );

  // Les deux migrations de SPEC-101 sont appliquées.
  await expect(page.getByTestId('db-migrations-total')).toContainText('migration(s) appliquée(s)');
  await expect(page.getByTestId('db-migrations').getByTestId('db-migration-row')).not.toHaveCount(0);

  // immutable_unaccent est réellement exécuté par Postgres.
  await expect(page.getByTestId('db-functions-sample')).toHaveText('Ecriture comptable');

  // Les quatre énumérations transverses sont présentes.
  for (const name of ['course_language', 'actor', 'content_origin', 'job_status']) {
    await expect(page.getByTestId('db-enums').getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByTestId(`check-enum-${name}`)).toHaveText('Conforme');
  }

  // Identité RLS : A et B voient leur propre auth.uid(), serviceDb reste postgres sans claim.
  const badges = page.locator('[data-testid^="check-"]');
  const texts = await badges.evaluateAll((elements) =>
    elements.map((element) => element.textContent.trim()),
  );
  expect(texts.length).toBeGreaterThan(10);
  expect(texts).toEqual(texts.map(() => 'Conforme'));

  await axeCheck();
  await captureEvidence('spec-101-demo');
  expect(consoleErrors).toEqual([]);
});

test('page db conforme @SPEC-101 @visual', async ({ page, axeCheck }) => {
  await page.goto('/_dev/sdd/SPEC-101');

  const ids = await page
    .locator('section[data-testid^="db-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  await expectTokens(page, {
    body: {
      color: PROVISIONAL_TOKENS.color.text,
      'background-color': PROVISIONAL_TOKENS.color.background,
    },
    '[data-testid="sdd-title"]': { color: PROVISIONAL_TOKENS.color.text },
    '[data-testid="db-extensions"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-101-demo.png', {
    fullPage: true,
    // UUID, versions, migration list and extension versions vary between environments and resets.
    mask: [
      page.getByTestId('db-variable'),
      page.getByTestId('db-migration-row'),
      page.getByTestId('db-migrations-total'),
    ],
  });
});
