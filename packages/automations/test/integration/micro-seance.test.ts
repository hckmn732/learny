// Integration tests of the `micro_seance` automation (SPEC-713 §12, CA-1 to CA-7). Real Postgres:
// the engine, the service role creation, the partial dedupe index, the SPEC-703 micro-session, the
// daily activity of SPEC-411 and the unified notifications of SPEC-209. The clock is injected and
// advanced step by step (ADR-0047); the AI stays in mock mode (ADR-0048).
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import type { Result } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { deliverDelivery, listDueDeliveries, notify } from '@learny/notifications';
import {
  answerReviewItem,
  completeReviewSession,
  createServiceContext,
  getOrCreateTodaySession,
  type ServiceContext,
} from '@learny/services';
import { createNotionState, makeModuleWithBank } from '@learny/testing';

import { runAutomation, undoAutomationAction, type AutomationEngineContext } from '../../src';

const PREFIX = 'sdd-713-';
const PARIS = 'Europe/Paris';
const PROPOSAL_NOW = '2026-11-11T19:05:00.000Z'; // 20:05 in Paris
const QUIET_NOW = '2026-11-11T20:05:00.000Z'; // 21:05 in Paris
const NEXT_MORNING = '2026-11-12T07:05:00.000Z'; // 08:05 in Paris

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

interface Fixture {
  user: User;
  formationId: string;
  moduleId: string;
  notionIds: string[];
  clock: TestClock;
}

interface ActionRow extends Record<string, unknown> {
  id: string;
  status: string;
  summary: string;
  payload: Record<string, unknown>;
  undo_payload: Record<string, unknown> | null;
}

interface SlotRow extends Record<string, unknown> {
  id: string;
  status: string;
  kind: string;
  title: string;
  meta: string;
  starts_at: Date | string;
  ends_at: Date | string;
  created_by: string;
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw result.error;
  return result.value;
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
    logger: createLogger({ level: 'error' }),
  });
}

async function createUser(label: string): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const row = await createTestUser(tx, { email, firstName: 'Alex', timezone: PARIS });
    await tx.execute(sql`
      update public.profiles
      set created_at = '2026-09-01T08:00:00Z'::timestamptz,
          onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz,
          onboarding_step = 'done'
      where id = ${row.id}::uuid
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${row.id}::uuid, 2, '{1,2,3,4,5,6,7}'::smallint[], '{soir}'::study_slot[])
      on conflict (user_id) do update set study_days = '{1,2,3,4,5,6,7}'::smallint[]
    `);
    return { id: row.id, email: row.email };
  });
}

async function setParams(
  user: User,
  params: Record<string, unknown>,
  enabled = true,
): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.automation_settings (user_id, key, enabled, params)
    values (${user.id}::uuid, 'micro_seance', ${enabled}, ${JSON.stringify(params)}::jsonb)
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

