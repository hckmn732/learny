import { randomUUID } from 'node:crypto';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const NOW = '2026-11-11T10:00:00Z';
const LATER = '2026-11-12T17:00:00Z';

let session: TestSession;

interface Seed {
  formationId: string;
  moduleIds: string[];
  notionIds: string[];
}

interface SeedOptions {
  validatedModules?: number;
  status?: 'active' | 'completed';
  light?: boolean;
  withReminder?: boolean;
}

async function seedReview(userId: string, options: SeedOptions = {}): Promise<Seed> {
  const validatedModules = options.validatedModules ?? 7;
  const status = options.status ?? (validatedModules === 7 ? 'completed' : 'active');
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 7,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'SAP S/4HANA Finance',
    });
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done',
          timezone = 'Europe/Paris',
          current_formation_id = ${programme.formationId}::uuid
      where id = ${userId}::uuid
    `);
    await tx.execute(sql`
      update public.formations
      set title = 'SAP S/4HANA Finance',
          monogram = 'SAP',
          accent_color = 'indigo',
          description = 'Certification Finance dans SAP S/4HANA.',
          objectives = '{operational,exam}'::public.formation_objective[],
          status = ${status}::public.formation_status,
          start_date = '2026-10-01',
          end_date = '2026-11-11',
          volume_hours = 60,
          completed_at = ${
            status === 'completed' ? sql`${NOW}::timestamptz` : sql`null`
          },
          maintenance_mode = ${
            options.light === true ? sql`'light'::public.maintenance_mode` : sql`null`
          }
      where id = ${programme.formationId}::uuid
    `);
    for (const [index, moduleId] of programme.moduleIds.entries()) {
      const validated = index < validatedModules;
      const moduleStatus = validated ? 'validated' : index === validatedModules ? 'open' : 'locked';
      await tx.execute(sql`
        update public.modules
        set title = ${`Module ${String(index + 1)}`},
            status = ${moduleStatus}::public.module_status,
            threshold = 80,
            validated_at = ${validated ? sql`${NOW}::timestamptz` : sql`null`}
        where id = ${moduleId}::uuid
      `);
      if (validated) {
        await tx.execute(sql`
          insert into public.module_progress (
            user_id, module_id, status, opened_at, validated_at, best_score
          ) values (
            ${userId}::uuid, ${moduleId}::uuid, 'validated'::public.module_status,
            ${NOW}::timestamptz, ${NOW}::timestamptz, 88
          )
          on conflict (user_id, module_id) do update set
            status = 'validated'::public.module_status,
            validated_at = excluded.validated_at,
            best_score = excluded.best_score
        `);
      } else {
        await tx.execute(sql`
          insert into public.module_progress (user_id, module_id, status, opened_at)
          values (
            ${userId}::uuid, ${moduleId}::uuid, ${moduleStatus}::public.module_status,
            ${NOW}::timestamptz
          )
          on conflict (user_id, module_id) do update set status = excluded.status
        `);
      }
    }

    const gaps: Record<number, { nature: 'confusion' | 'forgetting'; mastery: number }> = {
      11: { nature: 'confusion', mastery: 30 },
      12: { nature: 'forgetting', mastery: 55 },
    };
    for (const [index, notionId] of programme.notionIds.entries()) {
      const gap = gaps[index];
      await createNotionState(tx, {
        userId,
        notionId,
        mastery: gap?.mastery ?? 90,
        inReview: true,
        dueAt: new Date(NOW),
        ...(gap === undefined
          ? {}
          : { gapNature: gap.nature, evidence: `Preuve de la notion ${String(index + 1)}.` }),
      });
    }

    await tx.execute(sql`
      insert into public.schedule_slots (
        user_id, formation_id, kind, title, starts_at, ends_at, status, created_by
      ) values
        (
          ${userId}::uuid, ${programme.formationId}::uuid, 'course'::public.slot_kind,
          'Cours réalisé', '2026-11-09T09:00:00Z'::timestamptz,
          '2026-11-09T10:00:00Z'::timestamptz, 'done'::public.slot_status,
          'learner'::public.slot_creator
        ),
        (
          ${userId}::uuid, ${programme.formationId}::uuid, 'revision'::public.slot_kind,
          'Révision réalisée', '2026-11-10T09:00:00Z'::timestamptz,
          '2026-11-10T09:30:00Z'::timestamptz, 'done'::public.slot_status,
          'learner'::public.slot_creator
        ),
        (
          ${userId}::uuid, ${programme.formationId}::uuid, 'exercise'::public.slot_kind,
          'Exercice réalisé', '2026-11-10T14:00:00Z'::timestamptz,
          '2026-11-10T14:45:00Z'::timestamptz, 'done'::public.slot_status,
          'learner'::public.slot_creator
        ),
        (
          ${userId}::uuid, ${programme.formationId}::uuid, 'global_quiz'::public.slot_kind,
          'Quiz global futur', ${LATER}::timestamptz,
          '2026-11-12T17:10:00Z'::timestamptz, 'planned'::public.slot_status,
          'planner'::public.slot_creator
        )
    `);

    await tx.execute(sql`
      insert into public.programme_proposals (
        formation_id, user_id, version, source, description, payload
      ) values (
        ${programme.formationId}::uuid, ${userId}::uuid, 2,
        'generated'::public.programme_source, 'Programme ajusté', '{}'::jsonb
      )
    `);

    if (options.withReminder === true) {
      const notification = await tx.execute<{ id: string }>(sql`
        insert into public.notifications (
          user_id, formation_id, type, title, body, href, icon, dedupe_key
        ) values (
          ${userId}::uuid, ${programme.formationId}::uuid,
          'global_quiz_today'::public.notification_type,
          'Quiz global du jour', '14 notions à revoir.', '/formations/x/quiz-global',
          'quiz', ${`sdd-617-e2e-${randomUUID()}`}
        )
        returning id::text as id
      `);
      await tx.execute(sql`
        insert into public.notification_deliveries (notification_id, channel, status, scheduled_for)
        values (
          ${notification[0]?.id ?? ''}::uuid, 'email'::public.delivery_channel,
          'scheduled'::public.delivery_status, '2026-11-12T08:00:00Z'::timestamptz
        )
      `);
    }

    return {
      formationId: programme.formationId,
      moduleIds: programme.moduleIds,
      notionIds: programme.notionIds,
    };
  });
}

function reviewUrl(formationId: string): string {
  return `/formations/${formationId}/bilan`;
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

test('consulte son bilan final et choisit l’entretien léger @SPEC-617', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
}) => {
  const seed = await seedReview(session.userId);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(reviewUrl(seed.formationId));

  await expect(page.getByRole('heading', { level: 1, name: 'Bilan final' })).toBeVisible();
  await expect(page.getByTestId('final-review-result')).toHaveText('Résultat final : 88 %');
  await expect(page.getByTestId('final-review-completion')).toContainText(
    'Formation terminée le 11 nov. 2026 · 6 semaines · Programme version 2',
  );

  // CA-1, CA-3 — acquisitions, frictions, heures réalisées et rétention non mesurable.
  await expect(page.getByTestId('final-review-stat-mastered')).toContainText('12 notions acquises');
  await expect(page.getByTestId('final-review-stat-gaps')).toContainText('2 notions fragiles');
  await expect(page.getByTestId('final-review-stat-hours')).toContainText('2 h 15');
  await expect(page.getByTestId('final-review-stat-retention')).toContainText(
    'Pas encore disponible',
  );
  await expect(page.getByTestId('final-review-acquired-notion')).toHaveCount(12);
  await expect(page.getByTestId('final-review-gap')).toHaveCount(2);
  await expect(page.getByTestId('final-review-gap').first()).toContainText('Notion 6.1.2');
  await expect(page.getByTestId('final-review-gap').first()).toContainText('Confusion');
  await expect(page.getByTestId('final-review-gap').first()).toContainText('Maîtrise 30 %');
  await expect(page.getByTestId('final-review-map-module')).toHaveCount(7);
  await expect(page.getByTestId('final-review-map-notion')).toHaveCount(14);
  await expect(page.getByTestId('final-review-map-notion').nth(11)).toHaveAttribute(
    'data-status',
    'fragile',
  );
  expect(consoleErrors).toEqual([]);

  // EF-2 — one click activates the light interview, and a reload keeps it.
  await expect(page.getByTestId('maintenance-light')).toHaveAttribute('aria-checked', 'false');
  await page.getByTestId('maintenance-light').click();
  await expect(page.getByTestId('maintenance-status')).toHaveText(
    'Entretien de mémoire léger activé',
  );
  await expect(page.getByTestId('maintenance-light')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByTestId('maintenance-status')).toHaveText(
    'Entretien de mémoire léger activé',
  );
  await expect(page.getByTestId('maintenance-light')).toHaveAttribute('aria-checked', 'true');

  const mode = await serviceDb().execute<{ maintenance_mode: string }>(sql`
    select maintenance_mode::text as maintenance_mode
    from public.formations where id = ${seed.formationId}::uuid
  `);
  expect(mode[0]?.maintenance_mode).toBe('light');

  // CA-1, BR-PRO-03 — the completed formation appears in the « Terminées » tab.
  await page.goto('/accueil?onglet=terminees');
  const row = page.getByTestId(`home-formation-row-${seed.formationId}`);
  await expect(row).toContainText('SAP S/4HANA Finance');
  await expect(row).toContainText('Validée · 88 %');
  await expect(row).toContainText('notions aujourd');
  await expect(row).toContainText('Réviser');

  await page.goto(reviewUrl(seed.formationId));
  await axeCheck();
  await captureEvidence('spec-617-bilan-final');
});

test('arrête et reprend l’entretien @SPEC-617', async ({ page, axeCheck, captureEvidence }) => {
  const seed = await seedReview(session.userId, { light: true, withReminder: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(reviewUrl(seed.formationId));
  await expect(page.getByTestId('maintenance-light')).toHaveAttribute('aria-checked', 'true');

  // CA-2 — stopping shows « Entretien arrêté » and cancels every future reminder.
  await page.getByTestId('maintenance-stopped').click();
  await expect(page.getByTestId('maintenance-status')).toHaveText('Entretien arrêté');
  await expect(page.getByTestId('maintenance-stopped')).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.getByTestId('maintenance-status')).toHaveText('Entretien arrêté');

  const state = await serviceDb().execute<{
    maintenance_mode: string;
    planned: number;
    skipped: number;
  }>(sql`
    select f.maintenance_mode::text as maintenance_mode,
           (select count(*)::int from public.schedule_slots s
             where s.formation_id = f.id and s.status = 'planned') as planned,
           (select count(*)::int
             from public.notification_deliveries d
             join public.notifications n on n.id = d.notification_id
             where n.formation_id = f.id and d.status = 'skipped_pref') as skipped
    from public.formations f
    where f.id = ${seed.formationId}::uuid
  `);
  expect(state[0]).toMatchObject({ maintenance_mode: 'stopped', planned: 0, skipped: 1 });

  // BR-PRO-03 — the tab says « Entretien arrêté » without deleting the history.
  await page.goto('/accueil?onglet=terminees');
  const row = page.getByTestId(`home-formation-row-${seed.formationId}`);
  await expect(row).toContainText('SAP S/4HANA Finance');
  await expect(row).toContainText('Entretien arrêté');
  await expect(row).toContainText('Voir le bilan');
  const attempts = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.notion_states
    where user_id = ${session.userId}::uuid
  `);
  expect(attempts[0]?.count).toBe(14);

  // The choice remains editable: back to light in one click.
  await page.goto(reviewUrl(seed.formationId));
  await page.getByTestId('maintenance-light').click();
  await expect(page.getByTestId('maintenance-status')).toHaveText(
    'Entretien de mémoire léger activé',
  );
  await axeCheck();
  await captureEvidence('spec-617-entretien-choisi');
});

