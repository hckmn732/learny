// « Jeu choisi selon la lacune » (SPEC-716, BR-AUT-05, ADR-0190, ADR-0193).
//
// A detected gap drafts one action: a confusion imposes an association or a categorization that
// opposes the two notions, a forgetting imposes a recall card, an application schedules a practice
// exercise from the next day. The action is applied without consent; the session service reads the
// applied actions at draw time (ADR-0193 §4), so `apply` writes no format. A cleared gap expires
// the action before it is consumed. AI is only used indirectly, through the existing bank and
// exercise services, and the deterministic mock keeps the tests stable (ADR-0048).
import { z } from 'zod';

import { ENGINE, EXERCISE_DEFAULT_MIN } from '@learny/config/product';
import { JeuLacuneParams } from '@learny/contracts';
import {
  addCivilDays,
  AppError,
  localTimeToInstant,
  ok,
  userLocalDay,
  type Result,
} from '@learny/core';
import { sql, type Db, type DbTx } from '@learny/db';
import {
  chooseGapFormat,
  findCompatibleSlots,
  type BrickFormat,
  type CompatibleSlot,
  type ExistingPlannerSlot,
  type PlannerCalendar,
  type PlannerPreferences,
  type SlotKind,
  type SlotStatus,
} from '@learny/learning-engine';
import {
  createServiceContext,
  ensurePracticeExercise,
  requestRefill,
  type ServiceContext,
} from '@learny/services';

import {
  defineAutomation,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
  type AutomationDomainContext,
  type AutomationEffectContext,
  type AutomationTone,
} from '../moteur-d-automatismes';
import { dayOf, formatDayInSentence, formatHour } from '../reprise';

const SUMMARY_MAX = 160;
const UUID = z.uuid();

interface NotionRow extends Record<string, unknown> {
  notion_id: string;
  label: string;
  formation_id: string;
  module_id: string;
  gap_nature: string;
  gap_confused_with: string | null;
  gap_detected_at: Date | string | null;
}

