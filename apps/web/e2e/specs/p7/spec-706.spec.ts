// SPEC-706 — notification producers (BR-NOT-02, BR-NOT-07, BR-NOT-01): the thirteen types reach
// the bell of SCR-03, a validation quiz at 15:00 produces an eligible reminder at 14:20 and a move
// replaces it. The visual test replays the mockup dataset of SPEC-115 on the same frozen clock.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareWithReferenceRegion,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ACCUEIL = '/accueil';
const REFERENCE_DIR = fileURLToPath(new URL('../../../../../design/references/', import.meta.url));
const REFERENCE = `${REFERENCE_DIR}SCR-03-notifications-desktop.png`;
/** Open panel of the desktop reference, in reference pixels (1600 × 2095). */
const REFERENCE_PANEL = { x: 1044, y: 43, width: 360, height: 537 } as const;
const QUIZ_ID = '44444444-4444-4444-8444-444444444444';

let session: TestSession;

test.beforeAll(async () => {
  // The other e2e files mutate the shared demo user: restore before asserting its counts.
  await restoreDemoData();
});

test.beforeEach(async ({ context, baseURL }) => {
  await restoreDemoData();
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles
    set onboarding_step = 'done', timezone = 'Europe/Paris', tutor_tone = 'vous'
    where id = ${session.userId}::uuid
  `);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterEach(async () => {
  await deleteTestSession(session);
});

test.afterAll(async () => {
  await closeDb();
});

interface GeneratedNotification {
  type: string;
  kind: string;
  dedupeKey: string;
  notificationId: string;
  created: boolean;
  href: string;
  title: string;
  icon: string;
}

interface GeneratedResponse {
  notifications: GeneratedNotification[];
  reminder: {
    notificationId: string | null;
    created: boolean;
    cancelled: number;
    schedule: {
      slotId: string;
      startAt: string;
      eligibleAt: string;
      localTime: string;
      localDay: string;
      dedupeKey: string;
    };
  } | null;
}

const TYPES = [
  'validation_soon',
  'course_ready',
  'global_quiz_today',
  'new_gap',
  'session_planned',
  'module_validated',
  'session_to_reschedule',
  'weekly_review',
  'milestone',
  'ai_cost_alert',
  'ai_task_failed',
  'export_ready',
  'group_invitation',
] as const;

function originOf(page: import('@playwright/test').Page): string {
  return new URL(page.url()).origin;
}

async function generate(
  page: import('@playwright/test').Page,
  key: string,
  input: Record<string, unknown>,
): Promise<GeneratedResponse> {
  const response = await page.request.post('/api/v1/dev/sdd/notifications/generate', {
    headers: { origin: originOf(page), 'idempotency-key': key },
    data: input,
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as GeneratedResponse;
}

test('producteurs et rappels @SPEC-706', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.goto(ACCUEIL);
  const bell = page.getByTestId('header-notifications');
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, aucune non lue');

  // CA-1 — the thirteen producers create one notification per BR-NOT-02 type.
  const generated = await generate(page, 'spec-706-all-001', {
    quiz: { slotId: QUIZ_ID, startsAt: '2026-11-11T14:00:00.000Z' },
  });
  const producedTypes = new Set([
    ...generated.notifications.map((item) => item.type),
    ...(generated.reminder === null ? [] : ['validation_soon']),
  ]);
  expect([...producedTypes].sort()).toEqual([...TYPES].sort());
  expect(generated.reminder?.schedule.localTime).toBe('15:00');
  expect(generated.reminder?.schedule.eligibleAt).toBe('2026-11-11T13:20:00.000Z'); // 14:20 Paris
  expect(generated.reminder?.created).toBe(true);
  const firstReminderId = generated.reminder?.notificationId ?? '';

  const list = await page.request.get('/api/v1/notifications?filter=all');
  expect(list.status()).toBe(200);
  const dto = (await list.json()) as {
    items: { id: string; type: string; href: string; title: string; group: string }[];
    total: number;
    unreadCount: number;
    timezone: string;
  };
  expect(dto.total).toBe(13);
  expect(dto.unreadCount).toBe(13);
  expect(dto.timezone).toBe('Europe/Paris');
  expect([...new Set(dto.items.map((item) => item.type))].sort()).toEqual([...TYPES].sort());
  for (const item of dto.items) {
    expect(item.href).toMatch(/^\/(?!\/)/u);
    expect(item.title.length).toBeGreaterThan(0);
  }
  const validation = dto.items.find((item) => item.type === 'validation_soon');
  expect(validation?.id).toBe(firstReminderId);
  expect(validation?.title).toBe('Votre quiz de validation approche');

  // BR-NOT-01 — the bell groups the rows in the profile zone and keeps the badge.
  await page.reload();
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 13 non lues');
  await expect(page.getByTestId('header-notifications-badge')).toHaveText('13');
  await bell.click();
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('notification-group-today')).toBeVisible();
  await expect(panel.locator('[data-notif]')).toHaveCount(13);
  await expect(panel).toContainText('Votre quiz de validation approche');
  await expect(panel).toContainText('Votre cours est prêt');
  await panel.getByRole('button', { name: /Non lues/ }).click();
  await expect(panel.locator('[data-notif][data-unread]')).toHaveCount(13);
  await captureEvidence('spec-706-panneau-producteurs-desktop');

  // Replay — the same event writes nothing new (CL-3).
  const replay = await generate(page, 'spec-706-all-002', {
    quiz: { slotId: QUIZ_ID, startsAt: '2026-11-11T14:00:00.000Z' },
  });
  expect(replay.notifications.every((item) => !item.created)).toBe(true);
  expect(replay.reminder?.created).toBe(false);
  const afterReplay = await page.request.get('/api/v1/notifications?filter=all');
  expect(((await afterReplay.json()) as { total: number }).total).toBe(13);

  // CA-2 — moving the quiz to 16:00 cancels the old reminder and schedules the new one.
  const moved = await generate(page, 'spec-706-move-001', {
    types: ['validation_soon'],
    quiz: { slotId: QUIZ_ID, startsAt: '2026-11-11T15:00:00.000Z' },
  });
  expect(moved.reminder?.schedule.localTime).toBe('16:00');
  expect(moved.reminder?.schedule.eligibleAt).toBe('2026-11-11T14:20:00.000Z'); // 15:20 Paris
  expect(moved.reminder?.created).toBe(true);
  expect(moved.reminder?.cancelled).toBe(1);
  expect(moved.reminder?.notificationId).not.toBe(firstReminderId);
  const afterMove = await page.request.get('/api/v1/notifications?filter=all');
  const movedDto = (await afterMove.json()) as {
    total: number;
    items: { id: string; type: string }[];
  };
  expect(movedDto.total).toBe(13);
  expect(movedDto.items.filter((item) => item.type === 'validation_soon')).toHaveLength(1);
  expect(movedDto.items.some((item) => item.id === firstReminderId)).toBe(false);

  // CA-3 — an invalid body answers 400 and writes nothing.
  const invalid = await page.request.post('/api/v1/dev/sdd/notifications/generate', {
    headers: { origin: originOf(page), 'idempotency-key': 'spec-706-invalid-001' },
    data: { quiz: { slotId: 'pas-un-uuid', startsAt: 'hier' } },
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()) as { code: string }).toMatchObject({
    code: 'VALIDATION_FAILED',
  });
  const afterInvalid = await page.request.get('/api/v1/notifications?filter=all');
  expect(((await afterInvalid.json()) as { total: number }).total).toBe(13);

  // Reload — the committed state is the source of truth.
  await page.reload();
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 13 non lues');
  await bell.click();
  await expect(panel.locator('[data-notif]')).toHaveCount(13);

  // The badge is removed after « Tout marquer comme lu », so the axe scan below measures the
  // panel and the empty header badge defined by the mockup (no unrelated contrast warning).
  await page.keyboard.press('Escape');
  await page.request.post('/api/v1/notifications/read-all', {
    headers: { origin: originOf(page) },
  });
  await page.reload();
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, aucune non lue');

  expect(consoleErrors).toEqual([]);

  // ET-5 — a read failure keeps a distinct, accessible error state.
  await page.route(/\/api\/v1\/notifications\?/, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/problem+json; charset=utf-8',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Erreur interne',
        status: 500,
        detail: 'Erreur interne',
        code: 'INTERNAL_ERROR',
        requestId: 'spec-706-e2e',
      }),
    });
  });
  await bell.click();
  await expect(panel.getByTestId('notification-error')).toBeVisible();
  await expect(panel.getByText('Impossible de charger les notifications.')).toBeVisible();
  await axeCheck();
  await page.unroute(/\/api\/v1\/notifications\?/);
});

test('conformité SCR-03 @SPEC-706 @visual @mobile', async ({ page, axeCheck, context, baseURL }, testInfo) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const alex = DEMO_USERS.find((user) => user.key === 'alex');
  if (alex === undefined) throw new Error('utilisateur démo Alex absent');
  // The demo dataset of SPEC-115 carries the eight rows of the mockup.
  const demo = await createDemoSession(demoUserId('alex'), alex.email);
  await context.addCookies(
    demo.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mobile = testInfo.project.name === 'mobile';
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ACCUEIL);
  const bell = page.getByTestId('header-notifications');
  await expect(bell).toHaveAttribute('aria-label', 'Notifications, 3 non lues');
  await bell.click();
  await page.mouse.move(0, 0);
  const panel = page.getByTestId('notification-panel');
  await expect(panel).toBeVisible();

  // CA-1, §10 — the three groups and the « cours prêt » / « quiz à venir » types of SPEC-306.
  await expect(page.getByTestId('notification-group-today')).toBeVisible();
  await expect(page.getByTestId('notification-group-yesterday')).toBeVisible();
  await expect(page.getByTestId('notification-group-earlier')).toBeVisible();
  await expect(panel).toContainText('Votre cours est prêt');
  await expect(panel).toContainText('Quiz de validation à 14:00');
  await expect(panel.getByText('13:20')).toBeVisible();
  await expect(panel.getByText('16:42')).toBeVisible();

  // Tokens of the panel and of the bell badge (SPEC-301).
  await expectTokens(page, {
    '[data-testid="notification-panel"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
      'border-radius': '18px',
    },
    '[data-testid="header-notifications"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
    },
    '[data-testid="header-notifications-badge"]': {
      'background-color': colors.orange,
      color: colors.white,
    },
    '[data-testid="notification-filters"]': { 'background-color': colors.canvas },
    '[data-testid="notification-manage"]': { color: colors['indigo-ink'] },
  });

  if (!mobile) {
    const referencePath = REFERENCE;
    if (!fs.existsSync(referencePath)) throw new Error('référence SCR-03 absente');
    const panelBox = await panel.boundingBox();
    if (panelBox === null) throw new Error('panneau non mesurable');
    const actual = await page.screenshot({ clip: panelBox, animations: 'disabled' });
    const comparison = compareWithReferenceRegion(
      actual,
      referencePath,
      REFERENCE_PANEL,
      testInfo.outputPath('visual'),
      'spec-706-panneau',
    );
    await testInfo.attach('reference', { path: referencePath, contentType: 'image/png' });
    await testInfo.attach('side-by-side', {
      path: comparison.sideBySidePath,
      contentType: 'image/png',
    });
    await testInfo.attach('diff', { path: comparison.diffPath, contentType: 'image/png' });
    testInfo.annotations.push({
      type: 'mockup-diff-ratio',
      description: comparison.ratio.toFixed(4),
    });
    expect(comparison.ratio, 'écart à la maquette SCR-03').toBeLessThanOrEqual(
      MOCKUP_MAX_DIFF_RATIO,
    );
  }

  await expectScreenshotBaseline(panel, 'spec-706-panneau.png');
  await axeCheck();
});