async function fixture(
  label: string,
  options: { now?: string; due?: boolean; formationStatus?: 'active' | 'paused' } = {},
): Promise<Fixture> {
  const user = await createUser(label);
  const clock = new TestClock(options.now ?? PROPOSAL_NOW);
  const programme = await serviceDb().transaction(async (tx) => {
    const created = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 5,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = created.moduleIds[0] ?? '';
    await tx.execute(sql`
      update public.modules
      set title = 'Comptabilité générale', status = 'open', threshold = 80
      where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status)
      values (${user.id}::uuid, ${moduleId}::uuid, 'open')
    `);
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${created.formationId}::uuid
      where id = ${user.id}::uuid
    `);
    if (options.formationStatus === 'paused') {
      await tx.execute(sql`
        update public.formations set status = 'paused' where id = ${created.formationId}::uuid
      `);
    }
    await makeModuleWithBank(tx, {
      userId: user.id,
      formationId: created.formationId,
      moduleId,
      notions: 5,
      variantsPerFormat: 3,
    });
    // A validated module contributes every due notion, evaluated or not (BR-MEM-03).
    await tx.execute(sql`
      update public.modules set status = 'validated' where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      update public.module_progress
      set status = 'validated', validated_at = '2026-11-09T08:00:00Z'::timestamptz
      where user_id = ${user.id}::uuid and module_id = ${moduleId}::uuid
    `);
    for (const notionId of created.notionIds) {
      await createNotionState(tx, {
        userId: user.id,
        notionId,
        dueAt:
          options.due === false
            ? new Date('2026-12-01T08:00:00Z')
            : new Date('2026-11-11T18:00:00Z'),
      });
    }
    return {
      formationId: created.formationId,
      moduleId,
      notionIds: created.notionIds,
    };
  });
  return { user, ...programme, clock };
}

async function actions(userId: string): Promise<ActionRow[]> {
  return serviceDb().execute<ActionRow>(sql`
    select id::text as id,
           status::text as status,
           summary,
           payload,
           undo_payload
    from public.automation_actions
    where user_id = ${userId}::uuid and automation = 'micro_seance'
    order by created_at asc
  `);
}

async function slots(userId: string): Promise<SlotRow[]> {
  return serviceDb().execute<SlotRow>(sql`
    select id::text as id,
           status::text as status,
           kind::text as kind,
           title,
           meta,
           starts_at,
           ends_at,
           created_by::text as created_by
    from public.schedule_slots
    where user_id = ${userId}::uuid and kind = 'micro_session'
    order by starts_at asc
  `);
}

async function notifications(userId: string) {
  return serviceDb().execute<{
    id: string;
    title: string;
    body: string;
    href: string;
    read_at: Date | string | null;
    dedupe_key: string | null;
  }>(sql`
    select id::text as id, title, body, href, read_at, dedupe_key
    from public.notifications
    where user_id = ${userId}::uuid
    order by created_at asc
  `);
}

async function run(fx: Fixture, localHour: number) {
  return unwrap(
    await runAutomation(engine(fx.clock), {
      key: 'micro_seance',
      userId: fx.user.id,
      trigger: { type: 'hourly', localHour },
    }),
  );
}

describe('[SPEC-713] micro-séance de secours', () => {
  it('CA-1 — au tick de 20 h, action, créneau de 5 min et notification', async () => {
    const fx = await fixture('propose');
    const result = await run(fx, 20);
    expect(result.created).toBe(1);

    const [action] = await actions(fx.user.id);
    expect(action?.status).toBe('applied');
    expect(action?.payload).toMatchObject({
      dedupeKey: 'micro:2026-11-11',
      date: '2026-11-11',
      hour: 20,
      durationMin: 5,
    });
    expect(numberOf(action?.payload.notionCount)).toBeGreaterThan(0);
    expect(action?.summary).toBe('Micro-séance de 5 min proposée à 20:00 pour garder votre série.');

    const [slot] = await slots(fx.user.id);
    expect(slot).toMatchObject({
      kind: 'micro_session',
      title: 'Micro-séance de secours',
      meta: '5 min · ajoutée par le tuteur',
      status: 'planned',
      created_by: 'automation',
    });
    expect(new Date(String(slot?.starts_at)).toISOString()).toBe(
      new Date('2026-11-11T20:00:00+01:00').toISOString(),
    );
    expect(new Date(String(slot?.ends_at)).toISOString()).toBe(
      new Date('2026-11-11T20:05:00+01:00').toISOString(),
    );

    const [notification] = await notifications(fx.user.id);
    expect(notification?.title).toBe('Micro-séance de secours');
    expect(notification?.body).toBe(
      'Pas eu le temps aujourd’hui ? 5 minutes de cartes de rappel suffisent pour garder votre série.',
    );
    expect(notification?.href).toBe(`/formations/${fx.formationId}/quiz-global?mode=micro`);
  });

  it('CA-2 — activité faite, jour non prévu, automatisme coupé, pause ou aucune notion', async () => {
    const active = await fixture('already');
    await serviceDb().execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values (${active.user.id}::uuid, '2026-11-11'::date, 5, true, '{test}')
    `);
    expect((await run(active, 20)).created).toBe(0);

    const weekEnd = await fixture('weekend', { now: '2026-11-14T19:05:00.000Z' });
    await serviceDb().execute(sql`
      update public.study_preferences set study_days = '{1,2,3,4,5}'::smallint[]
      where user_id = ${weekEnd.user.id}::uuid
    `);
    expect((await run(weekEnd, 20)).created).toBe(0);

    const disabled = await fixture('disabled');
    await setParams(disabled.user, { hour: 20, durationMin: 5 }, false);
    const off = await run(disabled, 20);
    expect(off.created).toBe(0);
    expect(off.skipped).toBe('disabled');

    const paused = await fixture('paused');
    await addPause(paused.user, '2026-11-09', '2026-11-15');
    const onPause = await run(paused, 20);
    expect(onPause.created).toBe(0);
    expect(onPause.skipped).toBe('paused');

    const empty = await fixture('empty', { due: false });
    expect((await run(empty, 20)).created).toBe(0);
    expect(await actions(empty.user.id)).toHaveLength(0);
  });

  it('CA-4 — la micro-séance faite consomme, termine le créneau et garde la série', async () => {
    const fx = await fixture('consume');
    await run(fx, 20);
    await serviceDb().execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values (${fx.user.id}::uuid, '2026-11-10'::date, 10, true, '{previous}')
      on conflict (user_id, day) do update set qualifying = true
    `);
    await serviceDb().execute(sql`
      update public.profiles
      set streak_days = 5, streak_computed_on = '2026-11-10'::date
      where id = ${fx.user.id}::uuid
    `);
    const [action] = await actions(fx.user.id);
    const slotId = String(action?.undo_payload?.slotId);

    const session = unwrap(
      await getOrCreateTodaySession(context(fx.user, fx.clock), fx.formationId, 'micro'),
    );
    const first = session.items[0];
    if (first === undefined || session.sessionId === null) throw new Error('micro-séance vide');
    unwrap(
      await answerReviewItem(context(fx.user, fx.clock), session.sessionId, {
        position: first.position,
        clientAnswerId: randomUUID(),
        timeMs: 1200,
        skipped: true,
      }),
    );
    const summary = unwrap(
      await completeReviewSession(context(fx.user, fx.clock), session.sessionId),
    );
    expect(summary.streakDays).toBe(6);

    const [consumed] = await actions(fx.user.id);
    expect(consumed?.status).toBe('consumed');
    expect(consumed?.summary).toBe('Micro-séance de 5 min proposée et faite : série conservée.');
    const [slot] = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.schedule_slots where id = ${slotId}::uuid
    `);
    expect(slot?.status).toBe('done');
    const daily = await serviceDb().execute<{ qualifying: boolean }>(sql`
      select qualifying from public.daily_activity
      where user_id = ${fx.user.id}::uuid and day = '2026-11-11'::date
    `);
    expect(daily[0]?.qualifying).toBe(true);
    const profile = await serviceDb().execute<{ streak_days: number }>(sql`
      select streak_days from public.profiles where id = ${fx.user.id}::uuid
    `);
    expect(profile[0]?.streak_days).toBe(6);

    const refused = await undoAutomationAction(context(fx.user, fx.clock), {
      actionId: action?.id ?? '',
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe('AUTOMATION_ACTION_CONSUMED');
  });

  it('CA-5 — à minuit l’action expire et le créneau n’est pas replacé ; l’annulation avant consommation retire le créneau', async () => {
    const expired = await fixture('expire');
    await run(expired, 20);
    const [slot] = await slots(expired.user.id);
    expired.clock.set('2026-11-11T23:05:00.000Z'); // 00:05 in Paris
    expect((await run(expired, 0)).created).toBe(0);
    const [action] = await actions(expired.user.id);
    expect(action?.status).toBe('expired');
    expect(action?.summary).toBe('Micro-séance de 5 min proposée à 20:00, non faite.');
    const missed = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.schedule_slots where id = ${slot?.id ?? ''}::uuid
    `);
    expect(missed[0]?.status).toBe('missed');
    const replanned = await slots(expired.user.id);
    expect(replanned).toHaveLength(1);

    const undone = await fixture('undo');
    await run(undone, 20);
    const [undoneAction] = await actions(undone.user.id);
    const [undoneSlot] = await slots(undone.user.id);
    const [notification] = await notifications(undone.user.id);
    const result = unwrap(
      await undoAutomationAction(context(undone.user, undone.clock), {
        actionId: undoneAction?.id ?? '',
      }),
    );
    expect(result.status).toBe('undone');
    expect(result.summary).toBe('Annulé : micro-séance de 5 min du mercredi.');
    const cancelled = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.schedule_slots where id = ${undoneSlot?.id ?? ''}::uuid
    `);
    expect(cancelled[0]?.status).toBe('cancelled');
    const read = await serviceDb().execute<{ read_at: Date | string | null }>(sql`
      select read_at from public.notifications where id = ${notification?.id ?? ''}::uuid
    `);
    expect(read[0]?.read_at).not.toBeNull();
  });

  it('CA-6 — un tick rejoué ne duplique rien ; heures calmes à 21 h puis livraison supprimée', async () => {
    const fx = await fixture('replay');
    const first = await run(fx, 20);
    const second = await run(fx, 20);
    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.duplicateIds).toHaveLength(1);
    expect(await actions(fx.user.id)).toHaveLength(1);

    const quiet = await fixture('quiet', { now: QUIET_NOW });
    await setParams(quiet.user, { hour: 21, durationMin: 10 });
    await run(quiet, 21);
    const [action] = await actions(quiet.user.id);
    expect(action?.status).toBe('applied');
    const [slot] = await slots(quiet.user.id);
    expect(slot?.meta).toBe('10 min · ajoutée par le tuteur');
    const [notification] = await notifications(quiet.user.id);
    expect(notification?.title).toBe('Micro-séance de secours');
    const deliveries = await serviceDb().execute<{
      id: string;
      status: string;
      scheduled_for: Date | string | null;
    }>(sql`
      select id::text as id, status::text as status, scheduled_for
      from public.notification_deliveries
      where notification_id = ${notification?.id ?? ''}::uuid
    `);
    expect(deliveries.map((row) => row.status)).toEqual(['deferred_quiet', 'deferred_quiet']);

    quiet.clock.set(NEXT_MORNING);
    const ownIds = new Set(deliveries.map((row) => row.id));
    const due = (await listDueDeliveries(engine(quiet.clock), quiet.clock.now())).filter((row) =>
      ownIds.has(row.id),
    );
    expect(due).toHaveLength(2);
    for (const delivery of due) {
      const result = await deliverDelivery(engine(quiet.clock), delivery.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.status).toBe('skipped_pref');
        expect(result.value.error).toBe('stale');
      }
    }
    const after = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.notification_deliveries
      where notification_id = ${notification?.id ?? ''}::uuid
    `);
    expect(after.map((row) => row.status)).toEqual(['skipped_pref', 'skipped_pref']);
  });

  it('CA-6 — plafond atteint : l’in-app et le créneau existent, l’envoi hors application est capped', async () => {
    const fx = await fixture('capped');
    const earlier = new TestClock('2026-11-11T08:00:00.000Z');
    for (let index = 0; index < 5; index += 1) {
      unwrap(
        await notify(engine(earlier), {
          userId: fx.user.id,
          type: 'relaunch',
          data: { titleOverride: `Reprise ${String(index)}` },
          dedupeKey: `cap-${String(index)}`,
        }),
      );
    }
    await run(fx, 20);
    const [action] = await actions(fx.user.id);
    expect(action?.status).toBe('applied');
    expect(await slots(fx.user.id)).toHaveLength(1);
    const [notification] = (await notifications(fx.user.id)).filter(
      (row) => row.title === 'Micro-séance de secours',
    );
    expect(notification).toBeDefined();
    const deliveries = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.notification_deliveries
      where notification_id = ${notification?.id ?? ''}::uuid
    `);
    expect(deliveries.map((row) => row.status).sort()).toEqual(['capped', 'capped']);
  });

  it('EF-1, EF-8 — la durée réglée (3 min) pilote le créneau et l’explication', async () => {
    const three = await fixture('three');
    await setParams(three.user, { hour: 19, durationMin: 3 });
    await run(three, 19);
    const [action] = await actions(three.user.id);
    expect(action?.payload).toMatchObject({ hour: 19, durationMin: 3 });
    expect(action?.summary).toBe('Micro-séance de 3 min proposée à 19:00 pour garder votre série.');
    const [slot] = await slots(three.user.id);
    expect(slot?.meta).toBe('3 min · ajoutée par le tuteur');
  });
});

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

afterAll(async () => {
  await closeDb();
});
