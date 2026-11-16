// Integration tests of the `jeu_lacune` automation (SPEC-716 §12, CA-1 to CA-6, CL-7 to CL-9).
// Real Postgres: the engine, the learner RLS client, the gap events, the bank of SPEC-513, the
// exercise service of SPEC-613 and the daily session of SPEC-701. The clock is injected and the
// AI stays in deterministic mock mode (ADR-0047, ADR-0048).
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Result } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import {
  createServiceContext,
  getOrCreateTodaySession,
  answerReviewItem,
  type ServiceContext,
} from '@learny/services';
import { createBrick, createNotionState, makeModuleWithBank } from '@learny/testing';

import {
  jeuLacuneAutomation,
  runAutomation,
  undoAutomationAction,
  type AutomationEngineContext,
} from '../../src';

const PREFIX = 'sdd-716-';
const PARIS = 'Europe/Paris';
const NOW = '2026-11-11T12:20:00.000Z';
const DETECTED_AT = '2026-11-06T08:00:00.000Z';

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
  notionLabel: string;
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
    values (${user.id}::uuid, 'jeu_lacune', ${enabled}, ${JSON.stringify(params)}::jsonb)
    on conflict (user_id, key) do update
      set enabled = excluded.enabled, params = excluded.params
  `);
}

async function addPause(user: User): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.pauses (user_id, starts_on, ends_on, status)
    values (${user.id}::uuid, '2026-11-11'::date, '2026-11-12'::date, 'active')
  `);
}

const RECALL_PAYLOAD = {
  front: 'Que définit une variante d’exercice comptable ?',
  back: 'Le nombre de périodes comptables d’un exercice.',
  sourceLabel: 'votre cours du module 1, chapitre 1',
  sources: [],
};

const MATCHING_PAYLOAD = {
  instruction: 'Opposez les deux notions proches.',
  lefts: [
    { id: 'p1', text: 'Variante d’exercice' },
    { id: 'p2', text: 'Exercice comptable' },
  ],
  rights: [
    { id: 'r1', text: 'Nombre de périodes d’un exercice.' },
    { id: 'r2', text: 'Période annuelle de référence.' },
  ],
  sources: [],
};

const CATEGORIZATION_PAYLOAD = {
  instruction: 'Classez les deux notions opposées.',
  categories: [
    { id: 'c1', label: 'Variante' },
    { id: 'c2', label: 'Exercice' },
  ],
  items: [
    { id: 'i1', text: 'Nombre de périodes.', categoryId: 'c1' },
    { id: 'i2', text: 'Période annuelle.', categoryId: 'c2' },
  ],
  sources: [],
};

const CHOICE_PAYLOAD = {
  stem: 'Quelle notion définit le nombre de périodes d’un exercice ?',
  mode: 'single',
  options: [
    { id: 'a', text: 'La variante d’exercice', correct: true, notionId: null },
    { id: 'b', text: 'L’exercice comptable', correct: false, notionId: null },
  ],
  explanation: 'La variante porte le nombre de périodes.',
  objective: 'Opposer les deux notions.',
  sources: [],
};

