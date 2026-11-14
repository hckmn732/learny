import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoUserId } from '@learny/db/seed/fixtures';
import { createTestProgramme } from '@learny/db/testing';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const NOW = new Date('2026-11-11T12:20:00Z');
const SEED_DAYS = [
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
];

let session: TestSession | null = null;

test.beforeAll(async () => {
  // The demo dataset is shared by the whole e2e run: restore it before asserting its state.
  await restoreDemoData();
});

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done' where id = ${session.userId}::uuid
  `);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
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

/** Signs the browser in as the SPEC-115 learner (Alex) without changing the shared seed. */
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
    demo.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
  await page.clock.setFixedTime(NOW);
}

interface CompletedSeed {
  formationId: string;
}

/**
 * A completed formation with exactly 100 notions at 90 % mastery, the 12-day streak of SPEC-115
 * and no milestone yet: the reconciliation of the API must create one and only one milestone.
 */
async function seedHundredNotions(userId: string): Promise<CompletedSeed> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 5,
      chaptersPerModule: 5,
      notionsPerChapter: 4,
      title: 'SAP S/4HANA Finance',
    });
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${programme.formationId}::uuid,
          onboarding_step = 'done', timezone = 'Europe/Paris', streak_days = 12
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      update public.formations
      set completed_at = ${NOW.toISOString()}::timestamptz,
          start_date = '2026-10-01',
          end_date = '2026-11-11',
          volume_hours = 40
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set status = 'validated'::public.module_status,
          validated_at = ${NOW.toISOString()}::timestamptz
      where formation_id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (
        user_id, module_id, status, opened_at, validated_at, best_score
      )
      select ${userId}::uuid, id, 'validated'::public.module_status,
             ${NOW.toISOString()}::timestamptz, ${NOW.toISOString()}::timestamptz, 90
      from public.modules
      where formation_id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      insert into public.notion_states (
        user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
        success_count, in_review
      )
      select ${userId}::uuid, id,
             jsonb_build_object(
               'due', ${NOW.toISOString()}::text,
               'stability', 1,
               'difficulty', 5,
               'elapsed_days', 0,
               'scheduled_days', 1,
               'reps', 1,
               'lapses', 0,
               'state', 2,
               'last_review', ${NOW.toISOString()}::text
             ),
             ${NOW.toISOString()}::timestamptz, 90,
             ${NOW.toISOString()}::timestamptz, ${NOW.toISOString()}::timestamptz, 1, true
      from public.notions
      where formation_id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values ${sql.join(
        SEED_DAYS.map(
          (day) => sql`(${userId}::uuid, ${day}::date, 60, true, array['e2e']::text[])`,
        ),
        sql`, `,
      )}
      on conflict (user_id, day) do nothing
    `);
    return { formationId: programme.formationId };
  });
}

