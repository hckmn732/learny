import type { Page } from '@playwright/test';

import { AUTOMATION_DEFAULTS, AUTOMATION_KEYS } from '@learny/config';
import { expect, test } from '@learny/testing/playwright';
import {
  expectScreenshotBaseline,
  expectTokens,
  PROVISIONAL_TOKENS,
} from '@learny/testing/visual';

const SECTIONS = ['profile-card', 'study-card', 'notif-card', 'automation-table', 'constraints-card'];

const HEADINGS = ['Profil', 'Rythme', 'Notifications', 'Automatismes', 'Contraintes'];

const EXPECTED_SQLSTATES = ['22023', '23514', '23514', '23505'];

async function createDemoUser(page: Page): Promise<void> {
  await page.goto('/_dev/sdd/SPEC-102');
  await expect(page.getByTestId('identity-empty')).toBeVisible();
  await page.getByTestId('create-demo-user').click();
  await expect(page.getByTestId('profile-card')).toBeVisible();
}

test('initialisation du compte @SPEC-102', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto('/_dev/sdd/SPEC-102');

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-102 · Identité et préférences');
  expect(await title.evaluate((element) => element.tagName)).toBe('H1');

  await createDemoUser(page);

  const ids = await page
    .locator('section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(HEADINGS);

  // CA-2 — defaults of BR-ACC-12 and BR-ACC-08.
  const profile = page.getByTestId('profile-card');
  await expect(profile.getByTestId('profile-email')).toContainText('@test.learny.test');
  await expect(profile.getByTestId('profile-language')).toHaveText('fr');
  await expect(profile.getByTestId('profile-tone')).toHaveText('vous');
  await expect(profile.getByTestId('profile-timezone')).toHaveText('Europe/Paris');
  await expect(profile.getByTestId('profile-step')).toHaveText('profil');

  await expect(page.getByTestId('study-line')).toHaveText(
    '2 h par jour · lundi à vendredi · soir',
  );

  // CA-2 — defaults of BR-NOT-04.
  await expect(page.getByTestId('notif-type')).toHaveCount(6);
  const types = await page
    .getByTestId('notif-type')
    .evaluateAll((elements) => elements.map((element) => element.textContent));
  expect(types).toHaveLength(6);
  for (const text of types) expect(text).toContain('Activé');
  await expect(page.getByTestId('notif-digest')).toHaveText('08:00');
  await expect(page.getByTestId('notif-quiet')).toHaveText('21:00 – 08:00');
  await expect(page.getByTestId('notif-weekend')).toHaveText('Activé');
  await expect(page.getByTestId('notif-cap')).toContainText('5');

  // CA-1 / CA-6 — ten automations with the EF-6 params.
  await expect(page.getByTestId('automation-row')).toHaveCount(10);
  const rows = await page.getByTestId('automation-row').evaluateAll((elements) =>
    elements.map((element) => {
      const key = element.querySelector('td')?.textContent.trim() ?? '';
      const params = element.querySelector('[data-testid="automation-params"]')?.textContent ?? '';
      return { key, params };
    }),
  );
  expect(rows.map((row) => row.key)).toEqual([...AUTOMATION_KEYS].sort());
  for (const row of rows) {
    expect(JSON.parse(row.params), row.key).toEqual(
      AUTOMATION_DEFAULTS[row.key as keyof typeof AUTOMATION_DEFAULTS],
    );
  }
  const enabled = await page
    .getByTestId('automation-enabled')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(enabled).toEqual(Array(10).fill('Activé'));

  // CA-3 — the four constraint demonstrations are refused with their SQLSTATE.
  await expect(page.getByTestId('constraint-row')).toHaveCount(4);
  const sqlstates = await page
    .getByTestId('constraint-sqlstate')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(sqlstates).toEqual(EXPECTED_SQLSTATES);
  const results = await page
    .getByTestId('constraint-result')
    .evaluateAll((elements) => elements.map((element) => element.textContent.trim()));
  expect(results).toEqual(Array(4).fill('Refusé comme attendu'));

  await axeCheck();
  await captureEvidence('spec-102-demo');
  expect(consoleErrors).toEqual([]);

  // The demo account is removed; the cascade (CA-5) empties the six tables.
  await page.getByTestId('cleanup').click();
  await expect(page.getByTestId('identity-empty')).toBeVisible();
  await expect(page.getByTestId('profile-card')).toHaveCount(0);
});

test('page identité conforme @SPEC-102 @visual', async ({ page, axeCheck }) => {
  await createDemoUser(page);

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
    '[data-testid="profile-card"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-102-demo.png', {
    fullPage: true,
    // The demo e-mail carries the frozen sign-up instant of the test server.
    mask: [page.getByTestId('profile-email'), page.getByTestId('demo-user')],
  });

  await page.getByTestId('cleanup').click();
  await expect(page.getByTestId('identity-empty')).toBeVisible();
});
