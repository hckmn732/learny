import { randomUUID } from 'node:crypto';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { expect, test } from '@learny/testing/playwright';
import { createTestSession, deleteTestSession, type TestSession } from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';
import { colors } from '@learny/ui/tokens';

const NOW = '2026-11-11T12:20:00Z';
const LOCAL_DAY_START = new Date('2026-11-10T23:00:00Z');

let session: TestSession;

interface Seeded {
  sap: string;
  agile: string;
  python: string;
  excel: string;
  futureSlot: string;
}

async function seed(userId: string): Promise<Seeded> {
  return serviceDb().transaction(async (tx) => {
    const make = async (title: string, status: 'active' | 'paused', lastOpened: string) => {
      const programme = await createTestProgramme(tx, userId, {
        modules: 3,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title,
      });
      await tx.execute(sql`
        update public.formations
        set status = ${status}::public.formation_status,
            last_opened_at = ${lastOpened}::timestamptz,
            start_date = '2026-11-01'::date,
            end_date = '2026-12-20'::date,
            volume_hours = 30
        where id = ${programme.formationId}::uuid
      `);
      const first = programme.moduleIds[0];
      if (first !== undefined) {
        await tx.execute(sql`
          update public.modules
          set status = 'open', opened_at = ${NOW}::timestamptz
          where id = ${first}::uuid
        `);
      }
      return programme.formationId;
    };

    const sap = await make('SAP S/4HANA Finance', 'active', '2026-11-11T09:00:00Z');
    const agile = await make('Gestion de projet agile', 'active', '2026-11-10T09:00:00Z');
    const python = await make('Python pour l’analyse de données', 'active', '2026-11-09T09:00:00Z');
    const excel = await make('Excel pour l’analyse financière', 'paused', '2026-11-08T09:00:00Z');
    const futureSlot = randomUUID();
    await tx.execute(sql`
      insert into public.schedule_slots (
        id, user_id, formation_id, kind, title, starts_at, ends_at, status, created_by
      )
      values (
        ${futureSlot}::uuid,
        ${userId}::uuid,
        ${sap}::uuid,
        'course',
        'Cours — SAP',
        '2026-11-12T18:30:00+01:00'::timestamptz,
        '2026-11-12T19:30:00+01:00'::timestamptz,
        'planned',
        'planner'
      )
    `);
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${sap}::uuid, onboarding_step = 'done'
      where id = ${userId}::uuid
    `);
    return { sap, agile, python, excel, futureSlot };
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

test('change et met en pause une formation @SPEC-618', async ({
  page,
  axeCheck,
  captureEvidence,
}) => {
  const seeded = await seed(session.userId);
  await page.goto('/accueil');
  await expect(page.getByTestId('sidebar-formation-card')).toContainText('SAP S/4HANA Finance');

  // CA-1 — choisir B, recharger, retrouver B comme formation courante.
  await page.getByTestId('sidebar-switch-formation').click();
  await expect(page.getByTestId('sidebar-formation-menu')).toBeVisible();
  const switched = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/me/current-formation') &&
      response.request().method() === 'PATCH',
  );
  await page.getByTestId(`sidebar-formation-option-${seeded.agile}`).click();
  await switched;
  await expect(page.getByTestId('sidebar-formation-card')).toContainText('Gestion de projet agile');
  await page.reload();
  await expect(page.getByTestId('sidebar-formation-card')).toContainText('Gestion de projet agile');

  // CA-2 — pause de A : le menu sépare actives et pause et le créneau futur est gelé.
  await page.getByTestId('sidebar-switch-formation').click();
  const paused = page.waitForResponse(
    (response) =>
      response.url().includes(`/formations/${seeded.sap}/pause`) &&
      response.request().method() === 'POST',
  );
  await page.locator(`[data-testid="formation-pause"][data-formation-id="${seeded.sap}"]`).click();
  await paused;
  await page.getByTestId('sidebar-switch-formation').click();
  await expect(page.getByTestId('sidebar-formation-menu')).toBeVisible();
  await expect(page.getByTestId(`formation-row-${seeded.sap}`)).toContainText('En pause');
  const afterPause = await serviceDb().execute<{ status: string }>(sql`
    select status::text as status from public.schedule_slots where id = ${seeded.futureSlot}::uuid
  `);
  expect(afterPause[0]?.status).toBe('cancelled');
  await captureEvidence('formation-en-pause');

  // Reprise de A : le planificateur recrée des créneaux à partir du jour local.
  const resumed = page.waitForResponse(
    (response) =>
      response.url().includes(`/formations/${seeded.sap}/resume`) &&
      response.request().method() === 'POST',
  );
  await page.locator(`[data-testid="formation-resume"][data-formation-id="${seeded.sap}"]`).click();
  await resumed;
  await page.getByTestId('sidebar-switch-formation').click();
  await expect(page.getByTestId('sidebar-formation-menu')).toBeVisible();
  await expect(page.getByTestId(`formation-row-${seeded.sap}`)).toContainText('SAP S/4HANA Finance');
  const replanned = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.schedule_slots
    where user_id = ${session.userId}::uuid
      and formation_id = ${seeded.sap}::uuid
      and status = 'planned'
      and starts_at >= ${LOCAL_DAY_START.toISOString()}::timestamptz
  `);
  expect(replanned[0]?.count ?? 0).toBeGreaterThan(0);
  await axeCheck();
  await captureEvidence('formation-reprise');
});

