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
  // SPEC-006 enriched the body; SPEC-101 probes the configured test database (status ok).
  expect(await health.json()).toMatchObject({ status: 'ok', database: 'ok' });

  const post = await request.post('/api/v1/health');
  expect(post.status()).toBe(405);
});

