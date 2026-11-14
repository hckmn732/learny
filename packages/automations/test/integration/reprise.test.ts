// Integration tests of the `reprise` automation (SPEC-712 §12, CA-1 to CA-8). Real Postgres: the
// engine, the RLS client of the learner, the partial unique index of the dedupe key, the planner
// of SPEC-407 and the notification routing of SPEC-209. The clock is injected step by step and
// frozen at 2026-11-11T12:20:00Z for the seed (ADR-0047); nothing reads the process time.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { completeScheduleSlot, createServiceContext, type ServiceContext } from '@learny/services';

import {
  acceptAutomationAction,
  declineAutomationAction,
  repriseAutomation,
  runAutomation,
  undoAutomationAction,
  type AutomationEngineContext,
} from '../../src';

const PREFIX = 'sdd-712-';
const PARIS = 'Europe/Paris';

class TestClock {
  private at: Date;

  constructor(at: string) {
    this.at = new Date(at);
  }

  now(): Date {
    return new Date(this.at);
  }

  set(at: string): void {
    this.at = new Date(at);
  }
}

interface User {
  id: string;
  email: string;
}

function engine(clock: TestClock): AutomationEngineContext {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock,
    logger: createLogger({ level: 'error' }),
  };
}

function context(user: User, clock: TestClock): ServiceContext {
  return createServiceContext({
    userId: user.id,
    email: user.email,
    requestId: randomUUID(),
    clock,
  });
}

async function createUser(label: string, timeZone = PARIS): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const row = await createTestUser(tx, { email, firstName: 'Alex', timezone: timeZone });
    await tx.execute(sql`
      update public.profiles
      set created_at = '2026-09-01T08:00:00Z'::timestamptz,
          onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz
      where id = ${row.id}::uuid
    `);
    return { id: row.id, email: row.email };
  });
}

async function createFormation(
  user: User,
  title: string,
  status: 'active' | 'paused' = 'active',
  endDate = '2026-12-11',
): Promise<string> {
  const rows = await serviceDb().execute<{ id: string }>(sql`
    insert into public.formations (
      owner_id, title, status, objectives, start_date, end_date, volume_hours
    ) values (
      ${user.id}::uuid, ${title}, ${status}::formation_status,
      '{operational}'::formation_objective[], '2026-10-01'::date, ${endDate}::date, 30
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('formation non créée');
  return id;
}

async function createSlot(
  user: User,
  formationId: string,
  input: {
    kind?: string;
    title?: string;
    startsAt: string;
    endsAt: string;
    status?: string;
    createdBy?: string;
  },
): Promise<string> {
  const rows = await serviceDb().execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      user_id, formation_id, kind, title, starts_at, ends_at, status, created_by
    ) values (
      ${user.id}::uuid, ${formationId}::uuid, ${input.kind ?? 'course'}::slot_kind,
      ${input.title ?? 'Ledgers parallèles'}, ${input.startsAt}::timestamptz,
      ${input.endsAt}::timestamptz, ${input.status ?? 'planned'}::slot_status,
      ${input.createdBy ?? 'planner'}::slot_creator
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('créneau non créé');
  return id;
}

async function setParams(
  user: User,
  params: Record<string, unknown>,
  enabled = true,
): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.automation_settings (user_id, key, enabled, params)
    values (${user.id}::uuid, 'reprise', ${enabled}, ${JSON.stringify(params)}::jsonb)
    on conflict (user_id, key) do update
      set enabled = excluded.enabled, params = excluded.params
  `);
}

async function addPause(user: User, startsOn: string, endsOn: string): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.pauses (user_id, starts_on, ends_on, status)
    values (${user.id}::uuid, ${startsOn}::date, ${endsOn}::date, 'active')
  `);
}

async function addQualifying(user: User, day: string): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
    values (${user.id}::uuid, ${day}::date, 30, true, '{test}')
    on conflict (user_id, day) do update set qualifying = true, minutes = 30
  `);
}

