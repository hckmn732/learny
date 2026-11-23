// SPEC-719 — automatisme 8 : sprints J-K et J-1 avant un jalon (SCR-12, BR-AUT-08, ADR-0190).
//
// The journey uses the SPEC-115 demonstration day and the frozen clock of ADR-0047. It creates one
// validation quiz through the planning API, checks the two 30-minute sprint slots on the agenda,
// moves the milestone like SPEC-705 and verifies that only the future sprints are replanned. The
// visual test pins the sprint tokens on desktop and mobile.
import { randomUUID } from 'node:crypto';

import { closeDb, serviceDb, sql } from '@learny/testing/db';
import {
  DEMO_USERS,
  demoFormationId,
  demoId,
  demoModuleId,
  demoUserId,
} from '@learny/testing/db-factories';
import { expect, restoreDemoData, test } from '@learny/testing/playwright';
import {
  createDemoSession,
  deleteTestSession,
  type TestSession,
} from '@learny/testing/supabase';
import { expectScreenshotBaseline, expectTokens } from '@learny/testing/visual';

const ALEX = DEMO_USERS.find((user) => user.key === 'alex');
const ALEX_ID = demoUserId('alex');
const SAP = demoFormationId('sap');
const MODULE = demoModuleId('sap', 3);
const EXAM_ID = demoId('slot', 'spec-719-exam');
const NOW = new Date('2026-11-11T12:20:00Z');
const API = `/api/v1/formations/${SAP}/sprints`;

let session: TestSession | null = null;

