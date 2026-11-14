// Move of one agenda activity and BR-FOR-14 replanning (SPEC-705 EF-1 to EF-4, ET-1 to ET-5;
// BR-AGE-05, BR-FOR-14, BR-AUT-11; ADR-0029, ADR-0326).
//
// Every availability, local hour and projected end date comes from the pure planner of SPEC-407:
// `findCompatibleSlots` lists the three next free windows and `planSchedule` computes the three
// options and the incremental replanning. This service only reads the learner's rows behind RLS,
// persists the committed transition (old slot `moved`, new slot with `moved_from_id`, replay-safe
// automation action) and emits the domain event after the commit. A content version guards stale
// moves and stale plans (CL-2); the injected clock supplies every instant (ADR-0047).
import { createHash, randomUUID } from 'node:crypto';

import { ENGINE } from '@learny/config/product';
import type {
  AgendaDto,
  ReplanApplyInput,
  ReplanChoice,
  ReplanOption as ReplanOptionDto,
  ReplanOptionsDto,
  ReplanOutput,
  SlotAlternative,
  SlotAlternativesDto,
  SlotMoveInput,
  SlotMoveOutput,
} from '@learny/contracts';
import { AppError, addCivilDays, toUserZone, userLocalDay, type Result } from '@learny/core';
import { serviceDb, sql, type DbTx } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';
import {
  findCompatibleSlots,
  planSchedule,
  type ExistingPlannerSlot,
  type PlanResult,
  type PlanScheduleInput,
  type PlannerChapter,
  type PlannerFormation,
  type PlannerModule,
  type ReplanOption,
  type SlotKind,
  type SlotStatus,
} from '@learny/learning-engine';

import { getAgenda } from './agenda/get-agenda';
import { createAutomationActionQuiet } from './automations';
import type { ServiceContext } from './context';
import { reconcilePlanSlots } from './learning/persist-plan';
import { requireUser, toResult } from './resources/result';

/** Same fallbacks as the resume replanning of SPEC-618: a usable volume and horizon. */
const DEFAULT_MODULE_HOURS = 2;
const FALLBACK_HORIZON_DAYS = 120;
/** Automation journal key used for planning decisions (ADR-0326). */
const PLANNING_AUTOMATION = 'reprise' as const;
/** Share of the blocked module removed by the « alléger » preview (ADR-0326). */
const LIGHTEN_RATIO = 0.1;
/** Days displayed around the new slot in the refreshed agenda. */
const MOVE_WINDOW_DAYS = 3;

interface ProfileRow {
  timezone: string;
  hours_per_day: number | null;
  study_days: number[] | string[] | null;
  preferred_slots: string[] | null;
  [key: string]: unknown;
}

interface FormationRow {
  id: string;
  title: string;
  status: 'active' | 'paused' | 'completed' | 'draft' | 'programme_proposed';
  start_date: string | null;
  end_date: string | null;
  volume_hours: number | null;
  objectives: string[] | null;
  [key: string]: unknown;
}

interface ModuleRow {
  module_id: string;
  formation_id: string;
  position: number;
  title: string;
  status: 'locked' | 'open' | 'validated';
  planned_start: string | null;
  planned_end: string | null;
  chapter_id: string | null;
  chapter_position: number | null;
  chapter_title: string | null;
  [key: string]: unknown;
}

interface SlotRow {
  id: string;
  formation_id: string | null;
  module_id: string | null;
  kind: string;
  title: string;
  meta: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  status: string;
  activity_id: string | null;
  created_by: string;
  moved_from_id: string | null;
  group_milestone: boolean;
  [key: string]: unknown;
}

export interface PlanningContext {
  profile: ProfileRow;
  formation: FormationRow;
  modules: ModuleRow[];
  slots: SlotRow[];
}

