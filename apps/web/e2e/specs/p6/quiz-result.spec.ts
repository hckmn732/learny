import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { createNotionState, makeModuleWithBank } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectTokens } from '@learny/testing/visual';

const NOW = '2026-11-11T12:20:00Z';

let session: TestSession;

interface Seed {
  formationId: string;
  moduleId: string;
  nextModuleId: string;
  attemptId: string;
}

async function seedResult(userId: string): Promise<Seed> {
  const base = await serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 12,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0] ?? '';
    const nextModuleId = programme.moduleIds[1] ?? '';
    await tx.execute(sql`
      update public.modules set status = 'open', threshold = 80,
        title = 'Comptabilité générale'
      where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      update public.modules set status = 'locked', threshold = 80,
        title = 'Comptabilité fournisseurs'
      where id = ${nextModuleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${userId}::uuid, ${moduleId}::uuid, 'open')
    `);
    await makeModuleWithBank(tx, {
      userId,
      formationId: programme.formationId,
      moduleId,
      notions: 12,
      variantsPerFormat: 3,
    });
    await tx.execute(sql`
      update public.profiles set onboarding_step = 'done', timezone = 'Europe/Paris',
        current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${userId}::uuid, 'active', '2030-01-01T00:00:00Z')
    `);
    const ids = programme.notionIds.slice(0, 12);
    const gaps = [
      { nature: 'confusion', mastery: 20, evidence: 'Confondue avec le type de pièce dans 2 réponses.' },
      { nature: 'misunderstanding', mastery: 35, evidence: 'Erreurs aux tentatives 1 et 2, réponses ouvertes à côté du sujet.' },
      { nature: 'application', mastery: 55, evidence: 'Définition juste, mais exercice de saisie échoué.' },
    ] as const;
    for (const [index, notionId] of ids.entries()) {
      const gap = gaps[index];
      await createNotionState(tx, {
        userId,
        notionId,
        mastery: gap?.mastery ?? 90,
        ...(gap === undefined ? {} : { gapNature: gap.nature, evidence: gap.evidence }),
      });
    }
    const activity = await tx.execute<{ id: string }>(sql`
      insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
      values (
        ${userId}::uuid, ${programme.formationId}::uuid, ${moduleId}::uuid,
        'validation_quiz', '{"threshold":80,"questionCount":12,"scoring":"equal"}'::jsonb,
        '[]'::jsonb, 'draft'
      ) returning id::text as id
    `);
    const activityId = activity[0]?.id ?? '';
    const first = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (
        user_id, activity_id, attempt_no, status, started_at, submitted_at, score, passed
      ) values (
        ${userId}::uuid, ${activityId}::uuid, 1, 'graded',
        ${NOW}::timestamptz, ${NOW}::timestamptz, 58, false
      ) returning id::text as id
    `);
    const second = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (
        user_id, activity_id, attempt_no, status, started_at, submitted_at, score, passed, per_notion
      ) values (
        ${userId}::uuid, ${activityId}::uuid, 2, 'graded',
        ${NOW}::timestamptz, ${NOW}::timestamptz, 72, false,
        ${JSON.stringify(
          Object.fromEntries(
            ids.map((id, index) => [id, { correct: index < 8 ? 1 : 0, total: 1, score: index < 8 ? 100 : 0 }]),
          ),
        )}::jsonb
      ) returning id::text as id
    `);
    expect(first[0]?.id).toBeTruthy();
    return {
      formationId: programme.formationId,
      moduleId,
      nextModuleId,
      attemptId: second[0]?.id ?? '',
    };
  });
  return base;
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = 'done', timezone = 'Europe/Paris'
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

test('échec, lacunes puis remédiation @SPEC-612', async ({ page, axeCheck, captureEvidence, consoleErrors }) => {
  const seed = await seedResult(session.userId);
  await page.goto(
    `/formations/${seed.formationId}/modules/${seed.moduleId}/quiz/${seed.attemptId}/resultat`,
  );
  await expect(page.getByTestId('quiz-result-graded')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz-result')).toBeVisible();
  await expect(page.getByTestId('result-status')).toHaveText('Pas encore validé');
  await expect(page.getByTestId('result-headline')).toHaveText('Encore 8 points pour valider.');
  await expect(page.getByTestId('result-threshold-caption')).toHaveText('trait : seuil 80 %');
  await expect(page.getByTestId('result-gap-card')).toHaveCount(3);
  await expect(page.getByTestId('result-gap-card').first()).toContainText('Notion 1.1.1');
  await expect(page.getByTestId('result-gap-card').first()).toContainText('Confusion');
  await expect(page.getByTestId('result-gap-card').first()).toContainText(
    'une question qui oppose les deux notions.',
  );
  await expect(page.getByTestId('result-mastered')).toContainText('9 notions maîtrisées');
  await expect(page.getByTestId('result-retry')).toBeDisabled();
  await expect(page.getByText(/Disponible jeu\. 12 nov\. à/)).toBeVisible();
  await captureEvidence('result-fail');

  await page.getByTestId('result-remediation').click();
  await expect(page.getByTestId('remediation-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('remediation-page')).toContainText('Remédiation ciblée');
  await expect(page.getByTestId('remediation-prepare')).toBeVisible();
  await captureEvidence('remediation-ready');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('résultat échec conforme @SPEC-612 @visual', async ({ page, axeCheck, captureEvidence }) => {
  const seed = await seedResult(session.userId);
  await page.goto(
    `/formations/${seed.formationId}/modules/${seed.moduleId}/quiz/${seed.attemptId}/resultat`,
  );
  await expect(page.getByTestId('quiz-result-graded')).toBeVisible({ timeout: 30_000 });
  await expectTokens(page, {
    body: { 'background-color': 'rgb(244, 244, 241)', color: 'rgb(17, 17, 19)' },
    '[data-testid="result-score"]': { 'background-color': 'rgb(255, 255, 255)' },
    '[data-testid="result-status"]': { 'background-color': 'rgb(255, 237, 224)' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await captureEvidence('result-pass');
  await axeCheck();
});
