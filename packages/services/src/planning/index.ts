// Formation planning services (SPEC-618 EF-2, ET-2, ET-4; BR-FOR-15, ADR-0016, ADR-0029).
//
// Resuming a paused formation replans it from the learner's local day. The pure planner of
// SPEC-407 builds the slots; this service only reads the formation, the rhythm and the existing
// slots, then reconciles them inside the caller's transaction so the status change and the new
// planning commit together.

import { ENGINE } from '@learny/config/product';
import { AppError, localTimeToInstant, userLocalDay, type Clock } from '@learny/core';
import { schema, sql, type DbTx } from '@learny/db';
import {
  planSchedule,
  type ExistingPlannerSlot,
  type PlannerChapter,
  type PlannerFormation,
  type PlannerModule,
  type SlotKind,
  type SlotStatus,
} from '@learny/learning-engine';

import type { ServiceContext } from '../context';
import { reconcilePlanSlots, type PlanReconciliationCounts } from '../learning/persist-plan';
import { requireUser, toResult } from '../resources/result';

/** Fallback module volume when the cadrage did not record one; the planner needs a positive hour. */
const DEFAULT_MODULE_HOURS = 2;
/** Planning horizon used when the formation has no end date; mirrors the planner's 366-day bound. */
const FALLBACK_HORIZON_DAYS = 120;

interface ProfileRhythmRow {
  timezone: string;
  hours_per_day: number | null;
  study_days: number[] | string[] | null;
  preferred_slots: string[] | null;
  [key: string]: unknown;
}

interface FormationPlanRow {
  id: string;
  title: string;
  status: 'active' | 'paused';
  end_date: string | null;
  volume_hours: number | null;
  objectives: string[];
  [key: string]: unknown;
}

interface ModulePlanRow {
  module_id: string;
  position: number;
  title: string;
  status: 'locked' | 'open' | 'validated';
  chapter_id: string | null;
  chapter_position: number | null;
  chapter_title: string | null;
  [key: string]: unknown;
}

interface ExistingSlotRow {
  id: string;
  formation_id: string | null;
  module_id: string | null;
  kind: string;
  title: string;
  starts_at: Date | string;
  ends_at: Date | string;
  status: string;
  created_by: string;
  moved_from_id: string | null;
  [key: string]: unknown;
}

function addCivilDays(day: string, delta: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + delta));
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

function toInstant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function modulesOf(rows: readonly ModulePlanRow[], hours: number): PlannerModule[] {
  const byModule = new Map<string, { module: ModulePlanRow; chapters: PlannerChapter[] }>();
  for (const row of rows) {
    const current = byModule.get(row.module_id) ?? { module: row, chapters: [] };
    if (row.chapter_id !== null) {
      current.chapters.push({
        chapterId: row.chapter_id,
        position: row.chapter_position ?? 1,
        ...(row.chapter_title === null ? {} : { title: row.chapter_title }),
      });
    }
    byModule.set(row.module_id, current);
  }
  return [...byModule.values()]
    .sort((left, right) => left.module.position - right.module.position)
    .map(({ module, chapters }) => ({
      moduleId: module.module_id,
      position: module.position,
      title: module.title,
      hours,
      chapters: chapters.sort((left, right) => left.position - right.position),
      status: module.status,
    }));
}

function existingSlots(rows: readonly ExistingSlotRow[]): ExistingPlannerSlot[] {
  return rows
    .filter(
      (row) =>
        row.status === 'planned' ||
        row.status === 'done' ||
        row.status === 'missed' ||
        row.status === 'moved',
    )
    .map((row) => ({
      slotId: row.id,
      formationId: row.formation_id,
      moduleId: row.module_id,
      kind: row.kind as SlotKind,
      title: row.title,
      startsAt: toInstant(row.starts_at),
      endsAt: toInstant(row.ends_at),
      status: row.status as SlotStatus,
      createdBy:
        row.created_by === 'automation' || row.created_by === 'learner'
          ? row.created_by
          : 'planner',
      movedFromId: row.moved_from_id,
    }));
}

/**
 * EF-2, ET-2 — replans one paused formation from its resume day inside the caller's transaction.
 * Reuses SPEC-407 and SPEC-411 instead of duplicating the planner or the slot reconciliation.
 */
