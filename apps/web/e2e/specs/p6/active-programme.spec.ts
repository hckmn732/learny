import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { compareRegions, expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const NOW = '2026-11-11T12:20:00Z';
const REFERENCE = fileURLToPath(
  new URL('../../../../../design/references/SCR-05-base-desktop.png', import.meta.url),
);
const MODULES = [
  {
    title: 'Fondamentaux de SAP S/4HANA et navigation Fiori',
    start: '2026-11-02',
    end: '2026-11-04',
    chapters: [
      'Architecture de SAP S/4HANA',
      'Navigation dans SAP Fiori',
      'Données de base et transactions clés',
    ],
  },
  {
    title: 'Structure organisationnelle de la Finance',
    start: '2026-11-05',
    end: '2026-11-06',
    chapters: [
      'Sociétés et périmètres comptables',
      'Devises et variantes d’exercice',
      'Paramètres de saisie',
    ],
  },
  {
    title: 'Comptabilité générale',
    start: '2026-11-09',
    end: '2026-11-13',
    chapters: [
      'Plan comptable et comptes généraux',
      'Saisie des pièces comptables',
      'Journal universel (ACDOCA)',
      'Ledgers parallèles',
    ],
  },
  {
    title: 'Comptabilité fournisseurs',
    start: '2026-11-16',
    end: '2026-11-20',
    chapters: [
      'Données de base fournisseurs',
      'Factures fournisseurs',
      'Paiements',
      'Rapprochement des comptes',
    ],
  },
  {
    title: 'Comptabilité clients',
    start: '2026-11-23',
    end: '2026-11-27',
    chapters: ['Données de base clients', 'Factures clients', 'Encaissements', 'Relances'],
  },
  {
    title: 'Immobilisations',
    start: '2026-11-30',
    end: '2026-12-04',
    chapters: ['Fiches d’immobilisation', 'Acquisitions et cessions', 'Amortissements'],
  },
  {
    title: 'Clôture de période et préparation à la certification',
    start: '2026-12-07',
    end: '2026-12-11',
    chapters: ['Clôture mensuelle', 'Clôture annuelle', 'Examen blanc de certification'],
  },
] as const;

let session: TestSession;

interface SeededActive {
  formationId: string;
  moduleIds: string[];
}

async function seedActive(
  userId: string,
  options: { validated: number; open: number; setCurrent?: boolean; title?: string },
): Promise<SeededActive> {
  return serviceDb().transaction(async (tx) => {
    const title = options.title ?? 'SAP S/4HANA Finance';
    const [formation] = await tx.execute<{ id: string }>(sql`
      insert into public.formations (
        owner_id, title, description, status, course_language, monogram, accent_color,
        cadrage_profile, objectives, volume_hours, start_date, end_date, default_threshold,
        last_opened_at
      )
      values (
        ${userId}::uuid,
        ${title},
        'Devenir opérationnel sur les processus financiers de SAP S/4HANA et préparer la certification.',
        'active',
        'fr',
        'SA',
        'indigo',
        ${JSON.stringify({ scope: { value: title, state: 'done' } })}::jsonb,
        '{operational,exam}'::public.formation_objective[],
        150,
        '2026-11-02',
        '2026-12-11',
        80,
        ${NOW}::timestamptz
      )
      returning id::text as id
    `);
    if (formation === undefined) throw new Error('formation non créée');
    const moduleIds: string[] = [];
    for (const [index, module] of MODULES.entries()) {
      const position = index + 1;
      const status =
        position <= options.validated
          ? 'validated'
          : position === options.open
            ? 'open'
            : 'locked';
      const score = status === 'validated' ? (position === 1 ? 86 : 91) : null;
      const [row] = await tx.execute<{ id: string }>(sql`
        insert into public.modules (
          formation_id, position, title, objectives, planned_start, planned_end, threshold,
          status, opened_at, validated_at, created_at, updated_at
        )
        values (
          ${formation.id}::uuid,
          ${position},
          ${module.title},
          '{objectif}'::text[],
          ${module.start}::date,
          ${module.end}::date,
          80,
          ${status}::public.module_status,
          ${status === 'locked' ? null : `${module.start}T09:00:00Z`}::timestamptz,
          ${status === 'validated' ? `${module.end}T18:00:00Z` : null}::timestamptz,
          ${NOW}::timestamptz,
          ${NOW}::timestamptz
        )
        returning id::text as id
      `);
      if (row === undefined) throw new Error('module non créé');
      moduleIds.push(row.id);
      await tx.execute(sql`
        insert into public.module_progress (
          user_id, module_id, status, opened_at, validated_at, best_score, updated_at
        )
        values (
          ${userId}::uuid,
          ${row.id}::uuid,
          ${status}::public.module_status,
          ${status === 'locked' ? null : `${module.start}T09:00:00Z`}::timestamptz,
          ${status === 'validated' ? `${module.end}T18:00:00Z` : null}::timestamptz,
          ${score},
          ${NOW}::timestamptz
        )
      `);
      for (const [chapterIndex, chapterTitle] of module.chapters.entries()) {
        const [chapter] = await tx.execute<{ id: string }>(sql`
          insert into public.chapters (
            module_id, formation_id, position, title, created_at, updated_at
          )
          values (
            ${row.id}::uuid,
            ${formation.id}::uuid,
            ${chapterIndex + 1},
            ${chapterTitle},
            ${NOW}::timestamptz,
            ${NOW}::timestamptz
          )
          returning id::text as id
        `);
        if (chapter === undefined) throw new Error('chapitre non créé');
        await tx.execute(sql`
          insert into public.chapter_progress (
            user_id, chapter_id, contributions_status, done_at, updated_at
          )
          values (
            ${userId}::uuid,
            ${chapter.id}::uuid,
            ${status === 'locked' ? 'in_progress' : 'done'}::public.contrib_status,
            ${status === 'locked' ? null : `${module.start}T12:00:00Z`}::timestamptz,
            ${NOW}::timestamptz
          )
        `);
      }
    }
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done',
          streak_days = 12,
          current_formation_id = ${options.setCurrent === false ? null : formation.id}::uuid
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${userId}::uuid, 5, '{1,2,3,4,5}'::smallint[], '{matin,apres_midi}'::public.study_slot[])
      on conflict (user_id) do update set hours_per_day = 5
    `);
    return { formationId: formation.id, moduleIds };
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    insert into public.subscriptions (user_id, status, current_period_end)
    values (${session.userId}::uuid, 'active', '2030-01-01T00:00:00Z')
    on conflict (user_id) do update set status = 'active', current_period_end = '2030-01-01T00:00:00Z'
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

async function openProgramme(page: import('@playwright/test').Page, fid: string): Promise<void> {
  await page.goto(`/formations/${fid}/programme`);
  await expect(page.getByTestId('programme-active-screen')).toBeVisible({ timeout: 30_000 });
}

test('programme actif et module verrouillé @SPEC-606', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const fresh = await seedActive(session.userId, { validated: 0, open: 1, setCurrent: false });
  const sap = await seedActive(session.userId, { validated: 2, open: 3 });

  await openProgramme(page, sap.formationId);
  await expect(page.getByTestId('programme-progress')).toHaveText('29 %');
  await expect(page.getByText('2 modules validés sur 7')).toBeVisible();
  await expect(page.getByTestId('programme-today')).toHaveAttribute('data-date', '2026-11-11');
  await expect(page.getByText('Aujourd’hui')).toBeVisible();
  await expect(page.getByTestId('programme-quiz-1')).toHaveAttribute('data-date', '2026-11-04');
  await expect(page.getByTestId('programme-quiz-3')).toHaveAttribute('data-date', '2026-11-13');
  await expect(page.getByTestId('programme-quiz-7')).toHaveAttribute('data-date', '2026-12-11');
  await expect(page.getByTestId('programme-quiz-7')).toHaveAttribute('data-kind', 'exam');
  await expect(page.getByTestId('programme-module-1-status')).toHaveText('Validé · 86 %');
  await expect(page.getByTestId('programme-module-2-status')).toHaveText('Validé · 91 %');
  await expect(page.getByTestId('programme-module-3-status')).toHaveText('En cours');
  await expect(page.getByTestId('programme-module-4-status')).toHaveText('Verrouillé');
  await expect(page.getByTestId('programme-module-4').getByTestId('module-unlock-reason')).toHaveText(
    'Se débloque quand le quiz du module 3 est validé.',
  );
  await captureEvidence('programme-en-cours');
  await axeCheck();

  // CL-4 — the direct URL of a locked module is refused with its unlock condition, no course.
  await page.goto(`/formations/${sap.formationId}/modules/${sap.moduleIds[3] ?? ''}`);
  await expect(page.getByTestId('module-locked')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('module-unlock-reason')).toHaveText(
    'Se débloque quand le quiz du module 3 est validé.',
  );
  await expect(page.getByTestId('module-chapters')).toHaveCount(0);
  await captureEvidence('module-verrouille');

  // CA-2 — a freshly validated programme opens module 1 and locks module 2.
  await openProgramme(page, fresh.formationId);
  await expect(page.getByTestId('programme-progress')).toHaveText('0 %');
  await expect(page.getByTestId('programme-module-1-status')).toHaveText('En cours');
  await expect(page.getByTestId('programme-module-1-action')).toHaveText('Ouvrir le module');
  await expect(page.getByTestId('programme-module-2-status')).toHaveText('Verrouillé');
  await expect(page.getByTestId('programme-module-2').getByTestId('module-unlock-reason')).toHaveText(
    'Se débloque quand le quiz du module 1 est validé.',
  );
  await page.goto(`/formations/${fresh.formationId}/modules/${fresh.moduleIds[1] ?? ''}`);
  await expect(page.getByTestId('module-locked')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('module-unlock-reason')).toHaveText(
    'Se débloque quand le quiz du module 1 est validé.',
  );
  expect(consoleErrors).toEqual([]);
});

test('navigation vers module et examen blanc @SPEC-606', async ({ page }) => {
  const fresh = await seedActive(session.userId, { validated: 0, open: 1 });
  await openProgramme(page, fresh.formationId);

  await page.getByTestId('programme-open-module').click();
  await expect(page.getByTestId('module-page')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole('heading', { level: 1, name: /Module 1 · Fondamentaux de SAP S\/4HANA/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/formations/${fresh.formationId}/modules/[0-9a-f-]+$`));

  await page.goBack();
  await expect(page.getByTestId('programme-active-screen')).toBeVisible();
  await page.getByTestId('programme-exam-link').click();
  await expect(page).toHaveURL(/\/examen-blanc$/);
});

