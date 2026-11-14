// Integration tests of the agenda move and BR-FOR-14 replanning (SPEC-705 §12; BR-AGE-05,
// BR-FOR-14; CA-1 to CA-3). Postgres is real: RLS hides the slots of another learner, the version
// guards a stale write, the replayed request is absorbed by its automation action and the event is
// written only after the commit. The demonstration seed of SPEC-115 is restored at the end.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { demoFormationId, demoModuleId, demoUserId, seedDemo } from '@learny/db/seed';
import { createTestUser } from '@learny/db/testing';

import { getAgenda } from '../../src/agenda';
import {
  applyReplan,
  getReplanOptions,
  getSlotAlternatives,
  moveSlot,
} from '../../src/agenda-deplacer-et-reajuster-le-planning';
import { createServiceContext, type ServiceContext } from '../../src/context';

const ALEX = demoUserId('alex');
const SAP = demoFormationId('sap');
const MODULE_3 = demoModuleId('sap', 3);
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

function context(userId: string): ServiceContext {
  return createServiceContext({
    userId,
    requestId: 'spec-705-integration',
    clock: new TestClock(),
  });
}

let stranger: { userId: string } | null = null;
let movedSlotId: string | null = null;
let originalSlotId: string | null = null;
let moveVersion: string | null = null;
let moveStartsAt: string | null = null;
let moveEndsAt: string | null = null;

async function quizSlotId(): Promise<string> {
  const result = await getAgenda(context(ALEX), {
    from: '2026-11-11',
    to: '2026-11-13',
    formation: SAP,
  });
  if (!result.ok) throw new Error('agenda illisible');
  const quiz = result.value.slots.find(
    (slot) => slot.title === 'Quiz de validation' && slot.date === '2026-11-11',
  );
  if (quiz === undefined) throw new Error('quiz de validation du 11 novembre absent');
  return quiz.id;
}

beforeAll(async () => {
  await seedDemo();
  const created = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx);
    // EF-2 — the module 3 of the seed is late enough for BR-FOR-14 during this file only.
    await tx.execute(sql`
      update public.modules
      set planned_start = '2026-11-02', planned_end = '2026-11-06'
      where id = ${MODULE_3}::uuid
    `);
    return user;
  });
  stranger = { userId: created.id };
});

afterAll(async () => {
  await serviceDb().transaction(async (tx) => {
    await tx.execute(sql`
      delete from public.automation_actions
      where user_id = ${ALEX}::uuid
        and payload ->> 'dedupeKey' like any (array['slot-move:%', 'replan:%'])
    `);
    await tx.execute(sql`
      delete from public.event_outbox
      where user_id = ${ALEX}::uuid
        and (event_id like 'agenda-%' or event_id like 'plan-replanned:%')
    `);
    if (movedSlotId !== null) {
      await tx.execute(sql`delete from public.schedule_slots where id = ${movedSlotId}::uuid`);
    }
    if (originalSlotId !== null) {
      await tx.execute(sql`
        update public.schedule_slots
        set status = 'planned'
        where id = ${originalSlotId}::uuid
      `);
    }
    await tx.execute(sql`
      delete from public.schedule_slots
      where user_id = ${ALEX}::uuid
        and formation_id = ${SAP}::uuid
        and planner_key is not null
    `);
    await tx.execute(sql`
      update public.formations set end_date = '2026-12-11' where id = ${SAP}::uuid
    `);
    await tx.execute(sql`
      update public.modules set planned_start = '2026-11-09', planned_end = '2026-11-13' where id = ${MODULE_3}::uuid
    `);
    await tx.execute(sql`
      update public.study_preferences set hours_per_day = 5 where user_id = ${ALEX}::uuid
    `);
  });
  await closeDb();
});