async function seedExam(startsAt: string, endsAt: string): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.schedule_slots (
      id, user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by
    ) values (
      ${EXAM_ID}::uuid, ${ALEX_ID}::uuid, ${SAP}::uuid, ${MODULE}::uuid,
      'validation_quiz', 'Quiz de validation · Partie 3',
      ${startsAt}::timestamptz, ${endsAt}::timestamptz, 'planned', 'planner'
    )
    on conflict (id) do update
      set starts_at = excluded.starts_at, ends_at = excluded.ends_at,
          status = 'planned', updated_at = now()
  `);
}

async function resetSprints(): Promise<void> {
  await serviceDb().execute(sql`
    delete from public.automation_actions
    where user_id = ${ALEX_ID}::uuid
      and automation = 'sprint'
      and payload ->> 'examSlotId' = ${EXAM_ID}
  `);
  await serviceDb().execute(sql`
    delete from public.schedule_slots
    where user_id = ${ALEX_ID}::uuid
      and kind = 'sprint'
      and planner_key like ${`sprint:${EXAM_ID}:%`}
  `);
}

async function plan(page: import('@playwright/test').Page, baseURL: string | undefined) {
  const response = await page.request.post(API, {
    headers: {
      origin: new URL(baseURL ?? 'http://127.0.0.1:3131').origin,
      'Idempotency-Key': randomUUID(),
    },
    data: { examSlotId: EXAM_ID },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as {
    created: number;
    plans: Array<{
      examDate: string;
      targets: Array<{ day: string; durationMin: number }>;
      impossible: Array<{ label: string; day: string; reason: string }>;
    }>;
  };
}

async function sprintStatus(day: string): Promise<string | null> {
  const rows = await serviceDb().execute<{ status: string }>(sql`
    select status::text as status
    from public.schedule_slots
    where user_id = ${ALEX_ID}::uuid
      and kind = 'sprint'
      and planner_key = ${`sprint:${EXAM_ID}:${day}`}
    order by created_at desc
    limit 1
  `);
  return rows[0]?.status ?? null;
}

test.beforeAll(async () => {
  await restoreDemoData();
});

test.beforeEach(async ({ context, baseURL }) => {
  if (ALEX === undefined) throw new Error('utilisateur démo Alex absent');
  await resetSprints();
  // The demo week is full: widen the learner's daily capacity so the planner has room for the
  // two 30-minute sprints, without touching the demo activities themselves.
  await serviceDb().execute(sql`
    insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
    values (
      ${ALEX_ID}::uuid, 6, '{1,2,3,4,5}'::smallint[], '{matin,apres_midi,soir}'::study_slot[]
    )
    on conflict (user_id) do update
      set hours_per_day = 6, preferred_slots = '{matin,apres_midi,soir}'::study_slot[]
  `);
  // Wednesday 11 is at the capacity ceiling once the sprint is added: cancel the unused demo
  // remediation margin of that day so the planner can place the 30-minute sprint.
  await serviceDb().execute(sql`
    update public.schedule_slots
    set status = 'cancelled'
    where user_id = ${ALEX_ID}::uuid
      and kind = 'buffer'
      and status = 'planned'
      and starts_at >= '2026-11-11T08:00:00Z'::timestamptz
      and ends_at <= '2026-11-11T20:00:00Z'::timestamptz
  `);
  session = await createDemoSession(ALEX_ID, ALEX.email);
  await context.addCookies(
    session.cookies.map((cookie) => ({ ...cookie, url: baseURL ?? 'http://127.0.0.1:3131' })),
  );
});

test.afterEach(async () => {
  const current = session;
  if (current !== null) await deleteTestSession(current);
  session = null;
});

test.afterAll(async () => {
  await resetSprints();
  await closeDb();
});

test('parcours SPEC-719 @SPEC-719', async ({
  page,
  axeCheck,
  captureEvidence,
  consoleErrors,
  baseURL,
}) => {
  await page.clock.setFixedTime(NOW);
  await seedExam('2026-11-14T13:00:00Z', '2026-11-14T14:00:00Z');

  // CA-1 — K=3 on a 14 November quiz: J-3 (Wednesday 11) and J-1 (Friday 13), 30 minutes each.
  const first = await plan(page, baseURL);
  expect(first.created).toBe(1);
  expect(first.plans[0]?.examDate).toBe('2026-11-14');
  expect(first.plans[0]?.impossible, JSON.stringify(first.plans[0]?.impossible)).toEqual([]);
  expect(first.plans[0]?.targets.map((target) => target.day)).toEqual([
    '2026-11-11',
    '2026-11-13',
  ]);
  expect(first.plans[0]?.targets.every((target) => target.durationMin === 30)).toBe(true);

  await page.goto(`/agenda?vue=jour&date=2026-11-11&formation=${SAP}`);
  await expect(page.getByTestId('sprint-slot')).toHaveCount(1);
  await expect(page.getByTestId('sprint-slot')).toContainText('Sprint');
  await expect(page.getByTestId('sprint-reason')).toContainText('Notions ciblées');
  await captureEvidence('spec-719-sprint-j3');

  await page.goto(`/agenda?vue=jour&date=2026-11-13&formation=${SAP}`);
  await expect(page.getByTestId('sprint-slot')).toHaveCount(1);
  await expect(page.getByTestId('sprint-slot')).toContainText('Sprint');

  // Replaying the same request writes neither a second action nor a second slot.
  const replay = await plan(page, baseURL);
  expect(replay.created).toBe(0);
  expect(replay.plans).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId('sprint-slot')).toHaveCount(1);
  expect(await sprintStatus('2026-11-13')).toBe('planned');

  // CA-2 — the J-3 sprint is done; moving the quiz to Thursday 19 replans only the future.
  await serviceDb().execute(sql`
    update public.schedule_slots
    set status = 'done'
    where user_id = ${ALEX_ID}::uuid
      and planner_key = ${`sprint:${EXAM_ID}:2026-11-11`}
  `);
  await seedExam('2026-11-19T13:00:00Z', '2026-11-19T14:00:00Z');
  const moved = await plan(page, baseURL);
  expect(moved.created).toBe(1);
  expect(moved.plans[0]?.targets.map((target) => target.day)).toEqual([
    '2026-11-16',
    '2026-11-18',
  ]);
  expect(await sprintStatus('2026-11-11')).toBe('done');
  expect(await sprintStatus('2026-11-13')).toBe('cancelled');
  expect(await sprintStatus('2026-11-16')).toBe('planned');
  expect(await sprintStatus('2026-11-18')).toBe('planned');

  await page.goto(`/agenda?vue=jour&date=2026-11-13&formation=${SAP}`);
  await expect(page.getByTestId('sprint-slot')).toHaveCount(0);
  await page.goto(`/agenda?vue=jour&date=2026-11-16&formation=${SAP}`);
  await expect(page.getByTestId('sprint-slot')).toHaveCount(1);
  await captureEvidence('spec-719-sprint-deplace');

  // CA-3 — an invalid request writes nothing and answers 400.
  const invalid = await page.request.post(API, {
    headers: {
      origin: new URL(baseURL ?? 'http://127.0.0.1:3131').origin,
      'Idempotency-Key': randomUUID(),
    },
    data: { examSlotId: 'pas-un-uuid' },
  });
  expect(invalid.status()).toBe(400);
  expect(await sprintStatus('2026-11-16')).toBe('planned');

  expect(consoleErrors).toEqual([]);

  // Error state: an unknown formation keeps a distinct, accessible message and the retry action.
  await page.goto(
    '/agenda?vue=jour&date=2026-11-11&formation=00000000-0000-4000-8000-000000000000',
  );
  await expect(page.getByText('L’agenda n’a pas pu être chargé.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  await axeCheck();
});

test('conformité SPEC-719 @SPEC-719 @visual', async ({
  page,
  axeCheck,
  captureEvidence,
  baseURL,
}) => {
  await page.clock.setFixedTime(NOW);
  await seedExam('2026-11-14T13:00:00Z', '2026-11-14T14:00:00Z');
  await page.request.post(API, {
    headers: {
      origin: new URL(baseURL ?? 'http://127.0.0.1:3131').origin,
      'Idempotency-Key': randomUUID(),
    },
    data: { examSlotId: EXAM_ID },
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/agenda?vue=jour&date=2026-11-11&formation=${SAP}`);
  await expect(page.getByTestId('sprint-slot')).toBeVisible();

  await expectTokens(page, {
    '[data-testid="sprint-slot"]': {
      'background-color': '#F0E9FE',
      color: '#5B21B6',
    },
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await axeCheck();
  await captureEvidence('spec-719-desktop');
  await expectScreenshotBaseline(page, 'spec-719-sprint.png');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/agenda?vue=jour&date=2026-11-13&formation=${SAP}`);
  await expect(page.getByTestId('sprint-slot')).toBeVisible();
  await axeCheck();
  await captureEvidence('spec-719-mobile');
  await expectScreenshotBaseline(page, 'spec-719-sprint-mobile.png');
});
