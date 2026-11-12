// Integration tests of the planning schema (SPEC-108 §12): introspection, SQL constraints, slot
// moves and their concurrency, daily upsert idempotence, milestone uniqueness, range/pagination
// reads, RLS isolation with two real JWTs and cascade behaviour. Every test runs against the local
// Supabase database (testing.md §3); isolation uses `userDb(ctx)` (ET-3), never the service role.
// The clock is fixed at 2026-11-11T12:20:00Z (ADR-0047).
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { AppError } from '@learny/core';

import { closeDb, serviceDb, userDb, type DbTx } from '../../src/client';
import {
  consumeAutomationAction,
  countAutomationActions,
  createAutomationAction,
  decideAutomationAction,
  getAutomationAction,
  listAutomationActions,
  listAutomationActionsAscending,
  undoAutomationAction,
} from '../../src/repositories/automation-actions';
import {
  getDailyActivity,
  listDailyActivity,
  upsertDailyActivity,
} from '../../src/repositories/daily-activity';
import { getMilestone, listMilestones, recordMilestone } from '../../src/repositories/milestones';
import {
  createScheduleSlot,
  getScheduleSlot,
  listScheduleSlotWindows,
  listScheduleSlots,
  moveScheduleSlot,
  setScheduleSlotStatus,
} from '../../src/repositories/schedule-slots';
import { createTestProgramme, createTestUser, withRollback } from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const FIXED = new Date('2026-11-11T12:20:00Z');
const DAY = '2026-11-11';
const NEXT_DAY = '2026-11-12';
const SLOT_START = new Date('2026-11-11T17:00:00Z');
const SLOT_END = new Date('2026-11-11T18:00:00Z');
const MOVED_START = new Date('2026-11-12T17:00:00Z');
const MOVED_END = new Date('2026-11-12T18:00:00Z');

const TABLES = ['automation_actions', 'daily_activity', 'milestones', 'schedule_slots'];

const ENUMS: Record<string, string[]> = {
  automation_status: ['pending_consent', 'applied', 'declined', 'undone', 'expired', 'consumed'],
  milestone_key: ['module_validated', 'notions_100', 'streak_30'],
  slot_creator: ['planner', 'automation', 'learner'],
  slot_kind: [
    'contributions',
    'course',
    'exercise',
    'validation_quiz',
    'global_quiz',
    'revision',
    'buffer',
    'sprint',
    'mock_exam',
    'warmup',
    'micro_session',
    'weekly_review',
  ],
  slot_status: ['planned', 'done', 'missed', 'moved', 'cancelled'],
};

let savepoint = 0;

interface Failure {
  code: string;
  message: string;
}

function failureOf(error: unknown): Failure {
  let current: unknown = error;
  let code = 'unknown';
  const messages: string[] = [];
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (code === 'unknown' && typeof candidate.code === 'string') code = candidate.code;
    if (typeof candidate.message === 'string') messages.push(candidate.message);
    current = candidate.cause;
  }
  return { code, message: messages.join(' | ') };
}

async function attempt(tx: DbTx, run: () => Promise<unknown>): Promise<Failure> {
  savepoint += 1;
  const name = `spec108_${String(savepoint)}`;
  await tx.execute(sql.raw(`savepoint ${name}`));
  try {
    await run();
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return { code: '00000', message: '' };
  } catch (error) {
    await tx.execute(sql.raw(`rollback to savepoint ${name}`));
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return failureOf(error);
  }
}

async function failureOfUserDb(
  fn: (tx: DbTx) => Promise<unknown>,
  userId: string,
): Promise<Failure> {
  try {
    await userDb({ userId }).run(fn);
    return { code: '00000', message: '' };
  } catch (error) {
    return failureOf(error);
  }
}

interface Base {
  userId: string;
  formationId: string;
  moduleId: string;
}

async function createBase(tx: DbTx, title?: string): Promise<Base> {
  const user = await createTestUser(tx);
  const programme = await createTestProgramme(tx, user.id, {
    modules: 1,
    chaptersPerModule: 1,
    notionsPerChapter: 1,
    ...(title === undefined ? {} : { title }),
  });
  const moduleId = programme.moduleIds[0];
  if (moduleId === undefined) throw new Error('programme incomplet');
  return { userId: user.id, formationId: programme.formationId, moduleId };
}

function slotInput(base: Base, overrides: Partial<Parameters<typeof createScheduleSlot>[1]> = {}) {
  return {
    userId: base.userId,
    formationId: base.formationId,
    moduleId: base.moduleId,
    kind: 'course' as const,
    title: 'Lecture du cours',
    startsAt: SLOT_START,
    endsAt: SLOT_END,
    createdBy: 'planner' as const,
    ...overrides,
  };
}

async function count(tx: Queryable, table: string, column: string, value: string): Promise<number> {
  const rows = await tx.execute<{ count: string }>(sql`
    select count(*)::int as count from ${sql.raw(`public.${table}`)}
    where ${sql.raw(column)} = ${value}::uuid
  `);
  return Number(rows[0]?.count ?? '0');
}

