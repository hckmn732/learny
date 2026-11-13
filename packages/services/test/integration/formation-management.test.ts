process.env.APP_ENV = 'test';
process.env.JOBS_MODE = 'inline';

import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { startOfUserDay, type Clock } from '@learny/core';
import { closeDb, serviceDb, sql, type DbTx } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';

import { createServiceContext } from '../../src/context';
import {
  archiveFormation,
  pauseFormation,
  resumeFormation,
  switchCurrentFormation,
} from '../../src/formations';
import { getSidebar } from '../../src/sidebar';

const PREFIX = 'sdd-618-';
const NOW = new Date('2026-11-11T12:20:00Z');
const NOW_ISO = NOW.toISOString();

class TestClock implements Clock {
  now(): Date {
    return new Date(NOW);
  }
}

interface Learner {
  userId: string;
  email: string;
  ctx: ReturnType<typeof createServiceContext>;
}

interface SeededFormation {
  formationId: string;
  moduleId: string;
}

async function learner(label: string): Promise<Learner> {
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, {
      email: `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`,
    });
    return {
      userId: user.id,
      email: user.email,
      ctx: createServiceContext({
        userId: user.id,
        email: user.email,
        requestId: randomUUID(),
        clock: new TestClock(),
      }),
    };
  });
}

async function formation(
  userId: string,
  title: string,
  options: { status?: 'active' | 'paused' | 'cadrage'; lastOpenedAt?: string | null } = {},
): Promise<SeededFormation> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 2,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
      title,
    });
    const moduleId = programme.moduleIds[0];
    if (moduleId === undefined) throw new Error('module absent');
    await tx.execute(sql`
      update public.formations
      set status = ${options.status ?? 'active'}::public.formation_status,
          last_opened_at = ${
            options.lastOpenedAt === null || options.lastOpenedAt === undefined
              ? null
              : options.lastOpenedAt
          }::timestamptz,
          start_date = '2026-11-01'::date,
          end_date = '2026-12-20'::date,
          volume_hours = 20
      where id = ${programme.formationId}::uuid
    `);
    await tx.execute(sql`
      update public.modules
      set status = 'open', opened_at = ${NOW_ISO}::timestamptz
      where id = ${moduleId}::uuid
    `);
    return { formationId: programme.formationId, moduleId };
  });
}

async function insertSlot(
  userId: string,
  seeded: SeededFormation,
  input: {
    id?: string;
    startsAt: string;
    endsAt: string;
    status: 'planned' | 'done' | 'missed';
    title?: string;
  },
): Promise<string> {
  const id = input.id ?? randomUUID();
  await serviceDb().execute(sql`
    insert into public.schedule_slots (
      id, user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by
    )
    values (
      ${id}::uuid,
      ${userId}::uuid,
      ${seeded.formationId}::uuid,
      ${seeded.moduleId}::uuid,
      'course',
      ${input.title ?? 'Cours — reprise'},
      ${input.startsAt}::timestamptz,
      ${input.endsAt}::timestamptz,
      ${input.status}::public.slot_status,
      'planner'
    )
  `);
  return id;
}

