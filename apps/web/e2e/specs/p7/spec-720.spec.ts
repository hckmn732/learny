// SPEC-720 — automatisme 9 : bilan de la semaine (SCR-03, BR-AUT-09).
//
// The journey starts from the SPEC-115 demonstration day and the frozen clock of ADR-0047. It runs
// the real `bilan` definition on Sunday 19:00, checks the single action, the real hours, the
// expandable home card and the availability link, then switches to `app_email` and verifies the
// authorised e-mail delivery. The visual test compares the card with the SCR-03 reference and
// keeps desktop/mobile baselines; axe runs on every state.
import { randomUUID } from 'node:crypto';

import { runAutomation } from '@learny/automations';
import { formatWeeklyStudy, weeklyRetentionLabel } from '@learny/contracts';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import {
  DEMO_AUTOMATION_ACTIONS,
  DEMO_USERS,
  demoFormationId,
  demoId,
  demoUserId,
} from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const ALEX_ID = demoUserId('alex');
const NOW = new Date('2026-11-11T12:20:00Z');
const SUNDAY = '2026-11-08T18:00:00Z';
const NEXT_SUNDAY = '2026-11-15T18:00:00Z';
const REFERENCE = 'design/references/SCR-03-base-desktop.png';
const SEED_REVIEW = DEMO_AUTOMATION_ACTIONS.find((action) => action.key === 'weekly-review');

let session: TestSession | null = null;

function engine(at: string) {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock: { now: () => new Date(at) },
    logger: createLogger({ level: 'error' }),
  };
}

async function clearReviews(): Promise<void> {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  await serviceDb().execute(sql`
    delete from public.notification_deliveries
    where notification_id in (
      select id from public.notifications
      where user_id = ${ALEX_ID}::uuid
        and type = 'weekly_review'
        and dedupe_key like 'automation:%'
    )
  `);
  await serviceDb().execute(sql`
    delete from public.notifications
    where user_id = ${ALEX_ID}::uuid
      and type = 'weekly_review'
      and dedupe_key like 'automation:%'
  `);
  await serviceDb().execute(sql`
    delete from public.automation_actions
    where user_id = ${ALEX_ID}::uuid and automation = 'bilan'
  `);
}

async function setParams(channel: 'app' | 'app_email'): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.automation_settings (user_id, key, enabled, params)
    values (
      ${ALEX_ID}::uuid, 'bilan', true,
      ${JSON.stringify({ weekday: 7, hour: 19, channel })}::jsonb
    )
    on conflict (user_id, key) do update
      set enabled = true, params = excluded.params
  `);
}

async function runReview(
  at: string,
  channel: 'app' | 'app_email',
): Promise<{ actionId: string; studyMinutes: number; retentionLabel: string; atRiskCount: number }> {
  await setParams(channel);
  const result = await runAutomation(engine(at), {
    key: 'bilan',
    userId: ALEX_ID,
    trigger: { type: 'hourly', localHour: 19 },
  });
  if (!result.ok) throw result.error;
  if (result.value.created !== 1) throw new Error('bilan non créé');
  const actionId = result.value.actionIds[0];
  if (actionId === undefined) throw new Error('bilan sans identifiant');
  const rows = await serviceDb().execute<{ payload: Record<string, unknown> }>(sql`
    select payload from public.automation_actions where id = ${actionId}::uuid
  `);
  const payload = rows[0]?.payload ?? {};
  const studyMinutes = typeof payload.studyMinutes === 'number' ? payload.studyMinutes : 0;
  const atRiskCount = typeof payload.atRiskCount === 'number' ? payload.atRiskCount : 0;
  const retention = payload.retention as { rate?: unknown } | undefined;
  const rate = typeof retention?.rate === 'number' ? retention.rate : null;
  return {
    actionId,
    studyMinutes,
    retentionLabel: rate === null ? 'Non disponible' : `${String(Math.round(rate))} %`,
    atRiskCount,
  };
}

async function insertSeedReview(): Promise<void> {
  if (SEED_REVIEW?.payload === undefined) throw new Error('bilan de démonstration absent');
  await serviceDb().execute(sql`
    insert into public.automation_actions (
      id, user_id, formation_id, automation, kind, summary, payload,
      requires_consent, status, created_at
    ) values (
      ${demoId('automation-action', 'weekly-review')}::uuid,
      ${ALEX_ID}::uuid,
      ${demoFormationId('sap')}::uuid,
      'bilan', 'weekly_review', ${SEED_REVIEW.summary},
      ${JSON.stringify(SEED_REVIEW.payload)}::jsonb, false, 'applied',
      ${SEED_REVIEW.createdAt}::timestamptz
    )
  `);
}

async function actionsCount(): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.automation_actions
    where user_id = ${ALEX_ID}::uuid and automation = 'bilan'
  `);
  return rows[0]?.count ?? 0;
}

