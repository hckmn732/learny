// Integration tests of the `echauffement` automation (SPEC-714 §12, CA-1 to CA-7). Real Postgres:
// the engine, the RLS client of the learner, the dedupe index, the selection engine of SPEC-410,
// the FSRS application of SPEC-411 and the daily quiz session of SPEC-701. The clock is injected
// step by step and never read from the process (ADR-0047).
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import {
  getOrCreateTodaySession,
  getTodayWarmups,
  answerWarmup,
  createServiceContext,
  type ServiceContext,
} from '@learny/services';

import {
  echauffementAutomation,
  runAutomation,
  undoAutomationAction,
  type AutomationEngineContext,
} from '../../src';

const PREFIX = 'sdd-714-';
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

interface Fixture {
  user: User;
  formationId: string;
  moduleIds: string[];
  chapterIds: string[];
  notionIds: string[];
  sessionId: string;
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

async function createUser(label: string): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const row = await createTestUser(tx, { email, firstName: 'Alex', timezone: PARIS });
    await tx.execute(sql`
      update public.profiles
      set created_at = '2026-09-01T08:00:00Z'::timestamptz,
          onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz
      where id = ${row.id}::uuid
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${row.id}::uuid, 2, '{1,2,3,4,5,6,7}'::smallint[], '{soir}')
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
    values (${user.id}::uuid, 'echauffement', ${enabled}, ${JSON.stringify(params)}::jsonb)
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

async function addSlot(
  user: User,
  formationId: string,
  input: {
    kind: string;
    title?: string;
    day?: string;
    startsAt: string;
    endsAt: string;
    moduleId?: string | null;
  },
): Promise<string> {
  const rows = await serviceDb().execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by
    ) values (
      ${user.id}::uuid, ${formationId}::uuid, ${input.moduleId ?? null}::uuid,
      ${input.kind}::slot_kind, ${input.title ?? 'Quiz de validation'},
      ${input.startsAt}::timestamptz, ${input.endsAt}::timestamptz,
      'planned', 'planner'
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('créneau non créé');
  return id;
}

async function addNotionState(
  user: User,
  notionId: string,
  options: { lastSeenAt: string; dueAt?: string } = { lastSeenAt: '2026-11-10T17:00:00Z' },
): Promise<void> {
  const due = new Date(options.dueAt ?? '2026-11-18T08:00:00Z').toISOString();
  const lastReview = new Date(options.lastSeenAt).toISOString();
  await serviceDb().execute(sql`
    insert into public.notion_states (
      user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
      success_count, suspended, in_review, revision, created_at, updated_at
    ) values (
      ${user.id}::uuid, ${notionId}::uuid,
      ${JSON.stringify({
        due,
        stability: 10,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 7,
        reps: 2,
        lapses: 0,
        state: 2,
        last_review: lastReview,
      })}::jsonb,
      ${due}::timestamptz,
      50, ${options.lastSeenAt}::timestamptz, ${options.lastSeenAt}::timestamptz,
      2, false, true, 0,
      '2026-10-01T08:00:00Z'::timestamptz, '2026-11-10T18:00:00Z'::timestamptz
    )
    on conflict (user_id, notion_id) do update
      set last_seen_at = excluded.last_seen_at,
          due_at = excluded.due_at,
          in_review = true
  `);
}

async function addBrick(
  user: User,
  formationId: string,
  notionId: string,
  payload: Record<string, unknown>,
  purpose = 'bank',
): Promise<{ brickId: string; versionId: string }> {
  const brickId = randomUUID();
  const versionId = randomUUID();
  await serviceDb().execute(sql`
    insert into public.bricks (
      id, owner_id, formation_id, type, notion_ids, purpose, status, current_version, created_at
    ) values (
      ${brickId}::uuid, ${user.id}::uuid, ${formationId}::uuid, 'recall_card',
      ${sql`array[${notionId}::uuid]`}, ${purpose}::brick_purpose, 'active', 1,
      '2026-11-01T08:00:00Z'::timestamptz
    )
  `);
  await serviceDb().execute(sql`
    insert into public.brick_versions (
      id, brick_id, version, payload, fingerprint, origin, created_by, created_at
    ) values (
      ${versionId}::uuid, ${brickId}::uuid, 1, ${JSON.stringify(payload)}::jsonb,
      null, 'tutor', 'tutor', '2026-11-01T08:00:00Z'::timestamptz
    )
  `);
  return { brickId, versionId };
}

async function addLink(user: User, formationId: string, from: string, to: string): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.notion_links (formation_id, from_notion_id, to_notion_id, kind, owner_id)
    values (${formationId}::uuid, ${from}::uuid, ${to}::uuid, 'prerequisite', ${user.id}::uuid)
  `);
}

