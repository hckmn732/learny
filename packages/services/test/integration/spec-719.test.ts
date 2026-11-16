// Integration service and API rules of SPEC-719 (BR-AUT-08, ADR-0190).
//
// Postgres is real: the two 30-minute `sprint` slots are written under RLS for the learner, the
// `sprint_planned` journal action and its event are committed once, a moved milestone replans only
// the future sprints, and the 400/404/409/idempotence cases write nothing.
import { randomUUID } from 'node:crypto';

import type { SQL } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import '../../../automations/src/index';
import type { Clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';

import { planSprintsBeforeMilestones } from '../../../automations/src/automatisme-8-sprint-avant-un-jalon';
import { runAutomation } from '../../../automations/src/moteur-d-automatismes';
import { createServiceContext, type ServiceContext } from '../../src/context';

const PREFIX = 'sdd-719-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const TZ = 'Europe/Paris';

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Learner {
  userId: string;
  email: string;
  formationId: string;
  moduleId: string;
  notionIds: string[];
  ctx: ServiceContext;
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

function engine() {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock: new TestClock(),
    logger: createLogger({ level: 'error' }),
  };
}

async function createLearner(label: string, notions = 4): Promise<Learner> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, firstName: 'Alex', timezone: TZ });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: notions,
      title: 'SAP S/4HANA Finance',
    });
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', current_formation_id = ${programme.formationId}::uuid
      where id = ${user.id}::uuid
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${user.id}::uuid, 2, '{1,2,3,4,5}'::smallint[], '{soir}'::study_slot[])
      on conflict (user_id) do update
        set study_days = '{1,2,3,4,5}'::smallint[], preferred_slots = '{soir}'::study_slot[]
    `);
    return { user, programme };
  });
  return {
    userId: base.user.id,
    email,
    formationId: base.programme.formationId,
    moduleId: base.programme.moduleIds[0] ?? '',
    notionIds: base.programme.notionIds,
    ctx: createServiceContext({
      userId: base.user.id,
      email,
      requestId: randomUUID(),
      clock: new TestClock(),
      logger: createLogger({ level: 'error' }),
    }),
  };
}

async function addMastery(learner: Learner, values: readonly number[]): Promise<void> {
  for (const [index, mastery] of values.entries()) {
    const notionId = learner.notionIds[index];
    if (notionId === undefined) continue;
    await serviceDb().transaction((tx) =>
      createNotionState(tx, {
        userId: learner.userId,
        notionId,
        mastery,
        dueAt: new Date('2026-11-11T08:00:00Z'),
      }),
    );
  }
}

async function addExam(
  learner: Learner,
  input: { title?: string; startsAt?: string; endsAt?: string; status?: string } = {},
): Promise<string> {
  const rows = await serviceDb().execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by
    ) values (
      ${learner.userId}::uuid,
      ${learner.formationId}::uuid,
      ${learner.moduleId}::uuid,
      'validation_quiz',
      ${input.title ?? 'Quiz de validation · Partie 1'},
      ${input.startsAt ?? '2026-11-14T13:00:00Z'}::timestamptz,
      ${input.endsAt ?? '2026-11-14T14:00:00Z'}::timestamptz,
      ${input.status ?? 'planned'}::public.slot_status,
      'planner'
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('épreuve non créée');
  return id;
}

interface SprintRow {
  [key: string]: unknown;
  id: string;
  status: string;
  planner_key: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  meta: string | null;
}

async function sprintRows(userId: string): Promise<SprintRow[]> {
  return serviceDb().execute<SprintRow>(sql`
    select id::text as id, status::text as status, planner_key, starts_at, ends_at, meta
    from public.schedule_slots
    where user_id = ${userId}::uuid and kind = 'sprint'
    order by starts_at asc
  `);
}

async function countRows(query: SQL): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(query);
  return rows[0]?.count ?? 0;
}

function localDay(instant: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

describe('[SPEC-719] service et API', () => {
  it('CA-1, ET-3 — deux sprints de 30 min sur J-3 et J-1, notions les plus faibles', async () => {
    const learner = await createLearner('plan');
    await addMastery(learner, [70, 20, 50]);
    await addExam(learner);

    const result = await planSprintsBeforeMilestones(learner.ctx, {
      formationId: learner.formationId,
    });
    if (!result.ok) throw result.error;
    expect(result.value.created).toBe(1);
    expect(result.value.plans).toHaveLength(1);
    const plan = result.value.plans[0];
    expect(plan?.examDate).toBe('2026-11-14');
    expect(plan?.daysBefore).toBe(3);
    expect(plan?.targets.map((target) => target.day)).toEqual(['2026-11-11', '2026-11-13']);
    expect(plan?.targets.every((target) => target.durationMin === 30)).toBe(true);
    // Only studied notions are targeted, weakest first (20, then 50, then 70).
    expect(plan?.notionIds).toEqual([
      learner.notionIds[1],
      learner.notionIds[2],
      learner.notionIds[0],
    ]);

    const slots = await sprintRows(learner.userId);
    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => localDay(slot.starts_at))).toEqual(['2026-11-11', '2026-11-13']);
    expect(slots.every((slot) => slot.status === 'planned')).toBe(true);
    for (const slot of slots) {
      const minutes =
        (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / 60_000;
      expect(minutes).toBe(30);
      expect(slot.meta).toContain('Notions ciblées');
    }
    // The exam slot is never overlapped.
    const overlaps = await countRows(sql`
      select count(*)::int as count
      from public.schedule_slots sprint
      join public.schedule_slots exam
        on exam.user_id = sprint.user_id
       and exam.kind = 'validation_quiz'
      where sprint.user_id = ${learner.userId}::uuid
        and sprint.kind = 'sprint'
        and sprint.starts_at < exam.ends_at
        and sprint.ends_at > exam.starts_at
    `);
    expect(overlaps).toBe(0);

    const actions = await countRows(sql`
      select count(*)::int as count from public.automation_actions
      where user_id = ${learner.userId}::uuid
        and automation = 'sprint' and kind = 'sprint_planned'
    `);
    expect(actions).toBe(1);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.event_outbox
        where user_id = ${learner.userId}::uuid and name = 'automation/action-applied'
      `),
    ).toBe(1);
  });

  it('CA-2 — déplacer l’épreuve replanifie les futurs et conserve un sprint fait', async () => {
    const learner = await createLearner('moved');
    await addMastery(learner, [30, 80, 55]);
    const examId = await addExam(learner);

    const first = await planSprintsBeforeMilestones(learner.ctx, {
      formationId: learner.formationId,
    });
    if (!first.ok) throw first.error;
    const before = await sprintRows(learner.userId);
    expect(before).toHaveLength(2);
    const doneSlot = before.find((slot) => localDay(slot.starts_at) === '2026-11-11');
    if (doneSlot === undefined) throw new Error('sprint J-3 absent');
    await serviceDb().execute(sql`
      update public.schedule_slots set status = 'done' where id = ${doneSlot.id}::uuid
    `);

    // SPEC-705 moved the milestone to Thursday 19 November; J-3 and J-1 are both study days.
    const moved = await serviceDb().execute<{ id: string }>(sql`
      update public.schedule_slots
      set starts_at = '2026-11-19T13:00:00Z'::timestamptz,
          ends_at = '2026-11-19T14:00:00Z'::timestamptz,
          updated_at = '2026-11-11T12:30:00Z'::timestamptz
      where id = ${examId}::uuid
      returning id::text as id
    `);
    const newSlotId = moved[0]?.id;
    if (newSlotId === undefined) throw new Error('épreuve déplacée absente');

    const run = await runAutomation(engine(), {
      key: 'sprint',
      userId: learner.userId,
      trigger: {
        type: 'event',
        name: 'agenda/slot-moved',
        data: {
          userId: learner.userId,
          slotId: examId,
          newSlotId,
          formationId: learner.formationId,
        },
      },
    });
    expect(run.ok).toBe(true);
    if (!run.ok) throw run.error;
    expect(run.value.created).toBe(1);

    const after = await sprintRows(learner.userId);
    const stillDone = after.find((slot) => slot.id === doneSlot.id);
    expect(stillDone?.status).toBe('done');
    const planned = after.filter((slot) => slot.status === 'planned');
    expect(planned.map((slot) => localDay(slot.starts_at))).toEqual(['2026-11-16', '2026-11-18']);
    const cancelled = after.filter((slot) => slot.status === 'cancelled');
    expect(cancelled.map((slot) => localDay(slot.starts_at))).toEqual(['2026-11-13']);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.automation_actions
        where user_id = ${learner.userId}::uuid
          and automation = 'sprint' and kind = 'sprint_planned'
      `),
    ).toBe(2);
  });

  it('CA-3 — 400, 404 RLS et 409 sans écriture, double envoi sans duplication', async () => {
    const owner = await createLearner('owner');
    const stranger = await createLearner('stranger');
    await addMastery(owner, [40, 60]);
    await addExam(owner);

    const invalid = await planSprintsBeforeMilestones(owner.ctx, {
      formationId: 'pas-un-uuid',
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error.code).toBe('VALIDATION_FAILED');

    const foreign = await planSprintsBeforeMilestones(stranger.ctx, {
      formationId: owner.formationId,
    });
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.error.code).toBe('NOT_FOUND');

    const first = await planSprintsBeforeMilestones(owner.ctx, {
      formationId: owner.formationId,
    });
    if (!first.ok) throw first.error;
    expect(first.value.created).toBe(1);
    const actionsAfterFirst = await countRows(sql`
      select count(*)::int as count from public.automation_actions
      where user_id = ${owner.userId}::uuid and automation = 'sprint'
    `);

    const second = await planSprintsBeforeMilestones(owner.ctx, {
      formationId: owner.formationId,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.created).toBe(0);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.automation_actions
        where user_id = ${owner.userId}::uuid and automation = 'sprint'
      `),
    ).toBe(actionsAfterFirst);
    expect(await sprintRows(owner.userId)).toHaveLength(2);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.event_outbox
        where user_id = ${owner.userId}::uuid and name = 'automation/action-applied'
      `),
    ).toBe(1);

    const cancelled = await addExam(owner, { status: 'cancelled', title: 'Épreuve annulée' });
    const stale = await planSprintsBeforeMilestones(owner.ctx, {
      formationId: owner.formationId,
      examSlotId: cancelled,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.code).toBe('CONFLICT');
  });

  it('CL-4, CL-5 — épreuve annulée ou aucune notion étudiée ne crée aucun sprint', async () => {
    const learner = await createLearner('empty');
    await addExam(learner, { status: 'cancelled' });
    await addExam(learner, { startsAt: '2026-11-14T15:00:00Z', endsAt: '2026-11-14T16:00:00Z' });

    const result = await planSprintsBeforeMilestones(learner.ctx, {
      formationId: learner.formationId,
    });
    if (!result.ok) throw result.error;
    expect(result.value.created).toBe(0);
    expect(await sprintRows(learner.userId)).toEqual([]);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.automation_actions
        where user_id = ${learner.userId}::uuid
      `),
    ).toBe(0);
  });
});
