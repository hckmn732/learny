// SPEC-716 — automatisme 5 : jeu choisi selon la lacune (SCR-10). The functional journey seeds a
// forgetting gap, runs the real automation, checks the rail reason and the tutor box, answers the
// imposed card and verifies the journal line can no longer be undone. The visual test uses the
// demonstration dataset of SPEC-115 with the frozen clock of ADR-0047.
import { randomUUID } from 'node:crypto';

import { runAutomation, type AutomationEngineContext } from '@learny/automations';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoUserId } from '@learny/db/seed/fixtures';
import { createTestCourse, createTestProgramme } from '@learny/db/testing';
import { createBrick, createNotionState, makeModuleWithBank } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const PREFIX = 'sdd-716-e2e-';
const NOW = '2026-11-11T12:20:00.000Z';
const DETECTED_AT = '2026-11-06T16:42:00+01:00';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');

let session: TestSession | null = null;

const clock = { now: () => new Date(NOW) };

function engine(): AutomationEngineContext {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock,
    logger: createLogger({ level: 'error' }),
  };
}

const RECALL_PAYLOAD = {
  front: 'Que définit une variante d’exercice comptable ?',
  back: 'Le nombre de périodes comptables d’un exercice.',
  sourceLabel: 'votre cours du module 1, chapitre 1',
  sources: [],
};

async function seed(userId: string): Promise<{ formationId: string; notionId: string }> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 3,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0] ?? '';
    const notionId = programme.notionIds[0] ?? '';
    await tx.execute(sql`
      update public.modules set status = 'validated', threshold = 80 where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status, validated_at)
      values (${userId}::uuid, ${moduleId}::uuid, 'validated', '2026-10-20T08:00:00Z'::timestamptz)
      on conflict (user_id, module_id) do update set status = 'validated'
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz,
          timezone = 'Europe/Paris', current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${userId}::uuid, 2, '{1,2,3,4,5,6,7}'::smallint[], '{soir}'::study_slot[])
      on conflict (user_id) do update set study_days = '{1,2,3,4,5,6,7}'::smallint[]
    `);
    await createTestCourse(tx, { ownerId: userId, moduleId });
    await makeModuleWithBank(tx, {
      userId,
      formationId: programme.formationId,
      moduleId,
      notions: 3,
      variantsPerFormat: 1,
    });
    await createBrick(tx, {
      ownerId: userId,
      formationId: programme.formationId,
      type: 'recall_card',
      purpose: 'bank',
      notionIds: [notionId],
      payload: RECALL_PAYLOAD,
    });
    await createNotionState(tx, {
      userId,
      notionId,
      gapNature: 'forgetting',
      mastery: 42,
      dueAt: new Date('2026-11-11T08:00:00Z'),
    });
    await tx.execute(sql`
      update public.notion_states
      set gap_detected_at = ${DETECTED_AT}::timestamptz
      where user_id = ${userId}::uuid and notion_id = ${notionId}::uuid
    `);
    return { formationId: programme.formationId, notionId };
  });
}

async function automate(userId: string, seeded: { formationId: string; notionId: string }): Promise<void> {
  const result = await runAutomation(engine(), {
    key: 'jeu_lacune',
    userId,
    trigger: {
      type: 'event',
      name: 'gap/detected',
      data: {
        userId,
        formationId: seeded.formationId,
        notionId: seeded.notionId,
        nature: 'forgetting',
      },
    },
  });
  if (!result.ok) throw result.error;
  if (result.value.created !== 1) throw new Error('action de jeu non créée');
}