async function seedProgramme(
  user: User,
  options: { seen?: number; withLink?: boolean; withBricks?: boolean } = {},
): Promise<Fixture> {
  const programme = await serviceDb().transaction((tx) =>
    createTestProgramme(tx, user.id, {
      modules: 2,
      chaptersPerModule: 2,
      notionsPerChapter: 2,
      title: 'SAP S/4HANA Finance',
    }),
  );
  await serviceDb().execute(sql`
    insert into public.module_progress (user_id, module_id, status, opened_at, validated_at)
    values
      (${user.id}::uuid, ${programme.moduleIds[0] ?? ''}::uuid, 'validated',
       '2026-10-01T08:00:00Z'::timestamptz, '2026-10-20T08:00:00Z'::timestamptz),
      (${user.id}::uuid, ${programme.moduleIds[1] ?? ''}::uuid, 'open',
       '2026-10-21T08:00:00Z'::timestamptz, null)
  `);
  const seen = options.seen ?? 2;
  for (let index = 0; index < seen; index += 1) {
    const notionId = programme.notionIds[index];
    if (notionId === undefined) continue;
    await addNotionState(user, notionId);
  }
  if (options.withLink !== false) {
    const from = programme.notionIds[0];
    const to = programme.notionIds[4];
    if (from !== undefined && to !== undefined) {
      await addLink(user, programme.formationId, from, to);
    }
  }
  if (options.withBricks !== false) {
    for (let index = 0; index < seen; index += 1) {
      const notionId = programme.notionIds[index];
      if (notionId === undefined) continue;
      await addBrick(user, programme.formationId, notionId, {
        front: `Question ${String(index + 1)} ?`,
        back: `Réponse ${String(index + 1)}.`,
        sources: [],
      });
    }
  }
  const sessionId = await addSlot(user, programme.formationId, {
    kind: 'validation_quiz',
    title: 'Quiz de validation',
    startsAt: '2026-11-11T14:00:00+01:00',
    endsAt: '2026-11-11T15:00:00+01:00',
    moduleId: programme.moduleIds[1] ?? null,
  });
  return {
    user,
    formationId: programme.formationId,
    moduleIds: programme.moduleIds,
    chapterIds: programme.chapterIds,
    notionIds: programme.notionIds,
    sessionId,
  };
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
    select id::text as id, kind, status::text as status, summary, payload, undo_payload
    from public.automation_actions
    where user_id = ${userId}::uuid and automation = 'echauffement'
    order by created_at asc
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

beforeAll(() => {
  if (echauffementAutomation.key !== 'echauffement') throw new Error('définition absente');
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

describe('[SPEC-714] échauffement · intégration', () => {
  it('CA-1 — le tick de 06 h crée l’activité et le créneau de 2 minutes', async () => {
    const clock = new TestClock('2026-11-11T05:00:00Z'); // 06:00 à Paris
    const alex = await createUser('gen');
    const fixture = await seedProgramme(alex);
    await setParams(alex, { count: 2, scope: 'yesterday_prerequisites' });

    const run = await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    expect(run.created).toBe(1);
    const [action] = await actions(alex.id);
    expect(action?.kind).toBe('warmup_added');
    expect(action?.status).toBe('applied');
    expect(action?.payload.dedupeKey).toBe(`warmup:2026-11-11:${fixture.formationId}`);
    const activityId = String(action?.payload.activityId);
    const slotId = String(action?.payload.slotId);
    expect(activityId).not.toBe('');
    const activity = await serviceDb().execute<{
      kind: string;
      status: string;
      for_date: string;
      items: unknown[];
      config: Record<string, unknown>;
    }>(sql`
      select kind::text as kind, status::text as status, for_date::text as for_date, items, config
      from public.activities where id = ${activityId}::uuid
    `);
    expect(activity[0]?.kind).toBe('warmup');
    expect(activity[0]?.status).toBe('ready');
    expect(activity[0]?.for_date).toBe('2026-11-11');
    expect(activity[0]?.items).toHaveLength(2);
    expect(activity[0]?.config.questionCount).toBe(2);
    const slot = await serviceDb().execute<{
      kind: string;
      title: string;
      meta: string;
      starts_at: string;
      ends_at: string;
      created_by: string;
      activity_id: string;
    }>(sql`
      select kind::text as kind, title, meta, starts_at::text as starts_at, ends_at::text as ends_at,
             created_by::text as created_by, activity_id::text as activity_id
      from public.schedule_slots where id = ${slotId}::uuid
    `);
    expect(slot[0]?.kind).toBe('warmup');
    expect(slot[0]?.title).toBe('Échauffement');
    expect(slot[0]?.meta).toBe('2 questions de rappel · 2 min · ajouté par le tuteur');
    expect(slot[0]?.created_by).toBe('automation');
    expect(slot[0]?.activity_id).toBe(activityId);
    expect(new Date(String(slot[0]?.starts_at)).toISOString()).toBe(
      new Date('2026-11-11T13:50:00+01:00').toISOString(),
    );
    expect(new Date(String(slot[0]?.ends_at)).toISOString()).toBe(
      new Date('2026-11-11T13:52:00+01:00').toISOString(),
    );

    const replay = await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    expect(replay.created).toBe(0);
    expect(await actions(alex.id)).toHaveLength(1);
  });

  it('CA-2 — le créneau suit la séance suivante puis expire sans séance restante', async () => {
    const clock = new TestClock('2026-11-11T05:00:00Z');
    const alex = await createUser('move');
    const fixture = await seedProgramme(alex);
    await addSlot(alex, fixture.formationId, {
      kind: 'exercise',
      title: 'Exercice pratique',
      startsAt: '2026-11-11T17:00:00+01:00',
      endsAt: '2026-11-11T18:00:00+01:00',
      moduleId: fixture.moduleIds[1] ?? null,
    });
    await setParams(alex, { count: 2 });

    await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    const [action] = await actions(alex.id);
    const firstSlotId = String(action?.payload.slotId);

    clock.set('2026-11-11T13:05:00Z'); // 14:05 à Paris
    await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 14 },
      }),
    );
    const moved = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.schedule_slots where id = ${firstSlotId}::uuid
    `);
    expect(moved[0]?.status).toBe('moved');
    const [afterMove] = await actions(alex.id);
    const nextSlotId = String(afterMove?.payload.slotId);
    expect(nextSlotId).not.toBe(firstSlotId);
    const nextSlot = await serviceDb().execute<{
      starts_at: string;
      moved_from_id: string | null;
    }>(sql`
      select starts_at::text as starts_at, moved_from_id::text as moved_from_id
      from public.schedule_slots where id = ${nextSlotId}::uuid
    `);
    expect(new Date(String(nextSlot[0]?.starts_at)).toISOString()).toBe(
      new Date('2026-11-11T16:50:00+01:00').toISOString(),
    );
    expect(nextSlot[0]?.moved_from_id).toBe(firstSlotId);

    clock.set('2026-11-11T17:05:00Z'); // 18:05 à Paris
    await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 18 },
      }),
    );
    const [expired] = await actions(alex.id);
    expect(expired?.status).toBe('expired');
    expect(expired?.summary).toBe('Échauffement du mercredi 11 novembre non fait.');
    const missed = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.schedule_slots where id = ${nextSlotId}::uuid
    `);
    expect(missed[0]?.status).toBe('missed');
  });

  it('CA-4 — les réponses alimentent FSRS et la notion « À revoir » entre dans le quiz du soir', async () => {
    const clock = new TestClock('2026-11-11T05:00:00Z');
    const alex = await createUser('answers');
    const fixture = await seedProgramme(alex);
    await setParams(alex, { count: 2 });
    await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    const [action] = await actions(alex.id);
    const activityId = String(action?.payload.activityId);
    const warmups = await unwrap(getTodayWarmups(context(alex, clock)));
    expect(warmups.items).toHaveLength(1);
    const dto = warmups.items[0];
    expect(dto?.items).toHaveLength(2);
    expect(dto?.status).toBe('todo');

    clock.set('2026-11-11T12:20:00Z');
    const first = await unwrap(
      answerWarmup(context(alex, clock), { activityId, position: 0, knew: true }),
    );
    expect(first.answers).toEqual([{ position: 0, knew: true }]);
    expect(first.status).toBe('in_progress');
    const reviewNotionId = dto?.items[1]?.notionId ?? '';
    const second = await unwrap(
      answerWarmup(context(alex, clock), { activityId, position: 1, knew: false }),
    );
    expect(second.status).toBe('done');
    expect(second.answers).toHaveLength(2);

    const logs = await serviceDb().execute<{ source: string; grade: string }>(sql`
      select source::text as source, grade::text as grade
      from public.review_logs
      where user_id = ${alex.id}::uuid and source = 'warmup'
      order by reviewed_at asc
    `);
    expect(logs).toHaveLength(2);
    expect(logs.map((row) => row.grade)).toEqual(['good', 'again']);

    const [consumed] = await actions(alex.id);
    expect(consumed?.status).toBe('consumed');
    expect(consumed?.summary).toContain('Échauffement fait : 1 sur 2');
    expect(consumed?.payload.reviewNotionIds).toContain(reviewNotionId);

    const session = await unwrap(
      getOrCreateTodaySession(context(alex, clock), fixture.formationId, 'full'),
    );
    const inSession = session.items.some((item) => item.notionIds.includes(reviewNotionId));
    expect(inSession).toBe(true);

    const state = await serviceDb().execute<{ due_at: string; in_review: boolean }>(sql`
      select due_at::text as due_at, in_review
      from public.notion_states
      where user_id = ${alex.id}::uuid and notion_id = ${reviewNotionId}::uuid
    `);
    expect(state[0]?.in_review).toBe(true);
  });

  it('CA-7, CL-11 — une position déjà répondue est un 409 et un autre apprenant un 404', async () => {
    const clock = new TestClock('2026-11-11T05:00:00Z');
    const alex = await createUser('conflict');
    await seedProgramme(alex);
    await setParams(alex, { count: 2 });
    await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    const [action] = await actions(alex.id);
    const activityId = String(action?.payload.activityId);
    clock.set('2026-11-11T12:20:00Z');
    await unwrap(answerWarmup(context(alex, clock), { activityId, position: 0, knew: true }));
    await expectError(
      answerWarmup(context(alex, clock), { activityId, position: 0, knew: true }),
      'CONFLICT',
    );

    const bob = await createUser('other');
    await expectError(
      answerWarmup(context(bob, clock), { activityId, position: 1, knew: true }),
      'NOT_FOUND',
    );
  });

  it('CA-5 — désactivé, en pause globale ou sans notion : aucune création', async () => {
    const clock = new TestClock('2026-11-11T05:00:00Z');
    const disabled = await createUser('off');
    await seedProgramme(disabled);
    await setParams(disabled, { count: 2 }, false);
    const off = await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: disabled.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    expect(off.skipped).toBe('disabled');
    expect(await actions(disabled.id)).toHaveLength(0);

    const paused = await createUser('pause');
    await seedProgramme(paused);
    await addPause(paused, '2026-11-09', '2026-11-15');
    const onPause = await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: paused.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    expect(onPause.skipped).toBe('paused');
    expect(await actions(paused.id)).toHaveLength(0);

    const empty = await createUser('empty');
    await seedProgramme(empty, { seen: 0, withLink: false, withBricks: false });
    const none = await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: empty.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    expect(none.created).toBe(0);
    expect(await actions(empty.id)).toHaveLength(0);
  });

  it('CA-6 — l’annulation archive l’activité et retire le créneau, puis refuse après une réponse', async () => {
    const clock = new TestClock('2026-11-11T05:00:00Z');
    const alex = await createUser('undo');
    await seedProgramme(alex);
    await setParams(alex, { count: 2 });
    await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    const [action] = await actions(alex.id);
    const activityId = String(action?.payload.activityId);
    const slotId = String(action?.payload.slotId);
    clock.set('2026-11-11T12:20:00Z');
    await unwrap(undoAutomationAction(context(alex, clock), { actionId: action?.id ?? '' }));
    const activity = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.activities where id = ${activityId}::uuid
    `);
    expect(activity[0]?.status).toBe('archived');
    const slot = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.schedule_slots where id = ${slotId}::uuid
    `);
    expect(slot[0]?.status).toBe('cancelled');

    const bob = await createUser('undo-late');
    await seedProgramme(bob);
    await setParams(bob, { count: 2 });
    await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: bob.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    const [late] = await actions(bob.id);
    const lateActivityId = String(late?.payload.activityId);
    await unwrap(
      answerWarmup(context(bob, clock), { activityId: lateActivityId, position: 0, knew: true }),
    );
    await expectError(
      undoAutomationAction(context(bob, clock), { actionId: late?.id ?? '' }),
      'AUTOMATION_ACTION_CONSUMED',
    );
  });

  it('CL-8 — session du soir déjà commencée : la notion est due le lendemain local', async () => {
    const clock = new TestClock('2026-11-11T05:00:00Z');
    const alex = await createUser('late-session');
    const fixture = await seedProgramme(alex, { seen: 3 });
    await addNotionState(alex, fixture.notionIds[2] ?? '', {
      lastSeenAt: '2026-11-10T17:00:00Z',
      dueAt: '2026-11-11T07:00:00Z',
    });
    await addBrick(alex, fixture.formationId, fixture.notionIds[2] ?? '', {
      front: 'Question 3 ?',
      back: 'Réponse 3.',
      sources: [],
    });
    await setParams(alex, { count: 2 });
    await unwrap(
      runAutomation(engine(clock), {
        key: 'echauffement',
        userId: alex.id,
        trigger: { type: 'hourly', localHour: 6 },
      }),
    );
    const [action] = await actions(alex.id);
    const activityId = String(action?.payload.activityId);
    const warmup = (await unwrap(getTodayWarmups(context(alex, clock)))).items[0];
    expect(warmup?.items).toHaveLength(2);

    clock.set('2026-11-11T12:20:00Z');
    const session = await unwrap(
      getOrCreateTodaySession(context(alex, clock), fixture.formationId, 'full'),
    );
    expect(session.items.length).toBeGreaterThan(0);
    const firstVersion = session.items[0]?.brickVersionId;
    const attempt = await serviceDb().execute<{ id: string }>(sql`
      select t.id::text as id
      from public.attempts t
      join public.activities a on a.id = t.activity_id
      where t.user_id = ${alex.id}::uuid and a.kind = 'global_quiz_session'
      order by t.created_at desc limit 1
    `);
    await serviceDb().execute(sql`
      insert into public.answers (
        id, attempt_id, brick_version_id, position, response, is_correct,
        score, max_score, time_ms, graded_by, answered_at
      ) values (
        ${randomUUID()}::uuid, ${attempt[0]?.id ?? ''}::uuid, ${firstVersion ?? ''}::uuid,
        1, '{}'::jsonb, true, '1', '1', 1000, 'code', '2026-11-11T12:20:00Z'::timestamptz
      )
    `);
    const targetPosition = warmup?.items[0]?.position ?? 0;
    await unwrap(
      answerWarmup(context(alex, clock), { activityId, position: targetPosition, knew: false }),
    );
    const notionId = warmup?.items[0]?.notionId ?? '';
    const state = await serviceDb().execute<{ due_at: string }>(sql`
      select due_at::text as due_at from public.notion_states
      where user_id = ${alex.id}::uuid and notion_id = ${notionId}::uuid
    `);
    expect(new Date(String(state[0]?.due_at)).toISOString()).toBe(
      new Date('2026-11-11T23:00:00Z').toISOString(),
    );
  });
});
