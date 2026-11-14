import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoUserId } from '@learny/db/seed/fixtures';
import { expect, test } from '@learny/testing/playwright';
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

/** Fresh learner for the functional parcours; deleted after every test. */
let session: TestSession | null = null;

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  // The settings screen belongs to a learner who has finished the onboarding of SPEC-602.
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

/** Signs the test browser in as the seeded demonstration user (SPEC-115). */
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

/** Runs one control change and waits for its real PATCH (immediate persistence, EF-3). */
async function patchAfter(
  page: import('@playwright/test').Page,
  action: () => Promise<void>,
): Promise<void> {
  const sent = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/notification-settings') &&
      response.request().method() === 'PATCH',
  );
  await action();
  const response = await sent;
  expect(response.status()).toBe(200);
}

test('parcours SPEC-708 @SPEC-708', async ({ page, axeCheck, captureEvidence }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/parametres#notifications');

  // EF-1, BR-SET-01 — the Notifications tab is selected by the hash.
  await expect(page.getByTestId('settings-tab-notifications')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('settings-title')).toHaveText('Notifications');

  // EF-1 — three channels; the in-app one is always on and locked.
  await expect(page.getByTestId('notification-channels')).toBeVisible();
  await expect(page.getByTestId('notification-channel-app')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('notification-channel-app')).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await expect(page.getByTestId('notification-channel-email')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByTestId('notification-channel-browser')).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // CA-1, BR-NOT-04 — six types on by default, with the exact counter.
  await expect(page.getByTestId('notification-type-count')).toHaveText('6 sur 6 activés');
  await expect(page.getByTestId('notification-types').getByRole('switch')).toHaveCount(6);

  // CA-1 — disabling two switches leaves « 4 sur 6 activés » after a reload.
  await patchAfter(page, async () => {
    await page.getByTestId('notification-type-validation').click();
  });
  await expect(page.getByTestId('notification-type-count')).toHaveText('5 sur 6 activés');
  await patchAfter(page, async () => {
    await page.getByTestId('notification-type-course').click();
  });
  await expect(page.getByTestId('notification-type-count')).toHaveText('4 sur 6 activés');
  await page.reload();
  await expect(page.getByTestId('notification-type-count')).toHaveText('4 sur 6 activés');
  await expect(page.getByTestId('notification-type-validation')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByTestId('notification-type-course')).toHaveAttribute(
    'aria-checked',
    'false',
  );

  // CA-2, CL-3 — a refused browser permission saves no subscription and keeps the in-app channel.
  // The channel is first switched off through the real route, then the permission is refused.
  await patchAfter(page, async () => {
    await page.getByTestId('notification-channel-browser').click();
  });
  await expect(page.getByTestId('notification-channel-browser')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.evaluate(() => {
    Object.defineProperty(Notification, 'permission', {
      configurable: true,
      get: () => 'denied',
    });
  });
  await page.getByTestId('notification-channel-browser').click();
  await expect(page.getByTestId('notification-settings-error')).toContainText(
    'Notifications navigateur indisponibles',
  );
  await expect(page.getByTestId('notification-channel-browser')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByTestId('notification-channel-app')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const subscriptions = await serviceDb().execute<{ total: number }>(sql`
    select count(*)::int as total from public.push_subscriptions
     where user_id = ${session?.userId}::uuid
  `);
  expect(subscriptions[0]?.total).toBe(0);

  // CA-3 — digest time, quiet hours and weekend rule persist immediately and after a reload.
  await patchAfter(page, async () => {
    await page.getByTestId('notification-digest').selectOption('09:00');
  });
  await patchAfter(page, async () => {
    await page.getByTestId('quiet-hours-start').selectOption('22:00');
  });
  await patchAfter(page, async () => {
    await page.getByTestId('quiet-hours-end').selectOption('08:00');
  });
  await patchAfter(page, async () => {
    await page.getByTestId('weekend-rule-switch').click();
  });
  await expect(page.getByTestId('weekend-rule-switch')).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByTestId('notification-digest')).toHaveValue('09:00');
  await expect(page.getByTestId('quiet-hours-start')).toHaveValue('22:00');
  await expect(page.getByTestId('quiet-hours-end')).toHaveValue('08:00');
  await expect(page.getByTestId('weekend-rule-switch')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('notification-type-count')).toHaveText('4 sur 6 activés');

  const rows = await serviceDb().execute<{
    digest: string;
    quiet_start: string;
    quiet_end: string;
    weekend: boolean;
    validation: boolean;
    course: boolean;
  }>(sql`
    select digest_time::text as digest, quiet_start::text as quiet_start,
           quiet_end::text as quiet_end, weekend_quiet as weekend,
           type_validation as validation, type_course as course
      from public.notification_settings where user_id = ${session?.userId}::uuid
  `);
  expect(rows[0]).toMatchObject({
    digest: '09:00:00',
    quiet_start: '22:00:00',
    quiet_end: '08:00:00',
    weekend: false,
    validation: false,
    course: false,
  });

  // CL-4 — a network failure restores the server state, shows « Réessayer » and never lies.
  await page.route('**/api/v1/me/notification-settings', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 500, body: 'server down' });
      return;
    }
    await route.fallback();
  });
  await page.getByTestId('notification-type-planning').click();
  await expect(page.getByTestId('notification-settings-error')).toBeVisible();
  await expect(page.getByTestId('notification-settings-retry')).toBeVisible();
  await expect(page.getByTestId('notification-type-count')).toHaveText('4 sur 6 activés');
  await expect(page.getByTestId('notification-type-planning')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.unroute('**/api/v1/me/notification-settings');
  await patchAfter(page, async () => {
    await page.getByTestId('notification-settings-retry').click();
  });
  await expect(page.getByTestId('notification-type-count')).toHaveText('3 sur 6 activés');
  await expect(page.getByTestId('notification-type-planning')).toHaveAttribute(
    'aria-checked',
    'false',
  );

  await captureEvidence('spec-708-parametres-notifications');
  await axeCheck();
});