test('refuse le bilan à 6 modules validés et à un autre apprenant @SPEC-617', async ({
  page,
  browser,
  baseURL,
}) => {
  const partial = await seedReview(session.userId, { validatedModules: 6, status: 'active' });
  await page.goto(reviewUrl(partial.formationId));
  await expect(page).toHaveURL(new RegExp(`/formations/${partial.formationId}/programme$`));

  const complete = await seedReview(session.userId);
  const stranger = await createTestSession();
  const context = await browser.newContext(baseURL === undefined ? {} : { baseURL });
  try {
    await context.addCookies(
      stranger.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
    );
    await serviceDb().execute(
      sql`update public.profiles set onboarding_step = 'done' where id = ${stranger.userId}::uuid`,
    );
    const other = await context.newPage();
    const response = await other.goto(reviewUrl(complete.formationId));
    expect(response?.status()).toBe(404);
    await expect(other.getByTestId('system-not-found')).toBeVisible();
  } finally {
    await context.close();
    await deleteTestSession(stranger);
  }
});

test('conformité SPEC-617 @SPEC-617 @visual', async ({ page, axeCheck }) => {
  const seed = await seedReview(session.userId, { light: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(reviewUrl(seed.formationId));
  await expect(page.getByTestId('final-review')).toBeVisible();
  await expect(page.getByTestId('final-review-map-notion')).toHaveCount(14);

  await expectTokens(page, {
    body: { 'background-color': colors.canvas, color: colors.ink },
    '[data-testid="final-review-stat-mastered"]': {
      'background-color': colors.ink,
    },
    '[data-testid="final-review-stat-gaps"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
    },
    '[data-testid="maintenance-mode"]': {
      'background-color': colors.surface,
      'border-color': colors.border,
    },
  });
  await expectScreenshotBaseline(page, 'SCR-16-desktop.png', { fullPage: true });
  await axeCheck();
});

test('conformité SPEC-617 mobile @SPEC-617 @visual @mobile', async ({ page, axeCheck }) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const seed = await seedReview(session.userId, { light: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(reviewUrl(seed.formationId));
  await expect(page.getByTestId('final-review')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'SCR-16-mobile.png', { fullPage: false });
  await axeCheck();
});
