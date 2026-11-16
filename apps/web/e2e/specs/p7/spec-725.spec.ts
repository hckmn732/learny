import { randomUUID } from 'node:crypto';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const NOW = new Date('2026-11-11T12:20:00Z');
const PREFIX = 'sdd-725-e2e-';

let session: TestSession | null = null;

async function clearHostedAi(): Promise<void> {
  const alexId = demoUserId('alex');
  await serviceDb().execute(sql`delete from public.ai_calls where user_id = ${alexId}::uuid`);
  await serviceDb().execute(sql`delete from public.subscriptions where user_id = ${alexId}::uuid`);
}

async function seedActiveSubscription(spent: string): Promise<void> {
  const alexId = demoUserId('alex');
  await serviceDb().execute(sql`
    insert into public.subscriptions (user_id, status, current_period_end, daily_cap_usd)
    values (${alexId}::uuid, 'active', '2026-12-11T00:00:00Z'::timestamptz, 1.5)
    on conflict (user_id) do update
      set status = 'active', current_period_end = excluded.current_period_end,
          daily_cap_usd = excluded.daily_cap_usd
  `);
  await serviceDb().execute(sql`
    insert into public.ai_calls (
      user_id, task, provider, model, managed, cost_usd, status, created_at
    ) values (
      ${alexId}::uuid, 'light', 'anthropic', 'claude-haiku-4-5-20251001', true,
      ${spent}::numeric, 'ok', '2026-11-11T10:00:00Z'::timestamptz
    )
  `);
}

async function useDemoUser(
  context: import('@playwright/test').BrowserContext,
  baseURL: string | undefined,
  page: import('@playwright/test').Page,
): Promise<void> {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
  const demo = await createDemoSession(demoUserId('alex'), ALEX.email);
  await context.clearCookies();
  await context.addCookies(
    demo.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3125' })),
  );
  await page.clock.setFixedTime(NOW);
}

test.beforeAll(async () => {
  await restoreDemoData();
  await clearHostedAi();
});

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession({
    email: `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`,
  });
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
  `);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3125' })),
  );
});

test.afterEach(async () => {
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
});

test.afterAll(async () => {
  await clearHostedAi();
  await closeDb();
});

test('parcours SPEC-725 @SPEC-725', async ({ page, axeCheck, baseURL, context }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/parametres#modeles');

  // CA-1 — ni abonnement ni clé qualifiée : IA_UNAVAILABLE, le reste de l'écran demeure utilisable.
  const block = page.getByTestId('managed-ai-subscription');
  await expect(block).toBeVisible();
  await expect(page.getByTestId('managed-ai-status')).toHaveText('IA indisponible');
  await expect(page.getByTestId('managed-ai-unavailable')).toContainText('IA indisponible');
  await expect(page.getByTestId('managed-ai-subscribe')).toHaveText('Souscrire');
  await expect(page.getByTestId('managed-ai-usage')).toContainText('0,00 $');
  await expect(page.getByTestId('ai-models-task-list')).toBeVisible();

  // CA-2 — abonnement actif et consommation réelle : 80 % affiche la jauge et l'alerte.
  await useDemoUser(context, baseURL, page);
  await seedActiveSubscription('1.200000');
  await page.goto('/parametres#modeles');
  await page.reload();
  await expect(page.getByTestId('managed-ai-status')).toHaveText('IA fournie active');
  await expect(page.getByTestId('managed-ai-portal')).toHaveText('Gérer l’abonnement');
  await expect(page.getByTestId('managed-ai-usage')).toHaveText('1,20 $ dépensés sur 1,50 $');
  await expect(page.getByTestId('managed-ai-gauge')).toHaveAttribute('aria-valuenow', '80');
  await expect(page.getByTestId('managed-ai-cap-alert')).toContainText('80 %');

  // Au plafond, le programme est reporté et la date locale de reprise est affichée.
  await serviceDb().execute(sql`
    insert into public.ai_calls (
      user_id, task, provider, model, managed, cost_usd, status, created_at
    ) values (
      ${demoUserId('alex')}::uuid, 'light', 'anthropic', 'claude-haiku-4-5-20251001', true,
      0.5, 'ok', '2026-11-11T10:05:00Z'::timestamptz
    )
  `);
  await page.reload();
  await expect(page.getByTestId('managed-ai-gauge')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.getByTestId('managed-ai-cap-reached')).toContainText('Plafond atteint');
  await expect(page.getByTestId('managed-ai-cap-reached')).toContainText('jeudi 12 novembre');
  await expect(page.getByTestId('managed-ai-subscribe')).toHaveCount(0);

  // CL-4 — une erreur de lecture garde « Réessayer ».
  await page.route('**/api/v1/billing/subscription', (route) => route.abort());
  await page.reload();
  await expect(page.getByTestId('managed-ai-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  await page.unroute('**/api/v1/billing/subscription');
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByTestId('managed-ai-status')).toBeVisible();

  await axeCheck();
});

test('conformité SPEC-725 @SPEC-725 @visual', async ({
  page,
  axeCheck,
  baseURL,
  context,
}, testInfo) => {
  await useDemoUser(context, baseURL, page);
  await seedActiveSubscription('1.200000');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/parametres#modeles');

  const block = page.getByTestId('managed-ai-subscription');
  await expect(block).toBeVisible();
  await expect(page.getByTestId('managed-ai-status')).toHaveText('IA fournie active');
  await expect(page.getByTestId('managed-ai-usage')).toBeVisible();

  await expectTokens(page, {
    '[data-testid="managed-ai-subscription"]': { 'background-color': '#FFFFFF' },
    '[data-testid="managed-ai-gauge"]': { 'background-color': '#F4F4F1' },
  });
  await axeCheck();
  await expectScreenshotBaseline(block, 'spec-725-abonnement-ia-desktop.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await axeCheck();
  await expectScreenshotBaseline(
    page.getByTestId('managed-ai-subscription'),
    'spec-725-abonnement-ia-mobile.png',
  );
  await testInfo.attach('managed-ai-state', {
    body: JSON.stringify({ status: 'active', percent: 80 }),
    contentType: 'application/json',
  });
});
