// « Remédiation après un quiz raté » (SPEC-715, BR-AUT-04, ADR-0190).
//
// The automation listens to `quiz/graded`. A failed validation quiz freezes the delay (0/12/24/48 h)
// and the mode (advised/mandatory) in the action payload, prepares the targeted remediation of
// SPEC-612, places it as a 15-minute `revision` slot, and schedules (or moves) the next attempt at
// the first compatible slot after the delay. While the action is applied, a new attempt answers
// 422 `RETRY_NOT_YET_ALLOWED` (or `remediation_required` in mandatory mode). The next attempt
// consumes the action; an undo before it cancels the slots and lifts the delay.
import { z } from 'zod';

import { ENGINE, REMEDIATION_RULES } from '@learny/config/product';
import { RemediationParams } from '@learny/contracts';
import { AppError, ok, userLocalDay, type Result } from '@learny/core';
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
  createServiceContext,
  prepareRemediation,
  readActivePause,
  type ServiceContext,
} from '@learny/services';

import {
  defineAutomation,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
  type AutomationDomainContext,
  type AutomationEffectContext,
  type AutomationNotificationDraft,
  type AutomationTone,
} from '../moteur-d-automatismes';
import { dayOf, formatDayInSentence, formatHour } from '../reprise';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const SUMMARY_MAX = 160;
const REMEDIATION_MINUTES = REMEDIATION_RULES.durationMin;
const RETRY_MINUTES = ENGINE.planner.validationQuizMinutes;
const UUID = z.uuid();

interface AttemptRow extends Record<string, unknown> {
  attempt_id: string;
  attempt_no: number;
  score: string | null;
  passed: boolean;
  submitted_at: Date | string | null;
  module_id: string;
  formation_id: string;
  module_title: string;
  module_position: number;
  module_threshold: number;
  formation_title: string;
  activity_kind: string;
}

interface GapRow extends Record<string, unknown> {
  notion_id: string;
  label: string;
}

interface ProfileRow extends Record<string, unknown> {
  timezone: string;
  hours_per_day: number | null;
  study_days: number[] | string[] | null;
  preferred_slots: string[] | null;
}

interface SlotRow extends Record<string, unknown> {
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
}

interface PlannedWindow {
  startsAt: string;
  endsAt: string;
}

interface BufferSnapshot {
  id: string;
  before: { startsAt: string; endsAt: string; status: string };
}

interface RetryPlan extends PlannedWindow {
  /** Existing quiz slot when the next attempt reuses one; null when a slot is created. */
  slotId: string | null;
  created: boolean;
  previous: { startsAt: string; endsAt: string; title: string; status: string } | null;
  buffer: BufferSnapshot | null;
}

interface RemediationPlan extends PlannedWindow {
  slot: boolean;
}

interface StoredPlan {
  remediation: RemediationPlan | null;
  retry: RetryPlan | null;
}