interface ConfusedRow extends Record<string, unknown> {
  id: string;
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

interface BrickRow extends Record<string, unknown> {
  brick_id: string;
  type: string;
  notion_ids: string[];
  fingerprint: string | null;
}

interface LastPairRow extends Record<string, unknown> {
  payload: Record<string, unknown>;
}

function clip(value: string): string {
  return value.length <= SUMMARY_MAX ? value : `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

function stringOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function dbInstant(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatLabel(format: unknown): string {
  switch (format) {
    case 'matching':
      return 'association';
    case 'categorization':
      return 'classement';
    case 'recall_card':
      return 'carte de rappel';
    case 'choice_question':
      return 'question';
    default:
      return 'jeu';
  }
}

/** EF-9 — the applied line of the journal, short enough for the 160-character contract. */
function appliedGameText(payload: Record<string, unknown>): string {
  const notion = stringOf(payload.notionLabel, 'cette notion');
  const format = stringOf(payload.format);
  const confusion = stringOf(payload.confusedWithLabel);
  const pending = payload.pendingGeneration === true ? ' (en préparation)' : '';
  if (payload.nature === 'confusion') {
    return clip(
      `Lacune « ${notion} » : ${formatLabel(format)} « ${notion} / ${confusion} » ajouté au quiz global.${pending}`,
    );
  }
  return clip(`Lacune « ${notion} » : carte de rappel ajoutée au quiz global.${pending}`);
}

function appliedExerciseText(payload: Record<string, unknown>, timeZone: string): string {
  const notion = stringOf(payload.notionLabel, 'cette notion');
  const startsAt = stringOf(payload.startsAt);
  if (startsAt === '') return clip(`Lacune « ${notion} » : exercice pratique en préparation.`);
  const day = dayOf(startsAt, timeZone);
  return clip(
    `Lacune « ${notion} » : exercice pratique placé ${formatDayInSentence(day, startsAt, timeZone)} ${formatHour(startsAt, timeZone)}.`,
  );
}

/** EF-9 — one line for every status of the journal; no pronoun, identical in `vous` and `tu`. */
export function explainJeuLacune(
  action: AutomationActionView,
  _tone: AutomationTone,
  timeZone: string,
): string {
  const payload = action.payload;
  const notion = stringOf(payload.notionLabel, 'cette notion');
  if (action.status === 'undone') {
    if (action.kind === 'exercise_scheduled')
      return clip(`Annulé : exercice pratique de « ${notion} ».`);
    return clip(`Annulé : ${formatLabel(payload.format)} de « ${notion} » retiré du quiz global.`);
  }
  if (action.status === 'expired') {
    return clip(`Lacune « ${notion} » levée avant l’entraînement.`);
  }
  if (action.kind === 'exercise_scheduled') return appliedExerciseText(payload, timeZone);
  if (payload.nature === 'application') {
    return clip(`Lacune « ${notion} » : exercice pratique en préparation.`);
  }
  return appliedGameText(payload);
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function readNotion(
  db: Db | DbTx,
  userId: string,
  notionId: string,
): Promise<NotionRow | null> {
  if (!UUID.safeParse(notionId).success) return null;
  const rows = await db.execute<NotionRow>(sql`
    select n.id::text as notion_id,
           n.label,
           n.formation_id::text as formation_id,
           n.module_id::text as module_id,
           ns.gap_nature::text as gap_nature,
           ns.gap_confused_with::text as gap_confused_with,
           ns.gap_detected_at
    from public.notions n
    join public.notion_states ns on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
    where n.id = ${notionId}::uuid
      and ns.gap_nature is not null
      and ns.gap_cleared_at is null
    limit 1
  `);
  return rows[0] ?? null;
}

async function readConfused(db: Db | DbTx, notionId: string | null): Promise<ConfusedRow | null> {
  if (notionId === null || !UUID.safeParse(notionId).success) return null;
  const rows = await db.execute<ConfusedRow>(sql`
    select id::text as id, label from public.notions where id = ${notionId}::uuid limit 1
  `);
  return rows[0] ?? null;
}

async function readBank(
  db: Db | DbTx,
  userId: string,
  notionIds: readonly string[],
): Promise<BrickRow[]> {
  const valid = notionIds.filter((id) => UUID.safeParse(id).success);
  if (valid.length === 0) return [];
  const literal = `array[${valid.map((id) => `'${id}'`).join(',')}]::uuid[]`;
  return db.execute<BrickRow>(sql`
    select b.id::text as brick_id, b.type::text as type,
           b.notion_ids::text[] as notion_ids, bv.fingerprint
    from public.bricks b
    join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
    where b.owner_id = ${userId}::uuid
      and b.status = 'active'
      and b.purpose in ('review', 'bank')
      and b.notion_ids && ${sql.raw(literal)}
    order by b.id asc
  `);
}

async function readSeenFingerprints(db: Db | DbTx, userId: string): Promise<Set<string>> {
  const rows = await db.execute<{ fingerprint: string | null }>(sql`
    select distinct bv.fingerprint
    from public.answers a
    join public.attempts at on at.id = a.attempt_id
    join public.brick_versions bv on bv.id = a.brick_version_id
    where at.user_id = ${userId}::uuid and bv.fingerprint is not null
  `);
  return new Set(
    rows.map((row) => row.fingerprint).filter((value): value is string => value !== null),
  );
}

async function readLastPairFormat(
  db: Db | DbTx,
  userId: string,
  notionId: string,
  confusedWithId: string,
): Promise<BrickFormat | null> {
  const rows = await db.execute<LastPairRow>(sql`
    select payload
    from public.automation_actions
    where user_id = ${userId}::uuid
      and automation = 'jeu_lacune'
      and kind = 'game_chosen'
      and status in ('applied', 'consumed')
      and payload ->> 'notionId' = ${notionId}
      and payload ->> 'confusedWithId' = ${confusedWithId}
    order by created_at desc, id desc
    limit 1
  `);
  const format = rows[0]?.payload.format;
  return format === 'matching' || format === 'categorization' ? format : null;
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

async function nextExerciseSlot(
  db: Db | DbTx,
  userId: string,
  input: { formationId: string; moduleId: string; timeZone: string; now: Date },
): Promise<CompatibleSlot | null> {
  const profile = await readProfile(db, userId);
  const tomorrow = addCivilDays(userLocalDay(input.now, input.timeZone), 1);
  const slots = await readSlots(db, userId, input.now);
  const calendar: PlannerCalendar = {
    now: localTimeToInstant(tomorrow, '00:00', profile.timezone).toISOString(),
    params: ENGINE.planner,
    slots: slots.map(plannerSlot),
  };
  try {
    const candidates = findCompatibleSlots(
      {
        durationMinutes: EXERCISE_DEFAULT_MIN,
        kind: 'exercise',
        formationId: input.formationId,
        moduleId: input.moduleId,
        title: 'Exercice pratique',
      },
      calendar,
      preferencesOf(profile),
      1,
    );
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Expiration (ET-2, EF-8)                                             */
/* ------------------------------------------------------------------ */

/** ET-2 — `gap/cleared` expires the applied actions of the notion (EF-8). */
async function expireForNotion(
  ctx: AutomationDomainContext<z.output<typeof JeuLacuneParams>>,
  notionId: string,
): Promise<void> {
  if (!UUID.safeParse(notionId).success) return;
  const notion = await readConfused(ctx.db, notionId);
  const label = notion?.label ?? 'cette notion';
  const summary = clip(`Lacune « ${label} » levée avant l’entraînement.`);
  await ctx.db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string; undo_payload: unknown }>(sql`
      update public.automation_actions
      set status = 'expired', summary = ${summary}, decided_at = ${ctx.now.toISOString()}::timestamptz
      where user_id = ${ctx.userId}::uuid
        and automation = 'jeu_lacune'
        and status = 'applied'
        and payload ->> 'notionId' = ${notionId}
      returning id::text as id, undo_payload
    `);
    for (const row of rows) {
      const undo =
        typeof row.undo_payload === 'object' && row.undo_payload !== null
          ? (row.undo_payload as Record<string, unknown>)
          : {};
      const slotId = stringOf(undo.slotId);
      if (slotId === '') continue;
      await tx.execute(sql`
        update public.schedule_slots
        set status = 'cancelled', updated_at = ${ctx.now.toISOString()}::timestamptz
        where id = ${slotId}::uuid and user_id = ${ctx.userId}::uuid and status = 'planned'
      `);
    }
  });
}

/** CL-7 — a new nature or a new detection expires the previous unconsumed action of the notion. */
async function expirePrevious(
  db: Db | DbTx,
  userId: string,
  notionId: string,
  dedupeKey: string,
  now: Date,
): Promise<void> {
  await db.execute(sql`
    update public.automation_actions
    set status = 'expired', decided_at = ${now.toISOString()}::timestamptz
    where user_id = ${userId}::uuid
      and automation = 'jeu_lacune'
      and status = 'applied'
      and payload ->> 'notionId' = ${notionId}
      and (payload ->> 'dedupeKey') is distinct from ${dedupeKey}
  `);
}

/* ------------------------------------------------------------------ */
/* Proposal                                                            */
/* ------------------------------------------------------------------ */

function serviceContextOf(
  ctx: AutomationDomainContext<unknown> | AutomationEffectContext,
): ServiceContext {
  return createServiceContext({
    userId: ctx.userId,
    requestId: ctx.requestId,
    clock: ctx.clock,
    logger: ctx.logger,
  });
}

async function gameDraft(
  ctx: AutomationDomainContext<z.output<typeof JeuLacuneParams>>,
  notion: NotionRow,
  gapDetectedAt: string,
): Promise<AutomationActionDraft | null> {
  const db = ctx.db;
  const nature = notion.gap_nature;
  if (nature === 'misunderstanding') return null;
  const base = {
    notionId: notion.notion_id,
    notionLabel: notion.label,
    nature,
    confusedWithId: null as string | null,
    confusedWithLabel: null as string | null,
    brickId: null as string | null,
    pendingGeneration: false,
    gapDetectedAt,
  };

  if (nature === 'application') {
    const dedupeKey = `exercise:${notion.notion_id}:${gapDetectedAt}`;
    await expirePrevious(db, ctx.userId, notion.notion_id, dedupeKey, ctx.now);
    return {
      kind: 'exercise_scheduled',
      formationId: notion.formation_id,
      requiresConsent: false,
      payload: {
        dedupeKey,
        notionId: notion.notion_id,
        notionLabel: notion.label,
        nature: 'application',
        exerciseActivityId: null,
        slotId: null,
      },
      dedupeKey,
      notification: {
        type: 'planning_adjusted',
        href: `/formations/${encodeURIComponent(notion.formation_id)}/modules/${encodeURIComponent(notion.module_id)}/exercices`,
        data: {
          titleOverride: 'Exercice ajouté',
        },
      },
    };
  }

  if (nature === 'forgetting') {
    const bank = await readBank(db, ctx.userId, [notion.notion_id]);
    const seen = await readSeenFingerprints(db, ctx.userId);
    const available = [...new Set(bank.map((row) => row.type))] as BrickFormat[];
    const choice = chooseGapFormat({ nature: 'forgetting', available });
    if (choice.format === null) return null;
    const brick =
      bank.find(
        (row) =>
          row.type === choice.format && (row.fingerprint === null || !seen.has(row.fingerprint)),
      ) ?? null;
    const dedupeKey = `game:${notion.notion_id}:${gapDetectedAt}`;
    await expirePrevious(db, ctx.userId, notion.notion_id, dedupeKey, ctx.now);
    return {
      kind: 'game_chosen',
      formationId: notion.formation_id,
      requiresConsent: false,
      payload: {
        ...base,
        dedupeKey,
        format: choice.format,
        brickId: brick?.brick_id ?? null,
        pendingGeneration: brick === null,
      },
      dedupeKey,
    };
  }

  if (nature === 'confusion') {
    const confused = await readConfused(db, notion.gap_confused_with);
    if (confused === null) return null;
    const pairBank = await readBank(db, ctx.userId, [notion.notion_id, confused.id]);
    const seen = await readSeenFingerprints(db, ctx.userId);
    const pairRows = pairBank.filter(
      (row) => row.notion_ids.includes(confused.id) && row.notion_ids.includes(notion.notion_id),
    );
    const pairFormats = [
      ...new Set(
        pairRows
          .filter((row) => row.type === 'matching' || row.type === 'categorization')
          .map((row) => row.type),
      ),
    ] as BrickFormat[];
    const hasChoice = pairBank.some((row) => row.type === 'choice_question');
    const lastPairFormat = await readLastPairFormat(db, ctx.userId, notion.notion_id, confused.id);
    const choice = chooseGapFormat({
      nature: 'confusion',
      lastPairFormat,
      available: [...pairFormats, ...(hasChoice ? (['choice_question'] as BrickFormat[]) : [])],
    });
    const dedupeKey = `game:${notion.notion_id}:${gapDetectedAt}`;
    await expirePrevious(db, ctx.userId, notion.notion_id, dedupeKey, ctx.now);
    if (choice.format === null) {
      await requestRefill(
        serviceContextOf(ctx),
        ctx.userId,
        notion.formation_id,
        [notion.notion_id, confused.id],
        ['matching', 'categorization'],
      );
      return null;
    }
    if (choice.pendingGeneration) {
      const choiceBrick = pairBank.find((row) => row.type === 'choice_question') ?? null;
      await requestRefill(
        serviceContextOf(ctx),
        ctx.userId,
        notion.formation_id,
        [notion.notion_id, confused.id],
        ['matching', 'categorization'],
      );
      return {
        kind: 'game_chosen',
        formationId: notion.formation_id,
        requiresConsent: false,
        payload: {
          ...base,
          dedupeKey,
          nature: 'confusion',
          confusedWithId: confused.id,
          confusedWithLabel: confused.label,
          format: 'choice_question',
          brickId: choiceBrick?.brick_id ?? null,
          pendingGeneration: true,
        },
        dedupeKey,
      };
    }
    const brick =
      pairRows.find((row) => row.type === choice.format && !seen.has(stringOf(row.brick_id))) ??
      null;
    const pending = brick === null;
    if (pending) {
      await requestRefill(
        serviceContextOf(ctx),
        ctx.userId,
        notion.formation_id,
        [notion.notion_id, confused.id],
        ['matching', 'categorization'],
      );
    }
    return {
      kind: 'game_chosen',
      formationId: notion.formation_id,
      requiresConsent: false,
      payload: {
        ...base,
        dedupeKey,
        nature: 'confusion',
        confusedWithId: confused.id,
        confusedWithLabel: confused.label,
        format: choice.format,
        brickId: brick?.brick_id ?? null,
        pendingGeneration: pending,
      },
      dedupeKey,
    };
  }

  return null;
}

async function eventDrafts(
  ctx: AutomationDomainContext<z.output<typeof JeuLacuneParams>>,
  trigger: { type: 'event'; name: string; data?: Record<string, unknown> },
): Promise<AutomationActionDraft[]> {
  if (trigger.name === 'gap/cleared') {
    const notionId = stringOf(trigger.data?.notionId);
    if (notionId !== '') await expireForNotion(ctx, notionId);
    return [];
  }
  if (trigger.name !== 'gap/detected' && trigger.name !== 'gap/nature-changed') return [];
  const notionId = stringOf(trigger.data?.notionId);
  const notion = await readNotion(ctx.db, ctx.userId, notionId);
  if (notion === null) return [];
  const gapDetectedAt = dbInstant(notion.gap_detected_at);
  if (gapDetectedAt === null) return [];
  const draft = await gameDraft(ctx, notion, gapDetectedAt);
  return draft === null ? [] : [draft];
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

async function insertExerciseSlot(
  tx: DbTx,
  userId: string,
  input: {
    formationId: string;
    moduleId: string;
    activityId: string;
    notionLabel: string;
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
      ${input.activityId}::uuid, 'exercise', 'Exercice pratique',
      ${`${input.notionLabel} · ajouté par le tuteur`},
      ${input.startsAt}::timestamptz, ${input.endsAt}::timestamptz, 'planned', 'automation'
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new AppError('INTERNAL_ERROR', 'Créneau non créé.');
  return id;
}

async function applyJeuLacune(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<{ payload: Record<string, unknown>; undoPayload: Record<string, unknown> }>> {
  const payload = action.payload;
  if (action.kind !== 'exercise_scheduled') {
    // EF-4 — the format is read at draw time; nothing else is written.
    return ok({ payload, undoPayload: {} });
  }
  const notionId = stringOf(payload.notionId);
  const formationId = stringOf(payload.formationId, action.formationId ?? '');
  if (notionId === '' || formationId === '') {
    throw new AppError('VALIDATION_FAILED', 'Exercice incomplet.');
  }
  const ensured = await ensurePracticeExercise(serviceContextOf(ctx), notionId);
  if (!ensured.ok) {
    if (ensured.error.code === 'AI_UNAVAILABLE' || ensured.error.code === 'AI_CAP_REACHED') {
      return ok({ payload: { ...payload, pendingGeneration: true }, undoPayload: {} });
    }
    throw ensured.error;
  }
  const exercise = ensured.value;
  const slot = await nextExerciseSlot(ctx.tx, ctx.userId, {
    formationId,
    moduleId: exercise.moduleId,
    timeZone: ctx.timeZone,
    now: ctx.now,
  });
  if (slot === null) {
    return ok({
      payload: {
        ...payload,
        formationId,
        exerciseActivityId: exercise.exerciseId,
        slotId: null,
        pendingGeneration: true,
      },
      undoPayload: {},
    });
  }
  const slotId = await insertExerciseSlot(ctx.tx, ctx.userId, {
    formationId,
    moduleId: exercise.moduleId,
    activityId: exercise.exerciseId,
    notionLabel: stringOf(payload.notionLabel, 'Notion'),
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
  });
  const appliedPayload: Record<string, unknown> = {
    ...payload,
    formationId,
    exerciseActivityId: exercise.exerciseId,
    slotId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    pendingGeneration: false,
  };
  return ok({
    payload: appliedPayload,
    undoPayload: { slotId, exerciseActivityId: exercise.exerciseId },
  });
}

async function undoJeuLacune(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<Record<string, unknown> | null>> {
  const undo = action.undoPayload ?? {};
  const slotId = stringOf(undo.slotId);
  if (slotId !== '') {
    await ctx.tx.execute(sql`
      update public.schedule_slots
      set status = 'cancelled', updated_at = ${ctx.now.toISOString()}::timestamptz
      where id = ${slotId}::uuid and user_id = ${ctx.userId}::uuid and status = 'planned'
    `);
  }
  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export const jeuLacuneAutomation: AutomationDefinition<typeof JeuLacuneParams> = defineAutomation({
  key: 'jeu_lacune',
  // ET-2 — the second trigger expires an action when the gap is cleared (EF-8).
  triggers: [
    { type: 'event', name: 'gap/detected' },
    { type: 'event', name: 'gap/nature-changed' },
    { type: 'event', name: 'gap/cleared' },
  ],
  params: JeuLacuneParams,
  run: async (ctx, trigger) => {
    if (trigger.type !== 'event') return [];
    return eventDrafts(ctx, trigger);
  },
  explain: explainJeuLacune,
  apply: applyJeuLacune,
  undo: undoJeuLacune,
});