export async function replanFormationAfterResume(
  tx: DbTx,
  userId: string,
  formationId: string,
  now: Date,
  clock: Clock,
): Promise<PlanReconciliationCounts> {
  const profileRows = await tx.execute<ProfileRhythmRow>(sql`
    select p.timezone,
           sp.hours_per_day,
           sp.study_days,
           sp.preferred_slots::text[] as preferred_slots
    from public.profiles p
    left join public.study_preferences sp on sp.user_id = p.id
    where p.id = ${userId}::uuid
  `);
  const profile = profileRows[0];
  if (profile === undefined) throw new Error('Profil introuvable pour la replanification.');

  const formationRows = await tx.execute<FormationPlanRow>(sql`
    select f.id::text as id,
           f.title,
           f.status::text as status,
           f.end_date::text as end_date,
           f.volume_hours,
           f.objectives::text[] as objectives
    from public.formations f
    where f.id = ${formationId}::uuid
      and f.owner_id = ${userId}::uuid
  `);
  const formation = formationRows[0];
  if (formation === undefined) throw new Error('Formation introuvable pour la replanification.');

  const moduleRows = await tx.execute<ModulePlanRow>(sql`
    select m.id::text as module_id,
           m.position::int as position,
           m.title,
           m.status::text as status,
           c.id::text as chapter_id,
           c.position::int as chapter_position,
           c.title as chapter_title
    from public.modules m
    left join public.chapters c on c.module_id = m.id
    where m.formation_id = ${formationId}::uuid
    order by m.position, c.position
  `);

  const existingRows = await tx.execute<ExistingSlotRow>(sql`
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.kind::text as kind,
           ss.title,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           ss.created_by::text as created_by,
           ss.moved_from_id::text as moved_from_id
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.status in ('planned', 'done', 'missed', 'moved')
      and ss.starts_at >= ${new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()}::timestamptz
  `);

  const today = userLocalDay(now, profile.timezone);
  const moduleCount = new Set(moduleRows.map((row) => row.module_id)).size;
  const hours =
    moduleCount === 0
      ? DEFAULT_MODULE_HOURS
      : Math.max(
          1,
          Math.round((formation.volume_hours ?? moduleCount * DEFAULT_MODULE_HOURS) / moduleCount),
        );
  const modules = modulesOf(moduleRows, hours);
  const plannerFormation: PlannerFormation = {
    formationId: formation.id,
    title: formation.title,
    endDate: formation.end_date ?? addCivilDays(today, FALLBACK_HORIZON_DAYS),
    status: 'active',
    objectives: formation.objectives.filter(
      (objective): objective is 'operational' | 'exam' | 'dialogue' | 'project' =>
        objective === 'operational' ||
        objective === 'exam' ||
        objective === 'dialogue' ||
        objective === 'project',
    ),
    modules,
  };
  const availability = {
    hoursPerDay: profile.hours_per_day ?? 2,
    studyDays: (profile.study_days ?? [1, 2, 3, 4, 5])
      .map((day) => Number(day))
      .filter((day): day is 1 | 2 | 3 | 4 | 5 | 6 | 7 => day >= 1 && day <= 7)
      .sort((left, right) => left - right),
    preferredSlots: (profile.preferred_slots ?? ['soir'])
      .filter(
        (slot): slot is 'matin' | 'apres_midi' | 'soir' =>
          slot === 'matin' || slot === 'apres_midi' || slot === 'soir',
      )
      .sort(
        (left, right) =>
          (left === 'matin' ? 0 : left === 'apres_midi' ? 1 : 2) -
          (right === 'matin' ? 0 : right === 'apres_midi' ? 1 : 2),
      ),
  };
  const plan = planSchedule({
    formations: [plannerFormation],
    preferences: { tz: profile.timezone, availability },
    params: ENGINE.planner,
    existingSlots: existingSlots(existingRows),
    now: clock.now().toISOString(),
  });
  return reconcilePlanSlots(tx, userId, formationId, plan.slots, now);
}

interface MockExamFormationRow {
  id: string;
  title: string;
  status: string;
  end_date: string | null;
  objectives: string[];
  exam_format: unknown;
  timezone: string;
  [key: string]: unknown;
}

interface MockExamModuleRow {
  id: string;
  position: number;
  title: string;
  planned_end: string | null;
  [key: string]: unknown;
}

export interface ScheduledMockExam {
  position: 1 | 2;
  startsAt: string;
  endsAt: string;
  date: string;
  durationMin: number;
  slotId: string;
}

function mockExamDurationMinutes(examFormat: unknown): number {
  const parsed = schema.examFormatSchema.safeParse(examFormat);
  if (parsed.success) return parsed.data.durationMin;
  return ENGINE.planner.mockExam.questions * ENGINE.planner.mockExam.minutesPerQuestion;
}

function civilDateOffset(date: string, delta: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + delta));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