async function insertRawSlot(
  tx: Queryable,
  base: Base,
  input: {
    status?: string;
    startsAt?: Date;
    endsAt?: Date;
    movedFromId?: string | null;
    title?: string;
    kind?: string;
  } = {},
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by,
      moved_from_id
    )
    values (
      ${base.userId}::uuid,
      ${base.formationId}::uuid,
      ${base.moduleId}::uuid,
      ${input.kind ?? 'course'}::public.slot_kind,
      ${input.title ?? 'Lecture du cours'},
      ${(input.startsAt ?? SLOT_START).toISOString()}::timestamptz,
      ${(input.endsAt ?? SLOT_END).toISOString()}::timestamptz,
      ${input.status ?? 'planned'}::public.slot_status,
      'planner',
      ${input.movedFromId ?? null}::uuid
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('créneau non créé');
  return id;
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-108] planning persistence', () => {
  it('CA-1 — les quatre tables, cinq énumérations, contraintes, index, déclencheurs et politiques existent', async () => {
    await withRollback(async (tx) => {
      const tables = await tx.execute<Row>(sql`
        select c.relname as name, c.relrowsecurity as rls
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('schedule_slots', 'automation_actions', 'daily_activity', 'milestones')
        order by c.relname
      `);
      expect(tables.map((row) => String(row.name))).toEqual(TABLES);
      expect(
        tables.every((row) => row.rls === true),
        'RLS activée sur les quatre tables',
      ).toBe(true);

      for (const [name, values] of Object.entries(ENUMS)) {
        const rows = await tx.execute<Row>(sql`
          select e.enumlabel as label
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          where t.typnamespace = 'public'::regnamespace and t.typname = ${name}
          order by e.enumsortorder
        `);
        expect(
          rows.map((row) => String(row.label)),
          name,
        ).toEqual(values);
      }

      const constraints = await tx.execute<Row>(sql`
        select conname as name
        from pg_constraint
        where conrelid in (
          'public.schedule_slots'::regclass,
          'public.automation_actions'::regclass,
          'public.daily_activity'::regclass,
          'public.milestones'::regclass
        )
      `);
      const names = constraints.map((row) => String(row.name));
      for (const expected of [
        'schedule_slots_window_check',
        'schedule_slots_moved_from_not_self_check',
        'schedule_slots_title_length_check',
        'schedule_slots_meta_length_check',
        'schedule_slots_moved_from_id_fk',
        'automation_actions_summary_check',
        'automation_actions_payload_check',
        'automation_actions_undo_payload_check',
        'automation_actions_pending_consent_check',
        'automation_actions_pending_decided_at_check',
        'automation_actions_declined_decided_at_check',
        'daily_activity_minutes_check',
        'daily_activity_sources_check',
        'milestones_user_id_key_ref_id_unique',
      ]) {
        expect(names, expected).toContain(expected);
      }

      const indexes = await tx.execute<Row>(sql`
        select indexname as name, indexdef as definition
        from pg_indexes
        where schemaname = 'public'
          and tablename in ('schedule_slots', 'automation_actions', 'daily_activity', 'milestones')
      `);
      const byName = new Map(indexes.map((row) => [String(row.name), String(row.definition)]));
      for (const expected of [
        'schedule_slots_user_id_starts_at_idx',
        'schedule_slots_moved_from_active_unique',
        'automation_actions_user_id_created_at_idx',
        'milestones_user_id_key_ref_id_unique',
        'milestones_user_id_achieved_at_idx',
      ]) {
        expect(byName.has(expected), expected).toBe(true);
      }
      expect(byName.get('schedule_slots_user_id_starts_at_idx') ?? '').toContain('starts_at');
      expect(byName.get('schedule_slots_moved_from_active_unique') ?? '').toContain('WHERE');
      expect(byName.get('schedule_slots_moved_from_active_unique') ?? '').toContain(
        'moved_from_id',
      );
      expect(byName.get('automation_actions_user_id_created_at_idx') ?? '').toContain(
        'created_at DESC',
      );
      expect(byName.get('milestones_user_id_key_ref_id_unique') ?? '').toContain(
        'NULLS NOT DISTINCT',
      );

      const triggers = await tx.execute<Row>(sql`
        select cl.relname as table, tg.tgname as name
        from pg_trigger tg
        join pg_class cl on cl.oid = tg.tgrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public' and not tg.tgisinternal
      `);
      const triggerKeys = new Set(
        triggers.map((row) => `${String(row.table)}.${String(row.name)}`),
      );
      for (const expected of [
        'schedule_slots.set_updated_at',
        'schedule_slots.schedule_slots_move_consistency',
      ]) {
        expect(triggerKeys.has(expected), expected).toBe(true);
      }

      const policies = await tx.execute<Row>(sql`
        select cl.relname as table, pol.polname as name
        from pg_policy pol
        join pg_class cl on cl.oid = pol.polrelid
        join pg_namespace n on n.oid = cl.relnamespace
        where n.nspname = 'public'
          and cl.relname in ('schedule_slots', 'automation_actions', 'daily_activity', 'milestones')
        order by cl.relname, pol.polname
      `);
      expect(policies.map((row) => `${String(row.table)}.${String(row.name)}`)).toEqual([
        'automation_actions.automation_actions_owner_select',
        'automation_actions.automation_actions_owner_update',
        'daily_activity.daily_activity_owner_all',
        'milestones.milestones_owner_select',
        'schedule_slots.schedule_slots_owner_all',
      ]);

      // ET-1 — instants are timestamptz, the streak day is a date and has no server default.
      const types = await tx.execute<Row>(sql`
        select table_name, column_name, data_type, column_default
        from information_schema.columns
        where table_schema = 'public'
          and (
            (table_name = 'schedule_slots' and column_name in ('starts_at', 'ends_at'))
            or (table_name = 'daily_activity' and column_name = 'day')
          )
        order by table_name, column_name
      `);
      expect(types).toEqual([
        {
          table_name: 'daily_activity',
          column_name: 'day',
          data_type: 'date',
          column_default: null,
        },
        {
          table_name: 'schedule_slots',
          column_name: 'ends_at',
          data_type: 'timestamp with time zone',
          column_default: null,
        },
        {
          table_name: 'schedule_slots',
          column_name: 'starts_at',
          data_type: 'timestamp with time zone',
          column_default: null,
        },
      ]);
    });
  });

  it('CA-1 / CL-1 — plage invalide, titre vide, minutes négatives et résumé multiligne refusés', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);

      // CL-1 — the repository refuses before any write…
      await expect(
        createScheduleSlot(tx, slotInput(base, { endsAt: SLOT_START })),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      // … and the SQL check refuses a direct writer.
      const invalidWindow = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.schedule_slots (
            user_id, formation_id, kind, title, starts_at, ends_at, created_by
          )
          values (
            ${base.userId}::uuid,
            ${base.formationId}::uuid,
            'course',
            'Fin avant début',
            ${SLOT_END.toISOString()}::timestamptz,
            ${SLOT_START.toISOString()}::timestamptz,
            'planner'
          )
        `),
      );
      expect(invalidWindow.code).toBe('23514');
      expect(invalidWindow.message).toContain('schedule_slots_window_check');

      const emptyTitle = await attempt(tx, () => insertRawSlot(tx, base, { title: '' }));
      expect(emptyTitle.code).toBe('23514');
      expect(emptyTitle.message).toContain('schedule_slots_title_length_check');

      const missingOrigin = await attempt(tx, () =>
        insertRawSlot(tx, base, {
          movedFromId: '6f1d0f2a-0000-4000-8000-00000000ffff',
        }),
      );
      expect(missingOrigin.code).toBe('23503');
      expect(missingOrigin.message).toContain('schedule_slot_move_origin_missing');

      const negativeMinutes = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.daily_activity (user_id, day, minutes, sources)
          values (${base.userId}::uuid, ${DAY}::date, -1, '{}'::text[])
        `),
      );
      expect(negativeMinutes.code).toBe('23514');
      expect(negativeMinutes.message).toContain('daily_activity_minutes_check');

      const emptySource = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.daily_activity (user_id, day, minutes, sources)
          values (${base.userId}::uuid, ${DAY}::date, 5, array[''])
        `),
      );
      expect(emptySource.code).toBe('23514');
      expect(emptySource.message).toContain('daily_activity_sources_check');

      const emptySummary = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.automation_actions (user_id, automation, kind, summary)
          values (${base.userId}::uuid, 'reprise', 'reprise_proposed', '')
        `),
      );
      expect(emptySummary.code).toBe('23514');
      expect(emptySummary.message).toContain('automation_actions_summary_check');

      const multilineSummary = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.automation_actions (user_id, automation, kind, summary)
          values (${base.userId}::uuid, 'reprise', 'reprise_proposed', ${'deux\nlignes'})
        `),
      );
      expect(multilineSummary.code).toBe('23514');
      expect(multilineSummary.message).toContain('automation_actions_summary_check');

      const arrayPayload = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.automation_actions (user_id, automation, kind, summary, payload)
          values (${base.userId}::uuid, 'reprise', 'reprise_proposed', 'Reprise proposée', '[]'::jsonb)
        `),
      );
      expect(arrayPayload.code).toBe('23514');
      expect(arrayPayload.message).toContain('automation_actions_payload_check');

      // BR-AUT-11 — consent is required before waiting, and a decline is a dated decision.
      const pendingWithoutConsent = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.automation_actions (
            user_id, automation, kind, summary, status, requires_consent
          )
          values (
            ${base.userId}::uuid, 'reprise', 'reprise_proposed', 'Reprise proposée',
            'pending_consent', false
          )
        `),
      );
      expect(pendingWithoutConsent.code).toBe('23514');
      expect(pendingWithoutConsent.message).toContain('automation_actions_pending_consent_check');

      const declinedWithoutDecision = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.automation_actions (user_id, automation, kind, summary, status)
          values (${base.userId}::uuid, 'reprise', 'reprise_proposed', 'Reprise refusée', 'declined')
        `),
      );
      expect(declinedWithoutDecision.code).toBe('23514');
      expect(declinedWithoutDecision.message).toContain(
        'automation_actions_declined_decided_at_check',
      );

      // BR-AGE-04 — the five statuses are representable.
      const statuses = await tx.execute<Row>(sql`
        select e.enumlabel as label
        from pg_type t join pg_enum e on e.enumtypid = t.oid
        where t.typnamespace = 'public'::regnamespace and t.typname = 'slot_status'
        order by e.enumsortorder
      `);
      expect(statuses.map((row) => String(row.label))).toEqual([
        'planned',
        'done',
        'missed',
        'moved',
        'cancelled',
      ]);
    });
  });

  it('CA-2 / EF-2 / CL-3 — un déplacement conserve le lien, un créneau terminé ne bouge plus', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);
      const origin = await createScheduleSlot(tx, slotInput(base));

      const moved = await moveScheduleSlot(tx, {
        userId: base.userId,
        slotId: origin.id,
        startsAt: MOVED_START,
        endsAt: MOVED_END,
      });
      expect(moved.previous.status).toBe('moved');
      expect(moved.current.status).toBe('planned');
      expect(moved.current.movedFromId).toBe(origin.id);
      expect(moved.current.userId).toBe(base.userId);
      expect(moved.current.formationId).toBe(base.formationId);
      expect(moved.current.moduleId).toBe(base.moduleId);
      expect(moved.current.title).toBe(origin.title);
      expect(moved.current.createdBy).toBe('learner');

      // EF-6 — the agenda range returns both rows, ordered by start instant.
      const range = await listScheduleSlots(tx, {
        userId: base.userId,
        from: new Date('2026-11-11T00:00:00Z'),
        to: new Date('2026-11-13T00:00:00Z'),
      });
      expect(range.map((slot) => slot.id)).toEqual([origin.id, moved.current.id]);
      const windows = await listScheduleSlotWindows(tx, {
        userId: base.userId,
        from: new Date('2026-11-11T00:00:00Z'),
        to: new Date('2026-11-13T00:00:00Z'),
      });
      expect(windows.map((slot) => slot.status)).toEqual(['moved', 'planned']);

      // EF-2 — a moved slot is not moved again.
      await expect(
        moveScheduleSlot(tx, {
          userId: base.userId,
          slotId: origin.id,
          startsAt: MOVED_START,
          endsAt: MOVED_END,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      // EF-2 — done and cancelled slots are terminal.
      const done = await createScheduleSlot(
        tx,
        slotInput(base, {
          title: 'Quiz de validation',
          kind: 'validation_quiz',
          startsAt: new Date('2026-11-13T17:00:00Z'),
          endsAt: new Date('2026-11-13T17:30:00Z'),
        }),
      );
      const doneSlot = await setScheduleSlotStatus(tx, {
        userId: base.userId,
        slotId: done.id,
        status: 'done',
      });
      expect(doneSlot.status).toBe('done');
      // Repeating the same status is idempotent.
      expect(
        (
          await setScheduleSlotStatus(tx, {
            userId: base.userId,
            slotId: done.id,
            status: 'done',
          })
        ).status,
      ).toBe('done');
      await expect(
        moveScheduleSlot(tx, {
          userId: base.userId,
          slotId: done.id,
          startsAt: MOVED_START,
          endsAt: MOVED_END,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      const cancelled = await createScheduleSlot(
        tx,
        slotInput(base, {
          title: 'Séance annulée',
          startsAt: new Date('2026-11-14T17:00:00Z'),
          endsAt: new Date('2026-11-14T18:00:00Z'),
        }),
      );
      await setScheduleSlotStatus(tx, {
        userId: base.userId,
        slotId: cancelled.id,
        status: 'cancelled',
      });
      await expect(
        moveScheduleSlot(tx, {
          userId: base.userId,
          slotId: cancelled.id,
          startsAt: MOVED_START,
          endsAt: MOVED_END,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      // CL-2 — a direct writer cannot create a successor of a still-planned origin.
      const stillPlanned = await createScheduleSlot(
        tx,
        slotInput(base, {
          title: 'Séance encore prévue',
          startsAt: new Date('2026-11-15T17:00:00Z'),
          endsAt: new Date('2026-11-15T18:00:00Z'),
        }),
      );
      const orphanSuccessor = await attempt(tx, () =>
        insertRawSlot(tx, base, {
          title: 'Successeur sans déplacement',
          startsAt: MOVED_START,
          endsAt: MOVED_END,
          movedFromId: stillPlanned.id,
        }),
      );
      expect(orphanSuccessor.code).toBe('23514');
      expect(orphanSuccessor.message).toContain('schedule_slot_move_origin_not_moved');

      // CL-3 — the origin cannot be deleted while its successor exists.
      const deleteOrigin = await attempt(tx, () =>
        tx.execute(sql`delete from public.schedule_slots where id = ${origin.id}::uuid`),
      );
      expect(deleteOrigin.code).toBe('23503');
    });
  });

  it('CA-2 / CL-2 — deux déplacements concurrents ne créent qu’un seul successeur actif', async () => {
    // Deliberately outside withRollback: the two transactions must really commit and race.
    const seed = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx);
      const origin = await createScheduleSlot(tx, slotInput(base));
      return { ...base, originId: origin.id };
    });

    try {
      const move = (start: Date, end: Date) =>
        serviceDb().transaction((tx) =>
          moveScheduleSlot(tx, {
            userId: seed.userId,
            slotId: seed.originId,
            startsAt: start,
            endsAt: end,
          }),
        );

      const settled = await Promise.allSettled([
        move(new Date('2026-11-12T17:00:00Z'), new Date('2026-11-12T18:00:00Z')),
        move(new Date('2026-11-13T17:00:00Z'), new Date('2026-11-13T18:00:00Z')),
      ]);
      const fulfilled = settled.filter((result) => result.status === 'fulfilled');
      const rejected = settled.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const failure = failureOf(rejected[0]?.reason);
      expect(failure.code).toBe('CONFLICT');
      expect(rejected[0]?.reason).toBeInstanceOf(AppError);

      const [origin] = await serviceDb().execute<Row>(sql`
        select status::text as status
        from public.schedule_slots
        where id = ${seed.originId}::uuid
      `);
      expect(origin?.status).toBe('moved');
      const successors = await serviceDb().execute<Row>(sql`
        select id::text as id, status::text as status
        from public.schedule_slots
        where moved_from_id = ${seed.originId}::uuid
          and status in ('planned', 'done', 'missed')
      `);
      expect(successors).toHaveLength(1);
      expect(successors[0]?.status).toBe('planned');
      expect(
        await serviceDb().execute(sql`
          select id from public.schedule_slots where user_id = ${seed.userId}::uuid
        `),
      ).toHaveLength(2);
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    }
  });

  it('CA-3 / EF-4 / CL-5 — l’activité du jour et les jalons ne sont pas doublés', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);

      const first = await upsertDailyActivity(tx, {
        userId: base.userId,
        day: DAY,
        minutes: 30,
        qualifying: true,
        sources: ['attempt:1'],
      });
      expect(first.minutes).toBe(30);
      expect(first.qualifying).toBe(true);
      expect(first.sources).toEqual(['attempt:1']);

      // Replaying the same event adds no minute and no source.
      const replay = await upsertDailyActivity(tx, {
        userId: base.userId,
        day: DAY,
        minutes: 30,
        qualifying: false,
        sources: ['attempt:1'],
      });
      expect(replay.minutes).toBe(30);
      expect(replay.qualifying).toBe(true);
      expect(replay.sources).toEqual(['attempt:1']);

      // A new event adds its minutes and de-duplicates the source list.
      const another = await upsertDailyActivity(tx, {
        userId: base.userId,
        day: DAY,
        minutes: 20,
        qualifying: false,
        sources: ['attempt:1', 'slot:2'],
      });
      expect(another.minutes).toBe(50);
      expect(another.sources).toEqual(['attempt:1', 'slot:2']);

      const third = await upsertDailyActivity(tx, {
        userId: base.userId,
        day: DAY,
        minutes: 5,
        qualifying: true,
        sources: ['slot:2', 'slot:3'],
      });
      expect(third.minutes).toBe(55);
      expect(third.sources).toEqual(['attempt:1', 'slot:2', 'slot:3']);

      // EF-4 — one row per day; the range returns only existing rows.
      await upsertDailyActivity(tx, {
        userId: base.userId,
        day: NEXT_DAY,
        minutes: 15,
        sources: ['course:1'],
      });
      expect(await getDailyActivity(tx, { userId: base.userId, day: DAY })).toMatchObject({
        minutes: 55,
      });
      const range = await listDailyActivity(tx, {
        userId: base.userId,
        from: DAY,
        to: NEXT_DAY,
      });
      expect(range.map((row) => [row.day, row.minutes])).toEqual([
        [DAY, 55],
        [NEXT_DAY, 15],
      ]);
      const outside = await listDailyActivity(tx, {
        userId: base.userId,
        from: '2026-11-01',
        to: '2026-11-10',
      });
      expect(outside).toEqual([]);

      // EF-5, CL-6 — the same milestone is recorded once, including a null reference.
      const once = await recordMilestone(tx, {
        userId: base.userId,
        formationId: base.formationId,
        key: 'module_validated',
        refId: base.moduleId,
        achievedAt: FIXED,
      });
      expect(once.created).toBe(true);
      const twice = await recordMilestone(tx, {
        userId: base.userId,
        formationId: base.formationId,
        key: 'module_validated',
        refId: base.moduleId,
        achievedAt: new Date('2026-11-12T12:20:00Z'),
      });
      expect(twice.created).toBe(false);
      expect(twice.milestone.id).toBe(once.milestone.id);
      expect(twice.milestone.achievedAt.toISOString()).toBe(FIXED.toISOString());

      const streakOnce = await recordMilestone(tx, {
        userId: base.userId,
        key: 'streak_30',
        achievedAt: FIXED,
      });
      expect(streakOnce.created).toBe(true);
      const streakTwice = await recordMilestone(tx, {
        userId: base.userId,
        key: 'streak_30',
        achievedAt: new Date('2026-11-13T12:20:00Z'),
      });
      expect(streakTwice.created).toBe(false);
      expect(streakTwice.milestone.id).toBe(streakOnce.milestone.id);

      const duplicate = await attempt(tx, () =>
        tx.execute(sql`
          insert into public.milestones (user_id, key, achieved_at)
          values (${base.userId}::uuid, 'streak_30', ${FIXED.toISOString()}::timestamptz)
        `),
      );
      expect(duplicate.code).toBe('23505');
      expect(duplicate.message).toContain('milestones_user_id_key_ref_id_unique');

      expect(await count(tx, 'milestones', 'user_id', base.userId)).toBe(2);
      expect(
        await getMilestone(tx, { userId: base.userId, milestoneId: once.milestone.id }),
      ).toMatchObject({ key: 'module_validated' });
    });
  });

  it('CA-3 / CL-5 — deux écritures concurrentes du même jour additionnent sans perte', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx);
      return base;
    });

    try {
      const write = (minutes: number, source: string) =>
        serviceDb().transaction((tx) =>
          upsertDailyActivity(tx, {
            userId: seed.userId,
            day: DAY,
            minutes,
            qualifying: true,
            sources: [source],
          }),
        );
      const settled = await Promise.allSettled([write(10, 'attempt:a'), write(15, 'attempt:b')]);
      expect(settled.every((result) => result.status === 'fulfilled')).toBe(true);

      const [row] = await serviceDb().execute<Row>(sql`
        select minutes, qualifying, sources
        from public.daily_activity
        where user_id = ${seed.userId}::uuid and day = ${DAY}::date
      `);
      expect(Number(row?.minutes)).toBe(25);
      expect(row?.qualifying).toBe(true);
      expect([...(row?.sources as string[])].sort()).toEqual(['attempt:a', 'attempt:b']);

      // Replaying both events adds nothing.
      await Promise.allSettled([write(10, 'attempt:a'), write(15, 'attempt:b')]);
      const [afterReplay] = await serviceDb().execute<Row>(sql`
        select minutes from public.daily_activity
        where user_id = ${seed.userId}::uuid and day = ${DAY}::date
      `);
      expect(Number(afterReplay?.minutes)).toBe(25);
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    }
  });

  it('EF-3 / EF-6 / CL-4 — journal paginé, décision, annulation et action consommée', async () => {
    await withRollback(async (tx) => {
      const base = await createBase(tx);

      const first = await createAutomationAction(tx, {
        userId: base.userId,
        formationId: base.formationId,
        automation: 'reprise',
        kind: 'reprise_proposed',
        summary: 'Une reprise de cinq minutes est proposée.',
        payload: { minutes: 5 },
        undoPayload: { action: 'dismiss' },
        createdAt: new Date('2026-11-09T08:00:00Z'),
      });
      const second = await createAutomationAction(tx, {
        userId: base.userId,
        automation: 'sprint',
        kind: 'sprint_planned',
        summary: 'Deux révisions courtes avant le quiz.',
        payload: { slotIds: [] },
        requiresConsent: true,
        createdAt: new Date('2026-11-10T08:00:00Z'),
      });
      const third = await createAutomationAction(tx, {
        userId: base.userId,
        automation: 'bilan',
        kind: 'weekly_review',
        summary: 'Le bilan de la semaine est prêt.',
        payload: {},
        undoPayload: null,
        createdAt: new Date('2026-11-11T08:00:00Z'),
      });

      expect(first.status).toBe('applied');
      expect(second.status).toBe('pending_consent');
      expect(second.requiresConsent).toBe(true);
      expect(third.status).toBe('applied');

      // EF-3, EF-6 — newest first, stable pagination.
      const page = await listAutomationActions(tx, { userId: base.userId, limit: 2 });
      expect(page.map((action) => action.id)).toEqual([third.id, second.id]);
      const next = await listAutomationActions(tx, {
        userId: base.userId,
        limit: 2,
        offset: 2,
      });
      expect(next.map((action) => action.id)).toEqual([first.id]);
      const ascending = await listAutomationActionsAscending(tx, {
        userId: base.userId,
        since: new Date('2026-11-09T00:00:00Z'),
      });
      expect(ascending.map((action) => action.id)).toEqual([first.id, second.id, third.id]);
      expect(
        await countAutomationActions(tx, {
          userId: base.userId,
          since: new Date('2026-11-10T00:00:00Z'),
        }),
      ).toBe(2);

      // BR-AUT-11 — accept, decline, undo and consume follow their transitions.
      const accepted = await decideAutomationAction(tx, {
        userId: base.userId,
        actionId: second.id,
        decision: 'accept',
        decidedAt: FIXED,
      });
      expect(accepted.status).toBe('applied');
      expect(accepted.decidedAt?.toISOString()).toBe(FIXED.toISOString());

      const undone = await undoAutomationAction(tx, {
        userId: base.userId,
        actionId: first.id,
        undoneAt: FIXED,
      });
      expect(undone.status).toBe('undone');
      expect(undone.undoPayload).toEqual({ action: 'dismiss' });

      // CL-4 — an applied action without undo payload is refused and stays readable.
      await expect(
        undoAutomationAction(tx, {
          userId: base.userId,
          actionId: third.id,
          undoneAt: FIXED,
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(
        await getAutomationAction(tx, { userId: base.userId, actionId: third.id }),
      ).toMatchObject({ status: 'applied' });

      // BR-AUT-11 — a consumed action can no longer be undone.
      const consumed = await consumeAutomationAction(tx, {
        userId: base.userId,
        actionId: third.id,
      });
      expect(consumed.status).toBe('consumed');
      await expect(
        undoAutomationAction(tx, {
          userId: base.userId,
          actionId: third.id,
          undoneAt: FIXED,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });

      // EF-3 — a consenting action can be declined with its decision instant.
      const decline = await createAutomationAction(tx, {
        userId: base.userId,
        automation: 'pause',
        kind: 'pause_started',
        summary: 'La pause est proposée.',
        payload: {},
        requiresConsent: true,
      });
      const declined = await decideAutomationAction(tx, {
        userId: base.userId,
        actionId: decline.id,
        decision: 'decline',
        decidedAt: FIXED,
      });
      expect(declined.status).toBe('declined');
      expect(declined.decidedAt?.toISOString()).toBe(FIXED.toISOString());
    });
  });

  it('CA-4 / CL-7 — deux JWT ne voient ni n’écrivent les lignes de l’autre, même en formation partagée', async () => {
    const alice = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx, 'Formation partagée');
      const slot = await createScheduleSlot(tx, slotInput(base));
      const action = await createAutomationAction(tx, {
        userId: base.userId,
        formationId: base.formationId,
        automation: 'reprise',
        kind: 'reprise_proposed',
        summary: 'Reprise proposée.',
        payload: { slotId: slot.id },
        requiresConsent: true,
      });
      await upsertDailyActivity(tx, {
        userId: base.userId,
        day: DAY,
        minutes: 45,
        qualifying: true,
        sources: ['attempt:alice'],
      });
      await recordMilestone(tx, {
        userId: base.userId,
        formationId: base.formationId,
        key: 'notions_100',
        achievedAt: FIXED,
      });
      return { ...base, slotId: slot.id, actionId: action.id };
    });

    const bob = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx, 'Formation privée de Bob');
      const slot = await createScheduleSlot(tx, slotInput(base, { title: 'Séance de Bob' }));
      const action = await createAutomationAction(tx, {
        userId: base.userId,
        automation: 'sprint',
        kind: 'sprint_planned',
        summary: 'Sprint de Bob.',
        payload: {},
        requiresConsent: true,
      });
      await upsertDailyActivity(tx, {
        userId: base.userId,
        day: DAY,
        minutes: 20,
        qualifying: true,
        sources: ['attempt:bob'],
      });
      await recordMilestone(tx, {
        userId: base.userId,
        key: 'module_validated',
        refId: base.moduleId,
        achievedAt: FIXED,
      });

      // CL-7 — Bob receives a personal slot on Alice's shared formation; Alice must not see it.
      const shared = await createScheduleSlot(tx, {
        ...slotInput(base, {
          formationId: alice.formationId,
          moduleId: null,
          title: 'Séance personnelle de Bob sur la formation partagée',
        }),
        userId: base.userId,
      });
      return { ...base, slotId: slot.id, actionId: action.id, sharedSlotId: shared.id };
    });

    try {
      const aliceView = await userDb({ userId: alice.userId }).run(async (tx) => {
        const rows = await tx.execute<Row>(sql`
          select
            (select count(*)::int from public.schedule_slots) as slots,
            (select count(*)::int from public.schedule_slots where formation_id = ${alice.formationId}::uuid) as shared_formation_slots,
            (select count(*)::int from public.automation_actions) as actions,
            (select count(*)::int from public.daily_activity) as daily,
            (select count(*)::int from public.milestones) as milestones,
            (select count(*)::int from public.schedule_slots where user_id = ${bob.userId}::uuid) as foreign_slots,
            (select count(*)::int from public.automation_actions where user_id = ${bob.userId}::uuid) as foreign_actions,
            (select count(*)::int from public.daily_activity where user_id = ${bob.userId}::uuid) as foreign_daily,
            (select count(*)::int from public.milestones where user_id = ${bob.userId}::uuid) as foreign_milestones
        `);
        return rows[0];
      });
      expect(aliceView).toMatchObject({
        slots: 1,
        shared_formation_slots: 1,
        actions: 1,
        daily: 1,
        milestones: 1,
        foreign_slots: 0,
        foreign_actions: 0,
        foreign_daily: 0,
        foreign_milestones: 0,
      });

      // EF-6 — a repository call with Bob's identifier returns nothing under Alice's JWT.
      const foreignRange = await userDb({ userId: alice.userId }).run((tx) =>
        listScheduleSlots(tx, {
          userId: bob.userId,
          from: new Date('2026-11-11T00:00:00Z'),
          to: new Date('2026-11-13T00:00:00Z'),
        }),
      );
      expect(foreignRange).toEqual([]);
      expect(
        await userDb({ userId: alice.userId }).run((tx) =>
          getScheduleSlot(tx, { userId: alice.userId, slotId: bob.sharedSlotId }),
        ),
      ).toBeNull();
      expect(
        await userDb({ userId: alice.userId }).run((tx) =>
          getDailyActivity(tx, { userId: bob.userId, day: DAY }),
        ),
      ).toBeNull();
      expect(
        await userDb({ userId: alice.userId }).run((tx) =>
          listMilestones(tx, { userId: bob.userId }),
        ),
      ).toEqual([]);

      // ET-3 — writing a foreign slot, daily row, action or milestone is refused.
      const foreignSlot = await failureOfUserDb(
        (tx) =>
          createScheduleSlot(tx, {
            ...slotInput(alice, { title: 'Tentative' }),
            userId: bob.userId,
          }),
        alice.userId,
      );
      expect(foreignSlot.code).toBe('42501');
      const foreignDaily = await failureOfUserDb(
        (tx) =>
          upsertDailyActivity(tx, {
            userId: bob.userId,
            day: DAY,
            minutes: 5,
            sources: ['attempt:alice'],
          }),
        alice.userId,
      );
      expect(foreignDaily.code).toBe('42501');
      const foreignAction = await failureOfUserDb(
        (tx) =>
          createAutomationAction(tx, {
            userId: alice.userId,
            automation: 'bilan',
            kind: 'weekly_review',
            summary: 'Action d’Alice',
            payload: {},
          }),
        alice.userId,
      );
      expect(foreignAction.code).toBe('42501');
      const foreignMilestone = await failureOfUserDb(
        (tx) =>
          recordMilestone(tx, {
            userId: alice.userId,
            key: 'streak_30',
            achievedAt: FIXED,
          }),
        alice.userId,
      );
      expect(foreignMilestone.code).toBe('42501');

      // EF-3 — Alice still decides her own action through her JWT.
      const accepted = await userDb({ userId: alice.userId }).run((tx) =>
        decideAutomationAction(tx, {
          userId: alice.userId,
          actionId: alice.actionId,
          decision: 'accept',
          decidedAt: FIXED,
        }),
      );
      expect(accepted.status).toBe('applied');

      // … but she cannot decide Bob's.
      const foreignDecision = await userDb({ userId: alice.userId }).run((tx) =>
        tx.execute(sql`
          update public.automation_actions set status = 'applied'
          where id = ${bob.actionId}::uuid
          returning id
        `),
      );
      expect(foreignDecision).toEqual([]);
    } finally {
      await serviceDb().execute(
        sql`delete from auth.users where id in (${alice.userId}::uuid, ${bob.userId}::uuid)`,
      );
    }
  });

  it('CL-3 / CL-8 — la suppression du compte emporte la chaîne, les instants restent UTC', async () => {
    const seed = await serviceDb().transaction(async (tx) => {
      const base = await createBase(tx);
      const origin = await createScheduleSlot(tx, slotInput(base));
      const moved = await moveScheduleSlot(tx, {
        userId: base.userId,
        slotId: origin.id,
        startsAt: MOVED_START,
        endsAt: MOVED_END,
      });
      await createAutomationAction(tx, {
        userId: base.userId,
        formationId: base.formationId,
        automation: 'reprise',
        kind: 'reprise_proposed',
        summary: 'Reprise proposée.',
        payload: {},
      });
      await upsertDailyActivity(tx, {
        userId: base.userId,
        day: DAY,
        minutes: 10,
        qualifying: true,
        sources: ['attempt:1'],
      });
      await recordMilestone(tx, {
        userId: base.userId,
        key: 'streak_30',
        achievedAt: FIXED,
      });
      return { ...base, originId: origin.id, currentId: moved.current.id };
    });

    try {
      // CL-8 — timestamptz never depends on the session time zone.
      const inNewYork = await serviceDb().transaction(async (tx) => {
        await tx.execute(sql`set local time zone 'America/New_York'`);
        const slot = await getScheduleSlot(tx, {
          userId: seed.userId,
          slotId: seed.currentId,
        });
        const dailyRows = await tx.execute<Row>(sql`
          select day::text as day from public.daily_activity
          where user_id = ${seed.userId}::uuid
        `);
        return { slot, daily: dailyRows[0] };
      });
      expect(inNewYork.slot?.startsAt.toISOString()).toBe(MOVED_START.toISOString());
      expect(inNewYork.daily?.day).toBe(DAY);

      await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
      expect(await count(serviceDb(), 'schedule_slots', 'user_id', seed.userId)).toBe(0);
      expect(await count(serviceDb(), 'automation_actions', 'user_id', seed.userId)).toBe(0);
      expect(await count(serviceDb(), 'daily_activity', 'user_id', seed.userId)).toBe(0);
      expect(await count(serviceDb(), 'milestones', 'user_id', seed.userId)).toBe(0);
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${seed.userId}::uuid`);
    }
  });
});
