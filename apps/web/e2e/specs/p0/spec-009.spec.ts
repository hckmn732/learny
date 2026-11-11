import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PUBLIC_ENV_KEYS } from '@learny/config';
import { expect, test } from '@learny/testing/playwright';
import {
  PROVISIONAL_TOKENS,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';

import { DEMO_SECRET_SENTINEL } from '../../../lib/sdd-config-demo';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const DEMO = '/_dev/sdd/SPEC-009';
// Values that must never reach the page: simulated secrets and provider key shapes.
const LEAKS = new RegExp([DEMO_SECRET_SENTINEL, 'BwcHBwc', 'sk-ant-', 'whsec_', 'signkey-'].join('|'));

test('inspecte la configuration @SPEC-009', async ({ page, consoleErrors }) => {
  await page.goto(DEMO);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Configuration');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  const environment = page.getByTestId('spec-009-environment');
  await expect(environment.getByRole('heading', { level: 2 })).toHaveText('Environnement');
  await expect(page.getByTestId('spec-009-app-env')).toHaveText('test');
  await expect(page.getByTestId('spec-009-public-count')).toHaveText(String(PUBLIC_ENV_KEYS.length));
  const serverCount = await page.getByTestId('spec-009-server-count').textContent();
  expect(Number(serverCount)).toBeGreaterThanOrEqual(50);

  // Secrets: presence only, and the simulated values never leak into the HTML.
  const secrets = page.getByTestId('spec-009-secrets');
  await expect(secrets.getByRole('row')).toHaveCount(7);
  for (const name of [
    'APP_ENCRYPTION_KEY',
    'ANTHROPIC_API_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'VAPID_PRIVATE_KEY',
    'STRIPE_SECRET_KEY',
    'RESEND_API_KEY',
  ]) {
    await expect(page.getByTestId(`spec-009-secret-${name.toLowerCase()}`)).toHaveText(
      `${name}configuré`,
    );
  }

  // A truncated production configuration names its fields and nothing else.
  const invalid = page.getByTestId('spec-009-invalid');
  await expect(invalid.getByTestId('spec-009-invalid-field')).toContainText([
    'ANTHROPIC_API_KEY',
    'APP_ENCRYPTION_KEY',
    'ENABLE_SDD_PAGES',
  ]);

  // Modes: the test environment is fully simulated.
  await expect(page.getByTestId('spec-009-mode-llm')).toHaveText('mock');
  await expect(page.getByTestId('spec-009-mode-stripe')).toHaveText('mock');
  await expect(page.getByTestId('spec-009-mode-email')).toHaveText('memory');
  await expect(page.getByTestId('spec-009-mode-push')).toHaveText('mock');

  // Public variables: the six white-listed keys, no server key.
  const publicSection = page.getByTestId('spec-009-public');
  await expect(publicSection.getByRole('row')).toHaveCount(PUBLIC_ENV_KEYS.length + 1);
  for (const key of PUBLIC_ENV_KEYS) {
    await expect(publicSection.getByTestId(`spec-009-public-${key.toLowerCase()}`)).toContainText(
      key,
    );
  }

  // Models per task (BR-IA-01).
  const models = page.getByTestId('spec-009-models');
  await expect(models.getByRole('row')).toHaveCount(6);
  await expect(page.getByTestId('spec-009-model-programme')).toHaveText(
    'Conception du programmeclaude-opus-5-5élevé',
  );
  await expect(page.getByTestId('spec-009-model-course')).toHaveText(
    'Rédaction du coursclaude-opus-5-5moyen',
  );
  await expect(page.getByTestId('spec-009-model-gaps')).toHaveText(
    'Analyse des lacunesclaude-opus-5-5moyen',
  );
  await expect(page.getByTestId('spec-009-model-tutor')).toHaveText(
    'Tuteur, questions et jeuxclaude-sonnet-5-5faible',
  );
  await expect(page.getByTestId('spec-009-model-light')).toHaveText(
    'Tâches légèresclaude-haiku-5-5aucun',
  );

  // Seven product constant families.
  await expect(page.getByTestId('spec-009-family')).toHaveCount(7);
  await expect(page.getByTestId('spec-009-product')).toContainText('magicLinkTtlMinutes');
  await expect(page.getByTestId('spec-009-product')).toContainText('retentionTargetPercent');

  const html = await page.content();
  expect(html).not.toMatch(LEAKS);
  expect(consoleErrors).toEqual([]);
  expect(html).not.toContain('APP_ENCRYPTION_KEY=learny');
});

test('configuration conforme @SPEC-009 @visual', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(DEMO);

  // Structure: the five regions in the order of the specification.
  const ids = await page
    .locator('[data-testid^="spec-009-"]:is(section)')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(ids).toEqual([
    'spec-009-environment',
    'spec-009-modes',
    'spec-009-public',
    'spec-009-models',
    'spec-009-product',
  ]);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Environnement',
    'Modes',
    'Variables publiques',
    'Modèles par tâche',
    'Constantes produit',
  ]);

  // Tokens (SPEC-001 §10, ADR-0059): border, radius, text and product fonts.
  await expectTokens(page, {
    '[data-testid="spec-009-environment"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    body: { color: PROVISIONAL_TOKENS.color.text },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Space Grotesk/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  // Scrollable tables are named, keyboard-reachable regions.
  for (const name of ['Secrets', 'Modes', 'Variables publiques', 'Modèles par tâche']) {
    const region = page.getByRole('region', { name });
    await expect(region, name).toHaveCount(1);
    await expect(region, name).toHaveAttribute('tabindex', '0');
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-009-demo.png', { fullPage: true });
  await captureEvidence('spec-009-desktop');

  // 390 px: single column, no horizontal overflow, named scrollable regions.
  await page.setViewportSize({ width: 390, height: 844 });
  const lefts = await page
    .locator('section[data-testid^="spec-009-"]')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  expect(new Set(lefts).size).toBe(1);
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  ]);
  for (const width of widths) expect(width).toBeLessThanOrEqual(390);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-009-demo-mobile.png', { fullPage: true });
  await captureEvidence('spec-009-mobile');
});

test('refuse le démarrage en production incomplète @SPEC-009', async () => {
  const port = 3105;
  const output: string[] = [];
  // learny-test-only: values that must never be echoed by the startup error.
  const child = spawn(
    'pnpm',
    ['--filter', '@learny/web', 'exec', 'next', 'start', '-p', String(port)],
    {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        APP_ENV: 'production',
        ENABLE_SDD_PAGES: 'true',
        DATABASE_URL: 'postgresql://learny:learny-test-only-LEAK@db.example:5432/learny',
        ANTHROPIC_API_KEY: 'sk-ant-learny-test-only-LEAK', // learny-test-only
      },
    },
  );
  child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString()));

  try {
    const outcome = await Promise.race([
      new Promise<number | null>((resolve) => {
        child.once('exit', (code) => {
          resolve(code);
        });
      }),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => {
          resolve('timeout');
        }, 30000);
      }),
    ]);

    const text = output.join('');
    expect(outcome, 'le serveur de production doit s’arrêter').not.toBe('timeout');
    expect(outcome).not.toBe(0);
    expect(text).toContain('Configuration production invalide');
    expect(text).toContain('APP_ENCRYPTION_KEY');
    expect(text).toContain('ENABLE_SDD_PAGES');
    expect(text).not.toContain('LEAK');

    const health = await fetch(`http://127.0.0.1:${String(port)}/api/v1/health`).catch(
      () => null,
    );
    expect(health).toBeNull();
  } finally {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // Already stopped: the startup refused the production environment.
      }
    }
  }
});