function instantOf(value: Date | string): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** CL-1 — an identifier outside the schema is refused before any read or write. */
function assertUuid(value: string, field: string): string {
  if (!UUID.test(value)) {
    throw new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide.`, {
      errors: [{ path: field, message: 'identifiant UUID attendu' }],
    });
  }
  return value;
}

function isoOf(value: Date | string): string {
  return instantOf(value).toISOString();
}

function minutesOfWindow(startsAt: Date | string, endsAt: Date | string): number {
  return Math.max(
    0,
    Math.round((instantOf(endsAt).getTime() - instantOf(startsAt).getTime()) / 60_000),
  );
}

/** CL-2 — content version of one slot, independent of the frozen test clock. */
export function slotVersionOf(row: {
  id: string;
  starts_at: Date | string;
  ends_at: Date | string;
  status: string;
}): string {
  const canonical = [row.id, isoOf(row.starts_at), isoOf(row.ends_at), row.status].join('|');
  return `slot-${createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`;
}

export interface PlanVersionParts {
  formation: Pick<FormationRow, 'id' | 'end_date' | 'volume_hours'>;
  modules: readonly Pick<ModuleRow, 'module_id' | 'status' | 'planned_end'>[];
  slots: readonly Pick<SlotRow, 'id' | 'starts_at' | 'ends_at' | 'status'>[];
  hoursPerDay: number;
  studyDays: readonly number[];
}

/**
 * ET-4, CL-2 — deterministic plan version: hashing the content rather than `updated_at` keeps
 * two successive writes distinct even when the injected clock is fixed (ADR-0326).
 */
export function planVersionOf(parts: PlanVersionParts): string {
  const canonical = JSON.stringify({
    formation: {
      id: parts.formation.id,
      endDate: parts.formation.end_date,
      volumeHours: parts.formation.volume_hours,
    },
    modules: [...parts.modules]
      .map((module) => [module.module_id, module.status, module.planned_end])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    slots: [...parts.slots]
      .map((slot) => [slot.id, isoOf(slot.starts_at), isoOf(slot.ends_at), slot.status])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    hoursPerDay: parts.hoursPerDay,
    studyDays: [...parts.studyDays].sort((left, right) => left - right),
  });
  return `plan-${createHash('sha256').update(canonical).digest('hex').slice(0, 16)}`;
}

export function currentPlanVersion(context: PlanningContext): string {
  return planVersionOf({
    formation: context.formation,
    modules: context.modules,
    slots: context.slots,
    hoursPerDay: context.profile.hours_per_day ?? 2,
    studyDays: studyDaysOf(context.profile),
  });
}

function studyDaysOf(profile: ProfileRow): number[] {
  return (profile.study_days ?? [1, 2, 3, 4, 5])
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((left, right) => left - right);
}

function preferredSlotsOf(profile: ProfileRow): ('matin' | 'apres_midi' | 'soir')[] {
  const raw = (profile.preferred_slots ?? ['soir']).filter(
    (slot): slot is 'matin' | 'apres_midi' | 'soir' =>
      slot === 'matin' || slot === 'apres_midi' || slot === 'soir',
  );
  return raw.length === 0 ? ['soir'] : raw;
}

function plannerModules(modules: readonly ModuleRow[], hours: number): PlannerModule[] {
  const byModule = new Map<string, { module: ModuleRow; chapters: PlannerChapter[] }>();
  for (const row of modules) {
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
      ...(module.planned_end === null ? {} : { deadline: module.planned_end }),
    }));
}

function existingPlannerSlots(rows: readonly SlotRow[]): ExistingPlannerSlot[] {
  return rows
    .filter((row) => row.status !== 'cancelled')
    .map((row) => ({
      slotId: row.id,
      formationId: row.formation_id,
      moduleId: row.module_id,
      kind: row.kind as SlotKind,
      title: row.title,
      startsAt: isoOf(row.starts_at),
      endsAt: isoOf(row.ends_at),
      status: row.status as SlotStatus,
      createdBy:
        row.created_by === 'automation' || row.created_by === 'learner'
          ? row.created_by
          : 'planner',
      movedFromId: row.moved_from_id,
    }));
}

function plannerFormation(context: PlanningContext, endDate: string): PlannerFormation {
  const moduleCount = new Set(context.modules.map((module) => module.module_id)).size;
  const hours =
    moduleCount === 0
      ? DEFAULT_MODULE_HOURS
      : Math.max(
          1,
          Math.round(
            (context.formation.volume_hours ?? moduleCount * DEFAULT_MODULE_HOURS) / moduleCount,
          ),
        );
  return {
    formationId: context.formation.id,
    title: context.formation.title,
    endDate,
    status: 'active',
    objectives: (context.formation.objectives ?? []).filter(
      (objective): objective is 'operational' | 'exam' | 'dialogue' | 'project' =>
        objective === 'operational' ||
        objective === 'exam' ||
        objective === 'dialogue' ||
        objective === 'project',
    ),
    modules: plannerModules(context.modules, hours),
  };
}

/** ET-5 — the planner input of one formation; `overrides` only changes the previewed scenario. */
export function planInputOf(
  context: PlanningContext,
  now: Date,
  overrides: { endDate?: string; hoursPerDay?: number; slots?: readonly SlotRow[] } = {},
): PlanScheduleInput {
  const endDate =
    overrides.endDate ??
    context.formation.end_date ??
    addCivilDays(userLocalDay(now, context.profile.timezone), FALLBACK_HORIZON_DAYS);
  return {
    formations: [plannerFormation(context, endDate)],
    preferences: {
      tz: context.profile.timezone,
      availability: {
        hoursPerDay: overrides.hoursPerDay ?? context.profile.hours_per_day ?? 2,
        studyDays: studyDaysOf(context.profile).filter(
          (day): day is 1 | 2 | 3 | 4 | 5 | 6 | 7 => day >= 1 && day <= 7,
        ),
        preferredSlots: preferredSlotsOf(context.profile),
      },
    },
    params: ENGINE.planner,
    existingSlots: existingPlannerSlots(overrides.slots ?? context.slots),
    now: now.toISOString(),
  };
}

function daysBetween(from: string, to: string): number {
  const [fromYear = 0, fromMonth = 1, fromDay = 1] = from.split('-').map(Number);
  const [toYear = 0, toMonth = 1, toDay = 1] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000,
  );
}

export interface BlockedModuleView {
  formationId: string;
  moduleId: string;
  moduleNumber: number;
  title: string;
  reason: 'delayed' | 'quiz_failed';
}

/**
 * EF-2 — first module blocked by BR-FOR-14: quiz failed after its last planned margin, or at
 * least the configured delay on the planning. The planner's own `blockedModules` wins when given.
 */
export function blockedModuleOf(input: {
  modules: readonly ModuleRow[];
  slots: readonly SlotRow[];
  today: string;
  now: Date;
  plannerBlocked?: readonly string[];
  delayDays?: number;
}): BlockedModuleView | null {
  const delayDays = input.delayDays ?? ENGINE.planner.blockedDelayDays;
  const cutoff = addCivilDays(input.today, -delayDays);
  const ordered = [...input.modules].sort(
    (left, right) =>
      left.position - right.position || left.module_id.localeCompare(right.module_id),
  );
  for (const module of ordered) {
    if (module.status === 'validated') continue;
    const plannerSaysBlocked = input.plannerBlocked?.includes(module.module_id) === true;
    const delayed = module.planned_end !== null && module.planned_end <= cutoff;
    const failedQuiz = input.slots.some(
      (slot) =>
        slot.module_id === module.module_id &&
        slot.kind === 'validation_quiz' &&
        slot.status === 'missed',
    );
    const hasMarginLeft = input.slots.some(
      (slot) =>
        slot.module_id === module.module_id &&
        slot.kind === 'buffer' &&
        slot.status === 'planned' &&
        instantOf(slot.starts_at).getTime() > input.now.getTime(),
    );
    if (plannerSaysBlocked || delayed || (failedQuiz && !hasMarginLeft)) {
      return {
        formationId: module.formation_id,
        moduleId: module.module_id,
        moduleNumber: module.position,
        title: module.title,
        reason: failedQuiz && !hasMarginLeft ? 'quiz_failed' : 'delayed',
      };
    }
  }
  return null;
}

function scheduleOf(context: PlanningContext, input: PlanScheduleInput): PlanResult {
  return planSchedule(input);
}

function projectedEndOf(plan: PlanResult, formationId: string): string | null {
  return (
    plan.deadlines.find((deadline) => deadline.formationId === formationId)?.projectedEndDate ??
    null
  );
}

function plannerOptionsOf(plan: PlanResult, formationId: string): ReplanOption[] {
  return plan.options.filter((option) => option.formationId === formationId);
}

function optionDto(option: ReplanOption): ReplanOptionDto {
  return {
    kind: option.kind,
    feasible: option.feasible,
    reason: option.reason,
    currentEndDate: option.currentEndDate,
    projectedEndDate: option.projectedEndDate,
    extraDays: option.extraDays,
    currentHoursPerDay: option.currentHoursPerDay,
    newHoursPerDay: option.newHoursPerDay,
    removedMinutes: option.removedMinutes,
  };
}

/** Three deterministic previews when the deadline is not missed but a module is blocked. */
export function previewOptionsOf(
  context: PlanningContext,
  plan: PlanResult,
  now: Date,
  hoursPerDay: number,
): ReplanOptionDto[] {
  const endDate =
    context.formation.end_date ?? addCivilDays(userLocalDay(now, context.profile.timezone), 30);
  const projected = projectedEndOf(plan, context.formation.id) ?? endDate;
  const extraNeeded = Math.max(0, daysBetween(endDate, projected));
  const extraDays = Math.max(ENGINE.planner.blockedModuleExtraDays, extraNeeded);
  const shiftEnd = addCivilDays(endDate, extraDays);

  const maxHours = Math.min(ENGINE.planner.maxHoursPerDay, 24);
  const candidate = Math.min(Math.floor(hoursPerDay) + 1, maxHours);
  let volumeProjected = projected;
  let volumeFeasible = candidate > hoursPerDay;
  if (volumeFeasible) {
    const simulation = scheduleOf(context, planInputOf(context, now, { hoursPerDay: candidate }));
    volumeProjected = projectedEndOf(simulation, context.formation.id) ?? projected;
    volumeFeasible = volumeProjected <= endDate || volumeProjected < projected;
  }

  const moduleContent =
    context.modules.length === 0
      ? DEFAULT_MODULE_HOURS * 60
      : Math.max(
          1,
          Math.round(
            ((context.formation.volume_hours ?? context.modules.length * DEFAULT_MODULE_HOURS) *
              60) /
              new Set(context.modules.map((module) => module.module_id)).size,
          ),
        );
  const removedMinutes = Math.max(1, Math.round(moduleContent * LIGHTEN_RATIO));

  return [
    {
      kind: 'shift_end',
      feasible: true,
      reason: null,
      currentEndDate: endDate,
      projectedEndDate: shiftEnd > projected ? shiftEnd : projected,
      extraDays,
      currentHoursPerDay: hoursPerDay,
      newHoursPerDay: null,
      removedMinutes: null,
    },
    {
      kind: 'increase_volume',
      feasible: volumeFeasible,
      reason: volumeFeasible ? null : 'Volume quotidien déjà au maximum.',
      currentEndDate: endDate,
      projectedEndDate: volumeProjected,
      extraDays: null,
      currentHoursPerDay: hoursPerDay,
      newHoursPerDay: candidate,
      removedMinutes: null,
    },
    {
      kind: 'lighten',
      feasible: true,
      reason: null,
      currentEndDate: endDate,
      projectedEndDate: projected,
      extraDays: null,
      currentHoursPerDay: hoursPerDay,
      newHoursPerDay: null,
      removedMinutes,
    },
  ];
}

/** Always three entries, one per BR-FOR-14 option, in the presentation order. */
export function normalizeOptions(options: readonly ReplanOptionDto[]): ReplanOptionDto[] {
  const order: ReplanChoice[] = ['shift_end', 'increase_volume', 'lighten'];
  return order.map((kind) => {
    const found = options.find((option) => option.kind === kind);
    if (found !== undefined) return found;
    return {
      kind,
      feasible: false,
      reason: 'Option indisponible pour cette formation.',
      currentEndDate: options[0]?.currentEndDate ?? '2026-01-01',
      projectedEndDate: null,
      extraDays: null,
      currentHoursPerDay: options[0]?.currentHoursPerDay ?? 1,
      newHoursPerDay: null,
      removedMinutes: null,
    };
  });
}

function optionsFor(
  context: PlanningContext,
  now: Date,
): {
  plan: PlanResult;
  blocked: BlockedModuleView | null;
  options: ReplanOptionDto[];
} {
  const plan = scheduleOf(context, planInputOf(context, now));
  const deadline = plan.deadlines.find((entry) => entry.formationId === context.formation.id);
  const today = userLocalDay(now, context.profile.timezone);
  const blocked = blockedModuleOf({
    modules: context.modules,
    slots: context.slots,
    today,
    now,
    ...(deadline === undefined ? {} : { plannerBlocked: deadline.blockedModules }),
  });
  if (blocked === null) return { plan, blocked: null, options: [] };
  const plannerOptions = plannerOptionsOf(plan, context.formation.id).map(optionDto);
  const options =
    plannerOptions.length > 0
      ? plannerOptions
      : previewOptionsOf(context, plan, now, context.profile.hours_per_day ?? 2);
  return { plan, blocked, options: normalizeOptions(options) };
}

/** Reads the rows the planner needs for one formation, with the same visibility as the agenda. */
export async function readPlanningContext(
  tx: DbTx,
  userId: string,
  formationId: string,
  now: Date,
): Promise<PlanningContext> {
  const profileRows = await tx.execute<ProfileRow>(sql`
    select p.timezone,
           sp.hours_per_day,
           sp.study_days,
           sp.preferred_slots::text[] as preferred_slots
    from public.profiles p
    left join public.study_preferences sp on sp.user_id = p.id
    where p.id = ${userId}::uuid
  `);
  const profile = profileRows[0];
  if (profile === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');

  const formationRows = await tx.execute<FormationRow>(sql`
    select f.id::text as id,
           f.title,
           f.status::text as status,
           f.start_date::text as start_date,
           f.end_date::text as end_date,
           f.volume_hours,
           f.objectives::text[] as objectives
    from public.formations f
    where f.id = ${formationId}::uuid
      and (f.owner_id = ${userId}::uuid or exists (
        select 1 from public.groups g
        join public.group_members gm on gm.group_id = g.id
        where g.formation_id = f.id
          and gm.user_id = ${userId}::uuid
          and gm.member_status = 'active'
      ))
  `);
  const formation = formationRows[0];
  if (formation === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');

  const modules = await tx.execute<ModuleRow>(sql`
    select m.id::text as module_id,
           m.formation_id::text as formation_id,
           m.position::int as position,
           m.title,
           m.status::text as status,
           m.planned_start::text as planned_start,
           m.planned_end::text as planned_end,
           c.id::text as chapter_id,
           c.position::int as chapter_position,
           c.title as chapter_title
    from public.modules m
    left join public.chapters c on c.module_id = m.id
    where m.formation_id = ${formationId}::uuid
    order by m.position, c.position
  `);

  const slots = await tx.execute<SlotRow>(sql`
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           ss.activity_id::text as activity_id,
           ss.created_by::text as created_by,
           ss.moved_from_id::text as moved_from_id,
           ss.group_milestone
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.status in ('planned', 'done', 'missed', 'moved')
      and ss.ends_at >= ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz
  `);

  return { profile, formation, modules, slots };
}

function alternativeReasons(
  moment: 'matin' | 'apres_midi' | 'soir',
  date: string,
  context: PlanningContext,
  formationEnd: string | null,
): string[] {
  const reasons = ['Jour d’étude', 'Créneau libre'];
  if (preferredSlotsOf(context.profile).includes(moment)) {
    reasons.push(
      moment === 'matin'
        ? 'Moment préféré : matin'
        : moment === 'apres_midi'
          ? 'Moment préféré : après-midi'
          : 'Moment préféré : soir',
    );
  }
  if (formationEnd !== null && date <= formationEnd) reasons.push('Dans les dates de la formation');
  return reasons;
}

/** EF-1, ET-3 — three next compatible windows for one future slot, with their slot version. */
export function getSlotAlternatives(
  ctx: ServiceContext,
  slotId: string,
): Promise<Result<SlotAlternativesDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    assertUuid(slotId, 'params.sid');
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      const slotRows = await tx.execute<SlotRow>(sql`
        select ss.id::text as id,
               ss.formation_id::text as formation_id,
               ss.module_id::text as module_id,
               ss.kind::text as kind,
               ss.title,
               ss.meta,
               ss.starts_at,
               ss.ends_at,
               ss.status::text as status,
               ss.activity_id::text as activity_id,
               ss.created_by::text as created_by,
               ss.moved_from_id::text as moved_from_id,
               ss.group_milestone
        from public.schedule_slots ss
        where ss.id = ${slotId}::uuid
          and ss.user_id = ${userId}::uuid
        limit 1
      `);
      const slot = slotRows[0];
      if (slot === undefined) throw new AppError('NOT_FOUND', 'Créneau introuvable.');
      if (slot.status !== 'planned' || instantOf(slot.starts_at).getTime() <= now.getTime()) {
        throw new AppError('CONFLICT', 'Ce créneau ne peut plus être déplacé.', { status: 409 });
      }
      if (slot.formation_id === null) {
        throw new AppError('CONFLICT', 'Ce créneau n’appartient à aucune formation.', {
          status: 409,
        });
      }
      const context = await readPlanningContext(tx, userId, slot.formation_id, now);
      const durationMinutes = minutesOfWindow(slot.starts_at, slot.ends_at);
      const plannerCalendar = {
        now: now.toISOString(),
        params: ENGINE.planner,
        slots: existingPlannerSlots(context.slots),
      };
      const compatible = findCompatibleSlots(
        {
          durationMinutes,
          kind: slot.kind as SlotKind,
          formationId: slot.formation_id,
          moduleId: slot.module_id,
          title: slot.title,
        },
        plannerCalendar,
        {
          tz: context.profile.timezone,
          availability: planInputOf(context, now).preferences.availability,
        },
        12,
      );
      const formationEnd = context.formation.end_date;
      const alternatives: SlotAlternative[] = [];
      for (const candidate of compatible) {
        if (formationEnd !== null && candidate.date > formationEnd) continue;
        const wallStart = toUserZone(candidate.startsAt, context.profile.timezone);
        const wallEnd = toUserZone(candidate.endsAt, context.profile.timezone);
        alternatives.push({
          date: candidate.date,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
          startMinutes: wallStart.hour * 60 + wallStart.minute,
          endMinutes: wallEnd.hour * 60 + wallEnd.minute,
          moment: candidate.moment,
          reasons: alternativeReasons(candidate.moment, candidate.date, context, formationEnd),
        });
        if (alternatives.length === 3) break;
      }
      return {
        slotId,
        version: slotVersionOf(slot),
        timezone: context.profile.timezone,
        durationMinutes,
        day: userLocalDay(instantOf(slot.starts_at), context.profile.timezone),
        alternatives,
      };
    });
  });
}

function localLabel(startsAt: string, timezone: string): string {
  const wall = toUserZone(startsAt, timezone);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(wall.year)}-${pad(wall.month)}-${pad(wall.day)} ${pad(wall.hour)}:${pad(wall.minute)}`;
}

interface MoveTransactionResult {
  movedSlotId: string;
  explanation: string;
  created: boolean;
}

async function moveInTransaction(
  tx: DbTx,
  userId: string,
  slotId: string,
  input: SlotMoveInput,
  now: Date,
): Promise<MoveTransactionResult> {
  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended('agenda-move:' || ${userId}, 0))
  `);
  const slotRows = await tx.execute<SlotRow>(sql`
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           ss.activity_id::text as activity_id,
           ss.created_by::text as created_by,
           ss.moved_from_id::text as moved_from_id,
           ss.group_milestone
    from public.schedule_slots ss
    where ss.id = ${slotId}::uuid
      and ss.user_id = ${userId}::uuid
    limit 1
  `);
  const slot = slotRows[0];
  if (slot === undefined) throw new AppError('NOT_FOUND', 'Créneau introuvable.');

  // CA-3 — an identical replay is recognised from the state, not from the journal: the origin is
  // already `moved` with the same content the caller read, so its single successor is returned
  // without a second write or event.
  if (slot.status === 'moved') {
    const plannedVersion = slotVersionOf({ ...slot, status: 'planned' });
    if (plannedVersion === input.expectedVersion) {
      const successor = await tx.execute<{ id: string }>(sql`
        select id::text as id
        from public.schedule_slots
        where moved_from_id = ${slotId}::uuid
          and status in ('planned', 'done', 'missed')
        limit 1
      `);
      const movedSlotId = successor[0]?.id;
      if (movedSlotId !== undefined) {
        return {
          movedSlotId,
          explanation: 'Activité déjà déplacée.',
          created: false,
        };
      }
    }
    throw new AppError('CONFLICT', 'Ce créneau ne peut plus être déplacé.', { status: 409 });
  }
  if (slot.status !== 'planned' || instantOf(slot.starts_at).getTime() <= now.getTime()) {
    throw new AppError('CONFLICT', 'Ce créneau ne peut plus être déplacé.', { status: 409 });
  }
  if (slotVersionOf(slot) !== input.expectedVersion) {
    throw new AppError('CONFLICT', 'Ce créneau a changé : rechargez les alternatives.', {
      status: 409,
    });
  }

  const startsAt = instantOf(input.startsAt);
  const endsAt = instantOf(input.endsAt);
  if (startsAt.getTime() <= now.getTime()) {
    throw new AppError('VALIDATION_FAILED', 'Le nouveau créneau doit être à venir.', {
      errors: [{ path: 'body.startsAt', message: 'créneau futur attendu' }],
    });
  }
  if (minutesOfWindow(startsAt, endsAt) !== minutesOfWindow(slot.starts_at, slot.ends_at)) {
    throw new AppError('VALIDATION_FAILED', 'La durée de l’activité ne peut pas changer.', {
      errors: [{ path: 'body.endsAt', message: 'durée identique attendue' }],
    });
  }

  const overlaps = await tx.execute<{ id: string }>(sql`
    select id::text as id
    from public.schedule_slots
    where user_id = ${userId}::uuid
      and id <> ${slotId}::uuid
      and status in ('planned', 'done', 'missed')
      and starts_at < ${endsAt.toISOString()}::timestamptz
      and ends_at > ${startsAt.toISOString()}::timestamptz
    limit 1
  `);
  if (overlaps.length > 0) {
    throw new AppError(
      'CONFLICT',
      'Ce créneau vient d’être occupé : choisissez une autre option.',
      {
        status: 409,
        errors: [{ path: 'body.startsAt', message: 'créneau occupé' }],
      },
    );
  }

  const movedSlotId = randomUUID();
  await tx.execute(sql`
    update public.schedule_slots
    set status = 'moved',
        updated_at = ${now.toISOString()}::timestamptz
    where id = ${slotId}::uuid
      and user_id = ${userId}::uuid
      and status = 'planned'
  `);
  const inserted = await tx.execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      id, user_id, formation_id, module_id, kind, title, meta, starts_at, ends_at,
      status, activity_id, created_by, moved_from_id, group_milestone, created_at, updated_at
    ) values (
      ${movedSlotId}::uuid, ${userId}::uuid, ${slot.formation_id}::uuid, ${slot.module_id}::uuid,
      ${slot.kind}::slot_kind, ${slot.title}, ${slot.meta},
      ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
      'planned', ${slot.activity_id}::uuid, 'learner', ${slotId}::uuid, ${slot.group_milestone},
      ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz
    )
    returning id::text as id
  `);
  if (inserted[0] === undefined) throw new AppError('INTERNAL_ERROR', 'Créneau non déplacé.');
  const storedSlotId = inserted[0].id;
  const timezone = (
    await tx.execute<{ timezone: string }>(sql`
      select timezone from public.profiles where id = ${userId}::uuid
    `)
  )[0]?.timezone;
  const label = localLabel(startsAt.toISOString(), timezone ?? 'Europe/Paris');
  const explanation = `Activité déplacée au ${label}. Les marges restantes sont recalculées.`;
  return { movedSlotId: storedSlotId, explanation, created: true };
}