async function insertAttempt(userId: string, seeded: SeededFormation): Promise<string> {
  return serviceDb().transaction(async (tx: DbTx) => {
    const [activity] = await tx.execute<{ id: string }>(sql`
      insert into public.activities (owner_id, formation_id, module_id, kind, items)
      values (
        ${userId}::uuid,
        ${seeded.formationId}::uuid,
        ${seeded.moduleId}::uuid,
        'validation_quiz',
        '[]'::jsonb
      )
      returning id::text as id
    `);
    if (activity === undefined) throw new Error('activité non créée');
    const [attempt] = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (user_id, activity_id, attempt_no, status, score, passed)
      values (
        ${userId}::uuid,
        ${activity.id}::uuid,
        1,
        'graded',
        72,
        false
      )
      returning id::text as id
    `);
    if (attempt === undefined) throw new Error('tentative non créée');
    return attempt.id;
  });
}

async function activeCount(userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.formations
    where owner_id = ${userId}::uuid and status = 'active'
  `);
  return rows[0]?.count ?? 0;
}

async function setCurrent(userId: string, formationId: string | null): Promise<void> {
  await serviceDb().execute(sql`
    update public.profiles set current_formation_id = ${formationId}::uuid
    where id = ${userId}::uuid
  `);
}

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-618] gestion des formations', () => {
  it('CA-1 — la formation choisie reste courante après une reconnexion', async () => {
    const fx = await learner('switch');
    const first = await formation(fx.userId, 'SAP S/4HANA Finance', {
      lastOpenedAt: '2026-11-10T10:00:00Z',
    });
    const second = await formation(fx.userId, 'Gestion de projet agile', {
      lastOpenedAt: '2026-11-09T10:00:00Z',
    });

    const switched = await switchCurrentFormation(fx.ctx, { formationId: second.formationId });
    expect(switched.ok).toBe(true);
    if (!switched.ok) throw switched.error;
    expect(switched.value.currentFormationId).toBe(second.formationId);
    expect(switched.value.activeCount).toBe(2);

    const reconnected = createServiceContext({
      userId: fx.userId,
      email: fx.email,
      requestId: randomUUID(),
      clock: new TestClock(),
    });
    const sidebar = await getSidebar(reconnected);
    if (!sidebar.ok) throw sidebar.error;
    expect(sidebar.value.currentFormation?.id).toBe(second.formationId);
    expect(new Set(sidebar.value.formations.map((item) => item.id))).toEqual(
      new Set([second.formationId, first.formationId]),
    );

    // Une formation en pause ne peut pas devenir courante (BR-FOR-11).
    await serviceDb().execute(sql`
      update public.formations set status = 'paused' where id = ${first.formationId}::uuid
    `);
    const refused = await switchCurrentFormation(fx.ctx, { formationId: first.formationId });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe('CONFLICT');
  });

  it('CA-2 — la pause gèle les créneaux futurs et la reprise replanifie sans toucher aux tentatives', async () => {
    const fx = await learner('pause');
    const seeded = await formation(fx.userId, 'Python pour l’analyse de données');
    const futureId = await insertSlot(fx.userId, seeded, {
      startsAt: '2026-11-12T18:30:00+01:00',
      endsAt: '2026-11-12T19:30:00+01:00',
      status: 'planned',
    });
    const pastId = await insertSlot(fx.userId, seeded, {
      startsAt: '2026-11-10T18:30:00+01:00',
      endsAt: '2026-11-10T19:30:00+01:00',
      status: 'done',
    });
    const attemptId = await insertAttempt(fx.userId, seeded);

    const paused = await pauseFormation(fx.ctx, seeded.formationId, {});
    expect(paused.ok).toBe(true);
    if (!paused.ok) throw paused.error;
    expect(paused.value.outcome).toBe('applied');
    expect(paused.value.state.currentFormationId).toBeNull();

    const afterPause = await serviceDb().execute<{ id: string; status: string }>(sql`
      select id::text as id, status::text as status from public.schedule_slots
      where id = ${futureId}::uuid or id = ${pastId}::uuid
      order by starts_at
    `);
    expect(afterPause.find((row) => row.id === futureId)?.status).toBe('cancelled');
    expect(afterPause.find((row) => row.id === pastId)?.status).toBe('done');

    // Une seconde pause est un no-op : un seul événement formation/paused.
    const duplicate = await pauseFormation(fx.ctx, seeded.formationId, {});
    expect(duplicate.ok).toBe(true);
    if (duplicate.ok) expect(duplicate.value.outcome).toBe('unchanged');
    const pausedEvents = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where name = 'formation/paused'
        and data ->> 'formationId' = ${seeded.formationId}
    `);
    expect(pausedEvents[0]?.count).toBe(1);

    const resumed = await resumeFormation(fx.ctx, seeded.formationId, {});
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) throw resumed.error;
    expect(resumed.value.outcome).toBe('applied');
    expect(resumed.value.state.currentFormationId).toBe(seeded.formationId);

    const fromResumeDay = startOfUserDay('2026-11-11', 'Europe/Paris');
    const replanned = await serviceDb().execute<{ starts_at: Date | string; status: string }>(sql`
      select starts_at, status::text as status from public.schedule_slots
      where user_id = ${fx.userId}::uuid
        and formation_id = ${seeded.formationId}::uuid
        and status = 'planned'
    `);
    expect(replanned.length).toBeGreaterThan(0);
    for (const slot of replanned) {
      expect(new Date(slot.starts_at).getTime()).toBeGreaterThanOrEqual(fromResumeDay.getTime());
    }
    const keptAttempt = await serviceDb().execute<{ score: string; status: string }>(sql`
      select score::text as score, status::text as status from public.attempts
      where id = ${attemptId}::uuid
    `);
    expect(keptAttempt[0]).toMatchObject({ status: 'graded', score: '72.00' });
  });

  it('CA-3/CL-3 — deux reprises concurrentes ne dépassent jamais trois actives', async () => {
    const fx = await learner('limit');
    const a = await formation(fx.userId, 'SAP S/4HANA Finance', {
      lastOpenedAt: '2026-11-11T08:00:00Z',
    });
    const b = await formation(fx.userId, 'Gestion de projet agile', {
      lastOpenedAt: '2026-11-10T08:00:00Z',
    });
    const c = await formation(fx.userId, 'Python pour l’analyse de données', { status: 'paused' });
    const d = await formation(fx.userId, 'Excel pour l’analyse financière', { status: 'paused' });
    await setCurrent(fx.userId, a.formationId);
    await insertSlot(fx.userId, c, {
      startsAt: '2026-11-12T18:30:00+01:00',
      endsAt: '2026-11-12T19:30:00+01:00',
      status: 'planned',
    });

    const [left, right] = await Promise.all([
      resumeFormation(fx.ctx, c.formationId, {}),
      resumeFormation(fx.ctx, d.formationId, {}),
    ]);
    if (!left.ok) throw left.error;
    if (!right.ok) throw right.error;
    const outcomes = [left.value.outcome, right.value.outcome].sort();
    expect(outcomes).toEqual(['applied', 'limit']);
    expect(await activeCount(fx.userId)).toBe(3);
    expect(left.value.state.activeCount).toBeLessThanOrEqual(3);
    expect(right.value.state.activeCount).toBeLessThanOrEqual(3);

    const limited = left.value.outcome === 'limit' ? c : d;
    const chosen = await resumeFormation(fx.ctx, limited.formationId, {
      pauseFormationId: b.formationId,
    });
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) throw chosen.error;
    expect(chosen.value.outcome).toBe('applied');
    expect(chosen.value.pausedFormationId).toBe(b.formationId);
    expect(await activeCount(fx.userId)).toBe(3);
    const bRow = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.formations where id = ${b.formationId}::uuid
    `);
    expect(bRow[0]?.status).toBe('paused');
  });

  it('CL-5 — archiver la formation courante choisit la dernière active consultée', async () => {
    const fx = await learner('archive');
    const current = await formation(fx.userId, 'SAP S/4HANA Finance', {
      lastOpenedAt: '2026-11-11T09:00:00Z',
    });
    const fallback = await formation(fx.userId, 'Gestion de projet agile', {
      lastOpenedAt: '2026-11-10T09:00:00Z',
    });
    await setCurrent(fx.userId, current.formationId);
    await insertSlot(fx.userId, current, {
      startsAt: '2026-11-12T18:30:00+01:00',
      endsAt: '2026-11-12T19:30:00+01:00',
      status: 'planned',
    });

    const archived = await archiveFormation(fx.ctx, current.formationId, {});
    expect(archived.ok).toBe(true);
    if (!archived.ok) throw archived.error;
    expect(archived.value.outcome).toBe('applied');
    expect(archived.value.state.currentFormationId).toBe(fallback.formationId);
    const row = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.formations where id = ${current.formationId}::uuid
    `);
    expect(row[0]?.status).toBe('archived');
    const slots = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.schedule_slots
      where formation_id = ${current.formationId}::uuid
        and status = 'planned'
        and starts_at >= ${NOW_ISO}::timestamptz
    `);
    expect(slots[0]?.count).toBe(0);
  });

  it('CA-4 — un autre utilisateur reçoit 404 et les demandes invalides ne créent rien', async () => {
    const owner = await learner('owner');
    const intruder = await learner('intruder');
    const seeded = await formation(owner.userId, 'SAP S/4HANA Finance');

    const current = await switchCurrentFormation(intruder.ctx, {
      formationId: seeded.formationId,
    });
    const paused = await pauseFormation(intruder.ctx, seeded.formationId, {});
    const archived = await archiveFormation(intruder.ctx, seeded.formationId, {});
    for (const result of [current, paused, archived]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    }

    const unknown = await switchCurrentFormation(owner.ctx, { formationId: randomUUID() });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('NOT_FOUND');
    const untouched = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.formations where id = ${seeded.formationId}::uuid
    `);
    expect(untouched[0]?.status).toBe('active');
  });

  it('CL-1/CL-2 — les statuts invalides sont refusés et une version obsolète renvoie 409', async () => {
    const fx = await learner('invalid');
    const cadrage = await formation(fx.userId, 'Formation en cadrage', { status: 'cadrage' });
    const refusedPause = await pauseFormation(fx.ctx, cadrage.formationId, {});
    expect(refusedPause.ok).toBe(false);
    if (!refusedPause.ok) expect(refusedPause.error.code).toBe('CONFLICT');
    const refusedResume = await resumeFormation(fx.ctx, cadrage.formationId, {});
    expect(refusedResume.ok).toBe(false);
    if (!refusedResume.ok) expect(refusedResume.error.code).toBe('CONFLICT');

    const seeded = await formation(fx.userId, 'SAP S/4HANA Finance');
    const stale = await pauseFormation(fx.ctx, seeded.formationId, {
      expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error.code).toBe('CONFLICT');
    const stillActive = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.formations where id = ${seeded.formationId}::uuid
    `);
    expect(stillActive[0]?.status).toBe('active');

    const noopResume = await resumeFormation(fx.ctx, seeded.formationId, {});
    expect(noopResume.ok).toBe(true);
    if (noopResume.ok) expect(noopResume.value.outcome).toBe('unchanged');
  });
});
