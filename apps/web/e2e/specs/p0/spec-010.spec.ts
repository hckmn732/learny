import { expect, test } from '@learny/testing/playwright';
import { PROVISIONAL_TOKENS, expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

import {
  DEMO_API_KEY,
  DEMO_APPORT,
  DEMO_EMAIL,
  DEMO_REQUEST_ID,
} from '../../../lib/sdd-observability-demo';

const DEMO = '/_dev/sdd/SPEC-010';
// Fictitious values that must never appear as-is: only their redacted form may reach the page.
const LEAKS = new RegExp([DEMO_EMAIL, DEMO_API_KEY, DEMO_APPORT].join('|'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('inspecte le diagnostic @SPEC-010', async ({ page, request, consoleErrors }) => {
  await page.goto(DEMO);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Observabilité');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  // Correlation: one requestId shared by the four sections (CA-1).
  const requestId = page.getByTestId('spec-010-request-id');
  await expect(requestId).toHaveText(DEMO_REQUEST_ID);
  await expect(page.getByTestId('spec-010-user-id')).toHaveText('user-spec010-demo');
  await expect(page.getByTestId('spec-010-route')).toHaveText('/api/v1/health');

  // Redacted log: real pino bytes, fake address and key replaced (CA-2).
  const log = JSON.parse(
    (await page.getByTestId('spec-010-log-json').textContent()) ?? '{}',
  ) as Record<string, unknown>;
  expect(log).toMatchObject({
    level: 'warn',
    timestamp: '2026-11-11T12:20:00.000Z',
    requestId: DEMO_REQUEST_ID,
    userId: 'user-spec010-demo',
    route: '/api/v1/demo',
    method: 'POST',
    status: 400,
    code: 'VALIDATION_FAILED',
  });
  expect(String(log.message)).toContain('[Redacted]');
  expect(String(log.message)).not.toMatch(LEAKS);
  expect(log).not.toHaveProperty('email');
  expect(log).not.toHaveProperty('nested');

  // Safe error: code, status and the same requestId; no stack, no exception content (EF-3).
  await expect(page.getByTestId('spec-010-error-status')).toHaveText('400');
  await expect(page.getByTestId('spec-010-error-code')).toHaveText('VALIDATION_FAILED');
  await expect(page.getByTestId('spec-010-error-request-id')).toHaveText(DEMO_REQUEST_ID);
  const problem = JSON.parse(
    (await page.getByTestId('spec-010-error-json').textContent()) ?? '{}',
  ) as Record<string, unknown>;
  expect(problem).toMatchObject({
    type: 'about:blank',
    status: 400,
    code: 'VALIDATION_FAILED',
    requestId: DEMO_REQUEST_ID,
  });
  expect(JSON.stringify(problem)).not.toMatch(/stack|\.ts:/);

  // Health: base and build states, plus the three probe states with icon and text (EF-5).
  await expect(page.getByTestId('spec-010-health-database')).toContainText('Disponible');
  await expect(page.getByTestId('spec-010-health-build')).toContainText('Disponible');
  await expect(page.getByTestId('spec-010-health-probe-ok')).toContainText('Disponible');
  await expect(page.getByTestId('spec-010-health-probe-unavailable')).toContainText('Indisponible');
  await expect(page.getByTestId('spec-010-health-probe-not_configured')).toContainText(
    'Non configurée',
  );

  const html = await page.content();
  expect(html).not.toMatch(LEAKS);
  expect(consoleErrors).toEqual([]);

  // The real route echoes a bounded identifier and generates one when the input is unsafe
  // (EF-1, ET-3).
  const echoed = await request.get('/api/v1/health', {
    headers: { 'x-request-id': 'req-e2e-health' },
  });
  expect(echoed.headers()['x-request-id']).toBe('req-e2e-health');
  const health = (await echoed.json()) as Record<string, unknown>;
  expect(health).toMatchObject({
    status: 'degraded',
    database: 'not_configured',
    components: { database: 'not_configured', build: 'not_configured' },
  });

  const generated = await request.get('/api/v1/health', {
    headers: { 'x-request-id': 'bad header with spaces' },
  });
  expect(generated.headers()['x-request-id']).toMatch(UUID);
  expect(generated.headers()['x-request-id']).not.toBe('bad header with spaces');
});

test('diagnostic conforme @SPEC-010 @visual', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(DEMO);

  const ids = await page
    .locator('[data-testid^="spec-010-"]:is(section)')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(ids).toEqual([
    'spec-010-context',
    'spec-010-log',
    'spec-010-error',
    'spec-010-health',
  ]);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Corrélation',
    'Journal expurgé',
    'Erreur sûre',
    'Santé',
  ]);

  // Tokens of the demo shell (SPEC-001 §10, ADR-0059).
  await expectTokens(page, {
    '[data-testid="spec-010-context"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    body: { color: PROVISIONAL_TOKENS.color.text },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Space Grotesk/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  // The formatted JSON is a named, keyboard-reachable scroll region.
  for (const name of ['Journal JSON formaté', 'Corps problem+json']) {
    const region = page.getByRole('region', { name });
    await expect(region, name).toHaveCount(1);
    await expect(region, name).toHaveAttribute('tabindex', '0');
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-010-demo.png', { fullPage: true });
  await captureEvidence('spec-010-desktop');

  // 390 px: one column, no page overflow, the JSON scrolls inside its named region.
  await page.setViewportSize({ width: 390, height: 844 });
  const lefts = await page
    .locator('section[data-testid^="spec-010-"]')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  expect(new Set(lefts).size).toBe(1);
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  ]);
  for (const width of widths) expect(width).toBeLessThanOrEqual(390);
  const logRegion = page.getByRole('region', { name: 'Journal JSON formaté' });
  const overflow = await logRegion.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflow).toBe(true);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-010-demo-mobile.png', { fullPage: true });
  await captureEvidence('spec-010-mobile');
});
