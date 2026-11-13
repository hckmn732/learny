import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { createBrick } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const BASE = fileURLToPath(
  new URL('../../../../../design/references/SCR-11-base-desktop.png', import.meta.url),
);
const EXAM = fileURLToPath(
  new URL('../../../../../design/references/SCR-11-examen-desktop.png', import.meta.url),
);
const MODULE_TITLES = [
  'Fondamentaux et Fiori',
  'Structure organisationnelle',
  'Comptabilité générale',
  'Comptabilité fournisseurs',
  'Comptabilité clients',
  'Immobilisations',
  'Clôture et certification',
];

test.setTimeout(180_000);

let session: TestSession;

interface Seed {
  formationId: string;
  moduleIds: string[];
}

function choicePayload(label: string): unknown {
  return {
    stem: `Quelle interface donne accès aux applications de ${label} ?`,
    mode: 'single',
    options: [
      { id: 'a', text: 'Le Launchpad SAP Fiori', correct: true, notionId: null },
      { id: 'b', text: 'SAP GUI uniquement', correct: false, notionId: null },
      { id: 'c', text: 'SAP Analytics Cloud', correct: false, notionId: null },
      { id: 'd', text: 'Le portail client', correct: false, notionId: null },
    ],
    explanation: 'Le Launchpad Fiori présente les applications par rôle.',
    objective: 'Vérifier la navigation Fiori',
    sources: [],
  };
}

async function seedExam(options: { guide?: boolean } = {}): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    const userId = session.userId;
    const programme = await createTestProgramme(tx, userId, {
      modules: 7,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'SAP S/4HANA Finance',
    });
    for (const [moduleIndex, extra] of [
      [1, 2],
      [2, 4],
    ] as const) {
      const moduleId = programme.moduleIds[moduleIndex];
      if (moduleId === undefined) continue;
      const chapter = await tx.execute<{ id: string }>(sql`
        select id::text as id from public.chapters where module_id = ${moduleId}::uuid limit 1
      `);
      const chapterId = chapter[0]?.id;
      if (chapterId === undefined) continue;
      for (let index = 0; index < extra; index += 1) {
        await tx.execute(sql`
          insert into public.notions (
            formation_id, module_id, chapter_id, label, short_definition, position
          ) values (
            ${programme.formationId}::uuid, ${moduleId}::uuid, ${chapterId}::uuid,
            ${`Notion ${String(moduleIndex + 1)}.${String(index + 3)}`},
            'Définition courte', ${index + 3}
          )
        `);
      }
    }
    const resource = options.guide
      ? await tx.execute<{ id: string }>(sql`
          insert into public.resources (
            owner_id, formation_id, kind, origin, title, url, status, metadata
          ) values (
            ${userId}::uuid, ${programme.formationId}::uuid, 'exam_guide', 'learner',
            'Guide de certification', 'https://example.test/guide.pdf', 'ready',
            '{"examFormat":{"questions":20,"durationMin":40,"threshold":70}}'::jsonb
          )
          returning id::text as id
        `)
      : [];
    await tx.execute(sql`
      update public.formations
      set title = 'SAP S/4HANA Finance',
          objectives = '{exam}'::public.formation_objective[],
          start_date = '2026-11-02',
          end_date = '2026-12-11',
          default_threshold = 80,
          exam_format = ${
            options.guide
              ? JSON.stringify({
                  questions: 20,
                  durationMin: 40,
                  threshold: 70,
                  confirmed: true,
                  sourceResourceId: resource[0]?.id,
                })
              : null
          }::jsonb
      where id = ${programme.formationId}::uuid
    `);
    const modules = await tx.execute<{ id: string; position: number }>(sql`
      select id::text as id, position from public.modules
      where formation_id = ${programme.formationId}::uuid order by position
    `);
    for (const moduleRow of modules) {
      await tx.execute(sql`
        update public.modules
        set title = ${MODULE_TITLES[moduleRow.position - 1] ?? `Module ${String(moduleRow.position)}`},
            planned_start = '2026-11-02',
            planned_end = ${moduleRow.position >= 6 ? '2026-12-04' : '2026-11-30'}::date
        where id = ${moduleRow.id}::uuid
      `);
      if (moduleRow.position <= 3) {
        const validated = moduleRow.position < 3;
        await tx.execute(sql`
          insert into public.module_progress (user_id, module_id, status, validated_at)
          values (
            ${userId}::uuid, ${moduleRow.id}::uuid,
            ${validated ? 'validated' : 'open'}::public.module_status,
            ${validated ? '2026-11-09T18:00:00Z' : null}::timestamptz
          )
          on conflict (user_id, module_id) do update
          set status = excluded.status, validated_at = excluded.validated_at
        `);
      }
    }
    const notions = await tx.execute<{ id: string; label: string }>(sql`
      select id::text as id, label from public.notions
      where formation_id = ${programme.formationId}::uuid
      order by module_id, position
    `);
    for (const notion of notions) {
      await createBrick(tx, {
        ownerId: userId,
        formationId: programme.formationId,
        type: 'choice_question',
        purpose: 'bank',
        notionIds: [notion.id],
        payload: choicePayload(notion.label),
      });
    }
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${userId}::uuid, 'active', '2030-01-01T00:00:00Z')
      on conflict (user_id) do update set status = excluded.status
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    return {
      formationId: programme.formationId,
      moduleIds: modules.map((moduleRow) => moduleRow.id),
    };
  });
}

