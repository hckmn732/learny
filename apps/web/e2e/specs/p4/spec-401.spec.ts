import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createSeededRandom, fnv1a32 } from '@learny/learning-engine';
import { SAP_LINKS, SAP_MODULES, SAP_NOTIONS } from '@learny/learning-engine/fixtures';
import { expect, test } from '@learny/testing/playwright';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const PAGE = '/_dev/sdd/SPEC-401';
const REGIONS = ['engine-params', 'sap-reference', 'time-cases', 'random-cases'];

test('page de démonstration du socle du moteur @SPEC-401', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(PAGE);

  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveText('SPEC-401 · Socle du moteur');
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  // Region 1 — one row per top-level ENGINE key.
  await expect(page.locator('[data-testid^="engine-param-"]')).toHaveCount(10);
  await expect(page.getByTestId('engine-param-mastery')).toContainText('demi-vie 14 j');
  await expect(page.getByTestId('engine-param-mastery')).toContainText('seuil 80 %');
  await expect(page.getByTestId('engine-param-fsrs')).toContainText('rétention 0,90');

  // Region 2 — computed statistics and the seven module rows.
  const statCards = page.locator('[data-testid="sap-reference"] .stat-card');
  await expect(statCards).toHaveCount(4);
  await expect(statCards.nth(0)).toContainText(new RegExp(`${String(SAP_MODULES.length)}\\s*modules`));
  await expect(statCards.nth(1)).toContainText(/24\s*chapitres/);
  await expect(statCards.nth(2)).toContainText(new RegExp(`${String(SAP_NOTIONS.length)}\\s*notions`));
  await expect(statCards.nth(3)).toContainText(new RegExp(`${String(SAP_LINKS.length)}\\s*liens`));
  await expect(page.locator('[data-testid^="sap-module-"]')).toHaveCount(7);
  await expect(page.getByTestId('sap-module-sap-m3')).toContainText('Comptabilité générale');
  await expect(page.getByTestId('sap-module-sap-m3')).toContainText('2026-11-09 → 2026-11-13');
  await expect(page.getByTestId('sap-module-sap-m3')).toContainText('4');

  // Region 3 — every time case of CL-3/CL-4 is green.
  const badges = page.locator('[data-testid^="time-case-badge-"]');
  await expect(badges).toHaveCount(7);
  expect(await badges.allTextContents()).toEqual(Array.from({ length: 7 }, () => '✓'));

  // Region 4 — control values of FNV-1a and the first five draws of the demo seed.
  await expect(page.getByTestId('fnv-empty')).toHaveText(String(fnv1a32('')));
  await expect(page.getByTestId('fnv-a')).toHaveText(String(fnv1a32('a')));
  const random = createSeededRandom('SPEC-401');
  const draws = Array.from({ length: 5 }, () => random().toFixed(6));
  expect(await page.locator('[data-testid^="random-draw-"]').allTextContents()).toEqual(draws);

  await axeCheck();
  await captureEvidence('spec-401-demo');
  expect(consoleErrors).toEqual([]);
});

test('pages de démonstration désactivées @SPEC-401', async () => {
  const port = 3112;
  const server = spawn(
    'pnpm',
    ['--filter', '@learny/web', 'exec', 'next', 'start', '-p', String(port)],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        ENABLE_SDD_PAGES: 'false',
        APP_ENV: 'test',
        CLOCK_FIXED_AT: '2026-11-11T12:20:00Z',
        LLM_MODE: 'mock',
      },
      stdio: 'ignore',
      detached: true,
    },
  );

  try {
    await expect
      .poll(
        async () =>
          (await fetch(`http://127.0.0.1:${String(port)}/api/v1/health`).catch(() => null))
            ?.status,
        { timeout: 30000 },
      )
      .toBe(200);

    const response = await fetch(`http://127.0.0.1:${String(port)}${PAGE}`);
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain('Socle du moteur');
  } finally {
    if (server.pid) process.kill(-server.pid, 'SIGTERM');
  }
});

test('conformité visuelle du socle @SPEC-401 @visual', async ({ page, axeCheck }) => {
  await page.goto(PAGE);

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1' },
    '[data-testid="sap-reference"] .stat-card:first-child': { 'background-color': '#111113' },
    '[data-testid="sap-reference"] .stat-card:first-child span:first-child': { color: '#C6F432' },
    '[data-testid="sap-reference"] .stat-card:nth-child(2)': {
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="engine-params"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-top-left-radius': '21.6px',
    },
  });
  const title = page.getByTestId('sdd-title');
  await expect(title).toHaveCSS('font-size', '30.6px');
  await expect(title).toHaveCSS('font-family', /Space[_ ]Grotesk/);

  const regions = await page
    .locator('main > section[data-testid]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(regions).toEqual(REGIONS);

  const badges = page.locator('[data-testid^="time-case-badge-"]');
  expect(await badges.allTextContents()).toEqual(Array.from({ length: 7 }, () => '✓'));

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-401-demo.png', { fullPage: true });
});
