// Integration tests of the mode pause and return (SPEC-721 §12, CA-1 to CA-3).
//
// Real Postgres with the RLS client of the learner, the frozen clock of ADR-0047 and the
// deterministic draw of SPEC-406. Every assertion reads the rows actually written: the pause,
// the frozen slots, the journal and the diagnostic activity.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import {
  createBrick,
  createFormation,
  createModule,
  createNotion,
  createNotionState,
} from '@learny/testing';

import { undoAutomationAction } from '../../../automations/src/moteur-d-automatismes';
import { createServiceContext, type ServiceContext } from '../../src/context';
import { completePauseDiagnostic, endPause, getPauseState, startPause } from '../../src/pause';

const PREFIX = 'sdd-721-';
const START = new Date('2026-11-11T12:20:00Z');
const TIME_ZONE = 'Europe/Paris';

class TestClock implements Clock {
  current = START;
  now(): Date {
    return new Date(this.current);
  }
  set(value: Date): void {
    this.current = value;
  }
  addDays(days: number): void {
    this.current = new Date(this.current.getTime() + days * 86_400_000);
  }
}

interface User {
  userId: string;
  email: string;
}

async function createUser(label: string): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const userId = await serviceDb().transaction(
    async (tx) => (await createTestUser(tx, { email, timezone: TIME_ZONE })).id,
  );
  return { userId, email };
}

function context(user: User, clock: TestClock): ServiceContext {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock,
    logger: createLogger({ level: 'error' }),
  });
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw result.error;
  return result.value;
}

interface Fixture {
  formationId: string;
  slotId: string;
}

