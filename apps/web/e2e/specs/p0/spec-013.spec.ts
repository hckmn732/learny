import { expect, test } from '@learny/testing/playwright';
import {
  PROVISIONAL_TOKENS,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';

const DEMO = '/_dev/sdd/SPEC-013';

const SECTIONS = ['spec-013-environments', 'spec-013-regions', 'spec-013-dry-run'];

test('inspecte les régions de déploiement @SPEC-013', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(DEMO);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Déploiement géré');
  await expect(page.getByTestId('sdd-demo-title')).toHaveText('Déploiement géré');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

  // Environment matrix: four components and four environments (local, test, preview, production).
  const matrix = page.getByTestId('spec-013-environments-table');
  await expect(matrix.getByRole('row')).toHaveCount(5);
  for (const component of ['web', 'base', 'jobs', 'ai']) {
    await expect(page.getByTestId(`spec-013-component-${component}`)).toBeVisible();
  }
  await expect(page.getByTestId('spec-013-cell-web-local')).toContainText('pnpm dev');
  await expect(page.getByTestId('spec-013-cell-web-preview')).toContainText('Non configuré');
  await expect(page.getByTestId('spec-013-cell-base-production')).toContainText('Non configuré');
  await expect(page.getByTestId('spec-013-cell-jobs-preview')).toContainText('Non configuré');
  await expect(page.getByTestId('spec-013-cell-ai-test')).toContainText('mock obligatoire');

  // Three expected regions, always in the Vercel, Supabase, Inngest order.
  const regions = page.getByTestId('spec-013-regions').getByRole('listitem');
  await expect(regions).toHaveCount(3);
  await expect(regions.nth(0)).toContainText('Vercel');
  await expect(regions.nth(0)).toContainText('fra1');
  await expect(regions.nth(1)).toContainText('Supabase');
  await expect(regions.nth(1)).toContainText('eu-central-1');
  await expect(regions.nth(2)).toContainText('Inngest');
  await expect(regions.nth(2)).toContainText('eu');
  for (const index of [0, 1, 2]) await expect(regions.nth(index)).toContainText('UE');

  const dryRun = page.getByTestId('spec-013-dry-run');
  await expect(page.getByTestId('spec-013-dry-run-status')).toHaveText(
    'configuration statique vérifiée',
  );
  await expect(page.getByTestId('spec-013-dry-run-environment')).toHaveText('preview');
  await expect(page.getByTestId('spec-013-dry-run-action-check')).toContainText('dépôt local');
  for (const action of ['migrate', 'sync-inngest', 'vercel', 'smoke']) {
    await expect(page.getByTestId(`spec-013-dry-run-action-${action}`)).toContainText(
      'Non configuré',
    );
  }
  await expect(page.getByTestId('spec-013-dry-run-errors')).toHaveText('Aucun');
  await expect(dryRun).toContainText('Aucun appel réseau');

  // No deployment trigger, no token and no fictitious provider URL.
  await expect(page.getByRole('button')).toHaveCount(0);
  const html = await page.content();
  expect(html).not.toMatch(/sk-[A-Za-z0-9]{8,}|eyJhbGci|learny-test-only/);
  expect(html).not.toContain('/actions/runs/');
  expect(html).not.toContain('github.com/hckmn732/learny/actions');
  expect(html).not.toContain('SUPABASE_DB_URL=');

  await axeCheck();
  await captureEvidence('spec-013-final');
  expect(consoleErrors).toEqual([]);
});

test('déploiement conforme @SPEC-013 @visual', async ({ page, axeCheck, captureEvidence }) => {
  await page.goto(DEMO);

  const ids = await page
    .locator('section[data-testid^="spec-013-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(ids).toEqual(SECTIONS);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Matrice des environnements',
    'Régions UE',
    'Dernier contrôle local (--dry-run)',
  ]);

  await expectTokens(page, {
    '[data-testid="spec-013-environments"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
      'border-top-left-radius': PROVISIONAL_TOKENS.radius.card,
    },
    '[data-testid="spec-013-regions"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
    },
    '[data-testid="spec-013-dry-run"]': {
      'border-top-color': PROVISIONAL_TOKENS.color.border,
    },
    body: { color: PROVISIONAL_TOKENS.color.text },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Space Grotesk/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  // Scrollable tables are named and keyboard-reachable (WCAG 2.1.1).
  for (const name of ['Matrice des environnements', 'Actions prévues']) {
    const region = page.getByRole('region', { name });
    await expect(region, name).toHaveCount(1);
    await expect(region, name).toHaveAttribute('tabindex', '0');
  }

  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-013-demo-desktop.png', { fullPage: true });
  await captureEvidence('spec-013-desktop');

  // 390 px: single column, no horizontal overflow, still accessible.
  await page.setViewportSize({ width: 390, height: 844 });
  const lefts = await page
    .locator('section[data-testid^="spec-013-"]')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
  expect(new Set(lefts).size).toBe(1);
  const widths = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
  ]);
  for (const width of widths) expect(width).toBeLessThanOrEqual(390);
  await axeCheck();
  await expectScreenshotBaseline(page, 'spec-013-demo-mobile.png', { fullPage: true });
  await captureEvidence('spec-013-mobile');
});
