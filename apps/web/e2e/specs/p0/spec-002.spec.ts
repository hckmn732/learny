import { expect, test, } from '@playwright/test';

const FIXED_TIME = new Date('2026-11-11T12:20:00Z');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
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