test('conformité SCR-15 notifications @SPEC-708 @visual', async ({
  page,
  axeCheck,
  baseURL,
  context,
}, testInfo) => {
  await useDemoUser(context, baseURL, page);
  // The reference renders the SPEC-115 learner, whose notification row carries the BR-NOT-04
  // defaults (all on, 08:00, 21:00–08:00, weekend on).
  await page.goto('/parametres#notifications');
  await expect(page.getByTestId('notification-type-count')).toHaveText('6 sur 6 activés');

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="settings-tab-notifications"]': {
      'background-color': '#111113',
      color: '#FFFFFF',
    },
    '[data-testid="notification-channels"]': {
      'background-color': '#FFFFFF',
      'border-top-color': '#E7E6E1',
      'border-radius': '21.6px',
    },
    '[data-testid="notification-channel-app"]': { 'background-color': '#111113' },
    '[data-testid="notification-type-count"]': { color: '#3F3F46' },
    '[data-testid="notification-types"]': { 'background-color': '#FFFFFF' },
    '[data-testid="quiet-hours"]': { 'background-color': '#FFFFFF' },
    '[data-testid="notification-type-revision"]': { 'background-color': '#111113' },
  });
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /Space[ _]Grotesk/);
  await expect(page.getByTestId('notification-type-count')).toHaveText('6 sur 6 activés');
  await expect(page.getByTestId('quiet-hours-start')).toHaveValue('21:00');
  await expect(page.getByTestId('quiet-hours-end')).toHaveValue('08:00');

  // Mockup comparison region by region (ADR-0034, ≤ 12 %); the reference is a 0.9 render.
  const regions = await compareRegions(page, {
    reference: 'design/references/SCR-15-notifications-desktop.png',
    outputDir: testInfo.outputPath('visual'),
    regions: [
      {
        name: 'notification-channels',
        locator: page.getByTestId('notification-channels'),
        rect: { x: 313, y: 168, width: 1040, height: 153 },
      },
      {
        name: 'notification-types',
        locator: page.getByTestId('notification-types'),
        rect: { x: 313, y: 336, width: 1040, height: 399 },
      },
      {
        name: 'quiet-hours',
        locator: page.getByTestId('quiet-hours'),
        rect: { x: 313, y: 753, width: 1040, height: 164 },
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

  await expectScreenshotBaseline(page, 'spec-708-parametres-notifications-desktop.png', {
    fullPage: true,
  });
  await axeCheck();
});

test('conformité SCR-15 notifications mobile @SPEC-708 @visual @mobile', async ({
  page,
  axeCheck,
  baseURL,
  context,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await useDemoUser(context, baseURL, page);
  await page.goto('/parametres#notifications');
  await expect(page.getByTestId('notification-type-count')).toHaveText('6 sur 6 activés');
  await expect(page.getByTestId('quiet-hours')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'spec-708-parametres-notifications-mobile.png', {
    fullPage: true,
  });
  await axeCheck();
});