async function createFixture(user: User, options: { withNotions: boolean }): Promise<Fixture> {
  return serviceDb().transaction(async (tx) => {
    const formation = await createFormation(tx, {
      ownerId: user.userId,
      title: 'SAP S/4HANA Finance',
      status: 'active',
      startDate: '2026-11-01',
      endDate: '2026-12-20',
      volumeHours: 30,
    });
    const module = await createModule(tx, {
      ownerId: user.userId,
      formationId: formation.id,
      position: 1,
      title: 'Module 1',
      chapters: ['Chapitre 1'],
      status: 'open',
    });
    if (options.withNotions) {
      const notion = await createNotion(tx, {
        ownerId: user.userId,
        formationId: formation.id,
        moduleId: module.id,
        chapterId: module.chapterIds[0] as string,
        label: 'Écritures de clôture',
      });
      await createNotionState(tx, {
        userId: user.userId,
        notionId: notion.id,
        mastery: 35,
        gapNature: 'confusion',
        inReview: true,
        dueAt: START,
      });
      await createBrick(tx, {
        ownerId: user.userId,
        formationId: formation.id,
        type: 'matching',
        purpose: 'bank',
        notionIds: [notion.id],
      });
    }
    const slotRows = await tx.execute<{ id: string }>(sql`
      insert into public.schedule_slots (
        user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by
      ) values (
        ${user.userId}::uuid, ${formation.id}::uuid, ${module.id}::uuid, 'course',
        'Cours de clôture', '2026-11-12T09:00:00Z'::timestamptz,
        '2026-11-12T11:00:00Z'::timestamptz, 'planned', 'planner'
      )
      returning id::text as id
    `);
    const slotId = slotRows[0]?.id;
    if (slotId === undefined) throw new Error('créneau non créé');
    await tx.execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values
        (${user.userId}::uuid, '2026-11-09'::date, 20, true, '{global_quiz}'),
        (${user.userId}::uuid, '2026-11-10'::date, 20, true, '{global_quiz}')
    `);
    return { formationId: formation.id, slotId };
  });
}

async function pauseRows(
  userId: string,
): Promise<
  {
    id: string;
    starts_on: string;
    ends_on: string;
    status: string;
    diagnostic_on_return: boolean;
  }[]
> {
  return serviceDb().execute(sql`
    select id::text as id, starts_on::text as starts_on, ends_on::text as ends_on,
           status::text as status, diagnostic_on_return
    from public.pauses
    where user_id = ${userId}::uuid
    order by created_at asc
  `);
}

async function slotStatus(slotId: string): Promise<string | undefined> {
  const rows = await serviceDb().execute<{ status: string }>(
    sql`select status::text as status from public.schedule_slots where id = ${slotId}::uuid`,
  );
  return rows[0]?.status;
}

async function formationStatus(formationId: string): Promise<string | undefined> {
  const rows = await serviceDb().execute<{ status: string }>(
    sql`select status::text as status from public.formations where id = ${formationId}::uuid`,
  );
  return rows[0]?.status;
}

async function pauseActions(
  userId: string,
): Promise<{ id: string; kind: string; payload: Record<string, unknown> }[]> {
  return serviceDb().execute(sql`
    select id::text as id, kind, payload
    from public.automation_actions
    where user_id = ${userId}::uuid and automation = 'pause'
    order by created_at asc
  `);
}

async function countDiagnosticActivity(userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ n: number }>(sql`
    select count(*)::int as n
    from public.daily_activity
    where user_id = ${userId}::uuid
      and exists (
        select 1 from unnest(sources) as source where source like 'pause-diagnostic:%'
      )
  `);
  return rows[0]?.n ?? 0;
}

afterEach(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
});

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-721] service et API', () => {
  it('CA-1, CA-2 — une pause de trois jours gèle les créneaux, puis le diagnostic réel replanifie une fois', async () => {
    const alex = await createUser('pause');
    const clock = new TestClock();
    const ctx = context(alex, clock);
    const fixture = await createFixture(alex, { withNotions: true });

    const started = unwrap(
      await startPause(ctx, { endDate: '2026-11-14', diagnosticEnabled: true }),
    );
    expect(started.status).toBe('active');
    expect(started.startsOn).toBe('2026-11-11');
    expect(started.endsOn).toBe('2026-11-14');
    expect(started.diagnosticOnReturn).toBe(true);
    expect(started.pausedFormationIds).toEqual([fixture.formationId]);

    // CA-1 — the future slot is cancelled, the formation is paused and the three days are neutral.
    expect(await slotStatus(fixture.slotId)).toBe('cancelled');
    expect(await formationStatus(fixture.formationId)).toBe('paused');
    const rows = await pauseRows(alex.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('active');
    const actions = await pauseActions(alex.userId);
    expect(actions.map((action) => action.kind)).toEqual(['pause_started']);

    // CA-2 — on the return day a read finalizes the pause and proposes the ten-minute diagnostic.
    clock.addDays(4);
    const due = unwrap(await getPauseState(ctx));
    expect(due.status).toBe('ended');
    expect(due.diagnostic).not.toBeNull();
    expect(due.diagnostic?.minutes).toBe(10);
    expect(due.diagnostic?.notionIds.length).toBeGreaterThan(0);
    expect(due.diagnostic?.completedAt).toBeNull();
    // CL-4 — reading again does not propose a second diagnostic.
    const replay = unwrap(await getPauseState(ctx));
    expect(replay.diagnostic?.notionIds).toEqual(due.diagnostic?.notionIds);
    expect((await pauseActions(alex.userId)).filter((a) => a.kind === 'pause_ended')).toHaveLength(
      1,
    );

    const completed = unwrap(await completePauseDiagnostic(ctx, { answered: 3, correct: 2 }));
    expect(completed.diagnostic?.answered).toBe(3);
    expect(completed.diagnostic?.correct).toBe(2);
    expect(completed.diagnostic?.completedAt).not.toBeNull();
    expect(await formationStatus(fixture.formationId)).toBe('active');
    expect(await countDiagnosticActivity(alex.userId)).toBe(1);

    // CL-4 — replaying the result writes no second activity and keeps the same state.
    const again = unwrap(await completePauseDiagnostic(ctx, { answered: 3, correct: 2 }));
    expect(again.diagnostic?.completedAt).toBe(completed.diagnostic?.completedAt);
    expect(await countDiagnosticActivity(alex.userId)).toBe(1);
  });

  it('CA-2, CA-3 — diagnostic désactivé : reprise directe, idempotence et refus d’une date passée', async () => {
    const alex = await createUser('direct');
    const clock = new TestClock();
    const ctx = context(alex, clock);
    const fixture = await createFixture(alex, { withNotions: false });

    // CL-3 — a date before the local day is a 422 without any write.
    const invalid = await startPause(ctx, { endDate: '2026-11-10', diagnosticEnabled: true });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.error.code).toBe('VALIDATION_FAILED');
      expect(invalid.error.status).toBe(422);
    }
    expect(await pauseRows(alex.userId)).toHaveLength(0);

    const first = unwrap(
      await startPause(ctx, { endDate: '2026-11-14', diagnosticEnabled: false }),
    );
    const second = unwrap(
      await startPause(ctx, { endDate: '2026-11-14', diagnosticEnabled: false }),
    );
    expect(second.startsOn).toBe(first.startsOn);
    expect(await pauseRows(alex.userId)).toHaveLength(1);
    expect(
      (await pauseActions(alex.userId)).filter((a) => a.kind === 'pause_started'),
    ).toHaveLength(1);

    // CA-2 — diagnostic disabled: the return resumes and replans immediately, without a session.
    clock.addDays(4);
    const ended = unwrap(await getPauseState(ctx));
    expect(ended.status).toBe('ended');
    expect(ended.diagnostic).toBeNull();
    expect(await formationStatus(fixture.formationId)).toBe('active');
    const slots = await serviceDb().execute<{ n: number }>(sql`
      select count(*)::int as n from public.schedule_slots
      where user_id = ${alex.userId}::uuid
        and formation_id = ${fixture.formationId}::uuid
        and status = 'planned'
    `);
    expect(slots[0]?.n ?? 0).toBeGreaterThan(0);
  });

  it('CA-3 — un second utilisateur ne lit ni n’annule les données du premier', async () => {
    const alex = await createUser('owner');
    const other = await createUser('intruder');
    const clock = new TestClock();
    const alexFixture = await createFixture(alex, { withNotions: false });
    const otherFixture = await createFixture(other, { withNotions: false });

    unwrap(
      await startPause(context(alex, clock), {
        endDate: '2026-11-14',
        diagnosticEnabled: false,
      }),
    );
    const otherState = unwrap(await getPauseState(context(other, clock)));
    expect(otherState.status).toBe('none');
    expect(otherState.pausedFormationIds).toEqual([]);
    expect(await formationStatus(otherFixture.formationId)).toBe('active');

    const action = (await pauseActions(alex.userId)).find((a) => a.kind === 'pause_started');
    if (action === undefined) throw new Error('action de pause absente');
    const foreignUndo = await undoAutomationAction(context(other, clock), {
      actionId: action.id,
    });
    expect(foreignUndo.ok).toBe(false);
    if (!foreignUndo.ok) expect(foreignUndo.error.code).toBe('NOT_FOUND');
    expect(await formationStatus(alexFixture.formationId)).toBe('paused');

    // The early resume is idempotent and writes one `pause_ended` row only.
    unwrap(await endPause(context(alex, clock)));
    unwrap(await endPause(context(alex, clock)));
    expect((await pauseActions(alex.userId)).filter((a) => a.kind === 'pause_ended')).toHaveLength(
      1,
    );
    expect(await formationStatus(alexFixture.formationId)).toBe('active');
  });
});