/** Seeds an expired attempt with 12 correct studied answers and 8 wrong diagnostic answers. */
async function seedExpiredAttempt(seed: Seed): Promise<string> {
  return serviceDb().transaction(async (tx) => {
    const userId = session.userId;
    const rows = await tx.execute<{
      brick_id: string;
      version_id: string;
      payload: unknown;
      notion_id: string;
      notion_label: string;
      module_id: string;
      position: number;
      title: string;
    }>(sql`
      select b.id::text as brick_id, bv.id::text as version_id, bv.payload,
             n.id::text as notion_id, n.label as notion_label,
             m.id::text as module_id, m.position, m.title
      from public.bricks b
      join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
      join public.notions n on n.id = b.notion_ids[1]
      join public.modules m on m.id = n.module_id
      where b.owner_id = ${userId}::uuid and b.formation_id = ${seed.formationId}::uuid
      order by m.position, b.id
    `);
    const questions = rows.slice(0, 20);
    const items = questions.map((question) => ({
      brickId: question.brick_id,
      brickVersionId: question.version_id,
      points: 5,
      notionId: question.notion_id,
      notionLabel: question.notion_label,
      type: 'choice_question',
      payload: question.payload,
      moduleId: question.module_id,
      modulePosition: question.position,
      moduleLabel: question.title,
      studied: question.position <= 3,
    }));
    const modules = [...new Set(items.map((item) => item.modulePosition))].map((position) => {
      const item = items.find((entry) => entry.modulePosition === position);
      return {
        moduleId: item?.moduleId ?? '',
        position,
        label: item?.moduleLabel ?? '',
        studied: position <= 3,
      };
    });
    const config = {
      threshold: 70,
      durationSec: 2_400,
      questionCount: items.length,
      scoring: 'equal',
      examFormat: {
        questionCount: 20,
        secondsPerQuestion: 120,
        durationMin: 40,
        threshold: 70,
        source: 'default',
        confirmed: true,
      },
      diagnosticPositions: items
        .map((item, index) => ({ item, position: index + 1 }))
        .filter((entry) => !entry.item.studied)
        .map((entry) => entry.position),
      modules,
    };
    const activity = await tx.execute<{ id: string }>(sql`
      insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
      values (
        ${userId}::uuid, ${seed.formationId}::uuid, null, 'mock_exam',
        ${JSON.stringify(config)}::jsonb, ${JSON.stringify(items)}::jsonb, 'ready'
      )
      returning id::text as id
    `);
    const activityId = activity[0]?.id ?? '';
    const attempt = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (
        user_id, activity_id, attempt_no, status, started_at, deadline_at
      ) values (
        ${userId}::uuid, ${activityId}::uuid, 1, 'in_progress',
        '2026-11-11T11:40:00Z'::timestamptz, '2026-11-11T12:00:00Z'::timestamptz
      )
      returning id::text as id
    `);
    const attemptId = attempt[0]?.id ?? '';
    for (const [index, item] of items.entries()) {
      const correct = item.studied;
      await tx.execute(sql`
        insert into public.answers (
          attempt_id, brick_version_id, position, response, max_score, answered_at
        ) values (
          ${attemptId}::uuid, ${item.brickVersionId}::uuid, ${index + 1},
          ${JSON.stringify({ optionIds: [correct ? 'a' : 'b'] })}::jsonb, 5,
          '2026-11-11T12:00:00Z'::timestamptz
        )
      `);
    }
    return attemptId;
  });
}

async function openIntro(page: import('@playwright/test').Page, seed: Seed): Promise<void> {
  await page.goto(`/formations/${seed.formationId}/examen-blanc`);
  await expect(page.getByTestId('exam-intro')).toBeVisible({ timeout: 30_000 });
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

test('examen blanc sans aide @SPEC-614', async ({ page, axeCheck, captureEvidence }) => {
  const seed = await seedExam();
  await openIntro(page, seed);
  await expect(page.getByTestId('exam-format-questions')).toHaveText('20');
  await expect(page.getByTestId('exam-format-duration')).toHaveText('40 min');
  await expect(page.getByTestId('exam-format-threshold')).toHaveText('70 %');
  await expect(page.getByTestId('exam-format-banner')).toContainText('20 questions');
  await expect(page.getByTestId('exam-next-exams')).toContainText('4 déc. et 11 déc.');
  await captureEvidence('introduction');
  await page.getByTestId('exam-start').click();

  await expect(page.getByTestId('exam-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('exam-timer')).toContainText('40:00');
  await expect(page.getByTestId('exam-answered')).toContainText('0 répondue sur 20');
  await expect(page.getByTestId('exam-palette')).toBeVisible();
  await expect(page.locator('[data-testid^="exam-palette-"]')).toHaveCount(20);
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
  await page.getByTestId('exam-option-a').click();
  await page.getByTestId('exam-mark').click();
  await expect(page.getByTestId('exam-mark')).toHaveText('Ne plus marquer');
  await expect(page.getByTestId('exam-palette-1')).toHaveAttribute('aria-label', /répondue, à revoir/);

  await page.reload();
  await expect(page.getByTestId('exam-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('exam-option-a')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('exam-palette-1')).toHaveAttribute('aria-label', /répondue, à revoir/);
  await expect(page.getByTestId('exam-timer')).toContainText('3');
  await captureEvidence('epreuve');

  await page.getByTestId('exam-submit').click();
  await expect(page.getByTestId('exam-confirm-dialog')).toContainText('19 questions sans réponse');
  await expect(page.getByTestId('exam-confirm-dialog')).toContainText('1 marquée pour revoir');
  await page.getByTestId('exam-confirm-finish').click();
  await expect(page.getByTestId('exam-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('exam-result-score')).toContainText('%');
  await captureEvidence('resultat');
  await axeCheck();
});

test('expiration et revue @SPEC-614', async ({ page, axeCheck, captureEvidence }) => {
  const seed = await seedExam();
  const attemptId = await seedExpiredAttempt(seed);
  await page.goto(`/formations/${seed.formationId}/examen-blanc/${attemptId}`);
  await expect(page.getByTestId('exam-result')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('exam-result-score')).toHaveText('60 %');
  await expect(page.getByTestId('exam-result-studied')).toHaveText('100 %');
  await expect(page.getByTestId('exam-result-diagnostic')).toHaveText('0 %');
  await expect(page.getByTestId('exam-result')).toContainText('Temps écoulé : 40 min');
  await captureEvidence('resultat-expire');

  await page.getByTestId('exam-review-toggle').click();
  await expect(page.getByTestId('exam-review')).toBeVisible();
  await page.getByTestId('exam-review-filter-errors').click();
  await expect(page.locator('li[data-testid^="exam-review-"]')).toHaveCount(8);
  await expect(page.locator('li[data-testid^="exam-review-"]').first()).toContainText('Module 4');
  await captureEvidence('revue-erreurs');
  await axeCheck();
});

test('conformité SPEC-614 @SPEC-614 @visual', async ({ page, axeCheck, captureEvidence }) => {
  const seed = await seedExam({ guide: true });
  await openIntro(page, seed);
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="exam-format-banner"]': { 'background-color': '#ECECFC' },
  });
  const introComparisons = await compareRegions(page, {
    reference: BASE,
    outputDir: 'test-results/visual/SPEC-614-desktop',
    regions: [
      {
        name: 'introduction',
        locator: page.getByTestId('exam-intro'),
        rect: { x: 390, y: 60, width: 900, height: 650 },
      },
    ],
  });
  for (const comparison of introComparisons) {
    await test.info().attach(`comparaison-${comparison.name}-side-by-side`, {
      path: comparison.sideBySidePath,
      contentType: 'image/png',
    });
    await test.info().attach(`comparaison-${comparison.name}-diff`, {
      path: comparison.diffPath,
      contentType: 'image/png',
    });
  }
  expect(
    introComparisons
      .filter((comparison) => comparison.ratio > MOCKUP_MAX_DIFF_RATIO)
      .map((comparison) => `${comparison.name}: ${comparison.ratio.toFixed(3)}`),
  ).toEqual([]);
  await expectScreenshotBaseline(page, 'SCR-11-introduction.png', { fullPage: true });
  await captureEvidence('conformite-introduction');

  await page.getByTestId('exam-start').click();
  await expect(page.getByTestId('exam-paper')).toBeVisible({ timeout: 30_000 });
  const examComparisons = await compareRegions(page, {
    reference: EXAM,
    outputDir: 'test-results/visual/SPEC-614-desktop',
    regions: [
      {
        name: 'epreuve',
        locator: page.getByTestId('exam-paper'),
        rect: { x: 200, y: 78, width: 1040, height: 460 },
      },
    ],
  });
  for (const comparison of examComparisons) {
    await test.info().attach(`comparaison-${comparison.name}-side-by-side`, {
      path: comparison.sideBySidePath,
      contentType: 'image/png',
    });
    await test.info().attach(`comparaison-${comparison.name}-diff`, {
      path: comparison.diffPath,
      contentType: 'image/png',
    });
  }
  expect(
    examComparisons
      .filter((comparison) => comparison.ratio > MOCKUP_MAX_DIFF_RATIO)
      .map((comparison) => `${comparison.name}: ${comparison.ratio.toFixed(3)}`),
  ).toEqual([]);
  await expectScreenshotBaseline(page, 'SCR-11-epreuve.png', { fullPage: true });
  await captureEvidence('conformite-epreuve');

  const expired = await seedExam();
  const attemptId = await seedExpiredAttempt(expired);
  await page.goto(`/formations/${expired.formationId}/examen-blanc/${attemptId}`);
  await expect(page.getByTestId('exam-result')).toBeVisible({ timeout: 30_000 });
  await expectScreenshotBaseline(page, 'SCR-11-resultat.png', { fullPage: true });
  await captureEvidence('conformite-resultat');
  await axeCheck();
});

test('conformité SPEC-614 mobile @SPEC-614 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const seed = await seedExam({ guide: true });
  await openIntro(page, seed);
  await captureEvidence('conformite-introduction-mobile');
  await page.getByTestId('exam-start').click();
  await expect(page.getByTestId('exam-paper')).toBeVisible({ timeout: 30_000 });
  await expectScreenshotBaseline(page, 'SCR-11-epreuve-mobile.png', { fullPage: true });
  await captureEvidence('conformite-epreuve-mobile');
  await axeCheck();
});