async function refreshedAgenda(
  ctx: ServiceContext,
  startsAt: string,
  timezone: string,
): Promise<AgendaDto> {
  const day = userLocalDay(startsAt, timezone);
  const result = await getAgenda(ctx, {
    from: addCivilDays(day, -MOVE_WINDOW_DAYS),
    to: addCivilDays(day, MOVE_WINDOW_DAYS),
    formation: 'all',
  });
  if (!result.ok) throw result.error;
  return result.value;
}

/** ET-3 — moves one future activity and returns the refreshed agenda around its new day. */
export function moveSlot(
  ctx: ServiceContext,
  slotId: string,
  input: SlotMoveInput,
): Promise<Result<SlotMoveOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    assertUuid(slotId, 'params.sid');
    const now = ctx.clock.now();
    if (
      Number.isNaN(instantOf(input.startsAt).getTime()) ||
      Number.isNaN(instantOf(input.endsAt).getTime())
    ) {
      throw new AppError('VALIDATION_FAILED', 'Les horaires choisis sont invalides.');
    }
    const moved = await db.run((tx) => moveInTransaction(tx, userId, slotId, input, now));
    const timezone =
      (
        await db.run((tx) =>
          tx.execute<{ timezone: string }>(sql`
          select timezone from public.profiles where id = ${userId}::uuid
        `),
        )
      )[0]?.timezone ?? 'Europe/Paris';
    const agenda = await refreshedAgenda(ctx, input.startsAt, timezone);
    const movedSlot = agenda.slots.find((slot) => slot.id === moved.movedSlotId);
    if (movedSlot === undefined) {
      throw new AppError('INTERNAL_ERROR', 'Le créneau déplacé est absent de l’agenda.');
    }
    if (moved.created) {
      await emitAfterCommit(
        db,
        'agenda/slot-moved',
        {
          userId,
          slotId,
          newSlotId: moved.movedSlotId,
          formationId: movedSlot.formationId,
          startsAt: movedSlot.startsAt,
        },
        { id: `agenda-move:${slotId}` },
      );
    }
    return {
      movedSlot,
      replacedSlotId: slotId,
      version: slotVersionOf({
        id: movedSlot.id,
        starts_at: movedSlot.startsAt,
        ends_at: movedSlot.endsAt,
        status: movedSlot.status,
      }),
      explanation: moved.explanation,
      agenda,
    };
  });
}

