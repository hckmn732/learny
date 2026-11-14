// « Reprise après décrochage » (SPEC-712, BR-AUT-01/13, ADR-0190, ADR-0191, ADR-0192).
//
// The definition declares the two hourly triggers (22 h for a missed session, 8 h for inactivity),
// reads the learner's agenda and rhythm, and drafts at most one action per episode. The effects —
// moving a session into a margin, creating the five-minute warm-up slot, or proposing a plan
// change — are applied in the engine transaction, behind the agreement of the learner in the
// default `accord` mode (BR-AUT-11). No effect is ever applied from `run`: the 22 h branch only
// marks the finished sessions `missed`, the agenda rule of ADR-0192 §1 (CL-1).
import { z } from 'zod';

import { ENGINE } from '@learny/config/product';
import { RepriseParams, type ReprisePlanOption } from '@learny/contracts';
import { AppError, endOfUserDay, ok, toInstant, userLocalDay, type Result } from '@learny/core';
import { sql, type Db, type DbTx } from '@learny/db';
import {
  findCompatibleSlots,
  type CompatibleSlot,
  type ExistingPlannerSlot,
  type PlannerCalendar,
  type PlannerPreferences,
  type SlotKind,
  type SlotStatus,
} from '@learny/learning-engine';

import {
  defineAutomation,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
  type AutomationDomainContext,
  type AutomationEffectContext,
  type AutomationTone,
} from '../moteur-d-automatismes';
import {
  computeReprisePlanOptions,
  countInactiveStudyDays,
  dayOf,
  detectMissedSlots,
  formatDayInSentence,
  formatHour,
  localDayOf,
  pickReplacement,
  shiftDay,
  type PlacementWindow,
} from '../reprise';

const MS_PER_DAY = 86_400_000;
const DETECTION_DAYS = 30;
const SUMMARY_MAX = 160;

interface ProfileRow {
  [key: string]: unknown;
  timezone: string;
  created_at: Date | string;
  current_formation_id: string | null;
  study_days: number[] | string[] | null;
  hours_per_day: number | null;
  preferred_slots: string[] | null;
}

interface SlotRow {
  [key: string]: unknown;
  id: string;
  formation_id: string;
  module_id: string | null;
  activity_id: string | null;
  kind: string;
  title: string;
  starts_at: Date | string;
  ends_at: Date | string;
  status: string;
  created_by: string;
  moved_from_id: string | null;
  formation_status: string;
}

interface FormationRow {
  [key: string]: unknown;
  id: string;
  title: string;
  end_date: string | null;
  status: string;
}

interface ActionRow {
  [key: string]: unknown;
  id: string;
  status: string;
  kind: string;
  payload: Record<string, unknown>;
}

interface ReplacementPayload {
  [key: string]: unknown;
  dedupeKey: string;
  createdOn: string;
  missedSlotId: string;
  title: string;
  missedDate: string;
  proposed: { startsAt: string; endsAt: string; bufferSlotId: string | null; inBuffer: boolean };
  alternatives: { startsAt: string; endsAt: string }[];
}

function dbInstant(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new AppError('INTERNAL_ERROR', 'Instant de base invalide.');
  return parsed.toISOString();
}

