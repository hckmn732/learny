// « Sprint avant un jalon » (SPEC-719, BR-AUT-08, ADR-0190).
//
// Before each validation quiz or mock exam, two 30-minute sprints are planned on the local days
// J-K and J-1. The pure helpers compute the local target days (never a 24-hour duration, ET-5),
// rank the weakest notions (mastery ascending, stable identifier on ties) and place the two slots
// with the planner of SPEC-407. The definition only turns that plan into one replay-safe
// `sprint_planned` action: `apply` cancels the future sprints of a moved milestone, keeps the ones
// already done and inserts the new `sprint` slots. `undo` cancels only future, unconsumed slots.
import { z } from 'zod';

import { ENGINE } from '@learny/config/product';
import {
  SPRINT_PLANNED_KIND,
  SprintParams,
  SprintPlanResult,
  SprintTrigger,
  sprintDedupeKey,
  type SprintImpossibleTarget,
  type SprintPlanView,
  type SprintPlannedSlot,
} from '@learny/contracts';
import {
  AppError,
  addCivilDays,
  ok,
  startOfUserDay,
  toInstant,
  userLocalDay,
  type Result,
} from '@learny/core';
import { serviceDb, sql, type Db, type DbTx } from '@learny/db';
import {
  findCompatibleSlots,
  type CompatibleSlot,
  type ExistingPlannerSlot,
  type PlannerCalendar,
  type PlannerPreferences,
  type SlotKind,
  type SlotStatus,
} from '@learny/learning-engine';
import type { ServiceContext } from '@learny/services';

import {
  defineAutomation,
  runAutomation,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
  type AutomationDomainContext,
  type AutomationEffectContext,
  type AutomationTone,
  type AutomationTrigger,
} from './moteur-d-automatismes';
import { formatDayInSentence, formatHour } from './reprise';

const SUMMARY_MAX = 160;
const NOTION_LIMIT = 6;

const uuidSchema = z.uuid();

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export interface SprintTargetDay {
  label: 'J-K' | 'J-1';
  day: string;
}

/**
 * EF-1, ET-5 — J-K and J-1 as local civil days. `addCivilDays` keeps the calendar day across a DST
 * change, so the targets are never a 24-hour duration around the clock shift.
 */
export function sprintTargetDays(examDate: string, daysBefore: number): SprintTargetDay[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    throw new AppError('VALIDATION_FAILED', 'Date d’épreuve invalide.');
  }
  if (daysBefore < 1 || daysBefore > 30) {
    throw new AppError('VALIDATION_FAILED', 'Délai K invalide.');
  }
  return [
    { label: 'J-K', day: addCivilDays(examDate, -daysBefore) },
    { label: 'J-1', day: addCivilDays(examDate, -1) },
  ];
}

export interface SprintNotionCandidate {
  notionId: string;
  label: string;
  mastery: number;
}

/**
 * ET-3 — weakest notions first; equal mastery falls back to the stable notion identifier so two
 * runs on the same data always target the same notions.
 */
export function selectWeakestNotions(
  rows: readonly SprintNotionCandidate[],
  limit = NOTION_LIMIT,
): SprintNotionCandidate[] {
  return [...rows]
    .filter((row) => row.notionId !== '')
    .sort(
      (left, right) =>
        left.mastery - right.mastery ||
        (left.notionId < right.notionId ? -1 : left.notionId > right.notionId ? 1 : 0),
    )
    .slice(0, Math.max(0, limit));
}

export interface SprintPlacementInput {
  examDate: string;
  examSlotId: string;
  formationId: string;
  moduleId: string | null;
  daysBefore: number;
  durationMin: number;
  now: Date;
  timeZone: string;
  preferences: PlannerPreferences;
  slots: readonly ExistingPlannerSlot[];
}

export interface SprintPlacement {
  targets: SprintPlannedSlot[];
  impossible: SprintImpossibleTarget[];
  /** Slots that must be treated as busy by the following placement. */
  reserved: ExistingPlannerSlot[];
}

function studyDaysOf(preferences: PlannerPreferences): Set<number> {
  return new Set(preferences.availability.studyDays);
}