test('conformité SPEC-606 desktop @SPEC-606 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const sap = await seedActive(session.userId, { validated: 2, open: 3 });
  await openProgramme(page, sap.formationId);
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="programme-calendar"]': {
      'background-color': colors.surface,
      'border-top-color': colors.border,
    },
    '[data-testid="programme-module-3"]': { 'border-top-color': colors.ink },
    '[data-testid="programme-progress"]': { color: colors.lime },
    '[data-testid="programme-exam-link"]': {
      'background-color': colors.surface,
      'border-top-color': colors['border-strong'],
    },
    '[data-testid="programme-open-module"]': {
      'background-color': colors.ink,
      color: colors.white,
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByRole('heading', { level: 1, name: 'SAP S/4HANA Finance' })).toBeVisible();
  await expect(page.getByText('Calendrier de la formation')).toBeVisible();
  await expect(page.getByText('Modules et chapitres')).toBeVisible();
  await captureEvidence('programme-conformite');

  const comparisons = await compareRegions(page, {
    reference: REFERENCE,
    outputDir: 'test-results/visual/SPEC-606-desktop',
    regions: [
      {
        name: 'statistiques',
        locator: page.getByTestId('programme-stats'),
        rect: { x: 300, y: 175, width: 1290, height: 120 },
      },
      {
        name: 'calendrier',
        locator: page.getByTestId('programme-calendar'),
        rect: { x: 300, y: 300, width: 1290, height: 500 },
      },
      {
        name: 'modules',
        locator: page.getByTestId('programme-modules'),
        rect: { x: 300, y: 815, width: 1290, height: 660 },
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
  const outside = comparisons
    .filter((comparison) => comparison.ratio > 0.12)
    .map((comparison) => `${comparison.name}: ${comparison.ratio.toFixed(3)}`);
  expect(outside).toEqual([]);

  await expectScreenshotBaseline(page, 'SCR-05-en-cours-desktop.png', { fullPage: true });
  await axeCheck();
});

test('conformité SPEC-606 mobile @SPEC-606 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const sap = await seedActive(session.userId, { validated: 2, open: 3 });
  await openProgramme(page, sap.formationId);
  await expect(page.getByTestId('programme-progress')).toHaveText('29 %');
  await captureEvidence('programme-mobile');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'SCR-05-en-cours-mobile.png', { fullPage: true });
  await axeCheck();
});