/** ET-4 — the three scenarios and their preview, without any write. */
export function getReplanOptions(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<ReplanOptionsDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    assertUuid(formationId, 'params.fid');
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      const context = await readPlanningContext(tx, userId, formationId, now);
      const computed = optionsFor(context, now);
      return {
        formationId,
        planVersion: currentPlanVersion(context),
        blocked: computed.blocked,
        currentEndDate:
          context.formation.end_date ??
          addCivilDays(userLocalDay(now, context.profile.timezone), 30),
        currentHoursPerDay: context.profile.hours_per_day ?? 2,
        options: computed.options,
      };
    });
  });
}

interface ReplanTransactionResult {
  outcome: ReplanOutput['outcome'];
  explanation: string;
  endDate: string | null;
  hoursPerDay: number;
  consentActionId: string | null;
  actionId: string | null;
  created: boolean;
}

function replanExplanation(choice: ReplanChoice, option: ReplanOptionDto, endDate: string): string {
  if (choice === 'shift_end') {
    return `La fin de la formation est décalée au ${endDate} pour absorber le retard.`;
  }
  if (choice === 'increase_volume') {
    return `Le volume quotidien passe à ${String(option.newHoursPerDay)} h pour absorber le retard.`;
  }
  return `Le programme est allégé de ${String(option.removedMinutes)} min ; votre accord est requis.`;
}

