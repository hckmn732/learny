// Integration service and API rules of SPEC-720 (BR-AUT-09, ADR-0190).
//
// Real Postgres: the automation definition reads done slots, the SPEC-408 retention and the
// SPEC-402 states through the engine transaction; the weekly dedupe key makes a replayed tick a
// no-op; the notification channel is restricted to the application unless `app_email` is chosen.
// The service read runs under the learner's RLS client, so another learner answers 404 (CA-3).
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';

import {
  declineAutomationAction,
  runAutomation,
  type AutomationEngineContext,
} from '../../../automations/src';
import { createServiceContext, type ServiceContext } from '../../src/context';
import { getWeeklyReview } from '../../src/weekly-review';

const PREFIX = 'sdd-720-';
const SUNDAY = '2026-11-08T18:00:00.000Z';
const PARIS = 'Europe/Paris';

class TestClock implements Clock {
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

interface Learner {
  userId: string;
  email: string;
  formationId: string;
  moduleId: string;
  notionIds: string[];
  ctx: ServiceContext;
  clock: TestClock;
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

function engine(clock: TestClock): AutomationEngineContext {
  return {
    requestId: randomUUID(),
    sdb: serviceDb(),
    clock,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      child: () => engine(clock).logger,
    } as unknown as AutomationEngineContext['logger'],
  };
}

async function createLearner(
  label: string,
  options: { thousands?: boolean; params?: Record<string, unknown> } = {},
): Promise<Learner> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const clock = new TestClock(SUNDAY);
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, firstName: 'Alex', timezone: PARIS });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 6,
      title: 'SAP S/4HANA Finance',
    });
    return { user, programme };
  });
  const moduleId = base.programme.moduleIds[0];
  if (moduleId === undefined) throw new Error('module de test absent');

  if (options.thousands !== false) {
    await serviceDb().execute(sql`
      insert into public.module_progress (user_id, module_id, status, validated_at)
      values (
        ${base.user.id}::uuid, ${moduleId}::uuid, 'validated',
        '2026-10-01T09:00:00Z'::timestamptz
      )
      on conflict (user_id, module_id) do update
        set status = 'validated', validated_at = excluded.validated_at
    `);
    // 4 notions reviewed 31 days after validation, 3 successful: 75 % at one month.
    for (const [index, notionId] of base.programme.notionIds.slice(0, 4).entries()) {
      await serviceDb().execute(sql`
        insert into public.review_logs (user_id, notion_id, source, grade, correct, reviewed_at)
        values (
          ${base.user.id}::uuid, ${notionId}::uuid, 'global_quiz', 'good',
          ${index < 3}, '2026-11-01T09:00:00Z'::timestamptz
        )
      `);
    }
    // Done slots of the local week: 90 + 90 + 60 = 240 min (CA-1).
    await addSlot(base.user.id, base.programme.formationId, {
      startsAt: '2026-11-02T09:00:00+01:00',
      endsAt: '2026-11-02T10:30:00+01:00',
      status: 'done',
    });
    await addSlot(base.user.id, base.programme.formationId, {
      startsAt: '2026-11-03T14:00:00+01:00',
      endsAt: '2026-11-03T15:30:00+01:00',
      status: 'done',
    });
    await addSlot(base.user.id, base.programme.formationId, {
      startsAt: '2026-11-08T10:00:00+01:00',
      endsAt: '2026-11-08T11:00:00+01:00',
      status: 'done',
    });
    // Planned slots of the next local week: two days, 120 min.
    await addSlot(base.user.id, base.programme.formationId, {
      startsAt: '2026-11-09T09:00:00+01:00',
      endsAt: '2026-11-09T10:00:00+01:00',
    });
    await addSlot(base.user.id, base.programme.formationId, {
      startsAt: '2026-11-10T14:00:00+01:00',
      endsAt: '2026-11-10T15:00:00+01:00',
    });

    // Two notions below 60 % with an open gap or a due instant are at risk.
    await serviceDb().transaction((tx) =>
      createNotionState(tx, {
        userId: base.user.id,
        notionId: base.programme.notionIds[0] as string,
        mastery: 35,
        gapNature: 'confusion',
        confusedWith: base.programme.notionIds[1] as string,
        dueAt: new Date('2026-11-10T09:00:00Z'),
        inReview: true,
      }),
    );
    await serviceDb().transaction((tx) =>
      createNotionState(tx, {
        userId: base.user.id,
        notionId: base.programme.notionIds[1] as string,
        mastery: 55,
        dueAt: new Date('2026-11-08T09:00:00Z'),
        inReview: true,
      }),
    );
    await serviceDb().transaction((tx) =>
      createNotionState(tx, {
        userId: base.user.id,
        notionId: base.programme.notionIds[2] as string,
        mastery: 80,
        dueAt: new Date('2026-11-08T09:00:00Z'),
        inReview: true,
      }),
    );
  }

  await serviceDb().execute(sql`
    insert into public.automation_settings (user_id, key, enabled, params)
    values (
      ${base.user.id}::uuid, 'bilan', true,
      ${JSON.stringify(options.params ?? { weekday: 7, hour: 19, channel: 'app' })}::jsonb
    )
    on conflict (user_id, key) do update
      set enabled = excluded.enabled, params = excluded.params
  `);

  return {
    userId: base.user.id,
    email,
    formationId: base.programme.formationId,
    moduleId,
    notionIds: base.programme.notionIds,
    clock,
    ctx: createServiceContext({
      userId: base.user.id,
      email,
      requestId: randomUUID(),
      clock,
    }),
  };
}

