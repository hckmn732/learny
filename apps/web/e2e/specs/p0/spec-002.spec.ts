import { expect, test, type Page } from '@playwright/test';

const FIXED_TIME = new Date('2026-11-11T12:20:00Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
});

async function checkMessage(page: Page, message: string) {
  await page.getByLabel('Message de commit').fill(message);
  await page.getByRole('button', { name: 'Vérifier le message' }).click();
}

async function scan(page: Page, text: string) {
  await page.getByLabel('Texte à analyser').fill(text);
  await page.getByRole('button', { name: 'Analyser' }).click();
}

test('vérifie des messages de commit @SPEC-002', async ({ page }) => {
  await page.goto('/_dev/sdd/SPEC-002');
  const result = page.getByTestId('commit-result');

  await checkMessage(page, 'feat(SPEC-002): ajoute X');
  await expect(result).toHaveText('Message conforme');

  await checkMessage(page, 'feat: ajoute X');
  await expect(result.getByText('Message refusé')).toBeVisible();
  await expect(result.getByRole('listitem')).toContainText(['scope-empty']);

  await checkMessage(
    page,
    'merge(SPEC-006): Application web : configuration de base, santé et pages de démonstration',
  );
  await expect(result).toHaveText('Message conforme');
});

test('détecte un secret @SPEC-002', async ({ page }) => {
  await page.goto('/_dev/sdd/SPEC-002');
  const result = page.getByTestId('secret-result');

  await scan(page, `ANTHROPIC_API_KEY=${['sk-ant-', 'api03-', 'A'.repeat(30)].join('')}`);
  await expect(result.getByText('1 secret(s) détecté(s)')).toBeVisible();
  await expect(result.getByRole('listitem')).toHaveText(['ligne 1 — anthropic-key — sk-a…']);

  await scan(page, 'sk-ant-learny-test-only-0000000000000000');
  await expect(result).toHaveText('Aucun secret détecté.');
});

test('pages SDD désactivées en production @SPEC-002', async ({ request }) => {
  const res = await request.post('/api/v1/_dev/commit-check', { data: {} });
  expect(res.status()).toBe(400);
  expect(res.headers()['content-type']).toContain('application/problem+json');
  expect(await res.json()).toEqual({
    type: 'about:blank',
    title: 'Requête invalide',
    status: 400,
    code: 'VALIDATION_FAILED',
  });
});

test('démonstration SPEC-002 conforme @SPEC-002 @visual', async ({ page }) => {
  await page.goto('/_dev/sdd/SPEC-002');
  await expect(page.getByTestId('sdd-demo-title')).toHaveText(
    'Hooks Git, conventions de commit et protection des secrets',
  );
  const ids = await page
    .locator('[data-testid^="spec-002-"]:is(section)')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(ids).toEqual(['spec-002-hooks', 'spec-002-commit', 'spec-002-secrets', 'spec-002-types']);

  const h2 = page.getByRole('heading', { level: 2 });
  await expect(h2).toHaveText([
    'Hooks actifs',
    'Vérifier un message de commit',
    'Détecter un secret',
    'Types autorisés',
  ]);
  await expect(page.getByTestId('spec-002-hooks-path')).toHaveText('core.hooksPath = .husky/_');
  await expect(page.getByTestId('spec-002-hooks').getByRole('row')).toHaveText([
    'HookCommande',
    'pre-commitlint-staged puis check-secrets --staged',
    'commit-msgcommitlint --edit',
    'pre-pushtypecheck puis test:unit',
  ]);
  await expect(page.getByTestId('spec-002-types')).toContainText(
    'feat, fix, test, docs, refactor, perf, build, ci, chore, style, revert, evidence, merge',
  );
  await expect(page.getByTestId('spec-002-types')).toContainText('SPEC-xxx · CP-n · sdd');

  await expect(page).toHaveScreenshot('spec-002-demo.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});