async function applyReplanInTransaction(
  tx: DbTx,
  userId: string,
  formationId: string,
  input: ReplanApplyInput,
  now: Date,
): Promise<ReplanTransactionResult> {
  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended('agenda-replan:' || ${userId} || ':' || ${formationId}, 0))
  `);
  const context = await readPlanningContext(tx, userId, formationId, now);
  const version = currentPlanVersion(context);
  const hours = context.profile.hours_per_day ?? 2;
  const endDate = context.formation.end_date;
  if (version !== input.expectedPlanVersion) {
    throw new AppError(
      'CONFLICT',
      'Le planning a changé : rechargez les options de réajustement.',
      {
        status: 409,
      },
    );
  }
  const computed = optionsFor(context, now);
  if (computed.blocked === null) {
    throw new AppError('CONFLICT', 'Aucun module n’est bloqué pour cette formation.', {
      status: 409,
    });
  }
  const chosen = computed.options.find((option) => option.kind === input.choice);
  if (chosen === undefined || !chosen.feasible) {
    throw new AppError(
      'CONFLICT',
      chosen?.reason ?? 'Cette option ne permet pas de tenir l’échéance.',
      { status: 409 },
    );
  }

  if (input.choice === 'lighten') {
    return {
      outcome: 'consent_required',
      explanation: replanExplanation(input.choice, chosen, endDate ?? ''),
      endDate,
      hoursPerDay: hours,
      consentActionId: null,
      actionId: null,
      created: false,
    };
  }

  let nextEnd = endDate;
  let nextHours = hours;
  if (input.choice === 'shift_end') {
    nextEnd = chosen.projectedEndDate ?? endDate;
    if (nextEnd === null || nextEnd === endDate) {
      return {
        outcome: 'unchanged',
        explanation: 'Aucun changement nécessaire : la fin prévue tient déjà.',
        endDate,
        hoursPerDay: hours,
        consentActionId: null,
        actionId: null,
        created: false,
      };
    }
    await tx.execute(sql`
      update public.formations
      set end_date = ${nextEnd},
          updated_at = ${now.toISOString()}::timestamptz
      where id = ${formationId}::uuid
        and owner_id = ${userId}::uuid
    `);
  } else {
    nextHours = chosen.newHoursPerDay ?? hours;
    if (nextHours <= hours) {
      return {
        outcome: 'unchanged',
        explanation: 'Aucun changement nécessaire : le volume quotidien est déjà suffisant.',
        endDate,
        hoursPerDay: hours,
        consentActionId: null,
        actionId: null,
        created: false,
      };
    }
    await tx.execute(sql`
      update public.study_preferences
      set hours_per_day = ${nextHours},
          updated_at = ${now.toISOString()}::timestamptz
      where user_id = ${userId}::uuid
    `);
  }

  const refreshed = await readPlanningContext(tx, userId, formationId, now);
  const replanned = scheduleOf(refreshed, planInputOf(refreshed, now));
  await reconcilePlanSlots(tx, userId, formationId, replanned.slots, now);
  const explanation = replanExplanation(input.choice, chosen, nextEnd ?? '');
  return {
    outcome: 'applied',
    explanation,
    endDate: nextEnd,
    hoursPerDay: nextHours,
    consentActionId: null,
    actionId: null,
    created: true,
  };
}

interface LightenProposal {
  actionId: string | null;
  created: boolean;
}

/**
 * BR-AUT-11 — the lightening proposal belongs to the automation journal, whose creation is
 * reserved to the service role (RLS). It is written right after the (unchanged) planning
 * transaction, with its dedupe key so a reproduced click returns the same pending action.
 */
async function recordLightenProposal(input: {
  userId: string;
  formationId: string;
  explanation: string;
  removedMinutes: number | null;
  expectedPlanVersion: string;
  now: Date;
}): Promise<LightenProposal> {
  const dedupeKey = `replan:${input.formationId}:${input.expectedPlanVersion}:lighten`;
  const result = await serviceDb().transaction((tx) =>
    createAutomationActionQuiet(tx, {
      userId: input.userId,
      formationId: input.formationId,
      automation: PLANNING_AUTOMATION,
      kind: 'plan_lightened',
      summary: input.explanation,
      payload: {
        dedupeKey,
        choice: 'lighten',
        removedMinutes: input.removedMinutes,
      },
      requiresConsent: true,
      createdAt: input.now,
    }),
  );
  const actionId = result.action?.id ?? null;
  if (result.created && actionId !== null) {
    await emitAfterCommit(
      serviceDb(),
      'automation/action-proposed',
      { userId: input.userId, actionId, automation: PLANNING_AUTOMATION },
      { id: `agenda-replan-proposed:${actionId}` },
    );
  }
  return { actionId, created: result.created };
}

/** ET-4, EF-3 — applies the explicit choice and replans future slots atomically. */
export function applyReplan(
  ctx: ServiceContext,
  formationId: string,
  input: ReplanApplyInput,
): Promise<Result<ReplanOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    assertUuid(formationId, 'params.fid');
    const now = ctx.clock.now();
    const result = await db.run((tx) =>
      applyReplanInTransaction(tx, userId, formationId, input, now),
    );
    const context = await db.run((tx) => readPlanningContext(tx, userId, formationId, now));
    const planVersion = currentPlanVersion(context);
    let consentActionId: string | null = null;
    if (result.outcome === 'consent_required') {
      const proposal = await recordLightenProposal({
        userId,
        formationId,
        explanation: result.explanation,
        removedMinutes: null,
        expectedPlanVersion: input.expectedPlanVersion,
        now,
      });
      consentActionId = proposal.actionId;
    } else if (result.outcome === 'applied') {
      await emitAfterCommit(
        db,
        'plan/replanned',
        { userId, formationId, choice: input.choice, planVersion },
        {
          id: `plan-replanned:${formationId}:${input.expectedPlanVersion}:${input.choice}`,
        },
      );
    }
    return {
      outcome: result.outcome,
      formationId,
      planVersion,
      explanation: result.explanation,
      endDate: result.endDate,
      hoursPerDay: result.hoursPerDay,
      consentActionId,
    };
  });
}
