// SPEC-718 — automatisme 7 : quiz global plafonné et lissé (SCR-10, BR-AUT-07).
//
// The journey uses the SPEC-115 demonstration day and the frozen clock of ADR-0047. It checks the
// six admitted settings, the smoothed tutor box, « Annuler le lissage » reopening every due notion
// without a fake review log, the error state and the visual tokens captured on desktop and mobile.
import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const ALEX_ID = demoUserId('alex');
const ACTION_ID = demoId('automation-action', 'quiz-cap');
const NOW = new Date('2026-11-11T12:20:00Z');
const QUIZ = `/formations/${SAP}/quiz-global`;

let session: TestSession | null = null;

async function resetDemoSmoothing(): Promise<void> {
  await serviceDb().execute(sql`
    delete from public.activities
    where owner_id = ${ALEX_ID}::uuid
      and kind = 'global_quiz_session'::public.activity_kind
  `);
  await serviceDb().execute(sql`
    insert into public.automation_settings (user_id, key, enabled, params)
    values (
      ${ALEX_ID}::uuid, 'plafond_quiz', true,
      '{"maxMinutes":15,"targetRetention":0.9}'::jsonb
    )
    on conflict (user_id, key) do update
      set enabled = true, params = excluded.params
  `);
  await serviceDb().execute(sql`
    update public.automation_actions
    set status = 'applied',
        decided_at = created_at,
        summary = '18 notions étaient dues : 4 reportées à jeudi pour rester sous 15 minutes.',
        payload = ${JSON.stringify({
          dedupeKey: `smooth:${SAP}:2026-11-11`,
          formationId: SAP,
          localDate: '2026-11-11',
          deferredTo: '2026-11-12',
          dueCount: 18,
          selectedCount: 14,
          deferredNotionIds: [],
          estimatedMinutes: 10,
          maxMinutes: 15,
          targetRetention: 0.9,
          reason: 'cap',
        })}::jsonb,
        undo_payload = ${JSON.stringify({
          formationId: SAP,
          localDate: '2026-11-11',
          deferredNotionIds: [],
        })}::jsonb
    where id = ${ACTION_ID}::uuid
  `);
}

async function reviewLogCount(): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.review_logs
    where user_id = ${ALEX_ID}::uuid
  `);
  return rows[0]?.count ?? 0;
}

test.beforeAll(async () => {
  await restoreDemoData();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  await resetDemoSmoothing();
  session = await createDemoSession(ALEX_ID, ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3141' })),
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

test('parcours SPEC-718 @SPEC-718', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await page.clock.setFixedTime(NOW);

  // CA-1 — defaults and the six admitted choices are the ones of the settings screen.
  await page.goto('/parametres#automatismes');
  const cap = page.getByTestId('automation-setting-plafond_quiz-maxMinutes');
  const retention = page.getByTestId('automation-setting-plafond_quiz-targetRetention');
  await expect(cap).toHaveValue('15');
  await expect(cap.locator('option')).toHaveText(['10 min', '15 min', '20 min', '30 min']);
  await expect(retention).toHaveValue('0.9');
  await expect(retention.locator('option')).toHaveText([
    '85 %',
    '90 %',
    '95 % (plus de révisions)',
  ]);
  await axeCheck();

  await page.goto(QUIZ);
  await expect(page.getByTestId('gq-rail')).toBeVisible({ timeout: 30_000 });
  const initialItems = await page.getByTestId('gq-rail').getByRole('button').count();
  expect(initialItems).toBeGreaterThan(0);
  const initialLogs = await reviewLogCount();

  // CA-2 — the tutor box states the cap and the deferred notions; the day can be reopened.
  await expect(page.getByTestId('review-cap')).toHaveText('Durée maximale : 15 min par jour.');
  await expect(page.getByTestId('review-deferred')).toContainText('notions');
  await expect(page.getByTestId('review-deferred')).toContainText('reportées à jeudi');
  await expect(page.getByTestId('review-smoothing-undo')).toHaveText('Annuler le lissage');
  await captureEvidence('spec-718-avant-annulation');

  const undone = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/me/automation-actions/${ACTION_ID}/undo`) &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('review-smoothing-undo').click();
  expect((await undone).status()).toBe(200);

  await expect(page.getByTestId('review-smoothing-undo')).toHaveCount(0);
  await expect(page.getByTestId('review-deferred')).toHaveCount(0);
  await expect
    .poll(async () => page.getByTestId('gq-rail').getByRole('button').count())
    .toBeGreaterThan(initialItems);
  const reopenedItems = await page.getByTestId('gq-rail').getByRole('button').count();
  expect(await reviewLogCount()).toBe(initialLogs);
  await captureEvidence('spec-718-apres-annulation');

  // Reloading keeps the reopened day and never duplicates an item or a review log.
  await page.reload();
  await expect(page.getByTestId('gq-rail').getByRole('button')).toHaveCount(reopenedItems);
  await expect(page.getByTestId('review-smoothing-undo')).toHaveCount(0);
  expect(await reviewLogCount()).toBe(initialLogs);
  await axeCheck();
  expect(consoleErrors).toEqual([]);

  // Error state: a failed read of the other mode keeps a distinct, accessible message.
  await page.route('**/api/v1/formations/**/global-quiz/today**', (route) => route.abort());
  await page.getByTestId('gq-mode-micro').click();
  await expect(page.getByTestId('gq-error')).toBeVisible({ timeout: 15_000 });
  await axeCheck();
});

test('conformité SPEC-718 @SPEC-718 @visual', async ({ page, axeCheck, captureEvidence }) => {
  await page.clock.setFixedTime(NOW);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(QUIZ);
  await expect(page.getByTestId('gq-rail')).toBeVisible({ timeout: 30_000 });

  await expect(page.getByTestId('review-cap')).toBeVisible();
  await expect(page.getByTestId('review-deferred')).toBeVisible();
  await expect(page.getByTestId('review-smoothing-undo')).toBeVisible();
  await expectTokens(page, {
    '[data-testid="gq-rationale"]': { 'background-color': colors.ink },
    '[data-testid="gq-rationale"] h2': { color: colors.lime },
    '[data-testid="review-cap"]': { color: colors['on-dark-secondary'] },
    '[data-testid="review-smoothing-undo"]': { color: colors.white },
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'spec-718-smoothed.png');
  await captureEvidence('spec-718-desktop');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(QUIZ);
  await expect(page.getByTestId('review-cap')).toBeVisible({ timeout: 30_000 });
  await expectScreenshotBaseline(page, 'spec-718-smoothed-mobile.png');
  await captureEvidence('spec-718-mobile');
  await axeCheck();
});