function isoWeekdayOf(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** EF-2, CL-3 — place one 30-minute sprint per target day with the planner of SPEC-407. */
export function placeSprintTargets(input: SprintPlacementInput): SprintPlacement {
  const today = userLocalDay(input.now, input.timeZone);
  const studyDays = studyDaysOf(input.preferences);
  const reserved: ExistingPlannerSlot[] = [];
  const slots: ExistingPlannerSlot[] = [...input.slots];
  const targets: SprintPlannedSlot[] = [];
  const impossible: SprintImpossibleTarget[] = [];

  for (const target of sprintTargetDays(input.examDate, input.daysBefore)) {
    if (target.day < today) {
      impossible.push({ label: target.label, day: target.day, reason: 'past' });
      continue;
    }
    if (!studyDays.has(isoWeekdayOf(target.day))) {
      impossible.push({ label: target.label, day: target.day, reason: 'no_study_day' });
      continue;
    }
    const dayStart = startOfUserDay(target.day, input.timeZone);
    const cursor = dayStart.getTime() > input.now.getTime() ? dayStart : input.now;
    const calendar: PlannerCalendar = {
      now: cursor.toISOString(),
      params: ENGINE.planner,
      slots,
    };
    let candidates: CompatibleSlot[];
    try {
      candidates = findCompatibleSlots(
        {
          durationMinutes: input.durationMin,
          kind: 'sprint',
          formationId: input.formationId,
          moduleId: input.moduleId,
          title: 'Sprint',
        },
        calendar,
        input.preferences,
        12,
      );
    } catch {
      candidates = [];
    }
    const chosen = candidates.find((candidate) => candidate.date === target.day);
    if (chosen === undefined) {
      impossible.push({ label: target.label, day: target.day, reason: 'no_slot' });
      continue;
    }
    targets.push({
      label: target.label,
      day: target.day,
      slotId: null,
      startsAt: chosen.startsAt,
      endsAt: chosen.endsAt,
      durationMin: input.durationMin,
    });
    const booked: ExistingPlannerSlot = {
      slotId: `sprint:${input.examSlotId}:${target.day}`,
      formationId: input.formationId,
      moduleId: input.moduleId,
      kind: 'sprint',
      title: 'Sprint',
      startsAt: chosen.startsAt,
      endsAt: chosen.endsAt,
      status: 'planned',
      createdBy: 'automation',
      movedFromId: null,
    };
    slots.push(booked);
    reserved.push(booked);
  }
  return { targets, impossible, reserved };
}

function slotSentence(slot: SprintPlannedSlot, timeZone: string): string {
  return `${formatDayInSentence(slot.day, slot.startsAt, timeZone)} à ${formatHour(slot.startsAt, timeZone)}`;
}

function clip(value: string): string {
  return value.length <= SUMMARY_MAX ? value : `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

/** EF-2, §10 — one line explaining the selected notions, the milestone and the two dates. */
export function explainSprint(
  action: AutomationActionView,
  tone: AutomationTone,
  timeZone: string,
): string {
  const payload = action.payload;
  const examTitle = stringOf(payload.examTitle, 'l’épreuve');
  const targets = Array.isArray(payload.targets) ? (payload.targets as SprintPlannedSlot[]) : [];
  const impossible = Array.isArray(payload.impossible)
    ? (payload.impossible as SprintImpossibleTarget[])
    : [];
  const notionLabels = Array.isArray(payload.notionLabels)
    ? (payload.notionLabels as string[])
    : [];
  const duration = numberOr(payload.durationMin, 30);
  const prefix =
    action.status === 'undone'
      ? 'Annulé : '
      : action.status === 'declined'
        ? 'Refusé : '
        : action.status === 'expired'
          ? 'Expiré : '
          : '';
  if (action.status === 'undone') {
    return clip(
      `${prefix}sprints avant « ${examTitle} » retirés ; les créneaux déjà faits restent dans l’historique.`,
    );
  }
  const dates =
    targets.length === 0
      ? 'aucun créneau compatible'
      : targets
          .map((target) => slotSentence(target, timeZone))
          .join(' et ')
          .replace(/^./, (value) => value.toUpperCase());
  const notions =
    notionLabels.length === 0 ? '' : ` · notions ciblées : ${notionLabels.slice(0, 3).join(', ')}`;
  const missing =
    impossible.length === 0
      ? ''
      : ` · ${String(impossible.length)} jour(s) impossible(s) expliqué(s)`;
  const tu = tone === 'tu';
  return clip(
    `${prefix}${tu ? 'Tes' : 'Vos'} sprints de ${String(duration)} min avant « ${examTitle} » : ${dates}${notions}${missing}.`,
  );
}

function stringOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dbInstant(value: Date | string): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

interface ProfileRow {
  [key: string]: unknown;
  timezone: string;
  hours_per_day: number | null;
  study_days: number[] | string[] | null;
  preferred_slots: string[] | null;
}

interface MilestoneRow {
  [key: string]: unknown;
  id: string;
  formation_id: string;
  module_id: string | null;
  kind: string;
  title: string;
  starts_at: Date | string;
  ends_at: Date | string;
  status: string;
  formation_title: string;
  formation_status: string;
  module_title: string | null;
}

interface SlotRow {
  [key: string]: unknown;
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
}

async function readProfile(db: Db | DbTx, userId: string): Promise<ProfileRow> {
  const rows = await db.execute<ProfileRow>(sql`
    select p.timezone,
           sp.hours_per_day,
           sp.study_days,
           sp.preferred_slots::text[] as preferred_slots
    from public.profiles p
    left join public.study_preferences sp on sp.user_id = p.id
    where p.id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return row;
}

function preferencesOf(profile: ProfileRow): PlannerPreferences {
  const slots = (profile.preferred_slots ?? ['soir']).filter(
    (slot): slot is 'matin' | 'apres_midi' | 'soir' =>
      slot === 'matin' || slot === 'apres_midi' || slot === 'soir',
  );
  return {
    tz: profile.timezone,
    availability: {
      hoursPerDay: profile.hours_per_day ?? 2,
      studyDays: (profile.study_days ?? [1, 2, 3, 4, 5])
        .map((day) => Number(day))
        .filter((day): day is 1 | 2 | 3 | 4 | 5 | 6 | 7 => day >= 1 && day <= 7)
        .sort((left, right) => left - right),
      preferredSlots: slots.length === 0 ? ['soir'] : slots,
    },
  };
}

async function readSlots(db: Db | DbTx, userId: string, now: Date): Promise<ExistingPlannerSlot[]> {
  const rows = await db.execute<SlotRow>(sql`
    select id::text as id,
           formation_id::text as formation_id,
           module_id::text as module_id,
           kind::text as kind,
           title,
           starts_at,
           ends_at,
           status::text as status,
           created_by::text as created_by,
           moved_from_id::text as moved_from_id
    from public.schedule_slots
    where user_id = ${userId}::uuid
      and status in ('planned', 'done', 'missed')
      and ends_at >= ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz
  `);
  return rows.map((row) => ({
    slotId: row.id,
    formationId: row.formation_id,
    moduleId: row.module_id,
    kind: row.kind as SlotKind,
    title: row.title,
    startsAt: dbInstant(row.starts_at).toISOString(),
    endsAt: dbInstant(row.ends_at).toISOString(),
    status: row.status as SlotStatus,
    createdBy:
      row.created_by === 'automation' || row.created_by === 'learner' ? row.created_by : 'planner',
    movedFromId: row.moved_from_id,
  }));
}

async function readMilestones(
  db: Db | DbTx,
  userId: string,
  options: { examSlotId?: string | undefined; formationId?: string | undefined; now: Date },
): Promise<MilestoneRow[]> {
  const exam = options.examSlotId === undefined ? null : sql`ss.id = ${options.examSlotId}::uuid`;
  const formation =
    options.formationId === undefined
      ? sql`f.status = 'active'`
      : sql`f.id = ${options.formationId}::uuid and f.status = 'active'`;
  const rows = await db.execute<MilestoneRow>(sql`
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.kind::text as kind,
           ss.title,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           f.title as formation_title,
           f.status::text as formation_status,
           m.title as module_title
    from public.schedule_slots ss
    join public.formations f on f.id = ss.formation_id
    left join public.modules m on m.id = ss.module_id
    where ss.user_id = ${userId}::uuid
      and ss.kind in ('validation_quiz', 'mock_exam')
      and ${formation}
      ${exam === null ? sql`` : sql`and ${exam}`}
    order by ss.starts_at asc
  `);
  return rows
    .filter((row) => row.status === 'planned')
    .filter((row) => dbInstant(row.starts_at).getTime() > options.now.getTime())
    .map((row) => ({
      ...row,
      starts_at: dbInstant(row.starts_at),
      ends_at: dbInstant(row.ends_at),
    }));
}

interface NotionRow {
  [key: string]: unknown;
  notion_id: string;
  label: string;
  mastery: number;
}

async function readWeakestNotions(
  db: Db | DbTx,
  userId: string,
  formationId: string,
  moduleId: string | null,
): Promise<SprintNotionCandidate[]> {
  const module = moduleId === null ? sql`` : sql`and n.module_id = ${moduleId}::uuid`;
  const rows = await db.execute<NotionRow>(sql`
    select n.id::text as notion_id,
           n.label,
           ns.mastery::float8 as mastery
    from public.notions n
    join public.notion_states ns on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
    where n.formation_id = ${formationId}::uuid
      ${module}
    order by ns.mastery asc, n.id asc
  `);
  return selectWeakestNotions(
    rows.map((row) => ({
      notionId: row.notion_id,
      label: row.label,
      mastery: row.mastery,
    })),
  );
}

/* ------------------------------------------------------------------ */
/* Drafts                                                              */
/* ------------------------------------------------------------------ */

function draftFor(
  row: MilestoneRow,
  profile: ProfileRow,
  notions: readonly SprintNotionCandidate[],
  placement: SprintPlacement,
  params: { daysBefore: number; durationMin: number },
): AutomationActionDraft {
  if (placement.targets.length === 0) {
    throw new AppError('VALIDATION_FAILED', 'Aucun créneau de sprint compatible.');
  }
  const examDate = userLocalDay(dbInstant(row.starts_at), profile.timezone);
  const dedupeKey = sprintDedupeKey(row.id, examDate, params.daysBefore);
  const payload = {
    dedupeKey,
    formationId: row.formation_id,
    examSlotId: row.id,
    examKind: row.kind as 'validation_quiz' | 'mock_exam',
    examDate,
    examTitle: row.title,
    moduleId: row.module_id,
    moduleTitle: row.module_title,
    daysBefore: params.daysBefore,
    durationMin: params.durationMin,
    notionIds: notions.map((notion) => notion.notionId),
    notionLabels: notions.map((notion) => notion.label),
    targets: placement.targets,
    impossible: placement.impossible,
  };
  return {
    kind: SPRINT_PLANNED_KIND,
    formationId: row.formation_id,
    requiresConsent: false,
    payload,
    dedupeKey,
  };
}

async function sprintDrafts(
  ctx: AutomationDomainContext<z.infer<typeof SprintParams>>,
  trigger: AutomationTrigger,
): Promise<AutomationActionDraft[]> {
  const db = ctx.db as DbTx;
  const profile = await readProfile(db, ctx.userId);
  const context: { examSlotId?: string | undefined; formationId?: string | undefined } = {};
  if (trigger.type === 'direct') {
    const parsed = SprintTrigger.safeParse(trigger.data ?? {});
    if (parsed.success) {
      context.formationId = parsed.data.formationId;
      if (parsed.data.examSlotId !== undefined) context.examSlotId = parsed.data.examSlotId;
    }
  } else if (trigger.type === 'event' && trigger.name === 'agenda/slot-moved') {
    const moved = z
      .object({ newSlotId: uuidSchema, formationId: uuidSchema.nullable().optional() })
      .safeParse(trigger.data ?? {});
    if (moved.success) {
      context.examSlotId = moved.data.newSlotId;
      if (typeof moved.data.formationId === 'string') context.formationId = moved.data.formationId;
    }
  }

  const milestones = await readMilestones(db, ctx.userId, { ...context, now: ctx.now });
  const slots = await readSlots(db, ctx.userId, ctx.now);
  const preferences = preferencesOf(profile);
  const drafts: AutomationActionDraft[] = [];
  for (const row of milestones) {
    const notions = await readWeakestNotions(
      db,
      ctx.userId,
      row.formation_id,
      row.kind === 'mock_exam' ? null : row.module_id,
    );
    // CL-5 — no studied notion: no empty sprint and no action.
    if (notions.length === 0) continue;
    const examDate = userLocalDay(dbInstant(row.starts_at), profile.timezone);
    const placement = placeSprintTargets({
      examDate,
      examSlotId: row.id,
      formationId: row.formation_id,
      moduleId: row.module_id,
      daysBefore: ctx.params.daysBefore,
      durationMin: ctx.params.durationMin,
      now: ctx.now,
      timeZone: profile.timezone,
      preferences,
      slots,
    });
    if (placement.targets.length === 0) continue;
    slots.push(...placement.reserved);
    drafts.push(
      draftFor(row, profile, notions, placement, {
        daysBefore: ctx.params.daysBefore,
        durationMin: ctx.params.durationMin,
      }),
    );
  }
  return drafts;
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

function sprintMeta(payload: Record<string, unknown>): string {
  const labels = Array.isArray(payload.notionLabels) ? (payload.notionLabels as string[]) : [];
  const examDate = stringOf(payload.examDate);
  const examTitle = stringOf(payload.examTitle, 'l’épreuve');
  const notions = labels.slice(0, 3).join(', ');
  return `Notions ciblées : ${notions} · sprint avant « ${examTitle} » du ${examDate}`.slice(
    0,
    1000,
  );
}

async function applySprint(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<{ payload: Record<string, unknown>; undoPayload: Record<string, unknown> }>> {
  const payload = action.payload;
  const formationId = stringOf(payload.formationId, action.formationId ?? '');
  const examSlotId = stringOf(payload.examSlotId);
  if (formationId === '' || examSlotId === '') {
    throw new AppError('VALIDATION_FAILED', 'Sprint incomplet.');
  }
  const moduleId = stringOf(payload.moduleId);
  const targets = Array.isArray(payload.targets) ? (payload.targets as SprintPlannedSlot[]) : [];
  const title = `Sprint · ${stringOf(payload.examTitle, 'épreuve')}`;
  const meta = sprintMeta(payload);

  // EF-3 — cancel only the future sprints of this milestone; a done sprint stays untouched.
  await ctx.tx.execute(sql`
    update public.schedule_slots
    set status = 'cancelled', updated_at = ${ctx.now.toISOString()}::timestamptz
    where user_id = ${ctx.userId}::uuid
      and formation_id = ${formationId}::uuid
      and kind = 'sprint'
      and status = 'planned'
      and planner_key like ${`sprint:${examSlotId}:%`}
  `);

  const appliedTargets: SprintPlannedSlot[] = [];
  for (const target of targets) {
    const startsAt = toInstant(target.startsAt);
    if (startsAt.getTime() <= ctx.now.getTime()) continue;
    const plannerKey = `sprint:${examSlotId}:${target.day}`;
    const rows = await ctx.tx.execute<{ id: string }>(sql`
      insert into public.schedule_slots (
        user_id, formation_id, module_id, kind, title, meta,
        starts_at, ends_at, status, created_by, planner_key
      ) values (
        ${ctx.userId}::uuid, ${formationId}::uuid,
        ${moduleId === '' ? null : moduleId}::uuid,
        'sprint', ${title}, ${meta},
        ${toInstant(target.startsAt).toISOString()}::timestamptz,
        ${toInstant(target.endsAt).toISOString()}::timestamptz,
        'planned', 'automation', ${plannerKey}
      )
      returning id::text as id
    `);
    const slotId = rows[0]?.id;
    if (slotId === undefined) throw new AppError('INTERNAL_ERROR', 'Créneau de sprint non créé.');
    appliedTargets.push({ ...target, slotId, startsAt: startsAt.toISOString() });
  }

  return ok({
    payload: {
      ...payload,
      targets: appliedTargets,
      appliedAt: ctx.now.toISOString(),
    },
    undoPayload: {
      examSlotId,
      slotIds: appliedTargets
        .map((target) => target.slotId)
        .filter((id): id is string => typeof id === 'string' && id !== ''),
    },
  });
}

async function undoSprint(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<Record<string, unknown> | null>> {
  const undo = action.undoPayload ?? {};
  const slotIds = Array.isArray(undo.slotIds) ? (undo.slotIds as string[]) : [];
  for (const slotId of slotIds) {
    if (!uuidSchema.safeParse(slotId).success) continue;
    await ctx.tx.execute(sql`
      update public.schedule_slots
      set status = 'cancelled', updated_at = ${ctx.now.toISOString()}::timestamptz
      where id = ${slotId}::uuid
        and user_id = ${ctx.userId}::uuid
        and kind = 'sprint'
        and status = 'planned'
        and starts_at > ${ctx.now.toISOString()}::timestamptz
    `);
  }
  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export const sprintAutomation: AutomationDefinition<typeof SprintParams> = defineAutomation({
  key: 'sprint',
  triggers: [
    { type: 'direct' },
    // SPEC-705 emits `agenda/slot-moved` with the new slot identifier: a moved milestone is
    // replanned from its new local date, while the finished sprints stay in the history.
    { type: 'event', name: 'agenda/slot-moved' },
  ],
  params: SprintParams,
  run: (ctx, trigger) => sprintDrafts(ctx, trigger),
  explain: explainSprint,
  apply: applySprint,
  undo: undoSprint,
});

/* ------------------------------------------------------------------ */
/* Service + route                                                     */
/* ------------------------------------------------------------------ */

function requireUser(ctx: ServiceContext): {
  userId: string;
  db: NonNullable<ServiceContext['db']>;
} {
  if (ctx.userId === null || ctx.db === null) {
    throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté pour planifier un sprint.');
  }
  return { userId: ctx.userId, db: ctx.db };
}

interface ActionResultRow {
  [key: string]: unknown;
  id: string;
  summary: string;
  payload: Record<string, unknown>;
}

async function plansFor(
  db: Db,
  userId: string,
  examSlotIds: readonly string[],
  expectedExamDates: ReadonlyMap<string, string>,
): Promise<SprintPlanView[]> {
  if (examSlotIds.length === 0) return [];
  const rows = await db.execute<ActionResultRow>(sql`
    select id::text as id, summary, payload
    from public.automation_actions
    where user_id = ${userId}::uuid
      and automation = 'sprint'
      and kind = 'sprint_planned'
      and payload ->> 'examSlotId' in (${sql.join(
        examSlotIds.map((id) => sql`${id}`),
        sql`, `,
      )})
    order by created_at desc
  `);
  const seen = new Set<string>();
  const plans: SprintPlanView[] = [];
  for (const row of rows) {
    const examSlotId = stringOf(row.payload.examSlotId);
    if (examSlotId === '' || seen.has(examSlotId)) continue;
    // A moved milestone keeps its old applied action: only the plan of the current local exam
    // date is the active one, even when both rows share the frozen creation instant.
    const expected = expectedExamDates.get(examSlotId);
    if (expected !== undefined && stringOf(row.payload.examDate) !== expected) continue;
    seen.add(examSlotId);
    const targets = Array.isArray(row.payload.targets)
      ? (row.payload.targets as SprintPlannedSlot[])
      : [];
    const impossible = Array.isArray(row.payload.impossible)
      ? (row.payload.impossible as SprintImpossibleTarget[])
      : [];
    plans.push({
      actionId: row.id,
      formationId: stringOf(row.payload.formationId),
      examSlotId,
      examKind: row.payload.examKind === 'mock_exam' ? 'mock_exam' : 'validation_quiz',
      examDate: stringOf(row.payload.examDate),
      examTitle: stringOf(row.payload.examTitle, 'Épreuve'),
      daysBefore: numberOr(row.payload.daysBefore, 3),
      durationMin: numberOr(row.payload.durationMin, 30),
      notionIds: Array.isArray(row.payload.notionIds) ? (row.payload.notionIds as string[]) : [],
      notionLabels: Array.isArray(row.payload.notionLabels)
        ? (row.payload.notionLabels as string[])
        : [],
      targets,
      impossible,
      summary: row.summary,
    });
  }
  return plans;
}

/**
 * ET-1, ET-3 — plans the sprints of one formation (or one milestone) under RLS. The ownership
 * checks run through the learner client: a foreign formation or slot answers 404 without revealing
 * its existence; an obsolete slot answers 409; an invalid identifier answers 400.
 */
export async function planSprintsBeforeMilestones(
  ctx: ServiceContext,
  input: { formationId: string; examSlotId?: string | undefined },
): Promise<Result<z.infer<typeof SprintPlanResult>>> {
  try {
    const user = requireUser(ctx);
    if (!uuidSchema.safeParse(input.formationId).success) {
      throw new AppError('VALIDATION_FAILED', 'Formation invalide.', {
        errors: [{ path: 'formationId', message: 'UUID attendu' }],
      });
    }
    if (input.examSlotId !== undefined && !uuidSchema.safeParse(input.examSlotId).success) {
      throw new AppError('VALIDATION_FAILED', 'Épreuve invalide.', {
        errors: [{ path: 'examSlotId', message: 'UUID attendu' }],
      });
    }

    await user.db.run(async (tx) => {
      const formation = await tx.execute<{ id: string }>(sql`
        select id::text as id from public.formations
        where id = ${input.formationId}::uuid and owner_id = ${user.userId}::uuid
      `);
      if (formation[0] === undefined) {
        throw new AppError('NOT_FOUND', 'Formation introuvable.');
      }
      if (input.examSlotId === undefined) return;
      const slot = await tx.execute<{ id: string; kind: string; status: string }>(sql`
        select id::text as id, kind::text as kind, status::text as status
        from public.schedule_slots
        where id = ${input.examSlotId}::uuid
          and formation_id = ${input.formationId}::uuid
      `);
      const row = slot[0];
      if (row === undefined) throw new AppError('NOT_FOUND', 'Épreuve introuvable.');
      if (row.kind !== 'validation_quiz' && row.kind !== 'mock_exam') {
        throw new AppError('VALIDATION_FAILED', 'Ce créneau n’est pas une épreuve.', {
          errors: [{ path: 'examSlotId', message: 'quiz de validation ou examen blanc attendu' }],
        });
      }
      if (row.status !== 'planned') {
        throw new AppError('CONFLICT', 'Cette épreuve n’est plus planifiée : rechargez l’agenda.');
      }
    });

    const engine = {
      requestId: ctx.requestId,
      sdb: ctx.sdb ?? serviceDb(),
      clock: ctx.clock,
      logger: ctx.logger,
    };
    const run = await runAutomation(engine, {
      key: 'sprint',
      userId: user.userId,
      trigger: {
        type: 'direct',
        data: {
          formationId: input.formationId,
          ...(input.examSlotId === undefined ? {} : { examSlotId: input.examSlotId }),
        },
      },
    });
    if (!run.ok) throw run.error;

    const db = ctx.sdb ?? serviceDb();
    const milestones = await db.execute<{ id: string; starts_at: Date | string }>(sql`
      select ss.id::text as id, ss.starts_at
      from public.schedule_slots ss
      where ss.user_id = ${user.userId}::uuid
        and ss.formation_id = ${input.formationId}::uuid
        and ss.kind in ('validation_quiz', 'mock_exam')
        ${input.examSlotId === undefined ? sql`` : sql`and ss.id = ${input.examSlotId}::uuid`}
    `);
    const profile = await readProfile(db, user.userId);
    const expectedExamDates = new Map(
      milestones.map((row) => [row.id, userLocalDay(dbInstant(row.starts_at), profile.timezone)]),
    );
    const plans = await plansFor(
      db,
      user.userId,
      milestones.map((row) => row.id),
      expectedExamDates,
    );
    return ok({
      created: run.value.created,
      skipped: run.value.skipped,
      plans,
    });
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error };
    throw error;
  }
}