async function appliedEvents(): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.event_outbox
    where user_id = ${ALEX_ID}::uuid and name = 'automation/action-applied'
  `);
  return rows[0]?.count ?? 0;
}

async function deliveries(actionId: string) {
  return serviceDb().execute<{ channel: string; status: string }>(sql`
    select d.channel::text as channel, d.status::text as status
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where n.user_id = ${ALEX_ID}::uuid
      and n.dedupe_key = ${`automation:${actionId}`}
    order by d.channel asc
  `);
}

test.beforeAll(async () => {
  await restoreDemoData();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  await clearReviews();
  await setParams('app');
  session = await createDemoSession(ALEX_ID, ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3152' })),
  );
});

test.afterEach(async () => {
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
});

test.afterAll(async () => {
  await closeDb();
});

test('parcours SPEC-720 @SPEC-720', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.clock.setFixedTime(NOW);

  // CA-1 — the Sunday review is unique and its hours equal the sum of the done slots.
  const review = await runReview(SUNDAY, 'app');
  await page.goto('/accueil');
  const card = page.getByTestId('weekly-review');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('weekly-review-title')).toHaveText('Bilan de la semaine');
  await expect(page.getByTestId('weekly-review-hours')).toHaveText(
    formatWeeklyStudy(review.studyMinutes),
  );
  await expect(page.getByTestId('weekly-review-retention')).toHaveText(review.retentionLabel);
  await expect(page.getByTestId('weekly-review-at-risk')).toHaveText(String(review.atRiskCount));
  await expect(page.getByTestId('weekly-review-period')).toContainText('2 – 8 nov.');
  await expect(page.getByTestId('weekly-review-period')).toContainText('reçu dim. 19:00');

  // EF-2 — the card unfolds and asks « Vos disponibilités changent-elles ? ».
  const toggle = page.getByTestId('weekly-review-toggle');
  await expect(toggle).toHaveText('Voir le détail');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('weekly-review-details')).toContainText(
    'Vos disponibilités changent-elles ?',
  );
  await expect(page.getByTestId('weekly-review-availability')).toHaveAttribute(
    'href',
    '/parametres#rythme',
  );
  await axeCheck();
  await captureEvidence('spec-720-bilan-ouvert');
  expect(consoleErrors).toEqual([]);

  // A reload keeps the single review and its real values.
  await page.reload();
  await expect(page.getByTestId('weekly-review-hours')).toHaveText(
    formatWeeklyStudy(review.studyMinutes),
  );
  expect(await actionsCount()).toBe(1);
  expect(await appliedEvents()).toBe(1);

  // CA-2 — app + e-mail creates the authorised e-mail delivery; app alone creates none.
  expect(await deliveries(review.actionId)).toEqual([]);
  const emailReview = await runReview(NEXT_SUNDAY, 'app_email');
  const emailDeliveries = await deliveries(emailReview.actionId);
  expect(emailDeliveries.length).toBeGreaterThanOrEqual(1);
  expect(emailDeliveries.every((delivery) => delivery.channel === 'email')).toBe(true);
  await page.reload();
  await expect(page.getByTestId('weekly-review')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('weekly-review-toggle').click();
  await expect(page.getByTestId('weekly-review-availability')).toBeVisible();
  await axeCheck();

  // The error state is distinct and accessible.
  await page.route('**/api/v1/me/weekly-review*', (route) => route.abort());
  await page.reload();
  await expect(page.getByTestId('weekly-review-error')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('weekly-review-error')).toContainText(
    'Impossible de charger le bilan de la semaine.',
  );
  await axeCheck();
});

test('conformité SPEC-720 @SPEC-720 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}, testInfo) => {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await clearReviews();
  await insertSeedReview();
  if (SEED_REVIEW?.payload === undefined) throw new Error('bilan de démonstration absent');
  const seedPayload = SEED_REVIEW.payload as {
    studyMinutes: number;
    atRiskCount: number;
    retention: { rate: number | null };
  };

  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto('/accueil');
  const card = page.getByTestId('weekly-review');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('weekly-review-title')).toHaveText('Bilan de la semaine');
  await expect(page.getByTestId('weekly-review-hours')).toHaveText(
    formatWeeklyStudy(seedPayload.studyMinutes),
  );
  await expect(page.getByTestId('weekly-review-retention')).toHaveText(
    weeklyRetentionLabel(seedPayload.retention.rate),
  );
  await expect(page.getByTestId('weekly-review-at-risk')).toHaveText(
    String(seedPayload.atRiskCount),
  );
  await expect(page.getByTestId('weekly-review-toggle')).toHaveText('Voir le détail');

  await expectTokens(page, {
    '[data-testid="weekly-review"]': {
      'background-color': colors.surface,
      'border-top-color': colors.border,
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="weekly-review-hours"]': { color: colors.ink },
    '[data-testid="weekly-review-at-risk"]': { color: colors['orange-ink-strong'] },
  });
  await axeCheck();
  await captureEvidence('spec-720-desktop');

  const [region] = await compareRegions(page, {
    reference: REFERENCE,
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'SCR-03-bilan',
        locator: card,
        rect: { x: 945, y: 1307, width: 408, height: 176 },
      },
    ],
  });
  if (region !== undefined) {
    await testInfo.attach('SCR-03-bilan-side-by-side', {
      path: region.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach('SCR-03-bilan-diff', {
      path: region.diffPath,
      contentType: 'image/png',
    });
    testInfo.annotations.push({
      type: 'mockup-diff-ratio',
      description: `SCR-03-bilan:${region.ratio.toFixed(4)}`,
    });
    expect(region.ratio, 'écart à la maquette du bilan').toBeLessThanOrEqual(
      MOCKUP_MAX_DIFF_RATIO,
    );
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await expect(page.getByTestId('weekly-review')).toBeVisible({ timeout: 30_000 });
  await expectScreenshotBaseline(card, 'spec-720-bilan-desktop.png');

  // Mobile: same texts and order, own baseline ≤ 1 %.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId('weekly-review')).toBeVisible();
  await expect(page.getByTestId('weekly-review-availability')).toHaveCount(0);
  await page.getByTestId('weekly-review-toggle').click();
  await expect(page.getByTestId('weekly-review-availability')).toBeVisible();
  await axeCheck();
  await captureEvidence('spec-720-mobile');
  await expectScreenshotBaseline(card, 'spec-720-bilan-mobile.png');
});