/**
 * BR-PRA-05, ADR-0028 — a formation whose objectives contain `exam` carries two mock exams: at
 * the end of the penultimate module and on the last day of the formation. The reconciliation is
 * idempotent (stable `planner_key`) and never touches a completed or moved slot.
 */
export function ensureMockExamSlots(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<ScheduledMockExam[]>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      await tx.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended('mock-exams:' || ${userId} || ':' || ${formationId}, 0)
        )
      `);
      const formationRows = await tx.execute<MockExamFormationRow>(sql`
        select f.id::text as id,
               f.title,
               f.status::text as status,
               f.end_date::text as end_date,
               f.objectives::text[] as objectives,
               f.exam_format,
               p.timezone
        from public.formations f
        join public.profiles p on p.id = f.owner_id
        where f.id = ${formationId}::uuid
          and (f.owner_id = ${userId}::uuid or exists (
            select 1
            from public.groups g
            join public.group_members gm on gm.group_id = g.id
            where g.formation_id = f.id
              and gm.user_id = ${userId}::uuid
              and gm.member_status = 'active'
          ))
        limit 1
      `);
      const formation = formationRows[0];
      if (formation === undefined) {
        throw new AppError('NOT_FOUND', 'Formation introuvable.');
      }
      if (!formation.objectives.includes('exam') || formation.status !== 'active') return [];

      const moduleRows = await tx.execute<MockExamModuleRow>(sql`
        select id::text as id, position, title, planned_end::text as planned_end
        from public.modules
        where formation_id = ${formationId}::uuid
        order by position asc
      `);
      if (moduleRows.length === 0) return [];
      const endDate = formation.end_date ?? civilDateOffset(userLocalDay(now, formation.timezone), 30);
      const penultimate = moduleRows.length >= 2 ? moduleRows[moduleRows.length - 2] : undefined;
      const penultimateDate =
        penultimate?.planned_end ?? civilDateOffset(endDate, moduleRows.length >= 2 ? -7 : 0);
      const dates: { position: 1 | 2; date: string }[] =
        moduleRows.length >= 2
          ? [
              { position: 1, date: penultimateDate },
              { position: 2, date: endDate },
            ]
          : [{ position: 2, date: endDate }];
      const durationMin = mockExamDurationMinutes(formation.exam_format);
      const scheduled: ScheduledMockExam[] = [];

      for (const entry of dates) {
        const startsAt = localTimeToInstant(entry.date, '09:00', formation.timezone);
        const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
        const plannerKey = `mock-exam:${formationId}:${String(entry.position)}`;
        const title = `Examen blanc ${String(entry.position)} — ${formation.title}`;
        const existing = await tx.execute<{ id: string }>(sql`
          select id::text as id
          from public.schedule_slots
          where user_id = ${userId}::uuid
            and planner_key = ${plannerKey}
            and status = 'planned'
          limit 1
        `);
        let slotId = existing[0]?.id;
        if (slotId === undefined) {
          const inserted = await tx.execute<{ id: string }>(sql`
            insert into public.schedule_slots (
              user_id, formation_id, module_id, kind, title, starts_at, ends_at,
              status, created_by, planner_key
            ) values (
              ${userId}::uuid, ${formationId}::uuid, null, 'mock_exam', ${title},
              ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
              'planned', 'planner', ${plannerKey}
            )
            returning id::text as id
          `);
          slotId = inserted[0]?.id;
        } else {
          await tx.execute(sql`
            update public.schedule_slots
            set title = ${title},
                starts_at = ${startsAt.toISOString()}::timestamptz,
                ends_at = ${endsAt.toISOString()}::timestamptz,
                updated_at = ${now.toISOString()}::timestamptz
            where id = ${slotId}::uuid
              and status = 'planned'
              and created_by <> 'learner'
          `);
        }
        if (slotId === undefined) continue;
        const storedRows = await tx.execute<{ starts_at: Date | string; ends_at: Date | string }>(sql`
          select starts_at, ends_at from public.schedule_slots where id = ${slotId}::uuid
        `);
        const stored = storedRows[0];
        if (stored === undefined) continue;
        scheduled.push({
          position: entry.position,
          date: entry.date,
          startsAt:
            stored.starts_at instanceof Date
              ? stored.starts_at.toISOString()
              : new Date(stored.starts_at).toISOString(),
          endsAt:
            stored.ends_at instanceof Date
              ? stored.ends_at.toISOString()
              : new Date(stored.ends_at).toISOString(),
          durationMin,
          slotId,
        });
      }
      return scheduled;
    });
  });
}
