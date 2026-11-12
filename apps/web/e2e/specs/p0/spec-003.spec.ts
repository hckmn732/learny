import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import {
  indexCatalog,
  nextAction,
  normalizeState,
  progressSummary,
  type DisplayStatus,
  type RawCatalog,
} from '../../../../../tools/sdd/core.mjs';
import { sddDemos } from '../../../app/%5Fdev/sdd/registry';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const FIXED_TIME = new Date('2026-11-11T12:20:00Z');

const STATUS_LABELS: Record<DisplayStatus, string> = {
  pending: 'En attente',
  ready: 'Prête',
  waiting: 'En attente de dépendances',
  in_progress: 'En cours',
  done: 'Terminée',
  blocked: 'Bloquée',
  dependency_blocked: 'Bloquée par une dépendance',
};

function expectedSummary() {
  const catalog = indexCatalog(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'specs/catalog.json'), 'utf8')) as RawCatalog,
  );
  const st = normalizeState(
    catalog,
    JSON.parse(fs.readFileSync(path.join(ROOT, 'progress/state.json'), 'utf8')),
  );
  return { ...progressSummary(catalog, st), next: nextAction(catalog, st) };
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TIME);
});

test('consulte la progression SDD @SPEC-003', async ({ page }) => {
  const sum = expectedSummary();
  await page.goto('/_dev/sdd');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Progression SDD');

  const value = (id: string) =>
    page.getByTestId(`sdd-indicator-${id}`).getByTestId('sdd-indicator-value');
  await expect(value('total')).toHaveText(String(sum.total));
  await expect(value('done')).toHaveText(String(sum.done));
  await expect(value('in-progress')).toHaveText(String(sum.inProgress));
  await expect(value('blocked')).toHaveText(String(sum.blocked + sum.dependencyBlocked));
  await expect(page.getByTestId('sdd-index-live')).toContainText(
    `${String(sum.done)} spécification(s) terminée(s) sur ${String(sum.total)}`,
  );

  // Expectations follow the live state: the index must mirror state.json, whatever spec is running.
  const next = sum.next;
  if (next.kind === 'resume' || next.kind === 'start') {
    const verb = next.kind === 'resume' ? 'Reprendre' : 'Démarrer';
    await expect(page.getByTestId('sdd-index-next')).toContainText(`${verb} ${next.spec.id}`);
  } else if (next.kind === 'checkpoint') {
    await expect(page.getByTestId('sdd-index-next')).toContainText(`Checkpoint ${next.checkpoint}`);
  }
  for (const id of ['SPEC-001', 'SPEC-003', 'SPEC-013']) {
    const status = sum.displayStatuses[id] ?? 'pending';
    await expect(page.getByTestId(`sdd-spec-${id}`).getByTestId('sdd-spec-status')).toHaveText(
      STATUS_LABELS[status],
    );
  }
  await expect(page.getByTestId('sdd-index-specs').getByRole('row')).toHaveCount(sum.total + 1);

  // A specification without a registered demo is not a link; the registry grows with each spec.
  const unregistered = Object.keys(sum.displayStatuses).find((id) => !Object.hasOwn(sddDemos, id));
  if (unregistered === undefined) throw new Error('aucune spécification sans démonstration');
  await expect(page.getByTestId(`sdd-spec-${unregistered}`).getByRole('link')).toHaveCount(0);

  await page.getByTestId('sdd-spec-SPEC-001').getByRole('link', { name: 'SPEC-001' }).click();
  await expect(page).toHaveURL(/\/_dev\/sdd\/SPEC-001$/);
  await expect(page.getByTestId('sdd-demo-spec')).toHaveText('SPEC-001');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Progression SDD');
});

test('masque les pages SDD @SPEC-003', async () => {
  // A second server without ENABLE_SDD_PAGES, as in production.
  const port = 3101;
  const server: ChildProcess = spawn(
    'pnpm',
    ['--filter', '@learny/web', 'exec', 'next', 'start', '-p', String(port)],
    {
      cwd: ROOT,
      env: { ...process.env, ENABLE_SDD_PAGES: '', APP_ENV: 'test' },
      stdio: 'ignore',
      detached: true,
    },
  );
  try {
    const base = `http://127.0.0.1:${String(port)}`;
    await expect
      .poll(async () => (await fetch(`${base}/api/v1/health`).catch(() => null))?.status, {
        timeout: 30000,
      })
      .toBe(200);
    for (const route of ['/_dev/sdd', '/_dev/sdd/SPEC-001']) {
      const res = await fetch(`${base}${route}`);
      expect(res.status, route).toBe(404);
      expect(await res.text()).not.toContain('Progression SDD');
    }
  } finally {
    if (server.pid) process.kill(-server.pid, 'SIGTERM');
  }
});

test('index SDD conforme @SPEC-003 @visual', async ({ page }) => {
  await page.goto('/_dev/sdd');
  const regions = await page
    .locator('[data-testid^="sdd-index-"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(regions).toEqual([
    'sdd-index-live',
    'sdd-index-indicators',
    'sdd-index-progress',
    'sdd-index-next',
    'sdd-index-phases',
    'sdd-index-specs',
  ]);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Prochaine action',
    'Phases',
    'Spécifications',
  ]);
  await expect(page.getByRole('region', { name: 'Tableau des phases' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Tableau des spécifications' })).toBeVisible();

  // Tokens of the demo shell (SPEC-001 §10): border #E7E6E1, radius 16px, text #111113.
  const next = page.getByTestId('sdd-index-next');
  await expect(next).toHaveCSS('border-top-color', 'rgb(231, 230, 225)');
  await expect(next).toHaveCSS('border-top-left-radius', '16px');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(17, 17, 19)');

  // Live values change with every completed specification and can change text wrapping:
  // freeze the table layout and row heights before masking the dynamic cells.
  await page.addStyleTag({
    content: `
      [data-testid="sdd-index-specs"] table,
      [data-testid="sdd-index-phases"] table { table-layout: fixed; }
      [data-testid="sdd-index-specs"] tbody tr { height: 44px; }
      [data-testid="sdd-index-specs"] td,
      [data-testid="sdd-index-next"] p { white-space: nowrap; overflow: hidden; }
    `,
  });
  const mask = [
    page.getByTestId('sdd-index-live'),
    page.getByTestId('sdd-indicator-value'),
    page.getByTestId('sdd-index-progress'),
    next.locator('p'),
    page.locator('tbody'),
  ];
  await expect(page).toHaveScreenshot('sdd-status.png', { maxDiffPixelRatio: 0.01, mask });

  await page.setViewportSize({ width: 390, height: 844 });
  const boxes = await page
    .getByTestId('sdd-index-indicators')
    .locator('li')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  expect(new Set(boxes).size).toBe(1);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
  await expect(page).toHaveScreenshot('sdd-status-mobile.png', { maxDiffPixelRatio: 0.01, mask });
});