async function fixture(
  label: string,
  options: {
    nature: 'forgetting' | 'confusion' | 'application' | 'misunderstanding';
    withPairBricks?: boolean;
    withChoice?: boolean;
    enabled?: boolean;
    pause?: boolean;
  },
): Promise<Fixture & { confusedWithId: string | null }> {
  const user = await createUser(label);
  const clock = new TestClock(NOW);
  const programme = await serviceDb().transaction(async (tx) => {
    const created = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 4,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = created.moduleIds[0] ?? '';
    await tx.execute(sql`
      update public.modules set status = 'validated', threshold = 80 where id = ${moduleId}::uuid
    `);
    await tx.execute(sql`
      insert into public.module_progress (user_id, module_id, status, validated_at)
      values (${user.id}::uuid, ${moduleId}::uuid, 'validated', '2026-10-20T08:00:00Z'::timestamptz)
      on conflict (user_id, module_id) do update set status = 'validated'
    `);
    const notionId = created.notionIds[0] ?? '';
    const confusedWithId = created.notionIds[1] ?? null;
    await createTestCourse(tx, { ownerId: user.id, moduleId });
    await makeModuleWithBank(tx, {
      userId: user.id,
      formationId: created.formationId,
      moduleId,
      notions: 4,
      variantsPerFormat: 1,
    });
    await createBrick(tx, {
      ownerId: user.id,
      formationId: created.formationId,
      type: 'recall_card',
      purpose: 'bank',
      notionIds: [notionId],
      payload: RECALL_PAYLOAD,
    });
    if (options.withPairBricks === true && confusedWithId !== null) {
      await createBrick(tx, {
        ownerId: user.id,
        formationId: created.formationId,
        type: 'matching',
        purpose: 'bank',
        notionIds: [notionId, confusedWithId],
        payload: MATCHING_PAYLOAD,
      });
      await createBrick(tx, {
        ownerId: user.id,
        formationId: created.formationId,
        type: 'categorization',
        purpose: 'bank',
        notionIds: [notionId, confusedWithId],
        payload: CATEGORIZATION_PAYLOAD,
      });
    }
    if (options.withChoice === true) {
      await createBrick(tx, {
        ownerId: user.id,
        formationId: created.formationId,
        type: 'choice_question',
        purpose: 'bank',
        notionIds: [notionId],
        payload: CHOICE_PAYLOAD,
      });
    }
    await createNotionState(tx, {
      userId: user.id,
      notionId,
      gapNature: options.nature,
      confusedWith: options.nature === 'confusion' ? confusedWithId : null,
      mastery: 40,
      dueAt: new Date('2026-11-11T08:00:00Z'),
    });
    await tx.execute(sql`
      update public.notion_states
      set gap_detected_at = ${DETECTED_AT}::timestamptz
      where user_id = ${user.id}::uuid and notion_id = ${notionId}::uuid
    `);
    const labels = await tx.execute<{ id: string; label: string }>(sql`
      select id::text as id, label from public.notions where module_id = ${moduleId}::uuid
    `);
    return {
      formationId: created.formationId,
      moduleId,
      notionIds: created.notionIds,
      notionId,
      notionLabel: labels.find((row) => row.id === notionId)?.label ?? 'cette notion',
      confusedWithId,
    };
  });
  if (options.pause !== true) {
    await setParams(user, { preference: 'vary' }, options.enabled ?? true);
  }
  if (options.pause === true) await addPause(user);
  return {
    user,
    formationId: programme.formationId,
    moduleId: programme.moduleId,
    notionIds: programme.notionIds,
    notionLabel: programme.notionLabel,
    clock,
    confusedWithId: programme.confusedWithId,
  };
}

async function detect(fx: Fixture, nature: string, name = 'gap/detected') {
  return runAutomation(engine(fx.clock), {
    key: 'jeu_lacune',
    userId: fx.user.id,
    trigger: {
      type: 'event',
      name,
      data: {
        userId: fx.user.id,
        formationId: fx.formationId,
        notionId: fx.notionIds[0] ?? '',
        nature,
        ...(name === 'gap/nature-changed' ? { previousNature: 'forgetting' } : {}),
      },
    },
  });
}

async function actions(fx: Fixture) {
  return serviceDb().execute<{
    id: string;
    status: string;
    kind: string;
    summary: string;
    payload: Record<string, unknown>;
  }>(sql`
    select id::text as id, status::text as status, kind, summary, payload
    from public.automation_actions
    where user_id = ${fx.user.id}::uuid and automation = 'jeu_lacune'
    order by created_at asc, id asc
  `);
}

async function unwrap<T>(value: Promise<Result<T>>): Promise<T> {
  const result = await value;
  if (!result.ok) throw result.error;
  return result.value;
}

