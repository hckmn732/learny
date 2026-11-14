// SPEC-705 — agenda move and BR-FOR-14 replanning on SCR-12 (CA-1 to CA-4). The demonstration
// dataset of SPEC-115 is used as-is; the module 3 is made late for this file only and restored
// afterwards. The move is restored after the functional test so the visual baseline keeps the
// seed agenda, and no option is applied without an explicit confirmation.
import { closeDb, serviceDb, sql } from '@learny/db';
import { DEMO_USERS, demoFormationId, demoUserId } from '@learny/db/seed/fixtures';
import { expect, test } from '@learny/testing/playwright';
import { createDemoSession, type TestSession } from '@learny/testing/supabase';
import {
  expectScreenshotBaseline,
  expectTokens,
} from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const SAP = demoFormationId('sap');
const AGENDA = '/agenda?vue=semaine&date=2026-11-11&formation=all';

let session: TestSession;
let movedSlotId: string | null = null;
let originalSlotId: string | null = null;

async function setModuleLate(): Promise<void> {
  await serviceDb().execute(sql`
    update public.modules set planned_start = '2026-11-02', planned_end = '2026-11-06'
    where formation_id = ${SAP}::uuid and position = 3
  `);
}

async function restoreMove(): Promise<void> {
  if (movedSlotId !== null) {
    await serviceDb().execute(sql`delete from public.schedule_slots where id = ${movedSlotId}::uuid`);
  }
  if (originalSlotId !== null) {
    await serviceDb().execute(sql`
      update public.schedule_slots set status = 'planned' where id = ${originalSlotId}::uuid
    `);
  }
  await serviceDb().execute(sql`
    delete from public.automation_actions
    where user_id = ${demoUserId('alex')}::uuid
      and payload ->> 'dedupeKey' like 'slot-move:%'
  `);
  await serviceDb().execute(sql`
    delete from public.event_outbox
    where user_id = ${demoUserId('alex')}::uuid and event_id like 'agenda-move:%'
  `);
  movedSlotId = null;
  originalSlotId = null;
}

async function waitForFonts(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

test.beforeAll(async () => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  await setModuleLate();
  session = await createDemoSession(demoUserId('alex'), ALEX.email);
});

test.afterEach(async () => {
  await restoreMove();
});

test.afterAll(async () => {
  await restoreMove();
  await serviceDb().execute(sql`
    update public.modules set planned_start = '2026-11-09', planned_end = '2026-11-13'
    where formation_id = ${SAP}::uuid and position = 3
  `);
  await closeDb();
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3100' })),
  );
});