async function setStudyRhythm(user: User, studyDays: number[], hoursPerDay = 2): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
    values (${user.id}::uuid, ${hoursPerDay}, ${sql.raw(`'{${studyDays.join(',')}}'::smallint[]`)}, '{soir}')
    on conflict (user_id) do update
      set hours_per_day = excluded.hours_per_day, study_days = excluded.study_days
  `);
}

async function actions(userId: string) {
  return serviceDb().execute<{
    id: string;
    kind: string;
    status: string;
    summary: string;
    payload: Record<string, unknown>;
    undo_payload: Record<string, unknown> | null;
  }>(sql`
    select id::text as id, kind, status::text as status, summary, payload,
           undo_payload
    from public.automation_actions
    where user_id = ${userId}::uuid and automation = 'reprise'
    order by created_at asc
  `);
}

async function slotStatus(user: User, slotId: string): Promise<string | undefined> {
  const rows = await serviceDb().execute<{ status: string }>(sql`
    select status::text as status from public.schedule_slots
    where id = ${slotId}::uuid and user_id = ${user.id}::uuid
  `);
  return rows[0]?.status;
}

async function slotRow(user: User, slotId: string) {
  const rows = await serviceDb().execute<{
    id: string;
    starts_at: Date | string;
    ends_at: Date | string;
    status: string;
    created_by: string;
    moved_from_id: string | null;
  }>(sql`
    select id::text as id, starts_at, ends_at, status::text as status,
           created_by::text as created_by, moved_from_id::text as moved_from_id
    from public.schedule_slots where id = ${slotId}::uuid and user_id = ${user.id}::uuid
  `);
  return rows[0];
}

async function deliveries(userId: string) {
  return serviceDb().execute<{ status: string; title: string; body: string }>(sql`
    select d.status::text as status, n.title, n.body
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where n.user_id = ${userId}::uuid
    order by n.created_at asc
  `);
}

async function unwrap<T>(
  promise: Promise<{ ok: true; value: T } | { ok: false; error: AppError }>,
): Promise<T> {
  const result = await promise;
  if (!result.ok) throw result.error;
  return result.value;
}

async function expectError(
  promise: Promise<{ ok: true } | { ok: false; error: AppError }>,
  code: string,
): Promise<void> {
  const result = await promise;
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
}

function atParis(day: string, time: string): string {
  return new Date(`${day}T${time}:00+01:00`).toISOString();
}

beforeAll(() => {
  // The product registry is registered by the package entry point; keep the definition explicit
  // so a future order change never hides the automation from these tests.
  if (repriseAutomation.key !== 'reprise') throw new Error('définition reprise absente');
});

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

describe('[SPEC-712] service et API', () => {
  it('CA-1 — mode accord : la séance passe missed et une proposition porte trois alternatives', async () => {
    const clock = new TestClock(atParis('2026-11-10', '22:00'));
    const alex = await createUser('accord');
    const formation = await createFormation(alex, 'SAP S/4HANA Finance');
    const missed = await createSlot(alex, formation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    const buffer = await createSlot(alex, formation, {
      kind: 'buffer',
      title: 'Marge de rattrapage',
      startsAt: atParis('2026-11-12', '10:30'),
      endsAt: atParis('2026-11-12', '12:00'),
    });
    await setParams(alex, { mode: 'accord' });

    const result = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    expect(result.created).toBe(1);
    expect(await slotStatus(alex, missed)).toBe('missed');
    const [action] = await actions(alex.id);
    expect(action?.kind).toBe('reprise_proposed');
    expect(action?.status).toBe('pending_consent');
    expect(action?.summary).toContain('Je propose de le reprendre jeudi à 10:30');
    const payload = action?.payload as {
      proposed: { startsAt: string; bufferSlotId: string; inBuffer: boolean };
      alternatives: unknown[];
      missedSlotId: string;
    };
    expect(payload.missedSlotId).toBe(missed);
    expect(payload.proposed.startsAt).toBe(new Date(atParis('2026-11-12', '10:30')).toISOString());
    expect(payload.proposed.bufferSlotId).toBe(buffer);
    expect(payload.proposed.inBuffer).toBe(true);
    expect(payload.alternatives).toHaveLength(3);
    expect(await deliveries(alex.id)).toHaveLength(2);
  });

  it('CA-1 — un choix hors des alternatives répond 422 VALIDATION_FAILED', async () => {
    const clock = new TestClock(atParis('2026-11-10', '22:00'));
    const alex = await createUser('hors');
    const formation = await createFormation(alex, 'SAP');
    await createSlot(alex, formation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    await createSlot(alex, formation, {
      kind: 'buffer',
      title: 'Marge',
      startsAt: atParis('2026-11-12', '10:30'),
      endsAt: atParis('2026-11-12', '12:00'),
    });
    await setParams(alex, { mode: 'accord' });
    const run = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    const actionId = run.actionIds[0];
    if (actionId === undefined) throw new Error('aucune proposition');
    await expectError(
      acceptAutomationAction(context(alex, clock), {
        actionId,
        choice: { startsAt: '2026-11-13T15:00:00+01:00' },
      }),
      'VALIDATION_FAILED',
    );
  });

  it('CA-2, CA-6 — mode auto : créneau créé, marge raccourcie, annulation restaurée puis reproposition', async () => {
    const clock = new TestClock(atParis('2026-11-10', '22:00'));
    const alex = await createUser('auto');
    const formation = await createFormation(alex, 'SAP');
    const missed = await createSlot(alex, formation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    const buffer = await createSlot(alex, formation, {
      kind: 'buffer',
      title: 'Marge',
      startsAt: atParis('2026-11-12', '10:30'),
      endsAt: atParis('2026-11-12', '12:30'),
    });
    await setParams(alex, { mode: 'auto' });

    const run = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    expect(run.created).toBe(1);
    const [action] = await actions(alex.id);
    expect(action?.kind).toBe('slot_rescheduled');
    expect(action?.status).toBe('applied');
    expect(action?.summary).toMatch(/^C’est noté : reprise de « Ledgers parallèles » jeudi 10:30/);
    const created = action?.undo_payload as { createdSlotId: string; bufferSlotId: string };
    const createdSlot = await slotRow(alex, created.createdSlotId);
    expect(createdSlot?.created_by).toBe('automation');
    expect(createdSlot?.moved_from_id).toBe(missed);
    expect(new Date(String(createdSlot?.starts_at)).toISOString()).toBe(
      new Date(atParis('2026-11-12', '10:30')).toISOString(),
    );
    expect(await slotStatus(alex, buffer)).toBe('planned');
    const shortened = await slotRow(alex, buffer);
    expect(new Date(String(shortened?.starts_at)).toISOString()).toBe(
      new Date(atParis('2026-11-12', '12:00')).toISOString(),
    );

    // CA-6 — l'annulation restaure la marge et remet la séance manquée.
    await unwrap(undoAutomationAction(context(alex, clock), { actionId: action?.id ?? '' }));
    expect(await slotStatus(alex, created.createdSlotId)).toBe('cancelled');
    expect(await slotStatus(alex, missed)).toBe('missed');
    expect(new Date(String((await slotRow(alex, buffer))?.starts_at)).toISOString()).toBe(
      new Date(atParis('2026-11-12', '10:30')).toISOString(),
    );
  });

  it('CA-3 — J+2 : une reprise de 5 minutes et une notification, le tick rejoué ne duplique rien', async () => {
    const clock = new TestClock('2026-11-11T07:00:00Z'); // 08:00 à Paris
    const alex = await createUser('court');
    const formation = await createFormation(alex, 'SAP');
    await serviceDb().execute(sql`
      update public.profiles set current_formation_id = ${formation}::uuid where id = ${alex.id}::uuid
    `);
    await addQualifying(alex, '2026-11-06');
    await setParams(alex, { inactiveDays: 2, lightenDays: 5, mode: 'accord' });

    const run = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 8 },
      }),
    );
    expect(run.created).toBe(1);
    const [action] = await actions(alex.id);
    expect(action?.kind).toBe('reprise_short_proposed');
    expect(action?.status).toBe('pending_consent');
    expect(action?.payload.dedupeKey).toBe('short:2026-11-06');
    const notification = await serviceDb().execute<{ title: string; body: string }>(sql`
      select title, body from public.notifications where user_id = ${alex.id}::uuid
    `);
    expect(notification[0]?.title).toBe('Reprenons en douceur');
    expect(notification[0]?.body).toContain('5 minutes suffisent aujourd’hui');

    const replay = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 8 },
      }),
    );
    expect(replay.created).toBe(0);
    expect(await actions(alex.id)).toHaveLength(1);
  });

  it('CA-3 — la reprise de 5 minutes crée une micro-séance de 5 minutes', async () => {
    const clock = new TestClock('2026-11-11T07:00:00Z');
    const alex = await createUser('court-apply');
    const formation = await createFormation(alex, 'SAP');
    await serviceDb().execute(sql`
      update public.profiles set current_formation_id = ${formation}::uuid where id = ${alex.id}::uuid
    `);
    await addQualifying(alex, '2026-11-06');
    await setParams(alex, { inactiveDays: 2, lightenDays: 5, mode: 'accord' });
    const run = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 8 },
      }),
    );
    const action = (await actions(alex.id))[0];
    const accepted = await unwrap(
      acceptAutomationAction(context(alex, clock), { actionId: action?.id ?? '' }),
    );
    const createdId = (accepted.undoPayload as { createdSlotId: string }).createdSlotId;
    const slot = await slotRow(alex, createdId);
    expect(slot?.created_by).toBe('automation');
    expect(
      new Date(String(slot?.ends_at)).getTime() - new Date(String(slot?.starts_at)).getTime(),
    ).toBe(300_000);
    expect(await slotStatus(alex, createdId)).toBe('planned');
    expect(run.created).toBe(1);
  });

  it('CA-4 — J+5 : une proposition par formation active, aucun créneau modifié', async () => {
    const clock = new TestClock('2026-11-11T07:00:00Z');
    const alex = await createUser('plan');
    const sap = await createFormation(alex, 'SAP S/4HANA Finance');
    const agile = await createFormation(alex, 'Gestion de projet agile');
    await createSlot(alex, sap, {
      startsAt: atParis('2026-11-13', '09:00'),
      endsAt: atParis('2026-11-13', '10:00'),
    });
    await addQualifying(alex, '2026-11-03');
    await setParams(alex, { inactiveDays: 2, lightenDays: 5, mode: 'accord' });
    const before = await serviceDb().execute<{ n: number }>(sql`
      select count(*)::int as n from public.schedule_slots where user_id = ${alex.id}::uuid
    `);

    const run = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 8 },
      }),
    );
    expect(run.created).toBe(2);
    const rows = await actions(alex.id);
    expect(rows.every((row) => row.kind === 'plan_change_proposed')).toBe(true);
    expect(rows.every((row) => row.status === 'pending_consent')).toBe(true);
    expect(rows.map((row) => row.payload.formationId).sort()).toEqual([sap, agile].sort());
    for (const row of rows) {
      const options = row.payload.options as { kind: string }[];
      expect(options.map((option) => option.kind).sort()).toEqual(['lighten', 'shift_end']);
    }
    const after = await serviceDb().execute<{ n: number }>(sql`
      select count(*)::int as n from public.schedule_slots where user_id = ${alex.id}::uuid
    `);
    expect(after[0]?.n).toBe(before[0]?.n);
  });

  it('CA-7 — désactivé, pause globale et formation en pause ne produisent aucune action', async () => {
    const clock = new TestClock(atParis('2026-11-10', '22:00'));
    const disabled = await createUser('off');
    const disabledFormation = await createFormation(disabled, 'SAP');
    await createSlot(disabled, disabledFormation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    await setParams(disabled, { mode: 'accord' }, false);
    const off = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: disabled.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    expect(off.skipped).toBe('disabled');
    expect(await actions(disabled.id)).toHaveLength(0);

    const paused = await createUser('pause');
    const pausedFormation = await createFormation(paused, 'SAP');
    await createSlot(paused, pausedFormation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    await addPause(paused, '2026-11-09', '2026-11-15');
    const onPause = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: paused.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    expect(onPause.skipped).toBe('paused');
    expect(await actions(paused.id)).toHaveLength(0);

    const formationPaused = await createUser('formation-pause');
    const pausedFormationId = await createFormation(
      formationPaused,
      'Agile',
      'paused',
      '2026-11-27',
    );
    const slot = await createSlot(formationPaused, pausedFormationId, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    const result = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: formationPaused.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    expect(result.created).toBe(0);
    expect(await slotStatus(formationPaused, slot)).toBe('planned');
  });

  it('CA-7 — deux ticks concurrents ne créent qu’une action', async () => {
    const clock = new TestClock(atParis('2026-11-10', '22:00'));
    const alex = await createUser('concurrent');
    const formation = await createFormation(alex, 'SAP');
    await createSlot(alex, formation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    await createSlot(alex, formation, {
      kind: 'buffer',
      title: 'Marge',
      startsAt: atParis('2026-11-12', '10:30'),
      endsAt: atParis('2026-11-12', '12:00'),
    });
    await setParams(alex, { mode: 'accord' });
    const [left, right] = await Promise.all([
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    ]);
    const created = [left, right].reduce(
      (sum, result) => sum + (result.ok ? result.value.created : 0),
      0,
    );
    expect(created).toBe(1);
    expect(await actions(alex.id)).toHaveLength(1);
  });

  it('CA-7, CA-6 — une reprise faite n’est plus annulable (422 AUTOMATION_ACTION_CONSUMED)', async () => {
    const clock = new TestClock(atParis('2026-11-10', '22:00'));
    const alex = await createUser('consumed');
    const formation = await createFormation(alex, 'SAP');
    await createSlot(alex, formation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    await createSlot(alex, formation, {
      kind: 'buffer',
      title: 'Marge',
      startsAt: atParis('2026-11-12', '10:30'),
      endsAt: atParis('2026-11-12', '12:00'),
    });
    await setParams(alex, { mode: 'auto' });
    await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    const action = (await actions(alex.id))[0];
    const createdId = (action?.undo_payload as { createdSlotId: string }).createdSlotId;
    await serviceDb().transaction((tx) =>
      completeScheduleSlot(tx, { userId: alex.id, slotId: createdId, now: clock.now() }),
    );
    expect((await actions(alex.id))[0]?.status).toBe('consumed');
    await expectError(
      undoAutomationAction(context(alex, clock), { actionId: action?.id ?? '' }),
      'AUTOMATION_ACTION_CONSUMED',
    );
  });

  it('CA-7, CL-2, CL-3 — heures calmes différées et plafond atteint', async () => {
    const quietClock = new TestClock(atParis('2026-11-10', '22:00'));
    const quiet = await createUser('quiet');
    const quietFormation = await createFormation(quiet, 'SAP');
    await createSlot(quiet, quietFormation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    await createSlot(quiet, quietFormation, {
      kind: 'buffer',
      title: 'Marge',
      startsAt: atParis('2026-11-12', '10:30'),
      endsAt: atParis('2026-11-12', '12:00'),
    });
    await setParams(quiet, { mode: 'accord' });
    await unwrap(
      runAutomation(engine(quietClock), {
        key: 'reprise',
        userId: quiet.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    const quietDeliveries = await deliveries(quiet.id);
    expect(quietDeliveries.some((row) => row.status === 'deferred_quiet')).toBe(true);

    const capClock = new TestClock('2026-11-11T07:05:00Z');
    const capped = await createUser('capped');
    const cappedFormation = await createFormation(capped, 'SAP');
    await serviceDb().execute(sql`
      update public.profiles set current_formation_id = ${cappedFormation}::uuid
      where id = ${capped.id}::uuid
    `);
    await addQualifying(capped, '2026-11-06');
    await serviceDb().execute(sql`
      update public.notification_settings set max_per_day = 3 where user_id = ${capped.id}::uuid
    `);
    for (let index = 0; index < 3; index += 1) {
      await serviceDb().execute(sql`
        with inserted as (
          insert into public.notifications (user_id, type, title, body, href, icon, dedupe_key, created_at)
          values (
            ${capped.id}::uuid, 'milestone', 'Jalon', 'Jalon atteint', '/accueil', 'flag',
            ${`cap-${String(index)}`}, '2026-11-11T06:00:00Z'::timestamptz
          ) returning id
        )
        insert into public.notification_deliveries (notification_id, channel, status, sent_at)
        select id, 'email', 'sent', '2026-11-11T06:00:00Z'::timestamptz from inserted
      `);
    }
    await setParams(capped, { inactiveDays: 2, lightenDays: 5, mode: 'accord' });
    await unwrap(
      runAutomation(engine(capClock), {
        key: 'reprise',
        userId: capped.id,
        trigger: { type: 'hourly', localHour: 8 },
      }),
    );
    const cappedDeliveries = await deliveries(capped.id);
    expect(cappedDeliveries.some((row) => row.status === 'capped')).toBe(true);
  });

  it('CL-9 — un utilisateur de Montréal est traité à 22 h locales', async () => {
    const clock = new TestClock('2026-11-11T03:00:00Z'); // 22:00 EST le 10 novembre
    const alex = await createUser('montreal', 'America/Montreal');
    const formation = await createFormation(alex, 'SAP');
    const slot = await createSlot(alex, formation, {
      startsAt: '2026-11-10T20:00:00-05:00',
      endsAt: '2026-11-10T21:00:00-05:00',
    });
    await setParams(alex, { mode: 'accord' });
    const result = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    expect(result.created).toBe(1);
    expect(await slotStatus(alex, slot)).toBe('missed');
  });

  it('EF-3 — sans marge ni créneau compatible, la proposition devient un changement de plan', async () => {
    const clock = new TestClock(atParis('2026-11-10', '22:00'));
    const alex = await createUser('noroom');
    const formation = await createFormation(alex, 'SAP');
    await createSlot(alex, formation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '21:59'),
    });
    await setStudyRhythm(alex, [1, 2, 3, 4, 5], 1);
    await setParams(alex, { mode: 'accord' });
    const run = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    expect(run.created).toBe(1);
    const [action] = await actions(alex.id);
    expect(action?.kind).toBe('plan_change_proposed');
    expect(action?.payload.reason).toBe('no_room');
    expect(action?.summary).toContain('Plus de place pour reprendre');
  });

  it('ADR-0191 §3 — annuler une proposition acceptée la repropose avec une clé suffixée', async () => {
    const clock = new TestClock(atParis('2026-11-10', '22:00'));
    const alex = await createUser('repropose');
    const formation = await createFormation(alex, 'SAP');
    const missed = await createSlot(alex, formation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    await createSlot(alex, formation, {
      kind: 'buffer',
      title: 'Marge',
      startsAt: atParis('2026-11-12', '10:30'),
      endsAt: atParis('2026-11-12', '12:00'),
    });
    await setParams(alex, { mode: 'accord' });
    const run = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    const actionId = run.actionIds[0] ?? '';
    await unwrap(acceptAutomationAction(context(alex, clock), { actionId }));
    await unwrap(undoAutomationAction(context(alex, clock), { actionId }));
    const rows = await actions(alex.id);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.status === 'undone')).toBeDefined();
    const reproposed = rows.find((row) => row.status === 'pending_consent');
    expect(reproposed?.payload.dedupeKey).toBe(`missed:${missed}#1`);
  });

  it('CA-7 — un refus laisse la séance manquée et ne propose plus rien', async () => {
    const clock = new TestClock(atParis('2026-11-10', '22:00'));
    const alex = await createUser('refus');
    const formation = await createFormation(alex, 'SAP');
    const missed = await createSlot(alex, formation, {
      startsAt: atParis('2026-11-10', '10:30'),
      endsAt: atParis('2026-11-10', '12:00'),
    });
    await createSlot(alex, formation, {
      kind: 'buffer',
      title: 'Marge',
      startsAt: atParis('2026-11-12', '10:30'),
      endsAt: atParis('2026-11-12', '12:00'),
    });
    await setParams(alex, { mode: 'accord' });
    const run = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    const actionId = run.actionIds[0] ?? '';
    await unwrap(declineAutomationAction(context(alex, clock), { actionId }));
    expect(await slotStatus(alex, missed)).toBe('missed');
    const replay = await unwrap(
      runAutomation(engine(clock), {
        key: 'reprise',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 22 },
      }),
    );
    expect(replay.created).toBe(0);
  });
});
