import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const NOW = '2026-11-11T12:20:00Z';
const REFERENCE = fileURLToPath(
  new URL('../../../../../design/references/SCR-07-base-desktop.png', import.meta.url),
);

let session: TestSession;

interface Seeded {
  formationId: string;
  moduleId: string;
  chapterId: string;
}

async function seedModule(userId: string): Promise<Seeded> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0] ?? '';
    const chapterId = programme.chapterIds[0] ?? '';
    await tx.execute(sql`
      update public.formations
      set title = 'SAP S/4HANA Finance',
          description = 'Comprendre la comptabilité générale de SAP S/4HANA.',
          volume_hours = 150,
          start_date = '2026-11-02',
          end_date = '2026-12-11',
          default_threshold = 80
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set title = 'Comptabilité générale', status = 'open',
          planned_start = '2026-11-02', planned_end = '2026-12-11'
      where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${userId}::uuid, ${moduleId}::uuid, 'open')
      on conflict (user_id, module_id) do update set status = 'open'
    `);
    await tx.execute(sql`
      update public.chapters set title = 'Saisie des pièces comptables'
      where id = ${chapterId}::uuid
    `);
    await tx.execute(sql`
      insert into public.chapter_progress (user_id, chapter_id, contributions_status, updated_at)
      values (${userId}::uuid, ${chapterId}::uuid, 'in_progress', ${NOW}::timestamptz)
      on conflict (user_id, chapter_id) do update set contributions_status = 'in_progress'
    `);
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${userId}::uuid, 'active', '2030-01-01T00:00:00Z')
    `);
    const resource = await tx.execute<{ id: string }>(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, title, mime, status, storage_path
      ) values (
        ${userId}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
        'pdf', 'Guide FI', 'application/pdf', 'ready',
        ${`${userId}/${randomUUID()}/guide.pdf`}
      )
      returning id::text as id
    `);
    await tx.execute(sql`
      insert into public.resource_chunks (
        resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count
      ) values (
        ${resource[0]?.id ?? ''}::uuid, ${userId}::uuid, ${programme.formationId}::uuid,
        ${chapterId}::uuid, 0,
        'Toute écriture comptable dans SAP S/4HANA est enregistrée sous forme de pièce. Une pièce réunit un en-tête et des postes.',
        '{"page":4,"charStart":0,"charEnd":120}'::jsonb, 30
      )
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    return { formationId: programme.formationId, moduleId, chapterId };
  });
}

async function generateAndOpen(
  page: import('@playwright/test').Page,
  seeded: Seeded,
): Promise<void> {
  await page.goto(`/formations/${seeded.formationId}/modules/${seeded.moduleId}`);
  await expect(page.getByTestId('module-page')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('chapter-complete').click();
  await expect(page.getByTestId('module-notice')).toContainText('Génération du cours demandée.', {
    timeout: 60_000,
  });
  await page.goto(
    `/formations/${seeded.formationId}/modules/${seeded.moduleId}/cours?chapitre=${seeded.chapterId}`,
  );
  await expect(page.getByTestId('course-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('course-article')).toBeVisible({ timeout: 30_000 });
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

test('lit et résume un chapitre @SPEC-609', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const seeded = await seedModule(session.userId);
  await generateAndOpen(page, seeded);

  await expect(page.getByTestId('course-toc')).toBeVisible();
  await expect(page.getByTestId('course-title')).toHaveText('Saisie des pièces comptables');
  await expect(page.getByTestId('course-progress')).toBeVisible();
  await expect(page.getByTestId('course-quiz-card')).toContainText(
    'Prêt pour le quiz de validation ?',
  );
  await expect(page.getByTestId('course-source').first()).toContainText('Guide FI · p. 4');

  const citationId = await page.getByTestId('course-source').first().getAttribute('data-citation-id');
  expect(citationId).not.toBeNull();
  const source = await page.request.get(`/api/v1/course-citations/${String(citationId)}/source`);
  expect(source.status()).toBe(200);
  const resolved = (await source.json()) as { page: number | null; url: string | null };
  expect(resolved.page).toBe(4);
  expect(resolved.url).toContain('page=4');

  await page.getByTestId('course-reveal').click();
  await expect(page.getByTestId('course-answer')).toContainText(
    'Dans chaque poste, grâce à la clé de comptabilisation.',
  );

  await page.getByTestId('chapter-summary-input').fill(
    'Une pièce a un en-tête avec les dates et le type. Sur chaque poste, la clé dit si c’est un débit ou un crédit.',
  );
  await page.getByTestId('chapter-summary-submit').click();
  await expect(page.getByTestId('chapter-summary-feedback')).toContainText('Ce qui manque', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('chapter-summary-feedback')).toContainText('équilibrée');

  const courseResponse = await page.request.get(
    `/api/v1/modules/${seeded.moduleId}/course?chapitre=${seeded.chapterId}`,
  );
  const screen = (await courseResponse.json()) as {
    course: { id: string; sections: { id: string }[] };
  };
  const sectionIds = screen.course.sections.map((section) => section.id);
  const keyOne = randomUUID();
  const first = await page.request.put(`/api/v1/courses/${screen.course.id}/progress`, {
    headers: { 'Idempotency-Key': keyOne },
    data: { chapterId: seeded.chapterId, visibleSectionIds: sectionIds.slice(0, 3) },
  });
  expect(first.status()).toBe(200);
  const sixty = (await first.json()) as { chapterPercent: number; coursePercent: number };
  const lower = await page.request.put(`/api/v1/courses/${screen.course.id}/progress`, {
    headers: { 'Idempotency-Key': randomUUID() },
    data: { chapterId: seeded.chapterId, visibleSectionIds: sectionIds.slice(0, 1) },
  });
  const stayed = (await lower.json()) as { chapterPercent: number };
  expect(stayed.chapterPercent).toBe(sixty.chapterPercent);
  await page.reload();
  await expect(page.getByTestId('course-progress')).toHaveAttribute(
    'aria-valuenow',
    String(sixty.chapterPercent),
  );

  await captureEvidence('lecture-resume');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('signale et corrige une section @SPEC-609', async ({ page, axeCheck, captureEvidence }) => {
  const seeded = await seedModule(session.userId);
  await generateAndOpen(page, seeded);

  await page.getByTestId('course-section-report').first().click();
  await page.getByTestId('course-section-reason').fill('La clé 40 est décrite à l’envers.');
  await page.getByTestId('course-section-report-submit').click();
  await expect(page.getByTestId('course-section-reported').first()).toContainText(
    'Section signalée · exclue des nouveaux quiz',
    { timeout: 30_000 },
  );

  await page.getByTestId('course-section-edit').first().click();
  await page
    .getByTestId('course-section-content')
    .fill('## L’en-tête de pièce\n\nLa clé 40 débite, la clé 50 crédite.');
  await page.getByTestId('course-section-save').click();
  await expect(page.getByTestId('course-section-reported')).toHaveCount(0, { timeout: 30_000 });
  await page.reload();
  await expect(page.getByTestId('course-article')).toContainText('La clé 40 débite');
  await expect(page.getByTestId('course-article')).toContainText('Version 2');

  await captureEvidence('signalement-correction');
  await axeCheck();
});

test('conformité SPEC-609 @SPEC-609 @visual', async ({ page, axeCheck, captureEvidence }) => {
  const seeded = await seedModule(session.userId);
  await generateAndOpen(page, seeded);

  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="course-article"]': { 'background-color': colors.surface },
    '[data-testid="course-takeaway"]': { 'background-color': colors.ink, color: colors.white },
    '[data-testid="course-quiz-card"]': { 'background-color': 'rgba(0, 0, 0, 0)' },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('course-title')).toHaveText('Saisie des pièces comptables');
  await captureEvidence('cours-sans-tuteur');

  const comparisons = await compareRegions(page, {
    reference: REFERENCE,
    outputDir: 'test-results/visual/SPEC-609-desktop',
    regions: [
      {
        name: 'article',
        locator: page.getByTestId('course-article'),
        rect: { x: 536, y: 116, width: 834, height: 2077 },
      },
    ],
  });
  for (const comparison of comparisons) {
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
    comparisons
      .filter((comparison) => comparison.ratio > MOCKUP_MAX_DIFF_RATIO)
      .map((comparison) => `${comparison.name}: ${comparison.ratio.toFixed(3)}`),
  ).toEqual([]);
  await expectScreenshotBaseline(page, 'SCR-07-sans-tuteur-desktop.png', { fullPage: true });
  await axeCheck();
});

test('conformité SPEC-609 mobile @SPEC-609 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const seeded = await seedModule(session.userId);
  await generateAndOpen(page, seeded);
  await captureEvidence('cours-sans-tuteur-mobile');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'SCR-07-sans-tuteur-mobile.png', { fullPage: true });
  await axeCheck();
});
