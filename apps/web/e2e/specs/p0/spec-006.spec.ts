import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

import { scanText } from '@learny/config';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const FIXED_TIME = new Date('2026-11-11T12:20:00Z');
const AXE_SCRIPT = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const DEMO = '/_dev/sdd/SPEC-006';
// Internal details that must never reach the page or the browser console.
const LEAKS = /Erreur simulée|\n\s+at |\.js:\d+:\d+|ECONNREFUSED|db\.internal/;

interface AxeViolation {
  id: string;
  impact: string | null;
  nodes: { target: string[] }[];
}

async function expectNoSeriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const violations = await page.evaluate(async () => {
    const { axe } = window as unknown as {
      axe: { run: (ctx: Document) => Promise<{ violations: AxeViolation[] }> };
    };
    return (await axe.run(document)).violations;
  });
  const blocking = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(blocking).toEqual([]);
}

async function startServer(port: number, env: Record<string, string>): Promise<ChildProcess> {
  const server = spawn(
    'pnpm',
    ['--filter', '@learny/web', 'exec', 'next', 'start', '-p', String(port)],
    { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'ignore', detached: true },
  );
  await expect
    .poll(
      async () =>
        (await fetch(`http://127.0.0.1:${String(port)}/api/v1/health`).catch(() => null))?.status,
      { timeout: 30000 },
    )
    .toBe(200);
  return server;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
});

test('inspecte la santé @SPEC-006', async ({ page, request }) => {
  const consoleMessages: string[] = [];
  page.on('console', (m) => consoleMessages.push(m.text()));
  page.on('pageerror', (e) => consoleMessages.push(`${e.message}\n${e.stack ?? ''}`));

  // Public route: GET without session, uncached, SPEC-006 fields plus SPEC-010 components;
  // POST is refused.
  const health = await request.get('/api/v1/health');
  expect(health.status()).toBe(200);
  expect(health.headers()['cache-control']).toBe('no-store');
  expect(health.headers()['content-type']).toBe('application/json; charset=utf-8');
  const body = (await health.json()) as Record<string, unknown>;
  expect(body).toEqual({
    status: 'degraded',
    version: 'dev',
    commit: 'unknown',
    database: 'not_configured',
    components: { database: 'not_configured', build: 'not_configured' },
  });
  expect(scanText(JSON.stringify(body), 'health')).toEqual([]);
  expect((await request.post('/api/v1/health')).status()).toBe(405);

  await page.goto(DEMO);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Application web : configuration de base, santé et pages de démonstration',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  const healthSection = page.getByTestId('spec-006-health');
  await expect(healthSection.getByRole('heading', { level: 2 })).toHaveText(
    'Santé de l’application',
  );
  await expect(page.getByTestId('spec-006-health-status')).toHaveText('degraded');
  await expect(page.getByTestId('spec-006-health-version')).toHaveText('dev');
  await expect(page.getByTestId('spec-006-health-commit')).toHaveText('unknown');
  await expect(page.getByTestId('spec-006-health-database')).toHaveText('not_configured');
  await expect(page.getByTestId('spec-006-probe-ok').getByRole('cell')).toHaveText([
    'Base saine',
    '200',
    'ok',
    'ok',
  ]);
  await expect(page.getByTestId('spec-006-probe-unavailable').getByRole('cell')).toHaveText([
    'Base indisponible (connexion refusée)',
    '503',
    'degraded',
    'unavailable',
  ]);
  await expect(page.getByTestId('spec-006-probe-not_configured').getByRole('cell')).toHaveText([
    'Base non configurée (avant SPEC-101)',
    '200',
    'degraded',
    'not_configured',
  ]);

  const sdd = page.getByTestId('spec-006-sdd');
  await expect(page.getByTestId('spec-006-sdd-current')).toHaveText(
    'Garde actuel : pages accessibles · robots : noindex, nofollow',
  );
  await expect(sdd.getByTestId('spec-006-guard-case')).toHaveText([
    'truetestpages accessibles',
    'TRUEtestpages en 404',
    '1testpages en 404',
    '(vide)testpages en 404',
    '(absente)testpages en 404',
    'trueproductionpages en 404',
  ]);
  for (const id of ['SPEC-001', 'SPEC-002', 'SPEC-006']) {
    await expect(page.getByTestId('spec-006-sdd-registry')).toContainText(id);
  }

  const result = page.getByTestId('spec-006-client-result');
  await expect(result).toHaveAttribute('aria-live', 'polite');
  await expect(result).toHaveText('Aucun appel effectué.');
  await page.getByRole('button', { name: 'Appeler GET /api/v1/health' }).click();
  await expect(result).toHaveText('Succès : status degraded, database not_configured.');
  await page.getByRole('button', { name: 'Simuler une erreur problem+json' }).click();
  await expect(result).toContainText(
    'Erreur MODULE_LOCKED : Ce module est verrouillé tant que le précédent n’est pas validé.',
  );
  await expect(result).toContainText('Identifiant de requête : req-spec006-demo');

  // Unexpected error in a page component: safe French page, retry, no stack, no detail.
  await page.getByRole('button', { name: 'Simuler une erreur de page' }).click();
  const errorPage = page.getByTestId('system-error');
  await expect(errorPage.getByRole('heading', { level: 1 })).toHaveText('Une erreur est survenue');
  await expect(page.getByTestId('system-error-request-id')).toHaveText(
    'Identifiant de requête : req-spec006-page',
  );
  await expect(errorPage.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute(
    'href',
    '/',
  );
  const html = await page.content();
  expect(html).not.toMatch(LEAKS);
  expect(consoleMessages.join('\n')).not.toMatch(LEAKS);
  expect(consoleMessages).toContain(
    JSON.stringify({ msg: 'page error', code: 'INTERNAL_ERROR', requestId: 'req-spec006-page' }),
  );

  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByTestId('spec-006-client')).toBeVisible();
  await expect(page.getByTestId('system-error')).toHaveCount(0);
});