async function addSlot(
  userId: string,
  formationId: string,
  input: { startsAt: string; endsAt: string; status?: 'planned' | 'done' },
): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.schedule_slots (
      user_id, formation_id, kind, title, starts_at, ends_at, status, created_by
    ) values (
      ${userId}::uuid, ${formationId}::uuid, 'course', 'Séance de travail',
      ${input.startsAt}::timestamptz, ${input.endsAt}::timestamptz,
      ${input.status ?? 'planned'}::slot_status, 'planner'
    )
  `);
}

async function actions(userId: string) {
  return serviceDb().execute<{
    id: string;
    status: string;
    kind: string;
    summary: string;
    payload: Record<string, unknown>;
  }>(sql`
    select id::text as id, status::text as status, kind, summary, payload
    from public.automation_actions
    where user_id = ${userId}::uuid and automation = 'bilan'
    order by created_at asc
  `);
}

async function appliedEvents(userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.event_outbox
    where user_id = ${userId}::uuid and name = 'automation/action-applied'
  `);
  return rows[0]?.count ?? 0;
}

async function emailDeliveries(userId: string) {
  return serviceDb().execute<{ channel: string; status: string }>(sql`
    select d.channel::text as channel, d.status::text as status
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where n.user_id = ${userId}::uuid and n.type = 'weekly_review'
    order by n.created_at asc, d.channel asc
  `);
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe('[SPEC-720] service et API', () => {
  it('CA-1 — un bilan unique, heures = somme des créneaux faits, un rejeu ne duplique rien', async () => {
    const learner = await createLearner('weekly');
    const first = await runAutomation(engine(learner.clock), {
      key: 'bilan',
      userId: learner.userId,
      trigger: { type: 'hourly', localHour: 19 },
    });
    const value = unwrap(first);
    expect(value.created).toBe(1);
    const rows = await actions(learner.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('weekly_review');
    expect(rows[0]?.status).toBe('applied');
    expect(rows[0]?.payload).toMatchObject({
      weekKey: '2026-W45',
      weekStart: '2026-11-02',
      weekEnd: '2026-11-08',
      nextWeekStart: '2026-11-09',
      studyMinutes: 240,
      atRiskCount: 2,
      planMinutes: 120,
      channel: 'app',
      availabilityHref: '/parametres#rythme',
    });
    expect(rows[0]?.payload.retention).toMatchObject({ horizonDays: 30, rate: 75 });
    expect(rows[0]?.payload.plan).toEqual([
      { date: '2026-11-09', minutes: 60, slots: 1 },
      { date: '2026-11-10', minutes: 60, slots: 1 },
    ]);
    expect(rows[0]?.summary).toBe(
      'Bilan de la semaine (reçu dim. 19:00) : 4 h d’étude, 75 % retenu à 1 mois, 2 notions à risque.',
    );
    expect(await appliedEvents(learner.userId)).toBe(1);

    // A replayed tick finds the same dedupe key and writes neither a row nor an event.
    const replay = unwrap(
      await runAutomation(engine(learner.clock), {
        key: 'bilan',
        userId: learner.userId,
        trigger: { type: 'hourly', localHour: 19 },
      }),
    );
    expect(replay.created).toBe(0);
    expect(replay.duplicateIds).toHaveLength(1);
    expect(await actions(learner.userId)).toHaveLength(1);
    expect(await appliedEvents(learner.userId)).toBe(1);
  });

  it('CA-2 — app + e-mail crée une livraison e-mail, le canal application n’en crée aucune', async () => {
    const appOnly = await createLearner('app');
    unwrap(
      await runAutomation(engine(appOnly.clock), {
        key: 'bilan',
        userId: appOnly.userId,
        trigger: { type: 'hourly', localHour: 19 },
      }),
    );
    expect(await emailDeliveries(appOnly.userId)).toEqual([]);
    const inApp = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.notifications
      where user_id = ${appOnly.userId}::uuid and type = 'weekly_review'
    `);
    expect(inApp[0]?.count).toBe(1);

    const withEmail = await createLearner('email', {
      params: { weekday: 7, hour: 19, channel: 'app_email' },
    });
    unwrap(
      await runAutomation(engine(withEmail.clock), {
        key: 'bilan',
        userId: withEmail.userId,
        trigger: { type: 'hourly', localHour: 19 },
      }),
    );
    const deliveries = await emailDeliveries(withEmail.userId);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.channel).toBe('email');
  });

  it('CA-3 — 400, 404 RLS et 409 sans écriture supplémentaire', async () => {
    const owner = await createLearner('owner');
    const stranger = await createLearner('stranger');
    unwrap(
      await runAutomation(engine(owner.clock), {
        key: 'bilan',
        userId: owner.userId,
        trigger: { type: 'hourly', localHour: 19 },
      }),
    );
    const action = (await actions(owner.userId))[0];
    if (action === undefined) throw new Error('bilan absent');
    expect(await appliedEvents(owner.userId)).toBe(1);

    const foreign = await getWeeklyReview(stranger.ctx, { actionId: action.id });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_FOUND');

    const invalid = await getWeeklyReview(owner.ctx, { actionId: 'pas-un-uuid' });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('VALIDATION_FAILED');

    const conflict = await declineAutomationAction(owner.ctx, { actionId: action.id });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.error.code).toBe('CONFLICT');

    // The invalid settings are refused before any write, and an action remains a single row.
    await serviceDb().execute(sql`
      update public.automation_settings
      set params = '{"weekday":3,"hour":19,"channel":"app"}'::jsonb
      where user_id = ${owner.userId}::uuid and key = 'bilan'
    `);
    const refused = await runAutomation(engine(owner.clock), {
      key: 'bilan',
      userId: owner.userId,
      trigger: { type: 'hourly', localHour: 19 },
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe('VALIDATION_FAILED');
    expect(await actions(owner.userId)).toHaveLength(1);
    expect(await appliedEvents(owner.userId)).toBe(1);
  });

  it('CL-4 — une semaine vide affiche 0 h réellement et une rétention non disponible', async () => {
    const learner = await createLearner('empty', { thousands: false });
    unwrap(
      await runAutomation(engine(learner.clock), {
        key: 'bilan',
        userId: learner.userId,
        trigger: { type: 'hourly', localHour: 19 },
      }),
    );
    const action = (await actions(learner.userId))[0];
    expect(action?.payload).toMatchObject({
      studyMinutes: 0,
      atRiskCount: 0,
      planMinutes: 0,
    });
    expect(action?.payload.retention).toMatchObject({ rate: null, reviewed: 0, successful: 0 });

    const view = unwrap(await getWeeklyReview(learner.ctx, {}));
    expect(view.available).toBe(true);
    expect(view.review?.studyLabel).toBe('0 min');
    expect(view.review?.retentionLabel).toBe('Non disponible');
    expect(view.review?.availabilityQuestion).toBe(true);
  });
});