test('limite de trois formations @SPEC-618', async ({ page, axeCheck, captureEvidence }) => {
  const seeded = await seed(session.userId);
  await page.goto('/accueil');
  await page.getByTestId('sidebar-switch-formation').click();

  // Une reprise alors que trois formations sont actives ouvre le dialogue, sans transition.
  await page
    .locator(`[data-testid="formation-resume"][data-formation-id="${seeded.excel}"]`)
    .click();
  const dialog = page.getByTestId('active-limit-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Trois formations actives au plus');
  await expect(page.getByTestId('active-limit-options').getByRole('radio')).toHaveCount(3);
  const before = await serviceDb().execute<{ status: string }>(sql`
    select status::text as status from public.formations where id = ${seeded.excel}::uuid
  `);
  expect(before[0]?.status).toBe('paused');
  await captureEvidence('limite-trois-formations');

  // Choix explicite puis confirmation : une active passe en pause, la quatrième reprend.
  await page.getByTestId(`active-limit-option-${seeded.sap}`).click();
  const applied = page.waitForResponse(
    (response) =>
      response.url().includes(`/formations/${seeded.excel}/resume`) &&
      response.request().method() === 'POST',
  );
  await page.getByTestId('active-limit-confirm').click();
  await applied;
  await expect(dialog).toHaveCount(0);
  const rows = await serviceDb().execute<{ id: string; status: string }>(sql`
    select id::text as id, status::text as status from public.formations
    where id in (${seeded.sap}::uuid, ${seeded.excel}::uuid)
  `);
  expect(rows.find((row) => row.id === seeded.sap)?.status).toBe('paused');
  expect(rows.find((row) => row.id === seeded.excel)?.status).toBe('active');
  const active = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.formations
    where owner_id = ${session.userId}::uuid and status = 'active'
  `);
  expect(active[0]?.count).toBe(3);
  await axeCheck();
  await captureEvidence('limite-confirmee');
});

test('conformité SPEC-618 @SPEC-618 @visual', async ({ page, axeCheck }) => {
  const seeded = await seed(session.userId);
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/accueil');
  await page.getByTestId('sidebar-switch-formation').click();
  await expect(page.getByTestId('sidebar-formation-menu')).toBeVisible();
  await expectTokens(page, {
    '[data-testid="sidebar-formation-menu"]': {
      'background-color': colors.surface,
      'border-top-left-radius': '20px',
    },
    '[data-testid="formation-pause"]': {
      'background-color': colors.surface,
      'border-top-color': colors['border-strong'],
    },
  });
  await expectScreenshotBaseline(page, 'formation-switcher-desktop.png');

  await page
    .locator(`[data-testid="formation-resume"][data-formation-id="${seeded.excel}"]`)
    .click();
  await expect(page.getByTestId('active-limit-dialog')).toBeVisible();
  await expectTokens(page, {
    '[data-testid="active-limit-dialog"]': {
      'background-color': colors.surface,
      'border-top-left-radius': '24px',
    },
    [`[data-testid="active-limit-option-${seeded.sap}"]`]: {
      'background-color': colors.surface,
    },
  });
  await expectScreenshotBaseline(page, 'active-limit-desktop.png');
  await axeCheck();
});

test('conformité SPEC-618 mobile @SPEC-618 @visual @mobile', async ({ page, axeCheck }) => {
  test.skip(test.info().project.name !== 'mobile', 'mobile uniquement');
  const seeded = await seed(session.userId);
  await page.goto('/accueil');
  await page.getByTestId('sidebar-show').click();
  await expect(page.getByTestId('sidebar')).toBeVisible();
  await page.getByTestId('sidebar-switch-formation').click();
  await expect(page.getByTestId('sidebar-formation-menu')).toBeVisible();
  await page
    .locator(`[data-testid="formation-resume"][data-formation-id="${seeded.excel}"]`)
    .click();
  await expect(page.getByTestId('active-limit-dialog')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expectScreenshotBaseline(page, 'formation-switcher-mobile.png');
  await axeCheck();
});
