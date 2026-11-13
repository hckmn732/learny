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

async function seedModule(userId: string, withSource: boolean): Promise<Seeded> {
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
      set title = 'Comptabilité générale',
          status = 'open',
          planned_start = '2026-11-02',
          planned_end = '2026-12-11'
      where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${userId}::uuid, ${moduleId}::uuid, 'open')
      on conflict (user_id, module_id) do update set status = 'open'
    `);
    await tx.execute(sql`
      update public.chapters
      set title = 'Saisie des pièces comptables'
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
    if (withSource) {
      const resource = await tx.execute<{ id: string }>(sql`
        insert into public.resources (
          owner_id, formation_id, chapter_id, kind, title, mime, status, storage_path
        ) values (
          ${userId}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
          'pdf', 'Guide utilisateur FI — saisie.pdf', 'application/pdf', 'ready',
          ${`${userId}/${randomUUID()}/guide.pdf`}
        )
        returning id::text as id
      `);
      const resourceId = resource[0]?.id ?? '';
      await tx.execute(sql`
        insert into public.resource_chunks (
          resource_id, owner_id, formation_id, chapter_id, position, text, location, token_count
        ) values (
          ${resourceId}::uuid, ${userId}::uuid, ${programme.formationId}::uuid, ${chapterId}::uuid,
          0,
          'Toute écriture comptable dans SAP S/4HANA est enregistrée sous forme de pièce. Une pièce réunit un en-tête et des postes.',
          '{"page":2,"charStart":0,"charEnd":120}'::jsonb,
          30
        )
      `);
    }
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    return { formationId: programme.formationId, moduleId, chapterId };
  });
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

test('cours généré avec sources @SPEC-608', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const seeded = await seedModule(session.userId, true);
  await generateAndOpen(page, seeded);

  await expect(page.getByTestId('course-title')).toHaveText('Saisie des pièces comptables');
  await expect(page.getByTestId('course-citation').first()).toContainText(
    'Guide utilisateur FI — saisie.pdf · p. 2',
  );
  await expect(page.getByTestId('course-tutor-complement')).toContainText(
    'Une pièce n’est enregistrée que si le total des débits est égal au total des crédits.',
  );
  await expect(page.getByTestId('course-tutor-complement')).toContainText('Complété par le tuteur');
  await expect(page.getByTestId('course-takeaway')).toBeVisible();
  await expect(page.getByTestId('course-takeaway').locator('li')).toHaveCount(4);
  await expect(page.getByTestId('course-confusion')).toContainText('Type de pièce');
  await expect(page.getByTestId('course-quick-question')).toBeVisible();
  await page.getByTestId('course-reveal').click();
  await expect(page.getByTestId('course-answer')).toContainText(
    'Dans chaque poste, grâce à la clé de comptabilisation.',
  );
  await captureEvidence('cours-sources');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('cours de base sans apport @SPEC-608', async ({ page, axeCheck, captureEvidence }) => {
  const seeded = await seedModule(session.userId, false);
  await generateAndOpen(page, seeded);

  await expect(page.getByTestId('course-base-notice')).toContainText(
    'Ce chapitre n’a pas encore d’apport',
  );
  await expect(page.getByTestId('course-suggestions')).toContainText(
    'Guide officiel de la notion',
  );
  await expect(page.getByTestId('course-citation')).toHaveCount(0);
  await captureEvidence('cours-base');
  await axeCheck();
});

test('conformité SPEC-608 @SPEC-608 @visual', async ({ page, axeCheck, captureEvidence }) => {
  const seeded = await seedModule(session.userId, true);
  await generateAndOpen(page, seeded);

  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="course-article"]': { 'background-color': colors.surface },
    '[data-testid="course-takeaway"]': { 'background-color': colors.ink, color: colors.white },
    '[data-testid="course-reveal"]': { 'background-color': colors.ink, color: colors.white },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('course-title')).toHaveText('Saisie des pièces comptables');
  await captureEvidence('cours-conformite');

  const comparisons = await compareRegions(page, {
    reference: REFERENCE,
    outputDir: 'test-results/visual/SPEC-608-desktop',
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
  await expectScreenshotBaseline(page, 'SCR-07-cours-desktop.png', { fullPage: true });
  await axeCheck();
});

test('conformité SPEC-608 mobile @SPEC-608 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const seeded = await seedModule(session.userId, true);
  await generateAndOpen(page, seeded);
  await captureEvidence('cours-mobile');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'SCR-07-cours-mobile.png', { fullPage: true });
  await axeCheck();
});