test('parcours SPEC-705 @SPEC-705', async ({ page, axeCheck }) => {
  await page.goto(AGENDA);

  // CA-1 — the API lists three compatible windows sorted by date.
  const agendaResponse = await page.request.get(
    `/api/v1/agenda?from=2026-11-09&to=2026-11-13&formation=all`,
  );
  expect(agendaResponse.status()).toBe(200);
  const agenda = (await agendaResponse.json()) as {
    slots: { id: string; title: string; date: string; status: string; formationId: string }[];
  };
  const quiz = agenda.slots.find(
    (slot) => slot.title === 'Quiz de validation' && slot.date === '2026-11-11',
  );
  expect(quiz).toBeDefined();
  originalSlotId = quiz?.id ?? null;
  if (originalSlotId === null) throw new Error('quiz de validation absent');

  const alternativesResponse = await page.request.get(
    `/api/v1/slots/${originalSlotId}/alternatives`,
  );
  expect(alternativesResponse.status()).toBe(200);
  const alternatives = (await alternativesResponse.json()) as {
    version: string;
    alternatives: { date: string; startsAt: string; endsAt: string }[];
  };
  expect(alternatives.alternatives).toHaveLength(3);
  const dates = alternatives.alternatives.map((alternative) => alternative.startsAt);
  expect([...dates].sort()).toEqual(dates);
  const chosen = alternatives.alternatives[1];
  if (chosen === undefined) throw new Error('deuxième alternative absente');

  // CA-1 — « Déplacer » opens the three windows; the second one asks for confirmation.
  await expect(page.getByTestId('agenda-detail-title')).toHaveText('Quiz de validation');
  await page.getByTestId('slot-move').click();
  await expect(page.getByTestId('slot-alternatives')).toBeVisible();
  const cards = page.locator('[data-testid^="slot-alternative-"]');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await cards.nth(1).click();
  await expect(cards.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('slot-move-confirm')).toBeVisible();
  await page.getByTestId('slot-move-confirm-button').click();
  await expect(page.getByTestId('agenda-move-explanation')).toContainText('Activité déplacée');
  await expect(page.getByTestId('slot-move-panel')).toHaveCount(0);

  // The original row is marked `moved` and exactly one new row carries the chosen window.
  const movedRows = await serviceDb().execute<{
    id: string;
    status: string;
    moved_from_id: string | null;
    starts_at: Date | string;
  }>(sql`
    select id::text as id, status::text as status, moved_from_id::text as moved_from_id, starts_at
    from public.schedule_slots
    where id = ${originalSlotId}::uuid or moved_from_id = ${originalSlotId}::uuid
    order by created_at asc
  `);
  expect(movedRows).toHaveLength(2);
  expect(movedRows.find((row) => row.id === originalSlotId)?.status).toBe('moved');
  movedSlotId = movedRows.find((row) => row.moved_from_id === originalSlotId)?.id ?? null;
  expect(movedSlotId).not.toBe(null);

  // CA-1 — reloading keeps the agenda coherent: the old week no longer shows the quiz, the
  // chosen week does.
  await page.reload();
  await expect(page.getByRole('button', { name: /Quiz de validation,/ })).toHaveCount(0);
  const movedAgenda = (await (
    await page.request.get(`/api/v1/agenda?from=${chosen.date}&to=${chosen.date}&formation=all`)
  ).json()) as { slots: { id: string; title: string; startsAt: string }[] };
  expect(movedAgenda.slots.some((slot) => slot.id === movedSlotId)).toBe(true);

  // CA-2 — the three BR-FOR-14 previews do not touch any row before the confirmation.
  await page.goto(AGENDA);
  await expect(page.getByTestId('replan-panel')).toBeVisible();
  await expect(page.getByTestId('replan-blocked')).toContainText('Module 3');
  await expect(page.getByTestId('replan-options')).toBeVisible();
  await expect(page.locator('[data-testid^="replan-option-"]')).toHaveCount(3);
  const before = await serviceDb().execute<{ end_date: string | null; slots: number }>(sql`
    select f.end_date::text as end_date,
           (select count(*)::int from public.schedule_slots ss
            where ss.user_id = ${demoUserId('alex')}::uuid and ss.formation_id = f.id) as slots
    from public.formations f
    where f.id = ${SAP}::uuid
  `);
  await page.getByTestId('replan-option-shift_end').click();
  await expect(page.getByTestId('replan-confirm')).toBeVisible();
  const during = await serviceDb().execute<{ end_date: string | null; slots: number }>(sql`
    select f.end_date::text as end_date,
           (select count(*)::int from public.schedule_slots ss
            where ss.user_id = ${demoUserId('alex')}::uuid and ss.formation_id = f.id) as slots
    from public.formations f
    where f.id = ${SAP}::uuid
  `);
  expect(during[0]).toEqual(before[0]);
  await page.getByTestId('replan-cancel').click();
  await expect(page.getByTestId('replan-confirm')).toHaveCount(0);
  const afterRefusal = await serviceDb().execute<{ end_date: string | null; slots: number }>(sql`
    select f.end_date::text as end_date,
           (select count(*)::int from public.schedule_slots ss
            where ss.user_id = ${demoUserId('alex')}::uuid and ss.formation_id = f.id) as slots
    from public.formations f
    where f.id = ${SAP}::uuid
  `);
  expect(afterRefusal[0]).toEqual(before[0]);

  // ET-3 — the error state is distinct and announced when the alternatives cannot be read.
  await page.route('**/api/v1/slots/*/alternatives', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Erreur interne',
        status: 500,
        detail: 'Erreur simulée.',
        code: 'INTERNAL_ERROR',
        requestId: 'spec-705-error',
      }),
    });
  });
  await page.getByTestId('slot-move').click();
  await expect(page.getByTestId('slot-move-error')).toBeVisible();
  await expect(page.getByTestId('slot-move-error')).toHaveAttribute('role', 'alert');
  await page.unroute('**/api/v1/slots/*/alternatives');
  await axeCheck();
});

test('conformité SPEC-705 @SPEC-705 @visual @mobile', async ({ page, axeCheck }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(AGENDA);
  await expect(page.getByTestId('replan-panel')).toBeVisible();
  await expect(page.locator('[data-testid^="replan-option-"]')).toHaveCount(3);
  await page.getByTestId('slot-move').click();
  await expect(page.getByTestId('slot-alternatives')).toBeVisible();

  // CA-4 — the move and replan states reuse the agenda tokens and typography.
  await expectTokens(page, {
    '[data-testid="slot-move-panel"]': {
      'background-color': '#FFFFFF',
      'border-top-left-radius': '21.6px',
    },
    '[data-testid="replan-panel"]': { 'background-color': '#FFEDE0' },
    '[data-testid="replan-option-shift_end"]': { 'background-color': '#FFFFFF' },
  });
  await expect(page.getByTestId('slot-move-panel')).toContainText('Déplacer l’activité');
  await expect(page.getByTestId('replan-panel')).toContainText('Réajuster le planning');
  await page.getByTestId('slot-alternative-0').click();
  await expect(page.getByTestId('slot-move-confirm')).toBeVisible();
  await axeCheck();
  await waitForFonts(page);
  await expectScreenshotBaseline(page, 'spec-705-deplacer.png');
});