test.describe('automatisme 5 — test utilisateur', () => {
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

  test('raison du choix dans le quiz global @SPEC-716', async ({
    page,
    axeCheck,
    captureEvidence,
    consoleErrors,
  }, testInfo) => {
    const current = session;
    if (current === null) throw new Error('session absente');
    const seeded = await seed(current.userId);
    await automate(current.userId, seeded);
    const quizUrl = `/formations/${seeded.formationId}/quiz-global`;

    await page.goto(quizUrl);
    await expect(page.getByTestId('global-quiz-rail-reason')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('global-quiz-rail-reason')).toHaveText(
      'Choisi pour votre oubli',
    );
    await expect(page.getByTestId('global-quiz-tuned-gap')).toContainText('Lacune en priorité');
    await expect(page.getByTestId('global-quiz-tuned-gap')).toContainText(
      'revient en carte de rappel.',
    );
    await captureEvidence('rail-raison');
    await captureEvidence('encadre-regle');

    // CA-5 — jouer la carte imposée consomme l’action et ferme la fenêtre d’annulation.
    await page.getByTestId('recall-card-flip').click();
    await page.getByTestId('recall-grade-good').click();
    await expect(page.getByTestId('gq-next')).toBeEnabled({ timeout: 15_000 });

    await page.goto('/parametres#automatismes');
    const journal = page.getByTestId('automation-history');
    const row = journal
      .getByTestId('automation-journal-row')
      .filter({ hasText: 'carte de rappel ajoutée au quiz global' })
      .first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.getByTestId('automation-undo')).toHaveCount(0);
    await captureEvidence('journal-jeu-consomme');
    await axeCheck();
    expect(consoleErrors).toEqual([]);

    const consumed = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.automation_actions
      where user_id = ${current.userId}::uuid and automation = 'jeu_lacune'
      order by created_at desc limit 1
    `);
    await testInfo.attach('action-status', {
      body: JSON.stringify(consumed, null, 2),
      contentType: 'application/json',
    });
    expect(consumed[0]?.status).toBe('consumed');
  });
});

test.describe('automatisme 5 — démonstration', () => {
  test.beforeAll(async () => {
    await serviceDb().execute(sql`
      delete from public.activities
      where owner_id = ${demoUserId('alex')}::uuid
        and kind = 'global_quiz_session'::public.activity_kind
    `);
    await serviceDb().execute(sql`
      update public.automation_actions
      set status = 'applied'
      where user_id = ${demoUserId('alex')}::uuid and automation = 'jeu_lacune'
    `);
  });

  test.beforeEach(async ({ context, baseURL }) => {
    if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
    session = await createDemoSession(demoUserId('alex'), ALEX.email);
    await context.addCookies(
      session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3131' })),
    );
    await serviceDb().execute(sql`
      delete from public.activities
      where owner_id = ${demoUserId('alex')}::uuid
        and kind = 'global_quiz_session'::public.activity_kind
    `);
  });

  test.afterEach(async () => {
    const current = session;
    if (current !== null) await deleteTestSession(current);
    session = null;
  });

  test('quiz global, raison du jeu @SPEC-716 @visual', async ({ page, axeCheck }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/formations/${SAP}/quiz-global`);
    await expect(page.getByTestId('gq-rail')).toBeVisible({ timeout: 30_000 });

    await expect(page.getByTestId('global-quiz-rail-reason').first()).toHaveText(
      'Choisi pour votre oubli',
    );
    await expect(page.getByTestId('global-quiz-tuned-gap')).toContainText(
      'Lacune en priorité : Variante d’exercice, oubliée depuis le 6 nov., revient en carte de rappel.',
    );

    await expectTokens(page, {
      '[data-testid="global-quiz-rail-reason"]': {
        color: colors['orange-ink'],
        'font-size': '11px',
        'font-weight': '700',
      },
      '[data-testid="gq-rationale"]': { 'background-color': colors.ink },
      '[data-testid="gq-rationale"] h2': { color: colors.lime },
      '[data-testid="global-quiz-tuned-gap"]': { color: colors['on-dark-secondary'] },
    });

    await expectScreenshotBaseline(page, 'quiz-global-raison.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/formations/${SAP}/quiz-global`);
    await expect(page.getByTestId('global-quiz-rail-reason').first()).toBeVisible({
      timeout: 30_000,
    });
    await expectScreenshotBaseline(page, 'quiz-global-raison-mobile.png');
    await axeCheck();
  });
});

test.afterAll(async () => {
  await closeDb();
});