function clip(value: string): string {
  if (value.length <= SUMMARY_MAX) return value;
  return `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

function stringOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dbInstant(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function objectOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function planOf(payload: Record<string, unknown>): StoredPlan {
  const raw = objectOf(payload.plan);
  if (raw === null) return { remediation: null, retry: null };
  const remediationRaw = objectOf(raw.remediation);
  const retryRaw = objectOf(raw.retry);
  const windowOf = (value: Record<string, unknown> | null): PlannedWindow | null => {
    if (value === null) return null;
    const startsAt = stringOf(value.startsAt);
    const endsAt = stringOf(value.endsAt);
    return startsAt === '' || endsAt === '' ? null : { startsAt, endsAt };
  };
  const remediationWindow = windowOf(remediationRaw);
  const retryWindow = windowOf(retryRaw);
  const bufferRaw = objectOf(retryRaw?.buffer);
  const bufferBefore = objectOf(bufferRaw?.before);
  const previousRaw = objectOf(retryRaw?.previous);
  return {
    remediation:
      remediationWindow === null
        ? null
        : { ...remediationWindow, slot: remediationRaw?.slot === true },
    retry:
      retryWindow === null
        ? null
        : {
            ...retryWindow,
            slotId: typeof retryRaw?.slotId === 'string' ? retryRaw.slotId : null,
            created: retryRaw?.created === true,
            previous:
              previousRaw === null
                ? null
                : {
                    startsAt: stringOf(previousRaw.startsAt),
                    endsAt: stringOf(previousRaw.endsAt),
                    title: stringOf(previousRaw.title, 'Quiz de validation'),
                    status: stringOf(previousRaw.status, 'planned'),
                  },
            buffer:
              bufferRaw === null || bufferBefore === null
                ? null
                : {
                    id: stringOf(bufferRaw.id),
                    before: {
                      startsAt: stringOf(bufferBefore.startsAt),
                      endsAt: stringOf(bufferBefore.endsAt),
                      status: stringOf(bufferBefore.status, 'planned'),
                    },
                  },
          },
  };
}

function dayLabel(instant: string, timeZone: string): string {
  const day = dayOf(instant, timeZone);
  return formatDayInSentence(day, instant, timeZone);
}

function retrySlotLabel(payload: Record<string, unknown>, timeZone: string): string {
  const plan = planOf(payload);
  const at = plan.retry?.startsAt ?? stringOf(payload.retryAvailableAt);
  if (at === '') return 'à la reprise';
  return `${dayLabel(at, timeZone)} ${formatHour(at, timeZone)}`;
}

function appliedText(payload: Record<string, unknown>, timeZone: string): string {
  const score = numberOr(payload.score);
  const attemptNo = numberOr(payload.attemptNo, 1);
  const activityId = stringOf(payload.remediationActivityId);
  const next = attemptNo + 1;
  const paused = payload.paused === true;
  const when = paused ? 'à la reprise' : retrySlotLabel(payload, timeZone);
  const base =
    activityId === ''
      ? `Quiz à ${String(score)} % : tentative ${String(next)} placée ${when}. La remédiation sera prête dès que l’IA sera disponible.`
      : `Quiz à ${String(score)} % : remédiation de 15 min préparée, tentative ${String(next)} placée ${when}.`;
  const mandatory =
    payload.mode === 'mandatory' && activityId !== ''
      ? ' Remédiation obligatoire avant la tentative.'
      : '';
  return `${base}${mandatory}`;
}

/** EF-8 — one line (≤ 160 characters) for every status of the journal. */
export function explainRemediation(
  action: AutomationActionView,
  _tone: AutomationTone,
  timeZone: string,
): string {
  if (action.status === 'undone') {
    const position = numberOr(action.payload.modulePosition);
    return clip(`Annulé : délai et remédiation planifiée du quiz du module ${String(position)}.`);
  }
  return clip(appliedText(action.payload, timeZone));
}

/* ------------------------------------------------------------------ */
/* Read model                                                          */
/* ------------------------------------------------------------------ */

async function readAttempt(db: Db | DbTx, userId: string, attemptId: string): Promise<AttemptRow> {
  if (!UUID.safeParse(attemptId).success) {
    throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
  }
  const rows = await db.execute<AttemptRow>(sql`
    select at.id::text as attempt_id,
           at.attempt_no,
           at.score::text as score,
           at.passed,
           at.submitted_at,
           act.kind::text as activity_kind,
           act.module_id::text as module_id,
           act.formation_id::text as formation_id,
           m.title as module_title,
           m.position::int as module_position,
           m.threshold::int as module_threshold,
           f.title as formation_title
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    join public.modules m on m.id = act.module_id
    join public.formations f on f.id = act.formation_id
    where at.id = ${attemptId}::uuid
      and at.user_id = ${userId}::uuid
    limit 1
  `);
  const attempt = rows[0];
  if (attempt === undefined) throw new AppError('NOT_FOUND', 'Tentative introuvable.');
  return attempt;
}

async function readGaps(db: Db | DbTx, userId: string, moduleId: string): Promise<GapRow[]> {
  return db.execute<GapRow>(sql`
    select n.id::text as notion_id, n.label
    from public.notions n
    join public.notion_states ns
      on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
    where n.module_id = ${moduleId}::uuid
      and ns.gap_nature is not null
    order by ns.mastery asc nulls last, n.position asc, n.id asc
    limit ${REMEDIATION_RULES.maxGaps}
  `);
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

async function readSlots(db: Db | DbTx, userId: string, now: Date): Promise<SlotRow[]> {
  return db.execute<SlotRow>(sql`
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
           ss.moved_from_id::text as moved_from_id
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.status in ('planned', 'done', 'missed')
      and ss.ends_at >= ${new Date(now.getTime() - 86_400_000).toISOString()}::timestamptz
    order by ss.starts_at asc
  `);
}

function plannerSlot(row: SlotRow): ExistingPlannerSlot {
  return {
    slotId: row.id,
    formationId: row.formation_id,
    moduleId: row.module_id,
    kind: row.kind as SlotKind,
    title: row.title,
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    status: row.status as SlotStatus,
    createdBy:
      row.created_by === 'automation' || row.created_by === 'learner' ? row.created_by : 'planner',
    movedFromId: row.moved_from_id,
  };
}

function compatible(
  durationMinutes: number,
  kind: SlotKind,
  formationId: string,
  moduleId: string | null,
  slots: readonly SlotRow[],
  profile: ProfileRow,
  now: Date,
  count: number,
): CompatibleSlot[] {
  const calendar: PlannerCalendar = {
    now: now.toISOString(),
    params: ENGINE.planner,
    slots: slots.map(plannerSlot),
  };
  try {
    return findCompatibleSlots(
      { durationMinutes, kind, formationId, moduleId, title: 'Remédiation' },
      calendar,
      preferencesOf(profile),
      count,
    );
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Read-only placement used by `run` and by `apply`                    */
/* ------------------------------------------------------------------ */

function planSlots(input: {
  slots: readonly SlotRow[];
  profile: ProfileRow;
  formationId: string;
  moduleId: string;
  submittedAt: Date;
  retryAvailableAt: Date;
  delayHours: number;
  now: Date;
}): StoredPlan {
  const remediationFrom = new Date(
    Math.max(
      input.now.getTime(),
      input.submittedAt.getTime() + REMEDIATION_MINUTES * MS_PER_MINUTE,
    ),
  );
  const remediationCandidates = compatible(
    REMEDIATION_MINUTES,
    'revision',
    input.formationId,
    input.moduleId,
    input.slots,
    input.profile,
    remediationFrom,
    20,
  );
  const remediationFits =
    input.delayHours > 0
      ? remediationCandidates.find(
          (candidate) => Date.parse(candidate.endsAt) <= input.retryAvailableAt.getTime(),
        )
      : undefined;
  const remediationCandidate = remediationFits ?? remediationCandidates[0] ?? null;
  const remediation: RemediationPlan | null =
    remediationCandidate === null
      ? null
      : {
          startsAt: remediationCandidate.startsAt,
          endsAt: remediationCandidate.endsAt,
          slot: true,
        };

  const slotsWithRemediation: SlotRow[] =
    remediation === null
      ? [...input.slots]
      : [
          ...input.slots,
          {
            id: '',
            formation_id: input.formationId,
            module_id: input.moduleId,
            activity_id: null,
            kind: 'revision',
            title: 'Remédiation',
            starts_at: remediation.startsAt,
            ends_at: remediation.endsAt,
            status: 'planned',
            created_by: 'automation',
            moved_from_id: null,
          },
        ];

  const retryThreshold = new Date(Math.max(input.now.getTime(), input.retryAvailableAt.getTime()));
  const quizSlots = input.slots.filter(
    (row) =>
      row.status === 'planned' &&
      row.kind === 'validation_quiz' &&
      row.module_id === input.moduleId,
  );
  const before = quizSlots.find(
    (row) => new Date(row.starts_at).getTime() < input.retryAvailableAt.getTime(),
  );
  const later = quizSlots.find(
    (row) => new Date(row.starts_at).getTime() >= input.retryAvailableAt.getTime(),
  );

  // ADR-0192 §4 — the module's margin is tried first; a shorter buffer is not enough for a quiz.
  const buffer = input.slots.find(
    (row) =>
      row.status === 'planned' &&
      row.kind === 'buffer' &&
      row.module_id === input.moduleId &&
      new Date(row.starts_at).getTime() >= retryThreshold.getTime() &&
      new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime() >=
        RETRY_MINUTES * MS_PER_MINUTE,
  );
  const bufferSnapshot =
    buffer === undefined
      ? null
      : {
          id: buffer.id,
          before: {
            startsAt: new Date(buffer.starts_at).toISOString(),
            endsAt: new Date(buffer.ends_at).toISOString(),
            status: buffer.status,
          },
        };
  const freeStart = (): string | null => {
    if (buffer !== undefined) return new Date(buffer.starts_at).toISOString();
    const candidates = compatible(
      RETRY_MINUTES,
      'validation_quiz',
      input.formationId,
      input.moduleId,
      slotsWithRemediation.filter((row) => row.id !== before?.id),
      input.profile,
      retryThreshold,
      5,
    );
    return candidates[0]?.startsAt ?? null;
  };
  const withEnd = (startsAt: string): PlannedWindow => ({
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + RETRY_MINUTES * MS_PER_MINUTE).toISOString(),
  });

  if (before !== undefined) {
    const startsAt = freeStart() ?? new Date(before.starts_at).toISOString();
    return {
      remediation,
      retry: {
        ...withEnd(startsAt),
        slotId: before.id,
        created: false,
        previous: {
          startsAt: new Date(before.starts_at).toISOString(),
          endsAt: new Date(before.ends_at).toISOString(),
          title: before.title,
          status: before.status,
        },
        buffer: bufferSnapshot,
      },
    };
  }

  if (later !== undefined) {
    return {
      remediation,
      retry: {
        startsAt: new Date(later.starts_at).toISOString(),
        endsAt: new Date(later.ends_at).toISOString(),
        slotId: later.id,
        created: false,
        previous: null,
        buffer: null,
      },
    };
  }

  const startsAt = freeStart();
  if (startsAt === null) return { remediation, retry: null };
  return {
    remediation,
    retry: {
      ...withEnd(startsAt),
      slotId: null,
      created: true,
      previous: null,
      buffer: bufferSnapshot,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Proposal                                                            */
/* ------------------------------------------------------------------ */

function notificationOf(
  payload: Record<string, unknown>,
  summary: string,
  formationId: string,
  moduleId: string,
): AutomationNotificationDraft {
  return {
    type: 'planning_adjusted',
    href: `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(moduleId)}/remediation`,
    data: {
      titleOverride: 'Remédiation prête',
      bodyOverride: summary,
    },
  };
}

async function eventDrafts(
  ctx: AutomationDomainContext<z.infer<typeof RemediationParams>>,
  trigger: { type: 'event'; name: string; data?: Record<string, unknown> },
): Promise<AutomationActionDraft[]> {
  if (trigger.name !== 'quiz/graded') return [];
  const data = trigger.data ?? {};
  const attemptId = stringOf(data.attemptId);
  if (attemptId === '') return [];
  const db = ctx.db as DbTx;
  const attempt = await readAttempt(db, ctx.userId, attemptId);
  // EF-2 — only a failed validation quiz triggers automation 4; a mock exam or an exercise never.
  if (attempt.activity_kind !== 'validation_quiz' || attempt.passed) return [];
  const submittedAt = dbInstant(attempt.submitted_at);
  if (submittedAt === null) return [];
  const profile = await readProfile(db, ctx.userId);
  const gaps = await readGaps(db, ctx.userId, attempt.module_id);
  const delayHours = ctx.params.delayHours;
  const retryAvailableAt = new Date(
    Date.parse(submittedAt) + delayHours * MS_PER_HOUR,
  ).toISOString();
  const paused =
    (await readActivePause(db, ctx.userId, userLocalDay(ctx.now, profile.timezone))) !== null;
  const slots = paused ? [] : await readSlots(db, ctx.userId, ctx.now);
  const plan = paused
    ? { remediation: null, retry: null }
    : planSlots({
        slots,
        profile,
        formationId: attempt.formation_id,
        moduleId: attempt.module_id,
        submittedAt: new Date(submittedAt),
        retryAvailableAt: new Date(retryAvailableAt),
        delayHours,
        now: ctx.now,
      });
  const payload: Record<string, unknown> = {
    dedupeKey: `remediation:${attemptId}`,
    attemptId,
    attemptNo: attempt.attempt_no,
    moduleId: attempt.module_id,
    moduleTitle: attempt.module_title,
    modulePosition: attempt.module_position,
    formationId: attempt.formation_id,
    formationTitle: attempt.formation_title,
    score: Number(attempt.score ?? 0),
    threshold: attempt.module_threshold,
    gapNotionIds: gaps.map((gap) => gap.notion_id),
    gapLabels: gaps.map((gap) => gap.label),
    remediationActivityId: null,
    durationMin: REMEDIATION_MINUTES,
    retryAvailableAt,
    delayHours,
    mode: ctx.params.mode,
    paused,
    remediationSlotId: null,
    retrySlotId: plan.retry?.slotId ?? null,
    retrySlotPrevious: plan.retry?.previous ?? null,
    plan,
    createdOn: ctx.now.toISOString(),
  };
  const summary = explainRemediation(
    {
      id: '',
      automation: 'remediation',
      kind: 'remediation_ready',
      summary: '',
      formationId: attempt.formation_id,
      payload,
      undoPayload: null,
      requiresConsent: false,
      status: 'applied',
      decidedAt: ctx.now.toISOString(),
      createdAt: ctx.now.toISOString(),
    },
    ctx.tone,
    profile.timezone,
  );
  return [
    {
      kind: 'remediation_ready',
      formationId: attempt.formation_id,
      requiresConsent: false,
      payload,
      dedupeKey: `remediation:${attemptId}`,
      notification: notificationOf(payload, summary, attempt.formation_id, attempt.module_id),
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

async function insertSlot(
  tx: DbTx,
  userId: string,
  input: {
    formationId: string;
    moduleId: string | null;
    activityId: string | null;
    kind: 'revision' | 'validation_quiz';
    title: string;
    meta: string | null;
    startsAt: string;
    endsAt: string;
  },
): Promise<string> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      user_id, formation_id, module_id, activity_id, kind, title, meta,
      starts_at, ends_at, status, created_by
    ) values (
      ${userId}::uuid, ${input.formationId}::uuid, ${input.moduleId}::uuid,
      ${input.activityId}::uuid, ${input.kind}::slot_kind, ${input.title},
      ${input.meta}, ${input.startsAt}::timestamptz, ${input.endsAt}::timestamptz,
      'planned', 'automation'
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new AppError('INTERNAL_ERROR', 'Créneau non créé.');
  return id;
}

async function shortenBuffer(
  tx: DbTx,
  userId: string,
  buffer: BufferSnapshot,
  newStart: string,
  now: Date,
): Promise<void> {
  const end = Date.parse(buffer.before.endsAt);
  const start = Date.parse(newStart);
  if (start >= end) {
    await tx.execute(sql`
      update public.schedule_slots
      set status = 'cancelled', updated_at = ${now.toISOString()}::timestamptz
      where id = ${buffer.id}::uuid and user_id = ${userId}::uuid and status = 'planned'
    `);
  } else {
    await tx.execute(sql`
      update public.schedule_slots
      set starts_at = ${newStart}::timestamptz, updated_at = ${now.toISOString()}::timestamptz
      where id = ${buffer.id}::uuid and user_id = ${userId}::uuid and status = 'planned'
    `);
  }
}

function serviceContextOf(ctx: AutomationEffectContext): ServiceContext {
  return createServiceContext({
    userId: ctx.userId,
    requestId: ctx.requestId,
    clock: ctx.clock,
    logger: ctx.logger,
  });
}

async function applyRemediation(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<{ payload: Record<string, unknown>; undoPayload: Record<string, unknown> }>> {
  const payload = action.payload;
  const formationId = stringOf(payload.formationId, action.formationId ?? '');
  const moduleId = stringOf(payload.moduleId);
  const attemptId = stringOf(payload.attemptId);
  if (formationId === '' || moduleId === '' || attemptId === '') {
    throw new AppError('VALIDATION_FAILED', 'Remédiation incomplète.');
  }
  const plan = planOf(payload);
  let remediationActivityId: string | null = null;
  const prepared = await prepareRemediation(serviceContextOf(ctx), moduleId, {
    trigger: 'auto',
    onAiUnavailable: 'fail',
  });
  if (prepared.ok) remediationActivityId = prepared.value.activityId;
  else if (prepared.error.code !== 'AI_UNAVAILABLE' && prepared.error.code !== 'AI_CAP_REACHED') {
    throw prepared.error;
  }

  let remediationSlotId: string | null = null;
  let retrySlotId: string | null = plan.retry?.slotId ?? null;
  const paused = payload.paused === true;

  if (!paused && plan.remediation !== null && remediationActivityId !== null) {
    remediationSlotId = await insertSlot(ctx.tx, ctx.userId, {
      formationId,
      moduleId,
      activityId: remediationActivityId,
      kind: 'revision',
      title: `Remédiation · ${stringOf(payload.moduleTitle, 'module')}`,
      meta: 'Lacunes du quiz · 15 min · ajoutée par le tuteur',
      startsAt: plan.remediation.startsAt,
      endsAt: plan.remediation.endsAt,
    });
  }

  if (!paused && plan.retry !== null) {
    const title = `Quiz · tentative ${String(numberOr(payload.attemptNo, 1) + 1)}`;
    if (plan.retry.created) {
      retrySlotId = await insertSlot(ctx.tx, ctx.userId, {
        formationId,
        moduleId,
        activityId: null,
        kind: 'validation_quiz',
        title,
        meta: 'Nouvelle tentative après remédiation',
        startsAt: plan.retry.startsAt,
        endsAt: plan.retry.endsAt,
      });
    } else if (plan.retry.previous !== null && plan.retry.slotId !== null) {
      await ctx.tx.execute(sql`
        update public.schedule_slots
        set starts_at = ${plan.retry.startsAt}::timestamptz,
            ends_at = ${plan.retry.endsAt}::timestamptz,
            title = ${title},
            updated_at = ${ctx.now.toISOString()}::timestamptz
        where id = ${plan.retry.slotId}::uuid and user_id = ${ctx.userId}::uuid
      `);
    }
    if (plan.retry.buffer !== null) {
      await shortenBuffer(ctx.tx, ctx.userId, plan.retry.buffer, plan.retry.endsAt, ctx.now);
    }
  }

  const appliedPayload: Record<string, unknown> = {
    ...payload,
    remediationActivityId,
    remediationSlotId,
    retrySlotId,
    retrySlotPrevious: plan.retry?.previous ?? null,
    appliedAt: ctx.now.toISOString(),
  };
  return ok({
    payload: appliedPayload,
    undoPayload: {
      remediationSlotId,
      retrySlotId,
      retrySlotCreated: plan.retry?.created === true,
      retrySlotPrevious: plan.retry?.previous ?? null,
      retryBuffer: plan.retry?.buffer ?? null,
    },
  });
}

async function undoRemediation(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<Record<string, unknown> | null>> {
  const undo = action.undoPayload ?? {};
  const now = ctx.now.toISOString();
  const remediationSlotId = stringOf(undo.remediationSlotId);
  if (remediationSlotId !== '') {
    await ctx.tx.execute(sql`
      update public.schedule_slots
      set status = 'cancelled', updated_at = ${now}::timestamptz
      where id = ${remediationSlotId}::uuid and user_id = ${ctx.userId}::uuid
        and status = 'planned'
    `);
  }
  const retrySlotId = stringOf(undo.retrySlotId);
  const previous = objectOf(undo.retrySlotPrevious);
  if (retrySlotId !== '') {
    if (undo.retrySlotCreated === true) {
      await ctx.tx.execute(sql`
        update public.schedule_slots
        set status = 'cancelled', updated_at = ${now}::timestamptz
        where id = ${retrySlotId}::uuid and user_id = ${ctx.userId}::uuid
          and status = 'planned'
      `);
    } else if (previous !== null) {
      await ctx.tx.execute(sql`
        update public.schedule_slots
        set starts_at = ${stringOf(previous.startsAt)}::timestamptz,
            ends_at = ${stringOf(previous.endsAt)}::timestamptz,
            title = ${stringOf(previous.title, 'Quiz de validation')},
            updated_at = ${now}::timestamptz
        where id = ${retrySlotId}::uuid and user_id = ${ctx.userId}::uuid
      `);
    }
  }
  const buffer = objectOf(undo.retryBuffer);
  const before = objectOf(buffer?.before);
  if (buffer !== null && before !== null) {
    const status = stringOf(before.status, 'planned');
    await ctx.tx.execute(sql`
      update public.schedule_slots
      set starts_at = ${stringOf(before.startsAt)}::timestamptz,
          ends_at = ${stringOf(before.endsAt)}::timestamptz,
          status = ${status}::slot_status,
          updated_at = ${now}::timestamptz
      where id = ${stringOf(buffer.id)}::uuid and user_id = ${ctx.userId}::uuid
    `);
  }
  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export const remediationAutomation: AutomationDefinition<typeof RemediationParams> =
  defineAutomation({
    key: 'remediation',
    triggers: [{ type: 'event', name: 'quiz/graded' }],
    params: RemediationParams,
    run: async (ctx, trigger) => {
      if (trigger.type !== 'event') return [];
      return eventDrafts(ctx, trigger);
    },
    explain: explainRemediation,
    apply: applyRemediation,
    undo: undoRemediation,
  });