test('parcours SPEC-723 @SPEC-723', async ({ page, axeCheck, captureEvidence }) => {
  await page.clock.setFixedTime(NOW);
  const current = session;
  if (current === null) throw new Error('session absente');
  const seeded = await seedHundredNotions(current.userId);

  await page.goto('/accueil');

  // CA-1, BR-GAM-02 — the seed shows « 12 jours » and exactly 14 accessible boxes.
  await expect(page.getByTestId('streak-count')).toHaveText('12 jours');
  await expect(page.getByTestId('streak-day')).toHaveCount(14);
  await expect(page.getByTestId('sidebar-streak-day').first()).toHaveAttribute(
    'data-status',
    'none',
  );
  await expect(page.getByTestId('sidebar-streak-day').last()).toHaveAttribute(
    'data-status',
    'done',
  );
  const names = await page.getByTestId('streak-day').allTextContents();
  expect(names).toHaveLength(14);
  for (const name of names) {
    expect(name).toContain(':');
    expect(name.trim().length).toBeGreaterThan(4);
  }
  await page.reload();
  await expect(page.getByTestId('streak-count')).toHaveText('12 jours');
  await expect(page.getByTestId('streak-day')).toHaveCount(14);

  const response = await page.request.get('/api/v1/milestones');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    items: { key: string; label: string; achievedOn: string }[];
  };
  expect(body.items.filter((item) => item.key === 'notions_100')).toHaveLength(1);
  expect(body.items.find((item) => item.key === 'notions_100')?.label).toBe(
    '100 notions retenues',
  );

  // CA-2 — the final review shows the milestone and its date, with no ranking.
  await page.goto(`/formations/${seeded.formationId}/bilan`);
  await expect(page.getByTestId('milestone-list')).toBeVisible();
  await expect(page.getByTestId('milestone-list')).toContainText('100 notions retenues');
  await expect(page.getByTestId('milestone-list')).toContainText('Atteint le');
  const content = await page.locator('body').innerText();
  expect(content).not.toMatch(/leaderboard|premier de la classe|\brang\b/i);

  const milestones = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count
    from public.milestones
    where user_id = ${current.userId}::uuid and key = 'notions_100'::public.milestone_key
  `);
  expect(milestones[0]?.count).toBe(1);
  const notifications = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count
    from public.notifications
    where user_id = ${current.userId}::uuid and dedupe_key = 'milestone:notions_100'
  `);
  expect(notifications[0]?.count).toBe(1);

  await captureEvidence('spec-723-serie-jalons');
  await axeCheck();
});

test('conformité SCR-03 série @SPEC-723 @visual', async ({
  page,
  axeCheck,
  baseURL,
  context,
}, testInfo) => {
  await useDemoUser(context, baseURL, page);
  await page.goto('/accueil');
  await expect(page.getByTestId('streak-count')).toHaveText('12 jours');
  await expect(page.getByTestId('streak-day')).toHaveCount(14);

  // Tokens of the Série block: dark card, lime boxes for studied days, muted legend.
  await expectTokens(page, {
    '[data-testid="sidebar-streak"]': {
      'background-color': '#1C1C20',
      'border-radius': '12.6px',
    },
    '[data-testid="sidebar-streak-count"]': { color: '#FFFFFF' },
    '[data-testid="sidebar-streak-day"][data-status="done"]': {
      'background-color': '#C6F432',
    },
  });

  // Mockup comparison of the Série block (SCR-03 reference is 1600 px wide).
  const regions = await compareRegions(page, {
    reference: 'design/references/SCR-03-base-desktop.png',
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'streak-block',
        locator: page.getByTestId('sidebar-streak'),
        rect: { x: 11, y: 793, width: 202, height: 98 },
      },
    ],
  });
  for (const region of regions) {
    await testInfo.attach(`${region.name}-side-by-side`, {
      path: region.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach(`${region.name}-diff`, {
      path: region.diffPath,
      contentType: 'image/png',
    });
    expect(region.ratio, `écart ${region.name}`).toBeLessThanOrEqual(MOCKUP_MAX_DIFF_RATIO);
  }
  testInfo.annotations.push({
    type: 'mockup-diff-ratio',
    description: regions[0]?.ratio.toFixed(4) ?? 'n/a',
  });

  await expectScreenshotBaseline(page, 'spec-723-accueil-desktop.png', { fullPage: true });
  await axeCheck();
});

test('conformité SCR-03 série mobile @SPEC-723 @visual @mobile', async ({
  page,
  axeCheck,
  baseURL,
  context,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await useDemoUser(context, baseURL, page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/accueil');
  await page.getByTestId('sidebar-show').click();
  await expect(page.getByTestId('sidebar-streak')).toBeVisible();
  await expect(page.getByTestId('streak-day')).toHaveCount(14);
  // Wait for the drawer scroll lock and the fonts before the pixel baseline.
  await expect
    .poll(async () => page.evaluate(() => document.body.style.overflow))
    .toBe('hidden');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
  await expectScreenshotBaseline(page.getByTestId('sidebar-streak'), 'spec-723-serie-mobile.png');
  await axeCheck();
});
