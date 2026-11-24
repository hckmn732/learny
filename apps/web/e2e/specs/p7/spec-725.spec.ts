import { randomUUID } from 'node:crypto';

import { closeDb, serviceDb, sql } from '@learny/testing/db';
import { DEMO_USERS, demoUserId } from '@learny/testing/db-factories';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

// SPEC-725 (ADR-0340) — onglet « Abonnement » : droit d'utiliser l'application, gratuit par défaut,
// sans aucune notion d'IA fournie, de plafond ni de consommation.

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const NOW = new Date('2026-11-11T12:20:00Z');
const PREFIX = 'sdd-725-e2e-';

let session: TestSession | null = null;

async function clearSubscription(): Promise<void> {
  const alexId = demoUserId('alex');
  await serviceDb().execute(sql`delete from public.subscriptions where user_id = ${alexId}::uuid`);
}

async function seedSubscription(status: 'active' | 'past_due'): Promise<void> {
  const alexId = demoUserId('alex');
  await serviceDb().execute(sql`
    insert into public.subscriptions (user_id, status, current_period_end)
    values (${alexId}::uuid, ${status}::subscription_status, '2026-12-11T00:00:00Z'::timestamptz)
    on conflict (user_id) do update
      set status = excluded.status, current_period_end = excluded.current_period_end
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
  await clearSubscription();
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
  await clearSubscription();
  await closeDb();
});

test('parcours SPEC-725 @SPEC-725', async ({ page, axeCheck, baseURL, context }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/parametres#abonnement');

  // CA-1 — sans abonnement, l'application est gratuite : aucune souscription ni notion d'IA.
  await expect(page.getByTestId('settings-tab-abonnement')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('settings-title')).toHaveText('Abonnement');
  await expect(page.getByTestId('subscription-status')).toHaveText('Gratuit');
  await expect(page.getByTestId('subscription-summary')).toContainText('Learny est gratuit');
  await expect(page.getByTestId('subscription-portal')).toHaveCount(0);
  await expect(page.getByTestId('subscription-period')).toHaveCount(0);
  await expect(page.getByTestId('subscription-panel')).not.toContainText('plafond');
  await expect(page.getByTestId('subscription-panel')).not.toContainText('Souscrire');

  // CA-2 — l'onglet Modèles d'IA ne porte plus aucun abonnement.
  await page.getByTestId('settings-tab-modeles').click();
  await expect(page.getByTestId('managed-ai-subscription')).toHaveCount(0);
  await expect(page.getByTestId('ai-models-panel')).not.toContainText('Souscrire');

  // CA-3 — abonnement actif : statut, fin de période et portail.
  await useDemoUser(context, baseURL, page);
  await seedSubscription('active');
  await page.goto('/parametres#abonnement');
  await page.reload();
  await expect(page.getByTestId('subscription-status')).toHaveText('Actif');
  await expect(page.getByTestId('subscription-period')).toContainText('11 décembre 2026');
  await expect(page.getByTestId('subscription-portal')).toHaveText('Gérer l’abonnement');

  // CA-4 — paiement en retard : le statut le dit, le portail reste proposé.
  await seedSubscription('past_due');
  await page.reload();
  await expect(page.getByTestId('subscription-status')).toHaveText('Paiement en retard');
  await expect(page.getByTestId('subscription-portal')).toBeVisible();

  // CL-4 — une erreur de lecture garde « Réessayer ».
  await page.route('**/api/v1/billing/subscription', (route) => route.abort());
  await page.reload();
  await expect(page.getByTestId('subscription-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  await page.unroute('**/api/v1/billing/subscription');
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByTestId('subscription-status')).toBeVisible();

  await axeCheck();
});

test('conformité SPEC-725 @SPEC-725 @visual', async ({ page, axeCheck, baseURL, context }) => {
  await useDemoUser(context, baseURL, page);
  await seedSubscription('active');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/parametres#abonnement');

  const block = page.getByTestId('subscription-plan');
  await expect(block).toBeVisible();
  await expect(page.getByTestId('subscription-status')).toHaveText('Actif');

  await expectTokens(page, {
    '[data-testid="subscription-plan"]': { 'background-color': '#FFFFFF' },
  });
  await axeCheck();
  await expectScreenshotBaseline(block, 'spec-725-abonnement-desktop.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await axeCheck();
  await expectScreenshotBaseline(
    page.getByTestId('subscription-plan'),
    'spec-725-abonnement-mobile.png',
  );
});
