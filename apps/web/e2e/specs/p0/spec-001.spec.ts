import { expect, test } from '@playwright/test';

const FIXED_TIME = new Date('2026-11-11T12:20:00Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
});

test('accueil provisoire et santé @SPEC-001', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learny');
  await expect(page.getByText('Application en cours de construction.')).toBeVisible();

  const health = await request.get('/api/v1/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['cache-control']).toBe('no-store');
  // SPEC-006 enriched the body; before SPEC-101 the database is not configured (status degraded).
  expect(await health.json()).toMatchObject({ status: 'degraded' });

  const post = await request.post('/api/v1/health');
  expect(post.status()).toBe(405);
});

test('page de démonstration SPEC-001 @SPEC-001', async ({ page }) => {
  await page.goto('/_dev/sdd/SPEC-001');
  await expect(page.getByTestId('sdd-demo-spec')).toHaveText('SPEC-001');
  await expect(page.getByTestId('sdd-demo-title')).toHaveText(
    'Monorepo, application web minimale et socle de tests',
  );
  await expect(page.getByTestId('sdd-demo-clock')).toContainText('11/11/2026 13:20:00');

  const workspace = page.getByTestId('spec-001-workspace');
  await expect(workspace.getByRole('heading', { level: 2 })).toHaveText('Espace de travail');
  await expect(workspace.getByRole('columnheader')).toHaveText(['Paquet', 'Rôle']);
  for (const name of ['@learny/web', '@learny/core', '@learny/config']) {
    await expect(workspace.getByRole('cell', { name, exact: true })).toBeVisible();
  }

  const health = page.getByTestId('spec-001-health');
  await expect(health.getByRole('heading', { level: 2 })).toHaveText("Santé de l'API");
  await expect(health).toContainText('status : degraded');

  const regions = page.getByTestId('spec-001-regions');
  await expect(regions.getByRole('heading', { level: 2 })).toHaveText('Hébergement (BR-PLA-04)');
  await expect(page.getByTestId('region-vercel')).toHaveText('Vercel : fra1 — UE');
  await expect(page.getByTestId('region-supabase')).toHaveText('Supabase : eu-central-1 — UE');
  await expect(page.getByTestId('region-inngest')).toHaveText('Inngest : eu — UE');

  const clock = page.getByTestId('spec-001-clock');
  await expect(clock.getByRole('heading', { level: 2 })).toHaveText('Horloge injectable');
  await expect(clock).toContainText('CLOCK_FIXED_AT = 2026-11-11T12:20:00Z');
  await expect(clock).toContainText('clock.now() = 2026-11-11T12:20:00.000Z');

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

  const missing = await page.goto(['/_dev/sdd/SPEC', '999'].join('-'));
  expect(missing?.status()).toBe(404);
  const malformed = await page.goto('/_dev/sdd/abc');
  expect(malformed?.status()).toBe(404);
});

test('démonstration SPEC-001 conforme @SPEC-001 @visual', async ({ page }) => {
  await page.goto('/_dev/sdd/SPEC-001');
  const sections = page.locator('[data-testid^="spec-001-"]');
  const ids = await sections.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(ids).toEqual([
    'spec-001-workspace',
    'spec-001-health',
    'spec-001-regions',
    'spec-001-clock',
  ]);
  await expect(page).toHaveScreenshot('spec-001-demo.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });
});