describe('[SPEC-705] service et API', () => {
  it('CA-1 — trois alternatives triées, le deuxième créneau déplace une seule activité', async () => {
    originalSlotId = await quizSlotId();
    const alternatives = await getSlotAlternatives(context(ALEX), originalSlotId);
    expect(alternatives.ok).toBe(true);
    if (!alternatives.ok) return;
    expect(alternatives.value.alternatives).toHaveLength(3);
    const starts = alternatives.value.alternatives.map((alternative) => alternative.startsAt);
    expect([...starts].sort()).toEqual(starts);
    expect(alternatives.value.version).toMatch(/^slot-/);
    expect(alternatives.value.timezone).toBe('Europe/Paris');

    const chosen = alternatives.value.alternatives[1];
    if (chosen === undefined) throw new Error('deuxième alternative absente');
    moveVersion = alternatives.value.version;
    moveStartsAt = chosen.startsAt;
    moveEndsAt = chosen.endsAt;
    const result = await moveSlot(context(ALEX), originalSlotId, {
      expectedVersion: moveVersion,
      startsAt: moveStartsAt,
      endsAt: moveEndsAt,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    movedSlotId = result.value.movedSlot.id;
    expect(result.value.replacedSlotId).toBe(originalSlotId);
    expect(result.value.movedSlot.startsAt).toBe(chosen.startsAt);
    expect(result.value.agenda.slots.some((slot) => slot.id === originalSlotId)).toBe(false);

    const rows = await serviceDb().execute<{
      id: string;
      status: string;
      moved_from_id: string | null;
      title: string;
    }>(sql`
      select id::text as id, status::text as status, moved_from_id::text as moved_from_id, title
      from public.schedule_slots
      where id = ${originalSlotId}::uuid or moved_from_id = ${originalSlotId}::uuid
      order by created_at asc
    `);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === originalSlotId)?.status).toBe('moved');
    const moved = rows.find((row) => row.id === movedSlotId);
    expect(moved).toMatchObject({
      status: 'planned',
      moved_from_id: originalSlotId,
      title: 'Quiz de validation',
    });

    const outbox = await serviceDb().execute<{
      event_id: string;
      data: { newSlotId: string; slotId: string };
    }>(sql`
      select event_id, data from public.event_outbox
      where user_id = ${ALEX}::uuid and name = 'agenda/slot-moved'
    `);
    const moveEvent = outbox.find(
      (event) => event.event_id === `agenda-move:${String(originalSlotId)}`,
    );
    expect(moveEvent?.data).toMatchObject({ slotId: originalSlotId, newSlotId: movedSlotId });
  });

  it('CA-3 — un rejeu ne duplique ni créneau ni événement, une version obsolète renvoie 409', async () => {
    if (originalSlotId === null || movedSlotId === null)
      throw new Error('déplacement initial absent');
    const alternatives = await getSlotAlternatives(context(ALEX), originalSlotId);
    expect(alternatives).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    const count = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.schedule_slots
      where moved_from_id = ${originalSlotId}::uuid
    `);
    const events = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where user_id = ${ALEX}::uuid and event_id like 'agenda-move:%'
    `);
    expect(moveVersion).not.toBe(null);
    expect(moveStartsAt).not.toBe(null);
    expect(moveEndsAt).not.toBe(null);
    const replay = await moveSlot(context(ALEX), originalSlotId, {
      expectedVersion: moveVersion ?? '',
      startsAt: moveStartsAt ?? '',
      endsAt: moveEndsAt ?? '',
    });
    // CA-3 — the identical request returns the first answer without a second row or event.
    expect(replay).toMatchObject({ ok: true, value: { movedSlot: { id: movedSlotId } } });
    const after = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.schedule_slots
      where moved_from_id = ${originalSlotId}::uuid
    `);
    expect(after[0]?.count).toBe(count[0]?.count);
    const afterEvents = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where user_id = ${ALEX}::uuid and event_id like 'agenda-move:%'
    `);
    expect(afterEvents[0]?.count).toBe(events[0]?.count);

    const stale = await moveSlot(context(ALEX), originalSlotId, {
      expectedVersion: 'slot-0000000000000000',
      startsAt: '2026-11-13T09:00:00.000Z',
      endsAt: '2026-11-13T10:00:00.000Z',
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('CA-3 — un autre utilisateur reçoit 404 et un identifiant invalide ne crée rien', async () => {
    if (stranger === null) throw new Error('étranger absent');
    const foreign = await getSlotAlternatives(context(stranger.userId), originalSlotId ?? '');
    expect(foreign).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    const foreignOptions = await getReplanOptions(context(stranger.userId), SAP);
    expect(foreignOptions).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    const invalidSlot = await getSlotAlternatives(context(ALEX), 'pas-un-uuid');
    expect(invalidSlot).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    const invalidMove = await moveSlot(context(ALEX), 'pas-un-uuid', {
      expectedVersion: 'slot-1',
      startsAt: '2026-11-13T09:00:00.000Z',
      endsAt: '2026-11-13T10:00:00.000Z',
    });
    expect(invalidMove).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    const invalidPlan = await getReplanOptions(context(ALEX), 'pas-un-uuid');
    expect(invalidPlan).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    const invalidApply = await applyReplan(context(ALEX), 'pas-un-uuid', {
      choice: 'shift_end',
      expectedPlanVersion: 'plan-1',
    });
    expect(invalidApply).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('CA-2 — les trois options n’altèrent rien avant confirmation, une version obsolète est refusée', async () => {
    const before = await serviceDb().execute<{ end_date: string | null; slots: number }>(sql`
      select f.end_date::text as end_date,
             (select count(*)::int from public.schedule_slots ss
              where ss.user_id = ${ALEX}::uuid and ss.formation_id = f.id) as slots
      from public.formations f
      where f.id = ${SAP}::uuid
    `);
    const options = await getReplanOptions(context(ALEX), SAP);
    expect(options.ok).toBe(true);
    if (!options.ok) return;
    expect(options.value.blocked).toMatchObject({ moduleId: MODULE_3 });
    expect(options.value.options).toHaveLength(3);
    expect(options.value.options.map((option) => option.kind)).toEqual([
      'shift_end',
      'increase_volume',
      'lighten',
    ]);
    const again = await getReplanOptions(context(ALEX), SAP);
    expect(again).toMatchObject({ ok: true, value: { planVersion: options.value.planVersion } });
    const after = await serviceDb().execute<{ end_date: string | null; slots: number }>(sql`
      select f.end_date::text as end_date,
             (select count(*)::int from public.schedule_slots ss
              where ss.user_id = ${ALEX}::uuid and ss.formation_id = f.id) as slots
      from public.formations f
      where f.id = ${SAP}::uuid
    `);
    expect(after[0]).toEqual(before[0]);

    const stale = await applyReplan(context(ALEX), SAP, {
      choice: 'shift_end',
      expectedPlanVersion: 'plan-0000000000000000',
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const unchanged = await serviceDb().execute<{ end_date: string | null }>(sql`
      select end_date::text as end_date from public.formations where id = ${SAP}::uuid
    `);
    expect(unchanged[0]?.end_date).toBe(before[0]?.end_date);
  });

  it('CA-2 — une option confirmée replanifie sans perdre les activités réalisées', async () => {
    const options = await getReplanOptions(context(ALEX), SAP);
    expect(options.ok).toBe(true);
    if (!options.ok) return;
    const chosen = options.value.options.find(
      (option) => option.kind === 'shift_end' && option.feasible,
    );
    expect(chosen).toBeDefined();
    const doneBefore = await serviceDb().execute<{ id: string }>(sql`
      select id::text as id from public.schedule_slots
      where user_id = ${ALEX}::uuid and formation_id = ${SAP}::uuid and status = 'done'
      order by id
    `);
    const applied = await applyReplan(context(ALEX), SAP, {
      choice: 'shift_end',
      expectedPlanVersion: options.value.planVersion,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.outcome).toBe('applied');
    expect(applied.value.endDate).not.toBe(null);
    const doneAfter = await serviceDb().execute<{ id: string }>(sql`
      select id::text as id from public.schedule_slots
      where user_id = ${ALEX}::uuid and formation_id = ${SAP}::uuid and status = 'done'
      order by id
    `);
    expect(doneAfter.map((row) => row.id)).toEqual(doneBefore.map((row) => row.id));
    const eventsBefore = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where user_id = ${ALEX}::uuid and name = 'plan/replanned'
    `);
    const replay = await applyReplan(context(ALEX), SAP, {
      choice: 'shift_end',
      expectedPlanVersion: options.value.planVersion,
    });
    expect(replay).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    const eventsAfter = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where user_id = ${ALEX}::uuid and name = 'plan/replanned'
    `);
    expect(eventsAfter[0]?.count).toBe(eventsBefore[0]?.count);
  });

  it('BR-AUT-11 — « alléger » crée une action en attente sans changer le planning', async () => {
    const options = await getReplanOptions(context(ALEX), SAP);
    expect(options.ok).toBe(true);
    if (!options.ok) return;
    const before = await serviceDb().execute<{ end_date: string | null; slots: number }>(sql`
      select f.end_date::text as end_date,
             (select count(*)::int from public.schedule_slots ss
              where ss.user_id = ${ALEX}::uuid and ss.formation_id = f.id) as slots
      from public.formations f
      where f.id = ${SAP}::uuid
    `);
    const applied = await applyReplan(context(ALEX), SAP, {
      choice: 'lighten',
      expectedPlanVersion: options.value.planVersion,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.outcome).toBe('consent_required');
    expect(applied.value.consentActionId).not.toBe(null);
    const action = await serviceDb().execute<{ status: string; requires_consent: boolean }>(sql`
      select status::text as status, requires_consent
      from public.automation_actions
      where id = ${applied.value.consentActionId}::uuid
    `);
    expect(action[0]).toEqual({ status: 'pending_consent', requires_consent: true });
    const after = await serviceDb().execute<{ end_date: string | null; slots: number }>(sql`
      select f.end_date::text as end_date,
             (select count(*)::int from public.schedule_slots ss
              where ss.user_id = ${ALEX}::uuid and ss.formation_id = f.id) as slots
      from public.formations f
      where f.id = ${SAP}::uuid
    `);
    expect(after[0]).toEqual(before[0]);
  });
});
