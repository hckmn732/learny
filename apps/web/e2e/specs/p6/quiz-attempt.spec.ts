import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme } from '@learny/db/testing';
import { createBrick, makeModuleWithBank } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import {
  createTestSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const NOW = '2026-11-11T12:20:00Z';

test.setTimeout(120_000);

let session: TestSession;

interface Seed {
  formationId: string;
  moduleId: string;
  attemptId: string | null;
  notionIds: string[];
}

interface QuestionSeed {
  brickId: string;
  versionId: string;
  notionId: string;
  notionLabel: string;
  type: 'choice_question' | 'cloze' | 'matching' | 'open_question';
  payload: unknown;
}

function choiceOption(id: string, text: string, correct: boolean, notionId: string | null) {
  return { id, text, correct, notionId };
}

function targetChoice(notionIds: string[]): unknown {
  return {
    stem: 'Quel élément classe l’ensemble d’une pièce comptable ?',
    mode: 'single',
    options: [
      choiceOption('cle', 'La clé de comptabilisation', false, notionIds[1] ?? null),
      choiceOption('type', 'Le type de pièce', true, notionIds[0] ?? null),
      choiceOption('ledger', 'Le ledger', false, notionIds[2] ?? null),
      choiceOption('plan', 'Le plan comptable', false, notionIds[3] ?? null),
    ],
    explanation:
      'Le type de pièce, par exemple SA, classe toute la pièce. La clé de comptabilisation agit poste par poste : c’est la confusion la plus fréquente.',
    objective: 'Distinguer le type de pièce de la clé de comptabilisation',
    sources: [],
  };
}

function clozePayload(): unknown {
  return {
    template:
      'Dans SAP S/4HANA, toutes les écritures sont stockées dans un journal unique, le journal {{1}}, dont la table s’appelle {{2}}.',
    gaps: [
      { id: 1, answers: ['universel'] },
      { id: 2, answers: ['ACDOCA'] },
    ],
    explanation:
      'Le journal universel réunit dans une seule table les écritures de la finance et du contrôle de gestion.',
    sources: [],
  };
}

function matchingPayload(notionId: string): unknown {
  return {
    instruction: 'Associez chaque élément à sa signification.',
    pairs: [
      { id: 'k40', left: 'Clé 40', right: 'Débit sur un compte général', notionId },
      { id: 'k50', left: 'Clé 50', right: 'Crédit sur un compte général', notionId },
      { id: 'sa', left: 'Type SA', right: 'Pièce de comptabilité générale', notionId },
    ],
    extraRights: [],
    explanation: 'Clé 40 : débit. Clé 50 : crédit. SA : pièce de comptabilité générale.',
    sources: [],
  };
}

function openPayload(stem: string): unknown {
  return {
    stem,
    expectedElements: ['La règle essentielle', 'Un exemple concret'],
    criteria: [
      { key: 'comprehension', label: 'Compréhension', points: 1, description: 'Règle exacte.' },
    ],
    answerMaxChars: 2000,
    modelAnswer: 'Une pièce réunit un en-tête et des postes équilibrés.',
    explanation: 'La réponse attendue reprend la règle de la pièce comptable.',
    objective: 'Vérifier la compréhension',
    sources: [],
  };
}

async function customBrick(
  userId: string,
  formationId: string,
  type: QuestionSeed['type'],
  notionId: string,
  payload: unknown,
): Promise<QuestionSeed> {
  const created = await serviceDb().transaction((tx) =>
    createBrick(tx, {
      ownerId: userId,
      formationId,
      type,
      purpose: 'validation',
      notionIds: [notionId],
      payload,
    }),
  );
  return {
    brickId: created.id,
    versionId: created.versionId,
    notionId,
    notionLabel: type === 'open_question' ? 'Pièce comptable' : 'Type de pièce',
    type,
    payload,
  };
}

async function bankQuestions(
  userId: string,
  type: QuestionSeed['type'],
  count: number,
  skip: Set<string>,
): Promise<QuestionSeed[]> {
  const rows = await serviceDb().execute<{
    brick_id: string;
    version_id: string;
    notion_id: string;
    notion_label: string;
    payload: unknown;
    type: string;
  }>(sql`
    select b.id::text as brick_id, bv.id::text as version_id,
           b.notion_ids[1]::text as notion_id, n.label as notion_label,
           bv.payload, b.type::text as type
    from public.bricks b
    join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
    join public.notions n on n.id = b.notion_ids[1]
    where b.owner_id = ${userId}::uuid and b.type = ${type} and b.status = 'active'
    order by b.id
  `);
  return rows
    .filter((row) => !skip.has(row.brick_id))
    .slice(0, count)
    .map((row) => ({
      brickId: row.brick_id,
      versionId: row.version_id,
      notionId: row.notion_id,
      notionLabel: row.notion_label,
      type,
      payload: row.payload,
    }));
}

async function seedAttempt(
  userId: string,
  seed: Seed,
  questions: QuestionSeed[],
  checkedBefore: number,
): Promise<string> {
  const activityId = await serviceDb().transaction(async (tx) => {
    const config = { threshold: 80, questionCount: questions.length, scoring: 'equal' };
    const points = 100 / questions.length;
    const activity = await tx.execute<{ id: string }>(sql`
      insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
      values (
        ${userId}::uuid, ${seed.formationId}::uuid, ${seed.moduleId}::uuid,
        'validation_quiz', ${JSON.stringify(config)}::jsonb,
        ${JSON.stringify(
          questions.map((question) => ({
            brickId: question.brickId,
            brickVersionId: question.versionId,
            points,
            notionId: question.notionId,
            notionLabel: question.notionLabel,
            type: question.type,
            payload: question.payload,
          })),
        )}::jsonb,
        'ready'
      )
      returning id::text as id
    `);
    const id = activity[0]?.id ?? '';
    const attempt = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (user_id, activity_id, attempt_no, status, started_at)
      values (${userId}::uuid, ${id}::uuid, 2, 'in_progress', ${NOW}::timestamptz)
      returning id::text as id
    `);
    const attemptId = attempt[0]?.id ?? '';
    for (const [index, question] of questions.entries()) {
      const checked = index < checkedBefore;
      await tx.execute(sql`
        insert into public.answers (
          attempt_id, brick_version_id, position, response, is_correct, score, max_score,
          graded_by, feedback, answered_at
        ) values (
          ${attemptId}::uuid, ${question.versionId}::uuid, ${index + 1},
          ${JSON.stringify(
            checked && question.type === 'open_question'
              ? { text: 'Réponse déjà vérifiée.' }
              : checked
                ? { optionIds: ['a'] }
                : {},
          )}::jsonb,
          ${checked ? true : null}, ${checked ? points : null}, ${points},
          ${checked ? 'code' : null},
          ${checked ? JSON.stringify({ title: 'Exact.', explanation: 'Déjà vérifié.' }) : null}::jsonb,
          ${NOW}::timestamptz
        )
      `);
    }
    return attemptId;
  });
  return activityId;
}

async function seedQuiz(
  userId: string,
  options: { withAttempt?: boolean; checkedBefore?: number; withBank?: boolean } = {},
): Promise<Seed> {
  const withBank = options.withBank !== false;
  const base = await serviceDb().transaction(async (tx) => {
    if (!withBank) {
      const programme = await createTestProgramme(tx, userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 11,
        title: 'SAP S/4HANA Finance',
      });
      const moduleId = programme.moduleIds[0] ?? '';
      await tx.execute(sql`
        update public.modules set title = 'Comptabilité générale', status = 'open', threshold = 80
        where id = ${moduleId}::uuid
      `);
      await tx.execute(sql`
        insert into public.module_progress (user_id, module_id, status)
        values (${userId}::uuid, ${moduleId}::uuid, 'open')
      `);
      await createTestCourse(tx, {
        ownerId: userId,
        moduleId,
        sectionsPerChapter: 1,
      });
      await tx.execute(sql`
        update public.profiles set onboarding_step = 'done',
          current_formation_id = ${programme.formationId}::uuid
        where id = ${userId}::uuid
      `);
      await tx.execute(sql`
        insert into public.subscriptions (user_id, status, current_period_end)
        values (${userId}::uuid, 'active', '2030-01-01T00:00:00Z')
      `);
      return { formationId: programme.formationId, moduleId, notionIds: programme.notionIds };
    }
    const programme = await makeModuleWithBank(tx, {
      userId,
      notions: 11,
      variantsPerFormat: 4,
      title: 'SAP S/4HANA Finance',
    });
    await tx.execute(sql`
      update public.formations set title = 'SAP S/4HANA Finance'
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${userId}::uuid, 'active', '2030-01-01T00:00:00Z')
    `);
    return {
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      notionIds: programme.notionIds,
    };
  });

  await serviceDb().execute(sql`
    update public.formations
    set start_date = '2026-11-02',
        end_date = '2026-12-11',
        volume_hours = 150,
        default_threshold = 80
    where id = ${base.formationId}::uuid
  `);
  await serviceDb().execute(sql`
    update public.modules
    set planned_start = '2026-11-02', planned_end = '2026-12-11'
    where id = ${base.moduleId}::uuid
  `);

  const seed: Seed = { ...base, attemptId: null };
  if (options.withAttempt === false) return seed;

  const notion = base.notionIds[0] ?? '';
  const q1 = await customBrick(userId, base.formationId, 'open_question', notion, openPayload('Expliquez ce qu’est une pièce comptable.'));
  const q2 = (await bankQuestions(userId, 'choice_question', 1, new Set()))[0];
  const q3 = (await bankQuestions(userId, 'choice_question', 1, new Set([q2?.brickId ?? ''])))[0];
  const q4 = await customBrick(
    userId,
    base.formationId,
    'choice_question',
    notion,
    targetChoice(base.notionIds),
  );
  const q5 = await customBrick(userId, base.formationId, 'cloze', notion, clozePayload());
  const q6 = await customBrick(userId, base.formationId, 'matching', notion, matchingPayload(notion));
  const skip = new Set([
    q1.brickId,
    q2?.brickId ?? '',
    q3?.brickId ?? '',
    q4.brickId,
    q5.brickId,
    q6.brickId,
  ]);
  const choices = await bankQuestions(userId, 'choice_question', 3, skip);
  const opens = await bankQuestions(userId, 'open_question', 2, new Set());
  const questions = [q1, q2, q3, q4, q5, q6, ...choices, ...opens].filter(
    (question): question is QuestionSeed => question !== undefined,
  );
  while (questions.length < 12) {
    const index = questions.length;
    questions.push(
      await customBrick(userId, base.formationId, 'choice_question', notion, {
        stem: `Question de secours ${String(index)} sur la pièce comptable ?`,
        mode: 'single',
        options: [
          choiceOption('a', 'La règle exacte', true, notion),
          choiceOption('b', 'Une confusion', false, base.notionIds[1] ?? null),
          choiceOption('c', 'Un autre élément', false, base.notionIds[2] ?? null),
        ],
        explanation: 'La règle exacte s’applique à toute la pièce.',
        objective: 'Compléter la tentative de démonstration',
        sources: [],
      }),
    );
  }
  const attemptId = await seedAttempt(userId, seed, questions.slice(0, 12), options.checkedBefore ?? 0);
  return { ...seed, attemptId };
}

async function openQuiz(page: import('@playwright/test').Page, seed: Seed): Promise<void> {
  await page.goto(
    `/formations/${seed.formationId}/modules/${seed.moduleId}/quiz`,
  );
  await expect(page.getByTestId('quiz-page')).toBeVisible({ timeout: 30_000 });
}

async function checkAndNext(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('quiz-check').click();
  await expect(page.getByTestId('quiz-feedback')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('quiz-next').click();
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
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

test('passe une tentative complète @SPEC-611', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const seed = await seedQuiz(session.userId);
  await openQuiz(page, seed);

  await expect(page.getByTestId('quiz-attempt-badge')).toHaveText('Tentative 2');
  await expect(page.getByTestId('quiz-threshold-badge')).toHaveText('Seuil 80 %');
  await expect(page.getByTestId('quiz-question-counter')).toHaveText('Question 1 sur 12');
  await page.getByTestId('quiz-open-answer').fill('Une pièce réunit un en-tête et des postes.');
  await checkAndNext(page);

  await page.getByTestId('quiz-option-a').click();
  await page.getByTestId('quiz-check').click();
  await page.getByTestId('quiz-next').click();
  await page.getByTestId('quiz-option-a').click();
  await page.getByTestId('quiz-check').click();
  await page.getByTestId('quiz-next').click();

  await expect(page.getByTestId('quiz-question-counter')).toHaveText('Question 4 sur 12');
  await expect(page.getByTestId('quiz-question-type')).toHaveText('Choix unique');
  await expect(page.getByTestId('quiz-question-notion')).toHaveText('Notion : Type de pièce');
  await page.getByTestId('quiz-option-cle').click();
  await page.getByTestId('quiz-check').click();
  await expect(page.getByTestId('quiz-feedback')).toContainText('Pas tout à fait.');
  await expect(page.getByTestId('quiz-feedback')).toContainText('Le type de pièce');
  await expect(page.getByTestId('quiz-option-cle')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('quiz-option-cle')).toBeDisabled();
  await captureEvidence('question-4');
  await page.getByTestId('quiz-next').click();

  await page.getByTestId('quiz-gap-1').fill('universel');
  await page.getByTestId('quiz-gap-2').fill('ACDOCA');
  await page.getByTestId('quiz-check').click();
  await expect(page.getByTestId('quiz-feedback')).toContainText('Exact.');
  await page.getByTestId('quiz-next').click();

  await page.getByTestId('quiz-match-k40').selectOption({ label: 'Débit sur un compte général' });
  await page.getByTestId('quiz-match-k50').selectOption({ label: 'Crédit sur un compte général' });
  await page.getByTestId('quiz-match-sa').selectOption({ label: 'Pièce de comptabilité générale' });
  await checkAndNext(page);

  for (let index = 7; index <= 12; index += 1) {
    await expect(page.getByTestId('quiz-question-counter')).toContainText(
      `Question ${String(index)} sur 12`,
    );
    const open = page.getByTestId('quiz-open-answer');
    if ((await open.count()) > 0 && (await open.isVisible())) {
      await open.pressSequentially('Une pièce a un en-tête et des postes équilibrés.', { delay: 5 });
    } else {
      await page.getByTestId('quiz-option-a').click();
    }
    await page.getByTestId('quiz-check').click();
    await expect(page.getByTestId('quiz-feedback')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('quiz-next').click();
  }

  await expect(page.getByTestId('quiz-result')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('quiz-result-graded')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz-result-score')).toContainText('%');
  await captureEvidence('resultat');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('reprise après rechargement @SPEC-611', async ({ page }) => {
  const seed = await seedQuiz(session.userId);
  await openQuiz(page, seed);
  await page.getByTestId('quiz-open-answer').fill('Brouillon conservé.');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByTestId('quiz-question-counter')).toHaveText('Question 1 sur 12');
  await expect(page.getByTestId('quiz-open-answer')).toHaveValue('Brouillon conservé.');
  await checkAndNext(page);
  await page.reload();
  await expect(page.getByTestId('quiz-question-counter')).toHaveText('Question 2 sur 12');
});

test('banque épuisée puis préparée @SPEC-611', async ({ page }) => {
  const seed = await seedQuiz(session.userId, { withAttempt: false, withBank: false });
  await page.goto(`/formations/${seed.formationId}/modules/${seed.moduleId}/quiz`);
  await expect(page.getByTestId('quiz-preparing')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz-preparing')).toContainText(
    'Le tuteur prépare de nouvelles questions',
  );
  await serviceDb().transaction((tx) =>
    makeModuleWithBank(tx, {
      userId: session.userId,
      formationId: seed.formationId,
      moduleId: seed.moduleId,
      notions: 11,
      variantsPerFormat: 4,
    }),
  );
  await page.reload();
  await expect(page.getByTestId('quiz-question')).toBeVisible({ timeout: 30_000 });
});

test('correction en attente si le tuteur est indisponible @SPEC-611', async ({ page }) => {
  const seed = await seedQuiz(session.userId);
  await serviceDb().execute(sql`
    update public.answers
    set is_correct = true,
        score = max_score,
        graded_by = 'code',
        feedback = '{"title":"Exact.","explanation":"Déjà vérifié."}'::jsonb,
        response = '{"optionIds":["a"]}'::jsonb
    where attempt_id = ${seed.attemptId}::uuid and position <> 10
  `);
  await serviceDb().execute(sql`
    delete from public.subscriptions where user_id = ${session.userId}::uuid
  `);
  await openQuiz(page, seed);
  await page.getByTestId('quiz-open-answer').fill('Une réponse complète sur la pièce comptable.');
  await page.getByTestId('quiz-check').click();
  await expect(page.getByTestId('quiz-feedback')).toContainText('Réponse enregistrée.');
  for (let index = 0; index < 3; index += 1) {
    const next = page.getByTestId('quiz-next');
    if ((await next.count()) === 0) break;
    await next.click();
    await page.waitForTimeout(300);
  }
  await expect(page.getByTestId('quiz-result-pending')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz-result-retry')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('quiz-result-pending')).toContainText(
    'Correction des questions ouvertes en attente',
  );
});

test('écran de question conforme @SPEC-611 @visual', async ({ page, axeCheck, captureEvidence }) => {
  const seed = await seedQuiz(session.userId);
  await openQuiz(page, seed);
  for (let index = 0; index < 3; index += 1) {
    if (index === 0) {
      await page.getByTestId('quiz-open-answer').fill('Une pièce comptable.');
    } else {
      await page.getByTestId('quiz-option-a').click();
    }
    await checkAndNext(page);
  }
  await expect(page.getByTestId('quiz-question-counter')).toHaveText('Question 4 sur 12');
  await expectTokens(page, {
    body: { 'background-color': 'rgb(244, 244, 241)', color: 'rgb(17, 17, 19)' },
    '[data-testid="quiz-question"]': { 'background-color': 'rgb(255, 255, 255)' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await page.getByTestId('quiz-option-cle').click();
  await page.getByTestId('quiz-check').click();
  await expect(page.getByTestId('quiz-feedback')).toContainText('Pas tout à fait.');
  await captureEvidence('feedback-faux');
  await expectScreenshotBaseline(page, 'quiz-question.png', { fullPage: true });
  await axeCheck();
});
