// Formation planning services (SPEC-618 EF-2, ET-2, ET-4; BR-FOR-15, ADR-0016, ADR-0029).
//
// Resuming a paused formation replans it from the learner's local day. The pure planner of
// SPEC-407 builds the slots; this service only reads the formation, the rhythm and the existing
// slots, then reconciles them inside the caller's transaction so the status change and the new
// planning commit together.

import { ENGINE } from '@learny/config/product';
import { userLocalDay, type Clock } from '@learny/core';
import { sql, type DbTx } from '@learny/db';
import {
  planSchedule,
  type ExistingPlannerSlot,
  type PlannerChapter,
  type PlannerFormation,
  type PlannerModule,
  type SlotKind,
  type SlotStatus,
} from '@learny/learning-engine';

import { reconcilePlanSlots, type PlanReconciliationCounts } from '../learning/persist-plan';

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
