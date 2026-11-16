// Integration tests of the `remediation` automation (SPEC-715 §12, CA-1 to CA-7). Real Postgres:
// the engine, the RLS client of the learner, the dedicated quiz/graded trigger, the SPEC-612
// preparation, the planner of SPEC-407 and the retry guard of SPEC-715. The clock is injected and
// advanced step by step (ADR-0047); the AI stays in mock mode (ADR-0048).
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Result } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import {
  completeRemediation,
  createServiceContext,
  startValidationAttempt,
  type ServiceContext,
} from '@learny/services';
import { createNotionState, makeModuleWithBank } from '@learny/testing';

import {
  remediationAutomation,
  runAutomation,
  undoAutomationAction,
  type AutomationEngineContext,
} from '../../src';

const PREFIX = 'sdd-715-';
const PARIS = 'Europe/Paris';
const SUBMITTED_AT = '2026-11-11T12:00:00.000Z';
const NOW = '2026-11-11T12:20:00.000Z';
const RETRY_AT = '2026-11-12T12:00:00.000Z';

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

  advance(hours: number): void {
    this.at = new Date(this.at.getTime() + hours * 3_600_000);
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
  attemptId: string;
  clock: TestClock;
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

async function createUser(
  label: string,
  options: { subscription?: boolean; timezone?: string } = {},
): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const row = await createTestUser(tx, {
      email,
      firstName: 'Alex',
      timezone: options.timezone ?? PARIS,
    });
    await tx.execute(sql`
      update public.profiles
      set created_at = '2026-09-01T08:00:00Z'::timestamptz,
          onboarding_completed_at = '2026-09-01T08:00:00Z'::timestamptz,
          onboarding_step = 'done'
      where id = ${row.id}::uuid
    `);
    await tx.execute(sql`
      insert into public.study_preferences (user_id, hours_per_day, study_days, preferred_slots)
      values (${row.id}::uuid, 2, '{1,2,3,4,5,6,7}'::smallint[], '{matin,apres_midi,soir}'::study_slot[])
      on conflict (user_id) do update
        set study_days = '{1,2,3,4,5,6,7}'::smallint[],
            preferred_slots = '{matin,apres_midi,soir}'::study_slot[]
    `);
    if (options.subscription !== false) {
      await tx.execute(sql`
        insert into public.subscriptions (user_id, status, current_period_end)
        values (${row.id}::uuid, 'active', '2030-01-01T00:00:00Z'::timestamptz)
      `);
    }
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
    values (${user.id}::uuid, 'remediation', ${enabled}, ${JSON.stringify(params)}::jsonb)
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
  options: {
    delayHours?: number;
    mode?: 'advised' | 'mandatory';
    enabled?: boolean;
    subscription?: boolean;
    passed?: boolean;
    submittedAt?: string;
    now?: string;
  } = {},
): Promise<Fixture> {
  const user = await createUser(
    label,
    options.subscription === undefined ? {} : { subscription: options.subscription },
  );
  const clock = new TestClock(options.now ?? NOW);
  const programme = await serviceDb().transaction(async (tx) => {
    const created = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 6,
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
    await makeModuleWithBank(tx, {
      userId: user.id,
      formationId: created.formationId,
      moduleId,
      notions: 6,
      variantsPerFormat: 3,
    });
    for (const [index, notionId] of created.notionIds.slice(0, 3).entries()) {
      await createNotionState(tx, {
        userId: user.id,
        notionId,
        mastery: 20 + index * 10,
        gapNature: index === 0 ? 'confusion' : index === 1 ? 'application' : 'forgetting',
        evidence: 'Erreur observée au quiz de validation.',
      });
    }
    const activity = await tx.execute<{ id: string }>(sql`
      insert into public.activities (owner_id, formation_id, module_id, kind, config, items, status)
      values (
        ${user.id}::uuid, ${created.formationId}::uuid, ${moduleId}::uuid,
        'validation_quiz', '{"threshold":80,"questionCount":6,"scoring":"equal"}'::jsonb,
        '[]'::jsonb, 'draft'
      ) returning id::text as id
    `);
    const activityId = activity[0]?.id ?? '';
    const attempt = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (
        user_id, activity_id, attempt_no, status, started_at, submitted_at, score, passed
      ) values (
        ${user.id}::uuid, ${activityId}::uuid, 1, 'graded',
        ${options.submittedAt ?? SUBMITTED_AT}::timestamptz,
        ${options.submittedAt ?? SUBMITTED_AT}::timestamptz,
        ${options.passed === true ? 86 : 58},
        ${options.passed === true}
      ) returning id::text as id
    `);
    return {
      formationId: created.formationId,
      moduleId,
      notionIds: created.notionIds,
      attemptId: attempt[0]?.id ?? '',
    };
  });
  if (options.passed !== true) {
    await setParams(
      user,
      { delayHours: options.delayHours ?? 24, mode: options.mode ?? 'advised' },
      options.enabled ?? true,
    );
  }
  return { user, ...programme, clock };
}

async function run(fx: Fixture) {
  return runAutomation(engine(fx.clock), {
    key: 'remediation',
    userId: fx.user.id,
    trigger: {
      type: 'event',
      name: 'quiz/graded',
      data: {
        userId: fx.user.id,
        formationId: fx.formationId,
        attemptId: fx.attemptId,
        moduleId: fx.moduleId,
        score: 58,
        passed: false,
        threshold: 80,
        attemptNo: 1,
      },
    },
  });
}

async function unwrap<T>(value: Result<T> | Promise<Result<T>>): Promise<T> {
  const result = await value;
  if (!result.ok) throw result.error;
  return result.value;
}

async function actionOf(fx: Fixture) {
  const rows = await serviceDb().execute<{
    id: string;
    status: string;
    summary: string;
    payload: Record<string, unknown>;
    undo_payload: Record<string, unknown> | null;
  }>(sql`
    select id::text as id, status::text as status, summary, payload, undo_payload
    from public.automation_actions
    where user_id = ${fx.user.id}::uuid and automation = 'remediation'
    order by created_at desc, id desc
    limit 1
  `);
  return rows[0];
}

async function slots(fx: Fixture) {
  return serviceDb().execute<{
    id: string;
    kind: string;
    status: string;
    title: string;
    meta: string | null;
    activity_id: string | null;
    starts_at: string;
    ends_at: string;
  }>(sql`
    select id::text as id, kind::text as kind, status::text as status, title, meta,
           activity_id::text as activity_id, starts_at::text as starts_at, ends_at::text as ends_at
    from public.schedule_slots
    where user_id = ${fx.user.id}::uuid
    order by starts_at asc
  `);
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

beforeAll(() => {
  if (remediationAutomation.key !== 'remediation') throw new Error('définition absente');
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

describe('[SPEC-715] remédiation automatique', () => {
  it('CA-1 — un quiz échoué crée la remédiation, son créneau de 15 min et la tentative après le délai', async () => {
    const fx = await fixture('creation');
    const result = await unwrap(await run(fx));
    expect(result.created).toBe(1);

    const action = await actionOf(fx);
    expect(action?.status).toBe('applied');
    expect(action?.payload).toMatchObject({
      attemptId: fx.attemptId,
      attemptNo: 1,
      moduleId: fx.moduleId,
      score: 58,
      threshold: 80,
      delayHours: 24,
      mode: 'advised',
      retryAvailableAt: RETRY_AT,
      durationMin: 15,
    });
    expect(action?.payload.gapNotionIds).toHaveLength(3);
    expect(action?.payload.gapLabels).toEqual(['Notion 1.1.1', 'Notion 1.1.2', 'Notion 1.1.3']);
    const activityId = action?.payload.remediationActivityId;
    expect(typeof activityId).toBe('string');

    const rows = await slots(fx);
    const remediation = rows.find((row) => row.kind === 'revision');
    const retry = rows.find((row) => row.kind === 'validation_quiz');
    expect(remediation).toMatchObject({
      status: 'planned',
      title: 'Remédiation · Comptabilité générale',
      meta: 'Lacunes du quiz · 15 min · ajoutée par le tuteur',
      activity_id: activityId,
    });
    expect(Date.parse(remediation?.starts_at ?? '')).toBeGreaterThanOrEqual(
      Date.parse('2026-11-11T12:15:00.000Z'),
    );
    expect(Date.parse(remediation?.ends_at ?? '')).toBeLessThanOrEqual(Date.parse(RETRY_AT));
    expect(retry).toMatchObject({
      status: 'planned',
      title: 'Quiz · tentative 2',
    });
    expect(Date.parse(retry?.starts_at ?? '')).toBeGreaterThanOrEqual(Date.parse(RETRY_AT));
    expect(Date.parse(retry?.ends_at ?? '') - Date.parse(retry?.starts_at ?? '')).toBe(3_600_000);
    expect(action?.payload.remediationSlotId).toBe(remediation?.id);
    expect(action?.payload.retrySlotId).toBe(retry?.id);
  });

  it('CA-1 — un quiz réussi ne crée aucune action', async () => {
    const fx = await fixture('passed', { passed: true });
    const result = await unwrap(await run(fx));
    expect(result.created).toBe(0);
    expect(await actionOf(fx)).toBeUndefined();
  });

  it('CA-2 — le délai refuse 422 avec retryAvailableAt puis autorise 201 et consomme l’action', async () => {
    const fx = await fixture('delay');
    await unwrap(await run(fx));
    const ctx = context(fx.user, fx.clock);

    const blocked = await startValidationAttempt(ctx, fx.moduleId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe('RETRY_NOT_YET_ALLOWED');
      expect(blocked.error.availableAt).toBe(RETRY_AT);
      expect(blocked.error.remediationRequired).toBe(false);
    }

    fx.clock.advance(1);
    expect((await startValidationAttempt(ctx, fx.moduleId)).ok).toBe(false);
    fx.clock.advance(22);
    expect((await startValidationAttempt(ctx, fx.moduleId)).ok).toBe(false);
    fx.clock.advance(2);
    const allowed = await startValidationAttempt(ctx, fx.moduleId);
    expect(allowed.ok).toBe(true);
    const action = await actionOf(fx);
    expect(action?.status).toBe('consumed');
  });

  it('CA-3 — le mode obligatoire refuse jusqu’à la fin de la remédiation', async () => {
    const fx = await fixture('mandatory', { mode: 'mandatory' });
    await unwrap(await run(fx));
    const ctx = context(fx.user, fx.clock);
    fx.clock.advance(25);
    const blocked = await startValidationAttempt(ctx, fx.moduleId);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe('RETRY_NOT_YET_ALLOWED');
      expect(blocked.error.remediationRequired).toBe(true);
      expect(blocked.error.detail).toBe('Terminez d’abord la remédiation ciblée.');
    }

    const action = await actionOf(fx);
    const activityId = String(action?.payload.remediationActivityId);
    const remediationAttempt = await serviceDb().execute<{ id: string }>(sql`
      select at.id::text as id
      from public.attempts at
      join public.activities act on act.id = at.activity_id
      where act.id = ${activityId}::uuid and at.user_id = ${fx.user.id}::uuid
      limit 1
    `);
    const attemptId = remediationAttempt[0]?.id ?? '';
    await serviceDb().execute(sql`
      update public.answers
      set is_correct = true, score = max_score, graded_by = 'code'
      where attempt_id = ${attemptId}::uuid
    `);
    const completed = await completeRemediation(ctx, fx.moduleId);
    expect(completed.ok).toBe(true);
    const allowed = await startValidationAttempt(ctx, fx.moduleId);
    expect(allowed.ok).toBe(true);
  });

  it('CA-5 — undo avant la tentative suivante lève le délai et retire les créneaux', async () => {
    const fx = await fixture('undo');
    await unwrap(await run(fx));
    const action = await actionOf(fx);
    const before = await slots(fx);
    const undone = await undoAutomationAction(context(fx.user, fx.clock), {
      actionId: action?.id ?? '',
    });
    expect(undone.ok).toBe(true);
    if (undone.ok) expect(undone.value.status).toBe('undone');
    expect((await actionOf(fx))?.summary).toBe(
      'Annulé : délai et remédiation planifiée du quiz du module 1.',
    );
    const after = await slots(fx);
    expect(after.find((row) => row.kind === 'revision')?.status).toBe('cancelled');
    const retryAfter = after.find((row) => row.kind === 'validation_quiz');
    expect(retryAfter?.status).toBe('cancelled');
    expect(before.find((row) => row.kind === 'validation_quiz')?.id).toBe(retryAfter?.id);

    const started = await startValidationAttempt(context(fx.user, fx.clock), fx.moduleId);
    expect(started.ok).toBe(true);
  });

  it('CA-5 — après la tentative suivante, l’annulation répond AUTOMATION_ACTION_CONSUMED', async () => {
    const fx = await fixture('consumed', { delayHours: 0 });
    await unwrap(await run(fx));
    const action = await actionOf(fx);
    const started = await startValidationAttempt(context(fx.user, fx.clock), fx.moduleId);
    expect(started.ok).toBe(true);
    const again = await undoAutomationAction(context(fx.user, fx.clock), {
      actionId: action?.id ?? '',
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('AUTOMATION_ACTION_CONSUMED');
  });

  it('CA-6, CL-1 — désactivé : aucune action et tentative immédiate', async () => {
    const fx = await fixture('disabled', { enabled: false });
    const result = await unwrap(await run(fx));
    expect(result.skipped).toBe('disabled');
    expect(await actionOf(fx)).toBeUndefined();
    expect((await startValidationAttempt(context(fx.user, fx.clock), fx.moduleId)).ok).toBe(true);
  });

  it('CA-6, CL-5 — double émission : une seule action et un seul jeu de créneaux', async () => {
    const fx = await fixture('dedupe');
    const first = await unwrap(await run(fx));
    const second = await unwrap(await run(fx));
    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.duplicateIds).toHaveLength(1);
    const rows = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.automation_actions
      where user_id = ${fx.user.id}::uuid and automation = 'remediation'
    `);
    expect(rows[0]?.count).toBe(1);
    const created = await slots(fx);
    expect(created.filter((row) => row.kind === 'revision')).toHaveLength(1);
    expect(created.filter((row) => row.kind === 'validation_quiz')).toHaveLength(1);
  });

  it('CA-6, CL-9 — IA indisponible : délai et tentative appliqués, explication adaptée', async () => {
    const fx = await fixture('no-ai', { subscription: false });
    const result = await unwrap(await run(fx));
    expect(result.created).toBe(1);
    const action = await actionOf(fx);
    expect(action?.status).toBe('applied');
    expect(action?.payload.remediationActivityId).toBeNull();
    expect(action?.summary).toContain('La remédiation sera prête dès que l’IA sera disponible.');
    const rows = await slots(fx);
    expect(rows.some((row) => row.kind === 'revision')).toBe(false);
    const retry = rows.find((row) => row.kind === 'validation_quiz');
    expect(retry).toBeDefined();
    expect(Date.parse(retry?.starts_at ?? '')).toBeGreaterThanOrEqual(Date.parse(RETRY_AT));

    fx.clock.advance(25);
    expect((await startValidationAttempt(context(fx.user, fx.clock), fx.moduleId)).ok).toBe(true);
  });

  it('CA-6, CL-4 — pause globale : action créée, aucun créneau placé', async () => {
    const fx = await fixture('pause');
    await addPause(fx.user, '2026-11-11', '2026-11-12');
    const result = await unwrap(await run(fx));
    expect(result.created).toBe(1);
    const action = await actionOf(fx);
    expect(action?.payload.paused).toBe(true);
    expect(action?.payload.remediationSlotId).toBeNull();
    expect(action?.payload.retrySlotId).toBeNull();
    expect(action?.summary).toContain('à la reprise');
    expect(await slots(fx)).toHaveLength(0);
  });

  it('CL-2, CL-3 — heures calmes différées et plafond atteint sur la notification', async () => {
    const quiet = await fixture('quiet', { now: '2026-11-11T21:00:00Z' });
    await unwrap(await run(quiet));
    const quietDeliveries = await deliveries(quiet.user.id);
    expect(quietDeliveries.some((row) => row.status === 'deferred_quiet')).toBe(true);

    const capped = await fixture('capped');
    await serviceDb().execute(sql`
      update public.notification_settings set max_per_day = 3 where user_id = ${capped.user.id}::uuid
    `);
    for (let index = 0; index < 3; index += 1) {
      await serviceDb().execute(sql`
        with inserted as (
          insert into public.notifications (user_id, type, title, body, href, icon, dedupe_key, created_at)
          values (
            ${capped.user.id}::uuid, 'milestone', 'Jalon', 'Jalon atteint', '/accueil', 'flag',
            ${`cap-715-${String(index)}`}, '2026-11-11T06:00:00Z'::timestamptz
          ) returning id
        )
        insert into public.notification_deliveries (notification_id, channel, status, sent_at)
        select id, 'email', 'sent', '2026-11-11T06:00:00Z'::timestamptz from inserted
      `);
    }
    await unwrap(await run(capped));
    const cappedDeliveries = await deliveries(capped.user.id);
    expect(cappedDeliveries.some((row) => row.status === 'capped')).toBe(true);
    expect(
      cappedDeliveries.filter((row) => row.title === 'Remédiation prête').length,
    ).toBeGreaterThan(0);
  });
});