beforeAll(() => {
  if (jeuLacuneAutomation.key !== 'jeu_lacune') throw new Error('définition absente');
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

describe('[SPEC-716] jeu choisi selon la lacune', () => {
  it('CA-1 — un oubli crée game_chosen et la session présente la carte avec la raison', async () => {
    const fx = await fixture('oubli', { nature: 'forgetting' });
    const result = await detect(fx, 'forgetting');
    expect(result.ok).toBe(true);
    const rows = await actions(fx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'game_chosen', status: 'applied' });
    expect(rows[0]?.payload).toMatchObject({
      format: 'recall_card',
      nature: 'forgetting',
      notionId: fx.notionIds[0],
    });
    expect(rows[0]?.summary).toBe(
      `Lacune « ${fx.notionLabel} » : carte de rappel ajoutée au quiz global.`,
    );

    const session = await unwrap(
      getOrCreateTodaySession(context(fx.user, fx.clock), fx.formationId, 'full'),
    );
    const item = session.items.find((entry) => entry.notionIds.includes(fx.notionIds[0] ?? ''));
    expect(item).toBeDefined();
    expect(item?.type).toBe('recall_card');
    expect(item?.reason).toEqual({
      code: 'gap_forgetting',
      label: 'Choisi pour votre oubli',
    });
    expect(session.tuned[0]?.text).toContain('revient en carte de rappel');
  });

  it('CA-2, CL-7 — confusion : deux confrontations successives alternent', async () => {
    const fx = await fixture('confusion', { nature: 'confusion', withPairBricks: true });
    await detect(fx, 'confusion');
    let rows = await actions(fx);
    expect(rows[0]?.payload.format).toBe('categorization');
    expect(rows[0]?.payload.confusedWithId).toBe(fx.confusedWithId);
    expect(rows[0]?.summary).toContain('classement');

    // A new detection (later instant) expires the previous unconsumed action (CL-7).
    await serviceDb().execute(sql`
      update public.notion_states
      set gap_detected_at = '2026-11-07T08:00:00Z'::timestamptz
      where user_id = ${fx.user.id}::uuid and notion_id = ${fx.notionIds[0] ?? ''}::uuid
    `);
    await detect(fx, 'confusion', 'gap/nature-changed');
    rows = await actions(fx);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.status).sort()).toEqual(['applied', 'expired']);
    const next = rows.find((row) => row.status === 'applied');
    expect(next?.payload.format).toBe('matching');
    expect(next?.summary).toContain('association');
  });

  it('CL-9 — sans brique de confrontation, repli sur choice_question et génération demandée', async () => {
    const fx = await fixture('repli', {
      nature: 'confusion',
      withPairBricks: false,
      withChoice: true,
    });
    await detect(fx, 'confusion');
    const rows = await actions(fx);
    expect(rows[0]?.payload).toMatchObject({
      format: 'choice_question',
      pendingGeneration: true,
      confusedWithId: fx.confusedWithId,
    });
    const jobs = await serviceDb().execute<{ format: string }>(sql`
      select format::text as format from public.question_bank_jobs
      where user_id = ${fx.user.id}::uuid
    `);
    expect(jobs.length).toBeGreaterThan(0);
  });

  it('CA-3 — une difficulté d’application planifie un exercice dès le lendemain', async () => {
    const fx = await fixture('application', { nature: 'application' });
    await detect(fx, 'application');
    const rows = await actions(fx);
    expect(rows[0]).toMatchObject({ kind: 'exercise_scheduled', status: 'applied' });
    expect(rows[0]?.payload.exerciseActivityId).toEqual(expect.any(String));
    expect(rows[0]?.payload.slotId).toEqual(expect.any(String));
    expect(rows[0]?.summary).toMatch(
      new RegExp(
        `^Lacune « ${fx.notionLabel} » : exercice pratique placé (jeudi|vendredi) \\d{1,2}:\\d{2}\\.$`,
      ),
    );
    const slots = await serviceDb().execute<{
      kind: string;
      status: string;
      title: string;
      meta: string | null;
      starts_at: string;
    }>(sql`
      select kind::text as kind, status::text as status, title, meta, starts_at::text as starts_at
      from public.schedule_slots
      where user_id = ${fx.user.id}::uuid
    `);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      kind: 'exercise',
      status: 'planned',
      title: 'Exercice pratique',
    });
    expect(slots[0]?.meta).toContain('ajouté par le tuteur');
    expect(new Date(slots[0]?.starts_at ?? 0).toISOString() >= '2026-11-12T00:00:00.000Z').toBe(
      true,
    );
  });

  it('CA-5 — une réponse jouée consomme l’action et refuse l’annulation', async () => {
    const fx = await fixture('consommation', { nature: 'forgetting' });
    await detect(fx, 'forgetting');
    const ctx = context(fx.user, fx.clock);
    const session = await unwrap(getOrCreateTodaySession(ctx, fx.formationId, 'full'));
    const item = session.items.find((entry) => entry.notionIds.includes(fx.notionIds[0] ?? ''));
    expect(item).toBeDefined();
    if (item === undefined) return;
    await unwrap(
      answerReviewItem(ctx, session.sessionId ?? '', {
        position: item.position,
        clientAnswerId: randomUUID(),
        timeMs: 1_000,
        response: { selfRating: 'good' },
      }),
    );
    const rows = await actions(fx);
    expect(rows[0]?.status).toBe('consumed');
    const undone = await undoAutomationAction(ctx, { actionId: rows[0]?.id ?? '' });
    expect(undone.ok).toBe(false);
    if (!undone.ok) expect(undone.error.code).toBe('AUTOMATION_ACTION_CONSUMED');
  });

  it('CA-5, EF-10 — gap/cleared expire et undo avant consommation retire le format', async () => {
    const cleared = await fixture('levee', { nature: 'forgetting' });
    await detect(cleared, 'forgetting');
    const clearedResult = await runAutomation(engine(cleared.clock), {
      key: 'jeu_lacune',
      userId: cleared.user.id,
      trigger: {
        type: 'event',
        name: 'gap/cleared',
        data: {
          userId: cleared.user.id,
          formationId: cleared.formationId,
          notionId: cleared.notionIds[0] ?? '',
        },
      },
    });
    expect(clearedResult.ok).toBe(true);
    const expired = await actions(cleared);
    expect(expired[0]?.status).toBe('expired');
    expect(expired[0]?.summary).toBe(
      `Lacune « ${cleared.notionLabel} » levée avant l’entraînement.`,
    );

    const undone = await fixture('annule', { nature: 'forgetting' });
    await detect(undone, 'forgetting');
    const current = await actions(undone);
    const result = await undoAutomationAction(context(undone.user, undone.clock), {
      actionId: current[0]?.id ?? '',
    });
    expect(result.ok).toBe(true);
    const after = await actions(undone);
    expect(after[0]?.status).toBe('undone');
    const session = await unwrap(
      getOrCreateTodaySession(context(undone.user, undone.clock), undone.formationId, 'full'),
    );
    expect(session.tuned.some((line) => line.text.includes(undone.notionLabel))).toBe(false);
  });

  it('CA-6 — automatisme désactivé, double déclenchement et pause globale', async () => {
    const disabled = await fixture('desactive', { nature: 'forgetting', enabled: false });
    const disabledResult = await detect(disabled, 'forgetting');
    expect(disabledResult.ok).toBe(true);
    if (disabledResult.ok) expect(disabledResult.value.skipped).toBe('disabled');
    expect(await actions(disabled)).toHaveLength(0);

    const doubled = await fixture('double', { nature: 'forgetting' });
    await detect(doubled, 'forgetting');
    const replay = await detect(doubled, 'forgetting');
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.created).toBe(0);
    expect(await actions(doubled)).toHaveLength(1);

    const paused = await fixture('pause', { nature: 'forgetting', pause: true });
    const pausedResult = await detect(paused, 'forgetting');
    expect(pausedResult.ok).toBe(true);
    if (pausedResult.ok) expect(pausedResult.value.skipped).toBe('paused');
    expect(await actions(paused)).toHaveLength(0);
  });

  it('CL-8 — incompréhension : aucune action', async () => {
    const fx = await fixture('malentendu', { nature: 'misunderstanding' });
    const result = await detect(fx, 'misunderstanding');
    expect(result.ok).toBe(true);
    expect(await actions(fx)).toHaveLength(0);
  });
});
