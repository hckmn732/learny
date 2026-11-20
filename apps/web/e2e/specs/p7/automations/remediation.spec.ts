// SPEC-715 — automatisé 4 : remédiation après un quiz raté (SCR-09). The test seeds a failed
// validation attempt, runs the real automation (SPEC-715) with the frozen clock, then checks the
// result screen, the remediation and the journal/undo of the settings page.
import { randomUUID } from 'node:crypto';

import { runAutomation, type AutomationEngineContext } from '@learny/automations';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { createNotionState, makeModuleWithBank } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import {
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { seedOwnModels } from '../../../support/own-model';

const PREFIX = 'sdd-715-e2e-';
const NOW = '2026-11-11T12:20:00.000Z';
const SUBMITTED_AT = '2026-11-10T13:00:00.000Z';

let session: TestSession | null = null;

interface Seed {
  formationId: string;
  moduleId: string;
  attemptId: string;
}

const clock = { now: () => new Date(NOW) };

function engine(): AutomationEngineContext {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock,
    logger: createLogger({ level: 'error' }),
  };
}

async function seed(userId: string): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 6,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0] ?? '';
    await tx.execute(sql`
      update public.modules
      set title = 'Comptabilité générale', status = 'open', threshold = 80
      where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${userId}::uuid, ${moduleId}::uuid, 'open')
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz,
          timezone = 'Europe/Paris', current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${userId}::uuid, 2, '{1,2,3,4,5,6,7}'::smallint[], '{matin,apres_midi,soir}'::study_slot[])
      on conflict (user_id) do update
        set study_days = '{1,2,3,4,5,6,7}'::smallint[],
            preferred_slots = '{matin,apres_midi,soir}'::study_slot[]
    `);
    await seedOwnModels(userId, tx);
    await makeModuleWithBank(tx, {
      userId,
      formationId: programme.formationId,
      moduleId,
      notions: 6,
      variantsPerFormat: 3,
    });
    for (const [index, notionId] of programme.notionIds.slice(0, 3).entries()) {
      await createNotionState(tx, {
        userId,
        notionId,
        mastery: 20 + index * 10,
        gapNature: index === 0 ? 'confusion' : index === 1 ? 'application' : 'forgetting',
        evidence: 'Erreur observée au quiz de validation.',
      });
    }
    const activity = await tx.execute<{ id: string }>(sql`
      insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
      values (
        ${userId}::uuid, ${programme.formationId}::uuid, ${moduleId}::uuid,
        'validation_quiz', '{"threshold":80,"questionCount":6,"scoring":"equal"}'::jsonb,
        '[]'::jsonb, 'draft'
      ) returning id::text as id
    `);
    const attempt = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (
        user_id, activity_id, attempt_no, status, started_at, submitted_at, score, passed
      ) values (
        ${userId}::uuid, ${activity[0]?.id ?? ''}::uuid, 1, 'graded',
        ${SUBMITTED_AT}::timestamptz, ${SUBMITTED_AT}::timestamptz, 58, false
      ) returning id::text as id
    `);
    return {
      formationId: programme.formationId,
      moduleId,
      attemptId: attempt[0]?.id ?? '',
    };
  });
}

async function automate(userId: string, seedValue: Seed): Promise<void> {
  const result = await runAutomation(engine(), {
    key: 'remediation',
    userId,
    trigger: {
      type: 'event',
      name: 'quiz/graded',
      data: {
        userId,
        formationId: seedValue.formationId,
        attemptId: seedValue.attemptId,
        moduleId: seedValue.moduleId,
        score: 58,
        passed: false,
        threshold: 80,
        attemptNo: 1,
      },
    },
  });
  if (!result.ok) throw result.error;
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession({
    email: `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`,
  });
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3131' })),
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

test('quiz raté : remédiation prête et tentative différée @SPEC-715', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}, testInfo) => {
  const current = session;
  if (current === null) throw new Error('session absente');
  const seeded = await seed(current.userId);
  await automate(current.userId, seeded);
  const resultUrl = `/formations/${seeded.formationId}/modules/${seeded.moduleId}/quiz/${seeded.attemptId}/resultat`;

  await page.goto(resultUrl);
  await expect(page.getByTestId('quiz-result-graded')).toBeVisible({ timeout: 30_000 });

  // CA-4, EF-6 — bouton désactivé et date de disponibilité exacte (mercredi 11 nov. 14:00 Paris).
  await expect(page.getByTestId('quiz-retry')).toBeDisabled();
  await expect(page.getByTestId('quiz-retry')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('quiz-retry-available-at')).toContainText(
    'Nouvelle tentative possible mercredi 11 nov. à 14:00.',
  );
  await expect(page.getByTestId('quiz-retry-settings')).toHaveAttribute(
    'href',
    '/parametres#automatismes',
  );
  await expect(page.getByTestId('quiz-remediation')).toContainText('Remédiation ciblée · 15 min');
  await captureEvidence('resultat-delai');

  // CA-2 — the API answers 422 with the frozen instant, kept as evidence of the refusal.
  const blocked = await page.request.post(
    `/api/v1/modules/${seeded.moduleId}/quiz/attempts`,
    { headers: { origin: new URL(page.url()).origin, 'idempotency-key': randomUUID() } },
  );
  expect(blocked.status()).toBe(422);
  const problem = (await blocked.json()) as Record<string, unknown>;
  expect(problem).toMatchObject({
    code: 'RETRY_NOT_YET_ALLOWED',
    availableAt: '2026-11-11T13:00:00.000Z',
    remediationRequired: false,
  });
  await testInfo.attach('retry-422', {
    body: JSON.stringify(problem, null, 2),
    contentType: 'application/json',
  });

  // EF-6 — la remédiation ciblée s’ouvre depuis le résultat.
  await page.getByTestId('quiz-remediation').click();
  await expect(page.getByTestId('remediation-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('remediation-page')).toContainText('Remédiation ciblée');
  await page.goBack();
  await expect(page.getByTestId('quiz-result-graded')).toBeVisible();

  // EF-8 — la ligne du journal existe et « Annuler » lève le délai.
  await page.goto('/parametres#automatismes');
  const journal = page.getByTestId('automation-history');
  const row = journal
    .getByTestId('automation-journal-row')
    .filter({ hasText: 'Quiz à 58 %' })
    .first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/tentative 2 placée mercredi 14:\d{2}/);
  await captureEvidence('journal-remediation');
  const undone = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/automation-actions/') &&
      response.url().endsWith('/undo') &&
      response.request().method() === 'POST',
  );
  await row.getByTestId('automation-undo').click();
  expect((await undone).status()).toBe(200);
  await expect(journal.getByTestId('automation-journal-row').filter({ hasText: 'Annulé :' })).toHaveCount(1);

  await page.goto(resultUrl);
  await expect(page.getByTestId('quiz-result-graded')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz-retry')).toBeEnabled();
  await expect(page.getByTestId('quiz-retry')).toHaveAttribute('aria-disabled', 'false');
  await expect(page.getByTestId('quiz-retry-available-at')).toHaveCount(0);
  await captureEvidence('resultat-apres-annulation');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('résultat avec délai, jetons @SPEC-715 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const current = session;
  if (current === null) throw new Error('session absente');
  const seeded = await seed(current.userId);
  await automate(current.userId, seeded);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(
    `/formations/${seeded.formationId}/modules/${seeded.moduleId}/quiz/${seeded.attemptId}/resultat`,
  );
  await expect(page.getByTestId('quiz-result-graded')).toBeVisible({ timeout: 30_000 });

  await expectTokens(page, {
    body: { 'background-color': '#F4F4F1', color: '#111113' },
    '[data-testid="quiz-retry"]': {
      'border-top-color': '#DAD9D3',
      opacity: '0.55',
    },
    '[data-testid="quiz-remediation"]': { 'background-color': '#111113' },
    '[data-testid="quiz-retry-available-at"]': { color: '#62626B' },
    '[data-testid="quiz-retry-settings"]': { color: '#3A3AA8' },
  });
  await expect(page.getByTestId('quiz-retry-available-at')).toHaveCSS('font-size', '13px');
  await expect(page.getByTestId('quiz-retry-available-at')).toHaveCSS('text-align', 'right');
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expectScreenshotBaseline(
    page.getByTestId('quiz-result'),
    'quiz-resultat-delai.png',
  );
  await axeCheck();
  await captureEvidence('resultat-delai-visual');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByTestId('quiz-result-graded')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz-retry')).toBeDisabled();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await axeCheck();
  await captureEvidence('resultat-delai-mobile');
});
