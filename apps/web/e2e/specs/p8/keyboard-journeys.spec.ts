// SPEC-803 EF-3, CA-2 — the six critical journeys are completed with Tab, Maj+Tab, Enter, Space,
// Escape and arrows only. A guard replaces every page.mouse method with a failing stub: a pointer
// event in any of these tests fails immediately.
import { randomBytes } from 'node:crypto';

import type { Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import { createDemoSession, supabaseLocalEnv, type TestSession } from '@learny/testing/supabase';

import {
  deleteReviewLearner,
  quizUrl,
  seedReviewLearner,
  signInLearner,
  type ReviewLearner,
} from '../../journeys/support/review-automations';
import {
  deleteDemoAttempts,
  resetDemoRateLimits,
  seedDemoExamAttempts,
  type DemoExamAttempts,
} from '../../support/demo-exam';
import { seedOwnModels } from '../../support/own-model';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');

let session: TestSession;
let exam: DemoExamAttempts;
let created: string[] = [];
let passwordUser: { id: string; email: string } | null = null;
const PASSWORD = `pw-${randomBytes(10).toString('hex')}`;

test.setTimeout(180_000);

function forbidMouse(page: Page): void {
  const target = page as unknown as { mouse: Record<string, () => void> };
  for (const method of ['move', 'down', 'up', 'click', 'dblclick', 'wheel']) {
    target.mouse[method] = () => {
      throw new Error(`La souris est interdite dans un parcours clavier (${method})`);
    };
  }
}

async function focusAnd(page: Page, testId: string, key = 'Enter'): Promise<void> {
  const target = page.getByTestId(testId);
  await expect(target).toBeVisible();
  await target.focus();
  await page.keyboard.press(key);
}

/**
 * The demonstration dataset has no question bank for module quizzes (ADR-0334): like
 * `specs/p6/quiz-attempt.spec.ts` (SPEC-611), a dedicated learner receives a module with a complete
 * bank (`makeModuleWithBank`) and an in-progress validation attempt of three choice questions drawn
 * from it, so the journey reaches its result screen without touching the demo data.
 */
async function seedKeyboardQuiz(): Promise<{
  quizSession: TestSession;
  formationId: string;
  moduleId: string;
}> {
  const { makeModuleWithBank } = await import('@learny/testing');
  const { createTestSession } = await import('@learny/testing/supabase');
  const quizSession = await createTestSession();
  const userId = quizSession.userId;
  const seeded = await serviceDb().transaction(async (tx) => {
    const bank = await makeModuleWithBank(tx, {
      userId,
      notions: 3,
      variantsPerFormat: 1,
      title: 'SAP S/4HANA Finance',
    });
    await seedOwnModels(userId, tx);
    await tx.execute(sql`
      update public.formations
      set start_date = '2026-11-02',
          end_date = '2026-12-11',
          volume_hours = 150,
          default_threshold = 80
      where id = ${bank.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set planned_start = '2026-11-02', planned_end = '2026-12-11'
      where id = ${bank.moduleId}::uuid
    `);
    const rows = await tx.execute<{
      brick_id: string;
      version_id: string;
      notion_id: string;
      notion_label: string;
      payload: unknown;
    }>(sql`
      select b.id::text as brick_id, bv.id::text as version_id,
             n.id::text as notion_id, n.label as notion_label, bv.payload
      from public.bricks b
      join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
      join public.notions n on n.id = b.notion_ids[1]
      where b.owner_id = ${userId}::uuid and b.type = 'choice_question' and b.status = 'active'
        and n.module_id = ${bank.moduleId}::uuid
      order by n.position, b.id
      limit 3
    `);
    if (rows.length < 3) throw new Error('banque de questions à choix incomplète');
    const points = 100 / rows.length;
    const items = rows.map((row) => ({
      brickId: row.brick_id,
      brickVersionId: row.version_id,
      points,
      notionId: row.notion_id,
      notionLabel: row.notion_label,
      type: 'choice_question',
      payload: row.payload,
    }));
    const config = { threshold: 80, questionCount: items.length, scoring: 'equal' };
    const activity = await tx.execute<{ id: string }>(sql`
      insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
      values (
        ${userId}::uuid, ${bank.formationId}::uuid, ${bank.moduleId}::uuid, 'validation_quiz',
        ${JSON.stringify(config)}::jsonb, ${JSON.stringify(items)}::jsonb, 'ready'
      )
      returning id::text as id
    `);
    const attempt = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (user_id, activity_id, attempt_no, status, started_at)
      values (${userId}::uuid, ${activity[0]?.id ?? ''}::uuid, 1, 'in_progress', '2026-11-11T12:20:00Z')
      returning id::text as id
    `);
    for (const [index, row] of rows.entries()) {
      await tx.execute(sql`
        insert into public.answers (
          attempt_id, brick_version_id, position, response, max_score, answered_at
        )
        values (
          ${attempt[0]?.id ?? ''}::uuid, ${row.version_id}::uuid, ${index + 1}, '{}'::jsonb,
          ${points}, '2026-11-11T12:20:00Z'::timestamptz
        )
      `);
    }
    return { formationId: bank.formationId, moduleId: bank.moduleId };
  });
  return { quizSession, ...seeded };
}

async function createPasswordUser(): Promise<{ id: string; email: string }> {
  const email = `e2e803-${randomBytes(5).toString('hex')}@test.learny.test`;
  const { url, serviceRoleKey } = supabaseLocalEnv();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const createdUser = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { timezone: 'Europe/Paris' },
  });
  if (createdUser.error !== null) throw new Error(createdUser.error.message);
  const id = createdUser.data.user.id;
  const updated = await admin
    .from('profiles')
    .update({ onboarding_step: 'done' })
    .eq('id', id);
  if (updated.error !== null) throw new Error(updated.error.message);
  return { id, email };
}

async function clearDemoQuizAttempts(): Promise<void> {
  await serviceDb().execute(sql`
    delete from public.attempts
    where user_id = ${demoUserId('alex')}::uuid
      and activity_id in (
        select id from public.activities
        where owner_id = ${demoUserId('alex')}::uuid
          and kind = 'validation_quiz'::public.activity_kind
      )
      and status = 'in_progress'::public.attempt_status
  `);
}

test.beforeAll(async () => {
  await restoreDemoData();
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
  exam = await seedDemoExamAttempts();
  created = [exam.inProgressId, exam.gradedId];
  passwordUser = await createPasswordUser();
  await clearDemoQuizAttempts();
});

test.afterAll(async () => {
  await deleteDemoAttempts(created);
  if (passwordUser !== null) {
    const { url, serviceRoleKey } = supabaseLocalEnv();
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    await admin.auth.admin.deleteUser(passwordUser.id);
  }
  await restoreDemoData();
  await resetDemoRateLimits();
  await closeDb();
});

async function applyDemo(context: import('@playwright/test').BrowserContext, baseURL: string | undefined): Promise<void> {
  await context.clearCookies();
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
}

test('parcours clavier connexion @SPEC-803', async ({ page }) => {
  forbidMouse(page);
  const user = passwordUser;
  if (user === null) throw new Error('utilisateur mot de passe absent');
  await page.goto('/connexion');
  await focusAnd(page, 'auth-method-password', 'Enter');
  await page.getByTestId('auth-email').focus();
  await page.keyboard.type(user.email);
  await page.getByTestId('auth-password').focus();
  await page.keyboard.type(PASSWORD);
  await focusAnd(page, 'auth-submit', 'Enter');
  await expect(page).toHaveURL(/\/accueil$/);
  await expect(page.getByRole('link', { name: /Aller au contenu/ })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /Aller au contenu/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenu')).toBeFocused();
});

// SPEC-807 reprend ce parcours (ADR-0334) : la banque et la tentative sont semées comme dans
// quiz-attempt.spec.ts (SPEC-611), pour un apprenant dédié.
test('parcours clavier quiz de validation @SPEC-803', async ({ page, context, baseURL }) => {
  forbidMouse(page);
  const { deleteTestSession } = await import('@learny/testing/supabase');
  const seeded = await seedKeyboardQuiz();
  try {
    await context.clearCookies();
    await context.addCookies(
      seeded.quizSession.cookies.map((cookie) => ({
        ...cookie,
        url: baseURL ?? 'http://127.0.0.1:3100',
      })),
    );
    await page.goto(`/formations/${seeded.formationId}/modules/${seeded.moduleId}/quiz`);
    await expect(page.getByTestId('quiz-question-counter')).toBeVisible({ timeout: 30_000 });
    for (let index = 0; index < 3; index += 1) {
      const options = page.locator('[data-testid^="quiz-option-"]');
      await options.first().focus();
      await page.keyboard.press('Space');
      await focusAnd(page, 'quiz-check', 'Enter');
      await expect(page.getByTestId('quiz-next')).toBeVisible({ timeout: 20_000 });
      await focusAnd(page, 'quiz-next', 'Enter');
      if (index < 2) {
        await expect(page.getByTestId('quiz-question-counter')).toBeVisible();
      }
    }
    await expect(page.getByTestId('quiz-result')).toBeVisible({ timeout: 30_000 });
  } finally {
    await deleteTestSession(seeded.quizSession);
  }
});

// Réactivé par SPEC-807 (ADR-0334) : le 500 de GET /mock-exams/:id/result venait de la tentative
// semée sans lignes `answers` (seedDemoExamAttempts les crée désormais comme startExamAttempt).
test('parcours clavier examen blanc @SPEC-803', async ({ page, context, baseURL }) => {
  forbidMouse(page);
  await applyDemo(context, baseURL);
  // The seeded graded attempt only carries display data: the result of the new attempt must not
  // be compared with it.
  await deleteDemoAttempts([exam.gradedId]);
  await page.goto(`/formations/${SAP}/examen-blanc/${exam.inProgressId}`);
  await expect(page.getByTestId('exam-screen')).toBeVisible({ timeout: 30_000 });
  const examOption = page.locator('[data-testid^="exam-option-"]').first();
  await examOption.focus();
  await page.keyboard.press('Space');
  await focusAnd(page, 'exam-mark', 'Space');
  await focusAnd(page, 'exam-palette-2', 'Enter');
  await focusAnd(page, 'exam-next', 'Enter');
  await focusAnd(page, 'exam-submit', 'Enter');
  await expect(page.getByTestId('exam-confirm-dialog')).toBeVisible();
  await focusAnd(page, 'exam-confirm-finish', 'Enter');
  await expect(page.getByTestId('exam-result')).toBeVisible({ timeout: 30_000 });
});

// Réactivé par SPEC-807 (ADR-0334) : séance isolée et stable (fixture des révisions).
let quizLearner: ReviewLearner | null = null;

test.afterAll(async () => {
  await deleteReviewLearner(quizLearner);
});

test('parcours clavier quiz global @SPEC-803', async ({ page, context, baseURL }) => {
  test.setTimeout(360_000);
  forbidMouse(page);
  // SPEC-807 (ADR-0334) — isolated learner: one game of each kind (recall card, matching,
  // categorization, ordering, cloze), all due at the frozen instant; only their order varies.
  quizLearner = await seedReviewLearner({ prefix: 'e2e803-quiz-', bank: 'games' });
  await signInLearner(context, quizLearner, baseURL);
  await page.goto(quizUrl(quizLearner));
  await expect(page.getByTestId('gq-game').or(page.getByTestId('gq-end'))).toBeVisible({
    timeout: 30_000,
  });
  for (let turn = 0; turn < 40; turn += 1) {
    if ((await page.getByTestId('gq-end').count()) > 0) break;
    const currentId = await page
      .getByTestId('gq-rail')
      .locator('[aria-current="step"]')
      .getAttribute('data-testid');
    if ((await page.getByTestId('gq-recall').count()) > 0) {
      await focusAnd(page, 'recall-card-flip', 'Enter');
      await expect(page.getByTestId('recall-grade-good')).toBeVisible({ timeout: 10_000 });
      await focusAnd(page, 'recall-grade-good', 'Enter');
    } else if ((await page.getByTestId('game-matching').count()) > 0) {
      const lefts = await page.locator('[data-testid^="matching-left-"]').count();
      for (let index = 1; index <= lefts; index += 1) {
        await focusAnd(page, `matching-left-${String(index)}`, 'Enter');
        await focusAnd(page, `matching-right-${String(index)}`, 'Enter');
      }
      await focusAnd(page, 'matching-verify', 'Enter');
    } else if ((await page.getByTestId('game-categorization').count()) > 0) {
      const rows = await page.locator('[data-testid^="categorization-row-"]').count();
      for (let index = 1; index <= rows; index += 1) {
        await focusAnd(page, `categorization-choice-${String(index)}-1`, 'Enter');
      }
      await focusAnd(page, 'categorization-verify', 'Enter');
    } else if ((await page.getByTestId('game-ordering').count()) > 0) {
      await focusAnd(page, 'ordering-verify', 'Enter');
    } else if ((await page.getByTestId('game-cloze').count()) > 0) {
      const gaps = page.locator('input[data-testid^="cloze-gap-"]');
      const count = await gaps.count();
      for (let index = 0; index < count; index += 1) {
        await gaps.nth(index).focus();
        await page.keyboard.type('réponse');
      }
      // The last gap owns the Enter shortcut of the cloze game (SPEC-701), which frees the
      // journey from depending on the position of the verify button.
      await gaps.nth(count - 1).focus();
      await page.keyboard.press('Enter');
    }
    await expect(page.getByTestId('gq-next')).toBeEnabled({ timeout: 15_000 });
    const finishes = await page.getByTestId('gq-next').textContent();
    await focusAnd(page, 'gq-next', 'Enter');
    if (finishes?.includes('Terminer la session')) {
      await expect(page.getByTestId('gq-end')).toBeVisible({ timeout: 30_000 });
      break;
    }
    await expect
      .poll(() =>
        page
          .getByTestId('gq-rail')
          .locator('[aria-current="step"]')
          .getAttribute('data-testid'),
      )
      .not.toBe(currentId);
  }
  await expect(page.getByTestId('gq-end')).toBeVisible({ timeout: 30_000 });
});

test('parcours clavier carte des notions @SPEC-803', async ({ page, context, baseURL }) => {
  forbidMouse(page);
  await applyDemo(context, baseURL);
  await page.goto(`/formations/${SAP}/carte`);
  await page.getByTestId('graph-search').focus();
  await page.keyboard.type('clé');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('graph-detail')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('graph-course-link')).toBeVisible({ timeout: 15_000 });
  await focusAnd(page, 'graph-course-link', 'Enter');
  await expect(page).toHaveURL(/\/cours/);
});

test('parcours clavier paramètres @SPEC-803', async ({ page, context, baseURL }) => {
  forbidMouse(page);
  await applyDemo(context, baseURL);
  await page.goto('/parametres#profil');
  const profileTab = page.getByTestId('settings-tab-profil');
  await expect(profileTab).toHaveAttribute('aria-selected', 'true');
  // Hydration may move the focus once: retry until the tab keeps it.
  await expect(async () => {
    await profileTab.focus();
    await expect(profileTab).toBeFocused({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await profileTab.press('ArrowRight');
  await expect(page.getByTestId('settings-tab-notifications')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByTestId('settings-tab-notifications').press('End');
  await expect(page.getByTestId('settings-tab-abonnement')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByTestId('settings-tab-abonnement').press('Home');
  await expect(page.getByTestId('settings-tab-profil')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('settings-tab-profil').press('ArrowRight');
  const weekend = page.getByTestId('weekend-rule-switch');
  await expect(weekend).toBeVisible({ timeout: 20_000 });
  const before = await weekend.getAttribute('aria-checked');
  await weekend.focus();
  await page.keyboard.press('Space');
  await expect(weekend).not.toHaveAttribute('aria-checked', before ?? 'false');
  // The tab saves on change and announces the confirmation in its polite live region.
  await expect(page.getByTestId('notification-settings-status')).not.toBeEmpty({
    timeout: 20_000,
  });
});
