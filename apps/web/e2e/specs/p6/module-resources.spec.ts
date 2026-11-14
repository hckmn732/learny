import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { processResource } from '@learny/ingestion';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import {
  MOCKUP_MAX_DIFF_RATIO,
  compareRegions,
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

import { buildPdf } from '../../../../../packages/services/test/support/files';

const NOW = '2026-11-11T12:20:00Z';
const REFERENCE = fileURLToPath(
  new URL('../../../../../design/references/SCR-06-base-desktop.png', import.meta.url),
);

let session: TestSession;

interface Seeded {
  formationId: string;
  moduleId: string;
  chapters: string[];
}

async function seedModule(userId: string): Promise<Seeded> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 7,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[2] ?? '';
    const chapter1 = programme.chapterIds[2] ?? '';
    const chapter2 = await tx.execute<{ id: string }>(sql`
      insert into public.chapters (module_id, formation_id, position, title, created_at, updated_at)
      values (${moduleId}::uuid, ${programme.formationId}::uuid, 2, 'Saisie des pièces comptables', ${NOW}::timestamptz, ${NOW}::timestamptz)
      returning id::text as id
    `);
    const chapter3 = await tx.execute<{ id: string }>(sql`
      insert into public.chapters (module_id, formation_id, position, title, created_at, updated_at)
      values (${moduleId}::uuid, ${programme.formationId}::uuid, 3, 'Journal universel (ACDOCA)', ${NOW}::timestamptz, ${NOW}::timestamptz)
      returning id::text as id
    `);
    const chapter4 = await tx.execute<{ id: string }>(sql`
      insert into public.chapters (module_id, formation_id, position, title, created_at, updated_at)
      values (${moduleId}::uuid, ${programme.formationId}::uuid, 4, 'Ledgers parallèles', ${NOW}::timestamptz, ${NOW}::timestamptz)
      returning id::text as id
    `);
    const chapters = [chapter1, chapter2[0]?.id ?? '', chapter3[0]?.id ?? '', chapter4[0]?.id ?? ''];
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
    const titles = [
      'Fondamentaux de SAP S/4HANA et navigation Fiori',
      'Structure organisationnelle de la Finance',
      'Comptabilité générale',
      'Comptabilité fournisseurs',
      'Comptabilité clients',
      'Immobilisations',
      'Clôture de période et préparation à la certification',
    ];
    for (const [index, id] of programme.moduleIds.entries()) {
      const position = index + 1;
      const status = position < 3 ? 'validated' : position === 3 ? 'open' : 'locked';
      await tx.execute(sql`
        update public.modules
        set title = ${titles[index] ?? `Module ${String(position)}`},
            planned_start = ${position <= 3 ? '2026-11-02' : '2026-12-07'}::date,
            planned_end = ${position <= 3 ? '2026-11-13' : '2026-12-11'}::date,
            status = ${status}::public.module_status
        where id = ${id}::uuid
      `);
      await tx.execute(sql`
        insert into public.module_progress (
          user_id, module_id, status, opened_at, validated_at, updated_at
        )
        values (
          ${userId}::uuid, ${id}::uuid, ${status}::public.module_status,
          ${status === 'locked' ? null : NOW}::timestamptz,
          ${status === 'validated' ? NOW : null}::timestamptz,
          ${NOW}::timestamptz
        )
        on conflict (user_id, module_id) do update
        set status = excluded.status,
            opened_at = excluded.opened_at,
            validated_at = excluded.validated_at
      `);
    }
    await tx.execute(sql`
      update public.chapters set title = 'Plan comptable et comptes généraux'
      where id = ${chapter1}::uuid
    `);
    const done = [true, false, true, true];
    for (const [index, id] of chapters.entries()) {
      await tx.execute(sql`
        insert into public.chapter_progress (
          user_id, chapter_id, contributions_status, done_at, updated_at
        )
        values (
          ${userId}::uuid, ${id}::uuid,
          ${done[index] === true ? 'done' : 'in_progress'}::public.contrib_status,
          ${done[index] === true ? NOW : null}::timestamptz,
          ${NOW}::timestamptz
        )
        on conflict (user_id, chapter_id) do update
        set contributions_status = excluded.contributions_status, done_at = excluded.done_at
      `);
    }
    // Mockup-like apports: PDF, note, web page and image, all ready.
    const resources: Array<[string, string, string | null, string | null, number | null, string | null]> = [
      ['pdf', 'Guide utilisateur FI — saisie.pdf', null, 'application/pdf', 2_400_000, null],
      ['note', 'Clés de comptabilisation : 40 = débit, 50 = crédit ? À vérifier', 'Note', null, null, null],
      ['web', 'Article : les ledgers parallèles dans S/4HANA', null, null, null, 'https://example.test/ledgers'],
      ['image', 'Capture du journal universel', null, 'image/png', 180_000, null],
    ];
    for (const [kind, title, content, mime, size, url] of resources) {
      await tx.execute(sql`
        insert into public.resources (
          owner_id, formation_id, chapter_id, kind, title, content_text, mime, size_bytes, url,
          storage_path, status
        )
        values (
          ${userId}::uuid, ${programme.formationId}::uuid, ${chapters[1]}::uuid, ${kind}::public.resource_kind,
          ${title}, ${content}, ${mime}, ${size}, ${url},
          ${kind === 'pdf' || kind === 'image' ? `${userId}/${randomUUID()}/fichier.bin` : null},
          'ready'
        )
      `);
    }
    await tx.execute(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, origin, suggestion_status, title, url, status,
        metadata
      )
      values (
        ${userId}::uuid, ${programme.formationId}::uuid, ${chapters[1]}::uuid, 'web',
        'tutor_suggestion', 'pending', 'Synthèse des écritures comptables',
        'https://example.test/synthese', 'queued',
        '{"suggestionReason":"Une synthèse courte pour vérifier les bases avant le quiz."}'::jsonb
      )
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    return { formationId: programme.formationId, moduleId, chapters };
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

async function openModule(
  page: import('@playwright/test').Page,
  seeded: Seeded,
): Promise<void> {
  await page.goto(
    `/formations/${seeded.formationId}/modules/${seeded.moduleId}?chapitre=${seeded.chapters[1] ?? ''}`,
  );
  await expect(page.getByTestId('module-page')).toBeVisible({ timeout: 30_000 });
}

test('dépose des apports et termine un chapitre @SPEC-607', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const seeded = await seedModule(session.userId);
  await openModule(page, seeded);
  await expect(page.getByRole('heading', { level: 1, name: 'Comptabilité générale' })).toBeVisible();
  await expect(page.getByTestId('module-chapters')).toBeVisible();
  await expect(page.getByTestId('module-chapter-1')).toHaveAttribute('data-chapter-status', 'done');
  await expect(page.getByTestId('module-chapter-2')).toHaveAttribute(
    'data-chapter-status',
    'in_progress',
  );
  await expect(page.getByTestId('resource-dropzone')).toBeVisible();
  await expect(page.getByTestId('resource-suggestions')).toBeVisible();

  // A note and a real PDF, through the same service as the browser.
  await page.getByLabel('Idées et brouillons').fill('Le journal universel regroupe la finance.');
  await page.getByRole('button', { name: 'Ajouter la note' }).click();
  await expect(
    page.getByTestId('resource-list').getByText('Le journal universel regroupe la finance.'),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('resource-status').last()).toBeVisible();
  const pdf = buildPdf({ pages: 2 });
  await page
    .getByLabel('PDF', { exact: true })
    .setInputFiles({ name: 'saisie.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  const pdfItem = page.getByTestId('resource-item').filter({ hasText: 'saisie' });
  await expect(pdfItem).toBeVisible({ timeout: 30_000 });
  await expect(pdfItem.getByTestId('resource-status')).toHaveText(/En file|Analysé/, {
    timeout: 30_000,
  });

  await expect(page.getByTestId('module-notice')).toHaveText('Fichier ajouté.', {
    timeout: 30_000,
  });

  // The remaining chapter: all four are done, one generation request is written.
  await page.getByTestId('chapter-complete').click();
  await expect(page.getByTestId('module-notice')).toContainText('Génération du cours demandée.');
  await expect(page.getByTestId('course-generate')).toBeVisible();
  const events = await serviceDb().execute<{ total: number }>(sql`
    select count(*)::int as total from public.event_outbox
    where user_id = ${session.userId}::uuid and name = 'chapter/contributions-completed'
  `);
  expect(events[0]?.total).toBe(1);
  await captureEvidence('module-apports');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('erreur et reprise d’un apport @SPEC-607', async ({ page, axeCheck, captureEvidence }) => {
  const seeded = await seedModule(session.userId);
  const failed = await serviceDb().execute<{ id: string }>(sql`
    insert into public.resources (
      owner_id, formation_id, chapter_id, kind, title, content_text, status, error_code, error_message
    )
    values (
      ${session.userId}::uuid, ${seeded.formationId}::uuid, ${seeded.chapters[1]}::uuid,
      'note', 'Note en échec', 'Un contenu finalement exploitable.', 'failed',
      'EXTRACTION_FAILED', 'Le contenu n’a pas pu être analysé.'
    )
    returning id::text as id
  `);
  const resourceId = failed[0]?.id ?? '';
  await openModule(page, seeded);
  await expect(page.getByText('Échec', { exact: true })).toBeVisible();
  await expect(page.getByText('Le contenu n’a pas pu être analysé.')).toBeVisible();
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByTestId('resource-status').last()).toHaveText(/En file|Analysé/, {
    timeout: 15_000,
  });
  await expect(page.getByText('Le contenu n’a pas pu être analysé.')).toHaveCount(0);

  // The mock ingestion finishes the retry; the poller (3 s) or a reload shows the ready state.
  await processResource(
    {
      sdb: serviceDb(),
      clock,
      logger: createLogger({ level: 'silent' }),
      requestId: 'e2e-spec-607',
    },
    resourceId,
  );
  await page.reload();
  await expect(page.getByTestId('resource-status').last()).toHaveText('Analysé', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
  await captureEvidence('module-erreur-reprise');
  await axeCheck();
});

test('conformité SPEC-607 @SPEC-607 @visual', async ({ page, axeCheck, captureEvidence }) => {
  const seeded = await seedModule(session.userId);
  await openModule(page, seeded);
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="module-chapters"]': { 'background-color': colors.surface },
    '[data-testid="course-generate"]': { 'background-color': colors.lime, color: colors.ink },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByRole('heading', { level: 1, name: 'Comptabilité générale' })).toBeVisible();
  await expect(page.getByText('Apports déposés · 4')).toBeVisible();
  await captureEvidence('module-conformite');

  const comparisons = await compareRegions(page, {
    reference: REFERENCE,
    outputDir: 'test-results/visual/SPEC-607-desktop',
    regions: [
      {
        name: 'entete',
        locator: page.getByTestId('module-header'),
        rect: { x: 312, y: 86, width: 1040, height: 150 },
      },
      {
        name: 'chapitres',
        locator: page.getByTestId('module-chapters'),
        rect: { x: 312, y: 225, width: 280, height: 360 },
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
  await expectScreenshotBaseline(page, 'SCR-06-module-desktop.png', { fullPage: true });
  await axeCheck();
});

test('conformité SPEC-607 mobile @SPEC-607 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const seeded = await seedModule(session.userId);
  await openModule(page, seeded);
  await expect(page.getByTestId('module-chapters')).toBeVisible();
  await captureEvidence('module-mobile');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await expectScreenshotBaseline(page, 'SCR-06-module-mobile.png', { fullPage: true });
  await axeCheck();
});