function clip(value: string): string {
  if (value.length <= SUMMARY_MAX) return value;
  return `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

function stringOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formationTitleOf(action: AutomationActionView): string {
  return stringOf(action.payload.formationTitle, 'votre formation');
}

function titleOf(action: AutomationActionView): string {
  return stringOf(action.payload.title, 'Séance de travail');
}

function countLabel(days: number): string {
  return days === 1 ? '1 jour' : `${String(days)} jours`;
}

function optionLabel(option: ReprisePlanOption): string {
  return option.kind === 'shift_end' ? 'Décaler la fin' : 'Alléger le programme';
}

function summarize(action: AutomationActionView, tone: AutomationTone, timeZone: string): string {
  const status = action.status;
  const applied = status === 'applied' || status === 'consumed';
  const kind = action.kind;
  const createdOn = stringOf(action.payload.createdOn, '');
  const reference =
    action.createdAt === ''
      ? createdOn === ''
        ? new Date(0).toISOString()
        : createdOn
      : action.createdAt;
  const tu = tone === 'tu';
  const sentenceDay = (value: string) => (value.endsWith('.') ? value.slice(0, -1) : value);
  switch (kind) {
    case 'reprise_proposed': {
      const proposed = action.payload.proposed as
        { startsAt?: unknown; inBuffer?: unknown } | undefined;
      const startsAt = applied
        ? stringOf(action.payload.chosenStartsAt, stringOf(proposed?.startsAt, reference))
        : stringOf(proposed?.startsAt, reference);
      const inBuffer = proposed?.inBuffer !== false;
      const day = formatDayInSentence(
        stringOf(action.payload.missedDate, dayOf(startsAt, timeZone)),
        reference,
        timeZone,
      );
      const slotDay = formatDayInSentence(dayOf(startsAt, timeZone), reference, timeZone);
      const hour = formatHour(startsAt, timeZone);
      if (applied) {
        return tua(
          tu,
          `C’est noté : reprise de « ${titleOf(action)} » ${slotDay} ${hour}. Elle est dans ton agenda.`,
          `C’est noté : reprise de « ${titleOf(action)} » ${slotDay} ${hour}. Elle est dans votre agenda.`,
        );
      }
      return tua(
        tu,
        `« ${titleOf(action)} » n’a pas été terminé ${sentenceDay(day)}. Je propose de le reprendre ${slotDay} à ${hour}, ${inBuffer ? 'dans une marge de ton agenda' : 'dans un créneau libre de ton agenda'}.`,
        `« ${titleOf(action)} » n’a pas été terminé ${sentenceDay(day)}. Je propose de le reprendre ${slotDay} à ${hour}, ${inBuffer ? 'dans une marge de votre agenda' : 'dans un créneau libre de votre agenda'}.`,
      );
    }
    case 'slot_rescheduled': {
      const proposed = action.payload.proposed as { startsAt?: unknown } | undefined;
      const startsAt = applied
        ? stringOf(action.payload.chosenStartsAt, stringOf(proposed?.startsAt, reference))
        : stringOf(proposed?.startsAt, reference);
      const day = formatDayInSentence(dayOf(startsAt, timeZone), reference, timeZone);
      const hour = formatHour(startsAt, timeZone);
      return tua(
        tu,
        `C’est noté : reprise de « ${titleOf(action)} » ${day} ${hour}. Elle est dans ton agenda.`,
        `C’est noté : reprise de « ${titleOf(action)} » ${day} ${hour}. Elle est dans votre agenda.`,
      );
    }
    case 'reprise_short_proposed': {
      const proposed = action.payload.proposed as { startsAt?: unknown } | undefined;
      const startsAt = applied
        ? stringOf(action.payload.chosenStartsAt, stringOf(proposed?.startsAt, reference))
        : stringOf(proposed?.startsAt, reference);
      const day = formatDayInSentence(dayOf(startsAt, timeZone), reference, timeZone);
      const hour = formatHour(startsAt, timeZone);
      const days = numberOrNull(action.payload.inactiveDays) ?? 2;
      if (applied) {
        return tua(
          tu,
          `C’est noté : reprise de 5 minutes ${day} ${hour}. Elle est dans ton agenda.`,
          `C’est noté : reprise de 5 minutes ${day} ${hour}. Elle est dans votre agenda.`,
        );
      }
      return tua(
        tu,
        `Tu n’as pas étudié depuis ${String(days)} jours. Je te propose une reprise de 5 minutes ${day} à ${hour}.`,
        `Vous n’avez pas étudié depuis ${String(days)} jours. Je propose une reprise de 5 minutes ${day} à ${hour}.`,
      );
    }
    case 'plan_change_proposed': {
      const options = Array.isArray(action.payload.options)
        ? (action.payload.options as ReprisePlanOption[])
        : [];
      const chosen = stringOf(action.payload.chosenOption, '');
      if (applied && chosen !== '') {
        const label =
          options.find((option) => option.kind === chosen) === undefined
            ? chosen === 'shift_end'
              ? 'Décaler la fin'
              : 'Alléger le programme'
            : optionLabel(options.find((option) => option.kind === chosen) as ReprisePlanOption);
        return `C’est noté : « ${formationTitleOf(action)} », ${label.toLowerCase()}.`;
      }
      if (action.payload.reason === 'no_room') {
        return `Plus de place pour reprendre « ${titleOf(action)} » cette semaine : je propose d’alléger le programme ou de décaler la fin.`;
      }
      const days = numberOrNull(action.payload.inactiveDays) ?? 5;
      return `${countLabel(days)} sans étude sur « ${formationTitleOf(action)} » : je propose d’alléger le programme ou de décaler la fin.`;
    }
    default:
      return `Action de reprise : ${kind}.`;
  }
}

function tua(tu: boolean, tuText: string, vousText: string): string {
  return tu ? tuText : vousText;
}

/** EF-8 — one line, ≤ 160 characters, with the prefix of a final status. */
export function explainReprise(
  action: AutomationActionView,
  tone: AutomationTone,
  timeZone: string,
): string {
  const prefix =
    action.status === 'declined'
      ? 'Refusé : '
      : action.status === 'expired'
        ? 'Expiré : '
        : action.status === 'undone'
          ? 'Annulé : '
          : '';
  return clip(`${prefix}${summarize(action, tone, timeZone)}`);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function readProfile(db: Db | DbTx, userId: string) {
  const rows = await db.execute<ProfileRow>(sql`
    select p.timezone,
           p.created_at,
           p.current_formation_id::text as current_formation_id,
           sp.study_days,
           sp.hours_per_day,
           sp.preferred_slots::text[] as preferred_slots
    from public.profiles p
    left join public.study_preferences sp on sp.user_id = p.id
    where p.id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return { ...row, created_at: dbInstant(row.created_at) };
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

function plannerSlots(rows: readonly SlotRow[]): ExistingPlannerSlot[] {
  return rows
    .filter((row) => row.status !== 'cancelled')
    .map((row) => ({
      slotId: row.id,
      formationId: row.formation_id,
      moduleId: row.module_id,
      kind: row.kind as SlotKind,
      title: row.title,
      startsAt: dbInstant(row.starts_at),
      endsAt: dbInstant(row.ends_at),
      status: row.status as SlotStatus,
      createdBy:
        row.created_by === 'automation' || row.created_by === 'learner'
          ? row.created_by
          : 'planner',
      movedFromId: row.moved_from_id,
    }));
}

async function readAgendaSlots(db: DbTx, userId: string, now: Date): Promise<SlotRow[]> {
  const rows = await db.execute<SlotRow>(sql`
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id,
           ss.kind::text as kind,
           ss.title,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           ss.created_by::text as created_by,
           ss.moved_from_id::text as moved_from_id,
           f.status::text as formation_status
    from public.schedule_slots ss
    join public.formations f on f.id = ss.formation_id
    where ss.user_id = ${userId}::uuid
      and ss.status in ('planned', 'done', 'missed', 'moved')
      and ss.ends_at >= ${new Date(now.getTime() - MS_PER_DAY).toISOString()}::timestamptz
  `);
  return rows.map((row) => ({
    ...row,
    starts_at: dbInstant(row.starts_at),
    ends_at: dbInstant(row.ends_at),
  }));
}

interface PlannerInputs {
  calendar: PlannerCalendar;
  preferences: PlannerPreferences;
}

function calendarOf(slots: readonly SlotRow[], now: Date, profile: ProfileRow): PlannerInputs {
  return {
    calendar: {
      now: now.toISOString(),
      params: ENGINE.planner,
      slots: plannerSlots(slots),
    },
    preferences: preferencesOf(profile),
  };
}

function compatible(
  kind: SlotKind,
  durationMinutes: number,
  formationId: string,
  moduleId: string | null,
  inputs: PlannerInputs,
  count: number,
): CompatibleSlot[] {
  try {
    return findCompatibleSlots(
      {
        durationMinutes,
        kind,
        formationId,
        moduleId,
        title: 'Reprise',
      },
      inputs.calendar,
      inputs.preferences,
      count,
    );
  } catch {
    return [];
  }
}

async function existingActions(
  db: DbTx,
  userId: string,
  field: 'missedSlotId' | 'formationId',
  value: string,
): Promise<ActionRow[]> {
  return db.execute<ActionRow>(sql`
    select id::text as id, status::text as status, kind, payload
    from public.automation_actions
    where user_id = ${userId}::uuid
      and automation = 'reprise'
      and (payload ->> ${field}) = ${value}
    order by created_at asc
  `);
}

function dedupeFor(rows: readonly ActionRow[], base: string): string {
  const undone = rows.filter((row) => row.status === 'undone').length;
  return undone === 0 ? base : `${base}#${String(undone)}`;
}

function hasOpenAction(rows: readonly ActionRow[]): boolean {
  return rows.some(
    (row) =>
      row.status === 'pending_consent' || row.status === 'applied' || row.status === 'consumed',
  );
}

function hasDeclined(rows: readonly ActionRow[]): boolean {
  return rows.some((row) => row.status === 'declined');
}

/* ------------------------------------------------------------------ */
/* 22 h — missed sessions (EF-2 to EF-4, EF-7)                         */
/* ------------------------------------------------------------------ */

async function missedDrafts(
  ctx: AutomationDomainContext<z.infer<typeof RepriseParams>>,
  options: { includeMissed?: boolean } = {},
): Promise<AutomationActionDraft[]> {
  const db = ctx.db as DbTx;
  const profile = await readProfile(db, ctx.userId);
  const statusesIn = options.includeMissed === true ? sql`('planned', 'missed')` : sql`('planned')`;
  const rows = await db.execute<SlotRow>(sql`
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id,
           ss.kind::text as kind,
           ss.title,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status,
           ss.created_by::text as created_by,
           ss.moved_from_id::text as moved_from_id,
           f.status::text as formation_status
    from public.schedule_slots ss
    join public.formations f on f.id = ss.formation_id
    where ss.user_id = ${ctx.userId}::uuid
      and ss.status in ${statusesIn}
      and ss.ends_at <= ${ctx.now.toISOString()}::timestamptz
      and ss.ends_at >= ${new Date(ctx.now.getTime() - DETECTION_DAYS * MS_PER_DAY).toISOString()}::timestamptz
      and f.status = 'active'
    order by ss.starts_at asc
  `);
  const statuses = new Map(rows.map((row) => [row.formation_id, row.formation_status]));
  const candidates = rows.map((row) => ({
    id: row.id,
    formationId: row.formation_id,
    moduleId: row.module_id,
    activityId: row.activity_id,
    kind: row.kind,
    title: row.title,
    startsAt: dbInstant(row.starts_at),
    endsAt: dbInstant(row.ends_at),
    status: options.includeMissed === true && row.status === 'missed' ? 'planned' : row.status,
  }));
  const missed = detectMissedSlots(candidates, ctx.now, profile.timezone, {
    formationStatus: (formationId) => statuses.get(formationId),
  });
  if (missed.length === 0) return [];

  const allSlots = await readAgendaSlots(db, ctx.userId, ctx.now);
  const calendar = calendarOf(allSlots, ctx.now, profile);
  const drafts: AutomationActionDraft[] = [];
  for (const slot of missed) {
    // EF-2, ADR-0192 §1 — the session is missed at 22 h even in `accord` mode (CL-1).
    await db.execute(sql`
      update public.schedule_slots
      set status = 'missed', updated_at = ${ctx.now.toISOString()}::timestamptz
      where id = ${slot.id}::uuid
        and user_id = ${ctx.userId}::uuid
        and status = 'planned'
    `);
    const actions = await existingActions(db, ctx.userId, 'missedSlotId', slot.id);
    // ADR-0191 §5 — a refused proposal is final for its session.
    if (hasDeclined(actions) || hasOpenAction(actions)) continue;

    const buffers = allSlots
      .filter(
        (row) =>
          row.formation_id === slot.formationId &&
          row.kind === 'buffer' &&
          row.status === 'planned' &&
          toInstant(row.ends_at).getTime() > ctx.now.getTime(),
      )
      .map(
        (row) => ({ id: row.id, startsAt: row.starts_at, endsAt: row.ends_at }) as PlacementWindow,
      );
    const free = compatible(
      slot.kind as SlotKind,
      slot.durationMinutes,
      slot.formationId,
      slot.moduleId,
      calendar,
      4,
    );
    const placement = pickReplacement({
      buffers,
      freeSlots: free.map((entry) => ({ startsAt: entry.startsAt, endsAt: entry.endsAt })),
      durationMin: slot.durationMinutes,
      now: ctx.now,
      timeZone: profile.timezone,
    });
    const formation = allSlots.find((row) => row.formation_id === slot.formationId);
    if (placement === null) {
      drafts.push(
        await planChangeDraft(ctx, db, profile, {
          formationId: slot.formationId,
          formationTitle: formation?.title ?? 'votre formation',
          title: slot.title,
          reason: 'no_room',
          days: ctx.params.inactiveDays,
          dedupeKey: `plan:${slot.formationId}:no_room:${slot.id}`,
        }),
      );
      continue;
    }
    const payload: ReplacementPayload = {
      dedupeKey: dedupeFor(actions, `missed:${slot.id}`),
      createdOn: ctx.now.toISOString(),
      missedSlotId: slot.id,
      title: slot.title,
      missedDate: slot.missedDate,
      proposed: placement.proposed,
      alternatives: placement.alternatives,
    };
    const kind = ctx.params.mode === 'auto' ? 'slot_rescheduled' : 'reprise_proposed';
    const summary = explainReprise(
      {
        id: '',
        automation: 'reprise',
        kind,
        summary: '',
        formationId: slot.formationId,
        payload,
        undoPayload: null,
        requiresConsent: ctx.params.mode !== 'auto',
        status: 'pending_consent',
        decidedAt: null,
        createdAt: ctx.now.toISOString(),
      },
      ctx.tone,
      profile.timezone,
    );
    drafts.push({
      kind,
      formationId: slot.formationId,
      requiresConsent: ctx.params.mode !== 'auto',
      payload,
      dedupeKey: payload.dedupeKey,
      ...(ctx.params.mode === 'auto'
        ? {}
        : { expiresAt: toInstant(placement.proposed.startsAt).toISOString() }),
      notification: {
        type: 'session_to_reschedule',
        href: '/accueil',
        data: {
          title: slot.title,
          summary: `${summary}${ctx.params.mode === 'auto' ? '' : tua(ctx.tone === 'tu', ' Ton accord est demandé.', ' Votre accord est demandé.')}`,
        },
      },
    });
  }
  return drafts;
}

/* ------------------------------------------------------------------ */
/* 8 h — inactivity (EF-5, EF-6)                                       */
/* ------------------------------------------------------------------ */

async function planChangeDraft(
  ctx: AutomationDomainContext<z.infer<typeof RepriseParams>>,
  db: DbTx,
  profile: ProfileRow,
  input: {
    formationId: string;
    formationTitle: string;
    title?: string;
    reason: 'inactivity' | 'no_room';
    days: number;
    dedupeKey: string;
    options?: ReprisePlanOption[];
  },
): Promise<AutomationActionDraft> {
  const formationRows = await db.execute<FormationRow>(sql`
    select id::text as id, title, end_date::text as end_date, status::text as status
    from public.formations
    where id = ${input.formationId}::uuid and owner_id = ${ctx.userId}::uuid
  `);
  const formation = formationRows[0];
  const today = userLocalDay(ctx.now, profile.timezone);
  const currentEndDate = formation?.end_date ?? shiftDay(today, 120);
  const options =
    input.options ??
    computeReprisePlanOptions({
      formationId: input.formationId,
      currentEndDate,
      projectedEndDate: currentEndDate,
      currentHoursPerDay: profile.hours_per_day ?? 2,
      removedMinutes: 60,
    });
  const payload = {
    dedupeKey: input.dedupeKey,
    createdOn: ctx.now.toISOString(),
    formationId: input.formationId,
    formationTitle: input.formationTitle,
    reason: input.reason,
    inactiveDays: input.days,
    options,
    ...(input.title === undefined ? {} : { title: input.title }),
  };
  const summary = explainReprise(
    {
      id: '',
      automation: 'reprise',
      kind: 'plan_change_proposed',
      summary: '',
      formationId: input.formationId,
      payload,
      undoPayload: null,
      requiresConsent: true,
      status: 'pending_consent',
      decidedAt: null,
      createdAt: ctx.now.toISOString(),
    },
    ctx.tone,
    profile.timezone,
  );
  return {
    kind: 'plan_change_proposed',
    formationId: input.formationId,
    requiresConsent: true,
    payload,
    dedupeKey: input.dedupeKey,
    expiresAt: new Date(ctx.now.getTime() + 7 * MS_PER_DAY).toISOString(),
    notification: {
      type: 'planning_adjusted',
      href: '/accueil',
      data: {
        formationTitle: input.formationTitle,
        titleOverride: 'Votre planning à revoir',
        bodyOverride: summary,
      },
    },
  };
}

async function inactivityDrafts(
  ctx: AutomationDomainContext<z.infer<typeof RepriseParams>>,
): Promise<AutomationActionDraft[]> {
  const db = ctx.db as DbTx;
  const profile = await readProfile(db, ctx.userId);
  const today = userLocalDay(ctx.now, profile.timezone);
  const since = shiftDay(today, -400);
  const activity = await db.execute<{ day: string; qualifying: boolean }>(sql`
    select day::text as day, qualifying
    from public.daily_activity
    where user_id = ${ctx.userId}::uuid and day >= ${since}::date
    order by day asc
  `);
  const pauses = await db.execute<{ starts_on: string; ends_on: string }>(sql`
    select starts_on::text as starts_on, ends_on::text as ends_on
    from public.pauses
    where user_id = ${ctx.userId}::uuid
      and not (ends_on < ${shiftDay(today, -366)}::date)
      and status <> 'cancelled'
    order by starts_on asc
  `);
  const count = countInactiveStudyDays({
    dailyActivity: activity,
    studyDays: (profile.study_days ?? [1, 2, 3, 4, 5]).map((day) => Number(day)),
    pauses: pauses.map((pause) => ({
      startsOn: pause.starts_on,
      endsOn: pause.ends_on,
    })),
    accountCreatedOn: localDayOf(profile.created_at, profile.timezone),
    today,
  });
  if (count.days < ctx.params.inactiveDays) return [];

  const formations = await db.execute<FormationRow>(sql`
    select id::text as id, title, end_date::text as end_date, status::text as status
    from public.formations
    where owner_id = ${ctx.userId}::uuid
      and status = 'active'
    order by coalesce(end_date, '9999-12-31') asc, created_at asc
  `);
  if (formations.length === 0) return [];

  if (count.days >= ctx.params.lightenDays) {
    const drafts: AutomationActionDraft[] = [];
    for (const formation of formations) {
      const dedupeKey = `plan:${formation.id}:${count.lastActivityOn}`;
      const actions = await existingActions(db, ctx.userId, 'formationId', formation.id);
      if (
        actions.some(
          (row) => row.kind === 'plan_change_proposed' && row.payload.dedupeKey === dedupeKey,
        )
      ) {
        continue;
      }
      drafts.push(
        await planChangeDraft(ctx, db, profile, {
          formationId: formation.id,
          formationTitle: formation.title,
          reason: 'inactivity',
          days: count.days,
          dedupeKey,
        }),
      );
    }
    return drafts;
  }

  const currentId = profile.current_formation_id;
  const current = formations.find((formation) => formation.id === currentId) ?? formations[0];
  if (current === undefined) return [];
  const dedupeKey = `short:${count.lastActivityOn}`;
  const actions = await existingActions(db, ctx.userId, 'formationId', current.id);
  if (actions.some((row) => row.kind === 'reprise_short_proposed')) {
    const sameEpisode = actions.some(
      (row) => row.kind === 'reprise_short_proposed' && row.payload.dedupeKey === dedupeKey,
    );
    if (sameEpisode) return [];
  }

  const allSlots = await readAgendaSlots(db, ctx.userId, ctx.now);
  const calendar = calendarOf(allSlots, ctx.now, profile);
  const free = compatible('micro_session', 5, current.id, null, calendar, 4);
  const first = free[0];
  if (first === undefined) return [];
  const proposed = { startsAt: first.startsAt, endsAt: first.endsAt };
  const alternatives = free.slice(1, 4).map((entry) => ({
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
  }));
  const expiresAt = endOfUserDay(dayOf(proposed.startsAt, profile.timezone), profile.timezone);
  const payload = {
    dedupeKey,
    createdOn: ctx.now.toISOString(),
    formationId: current.id,
    formationTitle: current.title,
    inactiveDays: count.days,
    proposed,
    alternatives,
  };
  const tu = ctx.tone === 'tu';
  return [
    {
      kind: 'reprise_short_proposed',
      formationId: current.id,
      requiresConsent: true,
      payload,
      dedupeKey,
      expiresAt: expiresAt.toISOString(),
      notification: {
        type: 'relaunch',
        href: '/accueil',
        data: {
          formationTitle: current.title,
          titleOverride: 'Reprenons en douceur',
          bodyOverride: tu
            ? '5 minutes suffisent aujourd’hui : quelques cartes de rappel et une question, à toi de jouer.'
            : '5 minutes suffisent aujourd’hui : quelques cartes de rappel et une question.',
        },
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

async function lockSlot(tx: DbTx, userId: string, slotId: string) {
  const rows = await tx.execute<{
    id: string;
    formation_id: string;
    module_id: string | null;
    activity_id: string | null;
    kind: string;
    title: string;
    starts_at: Date | string;
    ends_at: Date | string;
    status: string;
  }>(sql`
    select id::text as id,
           formation_id::text as formation_id,
           module_id::text as module_id,
           activity_id::text as activity_id,
           kind::text as kind,
           title,
           starts_at,
           ends_at,
           status::text as status
    from public.schedule_slots
    where id = ${slotId}::uuid and user_id = ${userId}::uuid
    for update
  `);
  const row = rows[0];
  return row === undefined
    ? undefined
    : {
        ...row,
        starts_at: dbInstant(row.starts_at),
        ends_at: dbInstant(row.ends_at),
      };
}

async function assertFree(
  tx: DbTx,
  userId: string,
  startsAt: string,
  endsAt: string,
  ignoredSlotIds: readonly string[],
): Promise<void> {
  const exclude =
    ignoredSlotIds.length === 0
      ? sql``
      : sql`and id not in (${sql.join(
          ignoredSlotIds.map((slotId) => sql`${slotId}::uuid`),
          sql`, `,
        )})`;
  const rows = await tx.execute<{ id: string }>(sql`
    select id::text as id
    from public.schedule_slots
    where user_id = ${userId}::uuid
      ${exclude}
      and status in ('planned', 'done', 'missed')
      and starts_at < ${endsAt}::timestamptz
      and ends_at > ${startsAt}::timestamptz
    limit 1
  `);
  if (rows[0] !== undefined) {
    throw new AppError('CONFLICT', 'Ce créneau n’est plus libre. Choisissez-en un autre.');
  }
}

async function insertSlot(
  tx: DbTx,
  userId: string,
  slot: {
    formationId: string;
    moduleId: string | null;
    activityId: string | null;
    kind: string;
    title: string;
    startsAt: string;
    endsAt: string;
    movedFromId: string | null;
  },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      user_id, formation_id, module_id, activity_id, kind, title,
      starts_at, ends_at, status, created_by, moved_from_id
    ) values (
      ${userId}::uuid, ${slot.formationId}::uuid, ${slot.moduleId}::uuid,
      ${slot.activityId}::uuid, ${slot.kind}::slot_kind, ${slot.title},
      ${slot.startsAt}::timestamptz, ${slot.endsAt}::timestamptz,
      'planned', 'automation', ${slot.movedFromId}::uuid
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new AppError('INTERNAL_ERROR', 'Créneau non créé.');
  return id;
}

interface BufferSnapshot {
  bufferSlotId: string;
  bufferBefore: { startsAt: string; endsAt: string; status: string };
}

async function shortenBuffer(
  tx: DbTx,
  userId: string,
  bufferSlotId: string,
  chosenEnd: string,
  now: Date,
): Promise<BufferSnapshot> {
  const buffer = await lockSlot(tx, userId, bufferSlotId);
  if (buffer === undefined || buffer.status !== 'planned') {
    throw new AppError('CONFLICT', 'La marge de rattrapage n’est plus disponible.');
  }
  const before = {
    startsAt: toInstant(buffer.starts_at).toISOString(),
    endsAt: toInstant(buffer.ends_at).toISOString(),
    status: buffer.status,
  };
  const end = toInstant(buffer.ends_at).toISOString();
  if (chosenEnd >= end) {
    await tx.execute(sql`
      update public.schedule_slots
      set status = 'cancelled', updated_at = ${now.toISOString()}::timestamptz
      where id = ${bufferSlotId}::uuid and user_id = ${userId}::uuid
    `);
  } else {
    await tx.execute(sql`
      update public.schedule_slots
      set starts_at = ${chosenEnd}::timestamptz, updated_at = ${now.toISOString()}::timestamptz
      where id = ${bufferSlotId}::uuid and user_id = ${userId}::uuid
    `);
  }
  return { bufferSlotId, bufferBefore: before };
}

async function applyReplacement(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<{ payload: Record<string, unknown>; undoPayload: Record<string, unknown> }>> {
  const payload = action.payload as unknown as ReplacementPayload;
  const missed = await lockSlot(ctx.tx, ctx.userId, payload.missedSlotId);
  if (missed === undefined) throw new AppError('NOT_FOUND', 'Séance manquée introuvable.');
  if (missed.status === 'moved') {
    throw new AppError('CONFLICT', 'Cette séance a déjà été replacée.');
  }
  const choice = action.payload.choice as { startsAt?: unknown } | undefined;
  const chosenInstant = stringOf(choice?.startsAt, '');
  const alternative =
    chosenInstant === ''
      ? undefined
      : payload.alternatives.find((entry) => entry.startsAt === chosenInstant);
  if (chosenInstant !== '' && alternative === undefined) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Le créneau choisi ne fait pas partie des alternatives.',
      {
        errors: [{ path: 'choice.startsAt', message: 'créneau proposé attendu' }],
      },
    );
  }
  const placement = alternative ?? payload.proposed;
  await assertFree(
    ctx.tx,
    ctx.userId,
    placement.startsAt,
    placement.endsAt,
    alternative === undefined && payload.proposed.bufferSlotId !== null
      ? [missed.id, payload.proposed.bufferSlotId]
      : [missed.id],
  );
  // The move trigger of the agenda requires the origin to be `moved` before its successor is
  // inserted (ADR-0180); the surrounding transaction makes the two writes atomic.
  await ctx.tx.execute(sql`
    update public.schedule_slots
    set status = 'moved', updated_at = ${ctx.now.toISOString()}::timestamptz
    where id = ${missed.id}::uuid and user_id = ${ctx.userId}::uuid
  `);
  const createdSlotId = await insertSlot(ctx.tx, ctx.userId, {
    formationId: missed.formation_id,
    moduleId: missed.module_id,
    activityId: missed.activity_id,
    kind: missed.kind,
    title: missed.title,
    startsAt: placement.startsAt,
    endsAt: placement.endsAt,
    movedFromId: missed.id,
  });
  let buffer: BufferSnapshot | null = null;
  if (
    alternative === undefined &&
    payload.proposed.inBuffer &&
    payload.proposed.bufferSlotId !== null
  ) {
    buffer = await shortenBuffer(
      ctx.tx,
      ctx.userId,
      payload.proposed.bufferSlotId,
      placement.endsAt,
      ctx.now,
    );
  }
  return ok({
    payload: {
      ...action.payload,
      chosenStartsAt: placement.startsAt,
      appliedAt: ctx.now.toISOString(),
    },
    undoPayload: {
      createdSlotId,
      bufferSlotId: buffer?.bufferSlotId ?? null,
      bufferBefore: buffer?.bufferBefore ?? null,
      missedSlotId: missed.id,
    },
  });
}

async function applyShort(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<{ payload: Record<string, unknown>; undoPayload: Record<string, unknown> }>> {
  const payload = action.payload as {
    formationId?: unknown;
    proposed?: { startsAt?: unknown; endsAt?: unknown };
    alternatives?: { startsAt: string; endsAt: string }[];
    formationTitle?: unknown;
  };
  const formationId = stringOf(payload.formationId, action.formationId ?? '');
  if (formationId === '') throw new AppError('VALIDATION_FAILED', 'Formation introuvable.');
  const choice = action.payload.choice as { startsAt?: unknown } | undefined;
  const chosenInstant = stringOf(choice?.startsAt, '');
  const alternative =
    chosenInstant === ''
      ? undefined
      : (payload.alternatives ?? []).find((entry) => entry.startsAt === chosenInstant);
  if (chosenInstant !== '' && alternative === undefined) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Le créneau choisi ne fait pas partie des alternatives.',
      {
        errors: [{ path: 'choice.startsAt', message: 'créneau proposé attendu' }],
      },
    );
  }
  const startsAt = alternative?.startsAt ?? stringOf(payload.proposed?.startsAt, '');
  const endsAt = alternative?.endsAt ?? stringOf(payload.proposed?.endsAt, '');
  if (startsAt === '' || endsAt === '') {
    throw new AppError('VALIDATION_FAILED', 'Créneau de reprise introuvable.');
  }
  await assertFree(ctx.tx, ctx.userId, startsAt, endsAt, []);
  const createdSlotId = await insertSlot(ctx.tx, ctx.userId, {
    formationId,
    moduleId: null,
    activityId: null,
    kind: 'micro_session',
    title: 'Reprise en douceur',
    startsAt,
    endsAt,
    movedFromId: null,
  });
  return ok({
    payload: {
      ...action.payload,
      chosenStartsAt: startsAt,
      appliedAt: ctx.now.toISOString(),
    },
    undoPayload: { createdSlotId },
  });
}

function applyPlan(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<{ payload: Record<string, unknown>; undoPayload: Record<string, unknown> }>> {
  const choice = action.payload.choice as { option?: unknown } | undefined;
  const option = stringOf(choice?.option, '');
  if (option !== 'shift_end' && option !== 'lighten') {
    throw new AppError(
      'VALIDATION_FAILED',
      'Choisissez « Décaler la fin » ou « Alléger le programme ».',
      {
        errors: [{ path: 'choice.option', message: 'option de planning attendue' }],
      },
    );
  }
  // SPEC-705 owns the replanning service; until it is delivered the explicit choice is recorded
  // and no slot is modified (ADR-0322). The undo remains possible, like every other action.
  return Promise.resolve(
    ok({
      payload: {
        ...action.payload,
        chosenOption: option,
        appliedAt: ctx.now.toISOString(),
      },
      undoPayload: { planOption: option },
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export const repriseAutomation: AutomationDefinition<typeof RepriseParams> = defineAutomation({
  key: 'reprise',
  triggers: [
    { type: 'hourly', localHour: 22 },
    { type: 'hourly', localHour: 8 },
    { type: 'direct' },
  ],
  params: RepriseParams,
  run: async (ctx, trigger) => {
    const hour =
      trigger.type === 'hourly'
        ? typeof trigger.localHour === 'function'
          ? trigger.localHour(ctx.params)
          : trigger.localHour
        : null;
    if (hour === 22) return missedDrafts(ctx);
    if (hour === 8) return inactivityDrafts(ctx);
    if (trigger.type === 'direct') {
      // ADR-0191 §3 — an undo brings the proposal back; the auto mode keeps its automatic
      // replacement and never re-applies behind the learner's back.
      if (ctx.params.mode === 'auto') return [];
      const missed = await missedDrafts(ctx, { includeMissed: true });
      return missed.filter((draft) => draft.kind === 'reprise_proposed');
    }
    return [];
  },
  explain: explainReprise,
  apply: async (ctx, action) => {
    if (action.kind === 'reprise_proposed' || action.kind === 'slot_rescheduled') {
      return applyReplacement(ctx, action);
    }
    if (action.kind === 'reprise_short_proposed') return applyShort(ctx, action);
    if (action.kind === 'plan_change_proposed') return applyPlan(ctx, action);
    return ok({});
  },
  undo: async (ctx, action) => {
    const undo = action.undoPayload ?? {};
    const createdSlotId = stringOf(undo.createdSlotId, '');
    if (createdSlotId !== '') {
      const existing = await lockSlot(ctx.tx, ctx.userId, createdSlotId);
      if (existing !== undefined) {
        if (existing.status === 'done') {
          throw new AppError(
            'AUTOMATION_ACTION_CONSUMED',
            'Cette reprise a été faite : elle ne peut plus être annulée.',
          );
        }
        await ctx.tx.execute(sql`
            update public.schedule_slots
            set status = 'cancelled', updated_at = ${ctx.now.toISOString()}::timestamptz
            where id = ${createdSlotId}::uuid and user_id = ${ctx.userId}::uuid
          `);
      }
    }
    const missedSlotId = stringOf(undo.missedSlotId, '');
    if (missedSlotId !== '') {
      await ctx.tx.execute(sql`
          update public.schedule_slots
          set status = 'missed', updated_at = ${ctx.now.toISOString()}::timestamptz
          where id = ${missedSlotId}::uuid
            and user_id = ${ctx.userId}::uuid
            and status = 'moved'
        `);
    }
    const bufferSlotId = stringOf(undo.bufferSlotId, '');
    const before = undo.bufferBefore as
      { startsAt: string; endsAt: string; status: 'planned' | 'cancelled' } | null | undefined;
    if (bufferSlotId !== '' && before !== null && before !== undefined) {
      await ctx.tx.execute(sql`
          update public.schedule_slots
          set starts_at = ${before.startsAt}::timestamptz,
              ends_at = ${before.endsAt}::timestamptz,
              status = ${before.status}::slot_status,
              updated_at = ${ctx.now.toISOString()}::timestamptz
          where id = ${bufferSlotId}::uuid and user_id = ${ctx.userId}::uuid
        `);
    }
    return ok(null);
  },
  reproposeAfterUndo: true,
});