test('répond 404 hors garde et pour un identifiant inconnu @SPEC-006', async ({ page }) => {
  for (const path of [['/_dev/sdd/SPEC', '999'].join('-'), '/_dev/sdd/abc', `${DEMO}/x`]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    expect(res?.headers()['x-robots-tag'], path).toBe('noindex, nofollow');
  }
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable');
  await expect(page.getByRole('link', { name: 'Retour à l’accueil' })).toBeVisible();

  // Same build, guard refused: the flag is not exactly "true".
  const servers = [{ port: 3102, env: { ENABLE_SDD_PAGES: '1', APP_ENV: 'test' } }];
  for (const { port, env } of servers) {
    const server = await startServer(port, env);
    try {
      for (const route of ['/_dev/sdd', '/_dev/sdd/SPEC-001', DEMO]) {
        const res = await fetch(`http://127.0.0.1:${String(port)}${route}`);
        expect(res.status, `${String(port)} ${route}`).toBe(404);
        const text = await res.text();
        expect(text).not.toContain('Progression SDD');
        expect(text).not.toContain('Santé de l’application');
      }
    } finally {
      if (server.pid) process.kill(-server.pid, 'SIGTERM');
    }
  }

  // Production: SPEC-009 refuses the boot outright, so the pages can never be served. The
  // dedicated start-up check lives in spec-009.spec.ts (ADR-0227).
  const production = spawn(
    'pnpm',
    ['--filter', '@learny/web', 'exec', 'next', 'start', '-p', '3103'],
    {
      cwd: ROOT,
      env: { ...process.env, ENABLE_SDD_PAGES: 'true', APP_ENV: 'production' },
      stdio: 'ignore',
      detached: true,
    },
  );
  try {
    const stopped = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolve(false);
      }, 30000);
      production.once('exit', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    expect(stopped, 'un serveur de production ne démarre pas').toBe(true);
  } finally {
    if (production.pid) {
      try {
        process.kill(-production.pid, 'SIGTERM');
      } catch {
        // Already stopped: SPEC-009 refuses an incomplete production environment.
      }
    }
  }
});

test('démonstration web conforme @SPEC-006 @visual', async ({ page }) => {
  await page.goto(DEMO);

  // Structure: the three regions in order.
  const ids = await page
    .locator('[data-testid^="spec-006-"]:is(section)')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(ids).toEqual(['spec-006-health', 'spec-006-sdd', 'spec-006-client']);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Santé de l’application',
    'Pages de démonstration',
    'Client API',
  ]);

  // Tokens (SPEC-001 §10, ADR-0059): border #E7E6E1, radius 16px, text #111113, product fonts.
  const card = page.getByTestId('spec-006-health');
  await expect(card).toHaveCSS('border-top-color', 'rgb(231, 230, 225)');
  await expect(card).toHaveCSS('border-top-left-radius', '16px');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(17, 17, 19)');
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Space Grotesk/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page).toHaveTitle('Learny');
  // Both product fonts are really loaded, not replaced by a fallback.
  const fontsLoaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return ['body', 'h1'].map((selector) => {
      const el = document.querySelector(selector);
      const first = el ? (getComputedStyle(el).fontFamily.split(',')[0] ?? '') : '';
      return [first, document.fonts.check(`16px ${first}`)] as const;
    });
  });
  expect(fontsLoaded).toEqual([
    [expect.stringMatching(/Inter/), true],
    [expect.stringMatching(/Space Grotesk/), true],
  ]);

  await expectNoSeriousAxeViolations(page);

  // The list of registered demos grows with every specification. Masking alone would still let
  // its height shift the page; hide it so the baseline only covers the stable page chrome.
  await page
    .getByTestId('spec-006-sdd-registry')
    .evaluate((element) => { element.setAttribute('style', 'display:none'); });
  await expect(page).toHaveScreenshot('spec-006-demo.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const lefts = await page
    .locator('section[data-testid^="spec-006-"]')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  expect(new Set(lefts).size).toBe(1);
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  ]);
  for (const w of widths) expect(w).toBeLessThanOrEqual(390);
  await expectNoSeriousAxeViolations(page);
  await expect(page).toHaveScreenshot('spec-006-demo-mobile.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  });

  // Error page capture: French message, retry action, no stack.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Simuler une erreur de page' }).click();
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  expect(await page.content()).not.toMatch(LEAKS);
  await expectNoSeriousAxeViolations(page);
  await expect(page).toHaveScreenshot('spec-006-error.png', { maxDiffPixelRatio: 0.01 });
});
