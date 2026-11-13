import { fileURLToPath } from 'node:url';

import { closeDb, serviceDb, sql } from '@learny/db';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { compareRegions, expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const NOW = '2026-11-11T12:20:00Z';
const REFERENCE = fileURLToPath(
  new URL('../../../../../design/references/SCR-05-proposition-desktop.png', import.meta.url),
);
const DONE_PROFILE = {
  scope: { value: 'Comptabilité générale, fournisseurs, clients, immobilisations', state: 'done' },
  starting_point: { value: 'Bonnes bases en comptabilité', state: 'done' },
  target_level: { value: 'Utilisateur autonome, Certification SAP', state: 'done' },
  volume: { value: '10 h par semaine', state: 'done' },
  dates: { value: 'Du 18 novembre au 20 décembre', state: 'done' },
};

let session: TestSession;
let formationId: string;

async function seedProposal(userId: string): Promise<string> {
  return serviceDb().transaction(async (tx) => {
    const [formation] = await tx.execute<{ id: string }>(sql`
      insert into public.formations (
        owner_id, title, description, status, course_language, monogram, accent_color,
        cadrage_profile, objectives, volume_hours, start_date, end_date, last_opened_at
      )
      values (
        ${userId}::uuid,
        'SAP S/4HANA Finance',
        'Devenir opérationnel sur les processus financiers de SAP S/4HANA et préparer la certification.',
        'cadrage',
        'fr',
        'SA',
        'indigo',
        ${JSON.stringify(DONE_PROFILE)}::jsonb,
        '{operational,exam}'::public.formation_objective[],
        150,
        '2026-11-02',
        '2026-12-11',
        ${NOW}::timestamptz
      )
      returning id::text as id
    `);
    if (formation === undefined) throw new Error('formation non créée');
    await tx.execute(sql`
      insert into public.event_outbox (event_id, name, data, user_id, created_at)
      values (
        ${`cadrage-completed:${formation.id}`},
        'formation/cadrage-completed',
        ${JSON.stringify({ userId, formationId: formation.id })}::jsonb,
        ${userId}::uuid,
        ${NOW}::timestamptz
      )
      on conflict (event_id) do nothing
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${userId}::uuid, 2, '{1,2,3,4,5}'::smallint[], '{soir}'::public.study_slot[])
      on conflict (user_id) do nothing
    `);
    return formation.id;
  });
}

test.beforeEach(async ({ context, baseURL }) => {
  session = await createTestSession();
  await serviceDb().execute(sql`
    update public.profiles
    set onboarding_step = 'done', streak_days = 12
    where id = ${session.userId}::uuid
  `);
  await serviceDb().execute(sql`
    insert into public.subscriptions (user_id, status, current_period_end)
    values (${session.userId}::uuid, 'active', '2030-01-01T00:00:00Z')
    on conflict (user_id) do update set status = 'active', current_period_end = '2030-01-01T00:00:00Z'
  `);
  formationId = await seedProposal(session.userId);
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

async function openProposal(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(`/formations/${formationId}/programme`);
  await expect(page.getByTestId('programme-proposal')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('programme-module-7')).toBeVisible();
}

test('programme proposé, ajusté puis validé @SPEC-605', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await openProposal(page);
  await expect(page.getByTestId('programme-source')).toHaveText('Proposé par le tuteur');
  await expect(page.getByTestId('programme-timeline')).toBeVisible();
  await expect(page.getByTestId('programme-module-1')).toBeVisible();
  await captureEvidence('programme-proposition');

  await page.getByTestId('programme-adjust').click();
  await expect(page.getByTestId('programme-adjust-dialog')).toBeVisible();
  await page
    .getByTestId('programme-adjust-message')
    .fill('Ajoute un module sur les immobilisations et passe le dernier seuil à 85 %.');
  await page.getByTestId('programme-adjust-submit').click();
  await expect(page.getByTestId('programme-version-2')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('programme-module-8')).toBeVisible();
  await captureEvidence('programme-ajustement');

  await page.getByTestId('programme-version-1').click();
  await expect(page.getByText('Vous consultez une ancienne version.')).toBeVisible();
  await expect(page.getByTestId('programme-module-8')).toHaveCount(0);
  await expect(page.getByTestId('programme-module-7')).toBeVisible();
  await captureEvidence('programme-version-1');
  await page.getByRole('button', { name: 'Revenir à la version actuelle' }).click();
  await expect(page.getByTestId('programme-module-8')).toBeVisible();

  await page.getByTestId('programme-validate').click();
  await expect(page.getByTestId('programme-validate-dialog')).toBeVisible();
  await page.getByTestId('programme-validate-confirm').click();
  await expect(page.getByTestId('programme-active')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('programme-module-1-status')).toHaveText('Ouvert');
  await expect(page.getByTestId('programme-module-2-status')).toHaveText('Verrouillé');
  await captureEvidence('programme-actif');

  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('programme importé puis validé @SPEC-605', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  await openProposal(page);
  await page.getByTestId('programme-source-import').click();
  await expect(page.getByTestId('programme-import')).toBeVisible();
  await page
    .getByTestId('programme-import-text')
    .fill(
      'Module 1 : Introduction à la finance\nChapitre 1 : Bilan\nNotion : Actif\nModule 2 : Analyse\nChapitre 2 : Ratios\nNotion : Marge',
    );
  await page.getByTestId('programme-import-submit').click();
  await expect(page.getByTestId('programme-source')).toHaveText('Importé', { timeout: 30_000 });
  await expect(page.getByTestId('programme-version-2')).toBeVisible();
  await expect(page.getByTestId('programme-module-3')).toBeVisible();
  await captureEvidence('programme-importe');

  await page.getByTestId('programme-validate').click();
  await page.getByTestId('programme-validate-confirm').click();
  await expect(page.getByTestId('programme-active')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('programme-module-2-status')).toHaveText('Verrouillé');
  await axeCheck();
  expect(consoleErrors).toEqual([]);
});

test('conformité SCR-05 proposition desktop @SPEC-605 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  await openProposal(page);
  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="programme-timeline"]': {
      'background-color': colors.surface,
      'border-top-color': colors.border,
    },
    '[data-testid="programme-module-1"]': {
      'background-color': colors.surface,
      'border-top-color': colors.ink,
    },
    '[data-testid="programme-validate"]': {
      'background-color': colors.ink,
      color: colors.white,
    },
    '[data-testid="programme-adjust"]': {
      'background-color': colors.surface,
      'border-top-color': colors['border-strong'],
    },
  });
  await expect(page.locator('body')).toHaveCSS('font-family', /Inter/);
  await expect(page.getByTestId('programme-source')).toHaveText('Proposé par le tuteur');
  await expect(page.getByRole('heading', { level: 1, name: 'SAP S/4HANA Finance' })).toBeVisible();
  await expect(page.getByTestId('programme-adjust')).toHaveText('Ajuster avec le tuteur');
  await expect(page.getByTestId('programme-validate')).toHaveText('Valider le programme');
  await expect(page.getByText('Modules et chapitres')).toBeVisible();
  await captureEvidence('programme-conformite');

  const comparisons = await compareRegions(page, {
    reference: REFERENCE,
    outputDir: 'test-results/visual/SPEC-605-desktop',
    regions: [
      {
        name: 'calendrier',
        locator: page.getByTestId('programme-timeline'),
        rect: { x: 300, y: 368, width: 1300, height: 445 },
      },
      {
        name: 'modules',
        locator: page.getByTestId('programme-modules'),
        rect: { x: 300, y: 852, width: 1300, height: 930 },
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

  await expectScreenshotBaseline(page, 'SCR-05-proposition-desktop.png', { fullPage: true });
  await axeCheck();
});

test('conformité SCR-05 proposition mobile @SPEC-605 @visual @mobile', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  await openProposal(page);
  await captureEvidence('programme-mobile');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'SCR-05-proposition-mobile.png', { fullPage: true });
  await axeCheck();
});
