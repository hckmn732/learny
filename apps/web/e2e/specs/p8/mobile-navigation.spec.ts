// SPEC-802 — mobile navigation and full-screen panels (EF-2, EF-3, EF-5, EF-6, CA-3, CA-4).
// The `mobile` project runs this file; the desktop project skips it explicitly.
import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoChapterId, demoFormationId, demoModuleId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';

import { seedDemoExamAttempts } from '../../support/demo-exam';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const COURSE = `/formations/${SAP}/modules/${demoModuleId('sap', 1)}/cours?chapitre=${demoChapterId('sap', 1, 1)}`;

let session: TestSession;
let examAttemptId = '';

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  // The tutor answers through the managed AI, which needs an active subscription (as SPEC-610).
  await serviceDb().execute(
    sql`insert into public.subscriptions (user_id, status, current_period_end) values (${demoUserId('alex')}::uuid, 'active', '2030-01-01T00:00:00Z') on conflict (user_id) do update set status = 'active'`,
  );
  const exam = await seedDemoExamAttempts();
  examAttemptId = exam.inProgressId;
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test.afterAll(async () => {
  await closeDb();
});

test('menu en surimpression et panneaux plein écran @SPEC-802 @mobile', async ({ page, axeCheck }) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  test.setTimeout(120_000);
  await page.goto('/accueil');

  // EF-2 — the overlay is closed by default, dialog semantics, focus on the first link.
  await expect(page.getByTestId('sidebar')).toBeHidden();
  await page.getByTestId('sidebar-show').click();
  const sidebar = page.getByTestId('sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute('role', 'dialog');
  await expect(sidebar).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('sidebar-home')).toBeFocused();
  await expect(page.getByTestId('sidebar-backdrop')).toBeVisible();
  const width = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(390 * 0.85 + 1);
  await page.keyboard.press('Escape');
  await expect(sidebar).toBeHidden();
  await expect(page.getByTestId('sidebar-show')).toBeFocused();
  await page.getByTestId('sidebar-show').click();
  await page.getByTestId('sidebar-agenda').click();
  await expect(page).toHaveURL(/\/agenda/);
  await expect(page.getByTestId('sidebar')).toBeHidden();

  // EF-3 — notifications and account are full-screen with a 44 px Fermer button.
  await page.goto('/accueil');
  // A click that lands while the header swaps to its mobile trigger is retried (hydration).
  const notifications = page.getByTestId('notification-panel');
  await expect(async () => {
    await page.getByTestId('header-notifications').click();
    await expect(notifications).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  // EF-3 — the panel covers the window: origin at 0,0 and full size, not only full width.
  const notificationBox = await notifications.boundingBox();
  expect(notificationBox?.x ?? -1).toBe(0);
  expect(notificationBox?.y ?? -1).toBe(0);
  expect(notificationBox?.width ?? 0).toBeGreaterThanOrEqual(389);
  expect(notificationBox?.height ?? 0).toBeGreaterThanOrEqual(843);
  await expect(page.getByTestId('panel-close').first()).toBeVisible();
  await page.getByTestId('panel-close').first().click();
  await expect(notifications).toBeHidden();

  const account = page.getByTestId('account-menu');
  await expect(async () => {
    await page.getByTestId('header-account-trigger').click();
    await expect(account).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  const accountBox = await account.boundingBox();
  expect(accountBox?.x ?? -1).toBe(0);
  expect(accountBox?.width ?? 0).toBeGreaterThanOrEqual(389);
  expect(accountBox?.height ?? 0).toBeGreaterThanOrEqual(843);
  await page.getByTestId('panel-close').first().click();
  await expect(account).toBeHidden();

  // Tutor panel keeps its discussion and covers the window below 768 px.
  await page.goto(COURSE);
  await page.getByTestId('tutor-open').click();
  const tutor = page.getByTestId('tutor-panel');
  await expect(tutor).toBeVisible();
  const tutorBox = await tutor.boundingBox();
  expect(tutorBox?.width ?? 0).toBeGreaterThanOrEqual(389);
  await expect(page.getByTestId('tutor-close')).toBeVisible();
  await page.getByTestId('tutor-input').fill('Peux-tu préciser le plan comptable ?');
  await page.getByTestId('tutor-send').click();
  await expect(page.getByTestId('tutor-message').last()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('tutor-close').click();
  await expect(tutor).toBeHidden();

  // Graph detail opens in a full-screen ResponsivePanel.
  await page.goto(`/formations/${SAP}/carte`);
  await page.getByTestId('graph-gap-item').first().click();
  const detail = page.getByTestId('graph-detail-panel');
  await expect(detail).toBeVisible();
  const detailBox = await detail.boundingBox();
  expect(detailBox?.width ?? 0).toBeGreaterThanOrEqual(389);
  await page.getByTestId('panel-close').first().click();
  await expect(detail).toBeHidden();
  await axeCheck();
});

test('agenda et quiz global sur mobile @SPEC-802 @mobile', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  test.setTimeout(120_000);

  // EF-5 — day view by default, detail in a bottom sheet.
  await page.goto('/agenda');
  await expect(page.getByTestId('agenda-view-jour')).toHaveAttribute('aria-pressed', 'true');
  const slot = page.getByRole('button', { name: /, Prévu|, Fait|, En cours/ }).first();
  await slot.click();
  const sheet = page.getByTestId('agenda-detail-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('role', 'dialog');
  await page.getByTestId('panel-close').first().click();
  await expect(sheet).toBeHidden();

  // EF-6 — game rail scrolls horizontally, primary actions are in the fixed bar.
  await page.goto(`/formations/${SAP}/quiz-global`);
  const rail = page.getByTestId('gq-rail');
  await expect(rail).toBeVisible();
  await expect(rail).toHaveCSS('flex-direction', 'row');
  await expect(rail).toHaveCSS('overflow-x', 'auto');
  await expect(page.getByTestId('bottom-action-bar')).toBeVisible();

  // EF-6 — exam palette opens as a bottom sheet, timer stays in the sticky header.
  await page.goto(`/formations/${SAP}/examen-blanc/${examAttemptId}`);
  await expect(page.getByTestId('exam-timer')).toBeVisible();
  await page.getByTestId('exam-palette-open').click();
  const palette = page.getByTestId('exam-palette-sheet');
  await expect(palette).toBeVisible();
  await expect(palette.getByTestId('exam-palette').first()).toBeVisible();
  await page.getByTestId('panel-close').first().click();
  await expect(palette).toBeHidden();
});
