import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { toPublicBrick, type BrickType } from '@learny/bricks';
import {
  ENGINE,
  GAMES_ENABLED,
  GAME_LABELS,
  REVIEW_EXTRA_NOTION_SECONDS,
  REVIEW_FORMAT_SECONDS,
} from '@learny/config/product';
import {
  GlobalQuizSessionDtoSchema,
  ReviewAnswerResultDtoSchema,
  ReviewItemDtoSchema,
  ReviewSummaryDtoSchema,
  type GlobalQuizSessionDto,
  type ReviewAnswerInput,
  type ReviewAnswerResultDto,
  type ReviewItemDto,
  type ReviewRationale,
  type ReviewSummaryDto,
} from '@learny/contracts';
import { AppError, addCivilDays, userDayBounds, userLocalDay, type Result } from '@learny/core';
import { upsertDailyActivity, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';
import {
  buildDailySession,
  previewGrades,
  type FsrsRating,
  type GlobalQuizBank,
  type GlobalQuizGap,
  type GlobalQuizLastFormat,
} from '@learny/learning-engine';

import type { ServiceContext } from '../context';
import { fromPersistenceCard } from '../learning/apply-result';
import { applyReviewResult } from '../learning/apply-review';
import { getDueNotions } from '../learning/get-due-notions';
import { requestRefill } from '../question-bank';
import { requireUser, toResult } from '../resources/result';

import { composeMicroSession, type MicroBrick } from './micro-composition';
import { buildRationale, buildMicroNote, type RationaleGapItem } from './rationale';

// Daily global quiz session of one formation (SPEC-701, BR-MEM-03/08/09/10, ADR-0180, ADR-0319).
//
// One activity per (owner, formation, local day, mode): the first `GET` of the day creates the
// session under a consultative lock, the following ones replay the same DTO. The pure engine
// draws one item per notion; the service groups the notions served by the same brick into one
// game item. Every answer updates FSRS in its transaction; « Passer » writes none. All the
// reads go through the learner's RLS client; the payloads sent to the browser are the public
// projections of `@learny/bricks` (solutions withheld, ADR-0150 §3).

const REVIEW_ACTIVITY_KIND = 'global_quiz_session' as const;

interface ActivityRow {
  [key: string]: unknown;
  id: string;
  formation_id: string;
  config: unknown;
  items: unknown;
  status: string;
  for_date: string | null;
}

interface AttemptRow {
  [key: string]: unknown;
  id: string;
  attempt_no: number;
  status: string;
  started_at: Date | string;
  review_feedback: unknown;
}

interface BrickVersionRow {
  [key: string]: unknown;
  brick_id: string;
  version_id: string;
  type: string;
  notion_ids: string[];
  payload: unknown;
  status: string;
  fingerprint: string | null;
  origin: string;
}

interface AnswerRow {
  [key: string]: unknown;
  id: string;
  position: number;
  is_correct: boolean | null;
  response: unknown;
  feedback: unknown;
  time_ms: number | null;
}

interface NotionRow {
  [key: string]: unknown;
  notion_id: string;
  label: string;
  module_id: string;
  module_position: number;
  in_review: boolean;
  due_at: Date | string;
  gap_nature: string | null;
  gap_detected_at: Date | string | null;
  fsrs: unknown;
}

interface SessionItemConfig {
  position: number;
  format: string;
  reasonKey: string | null;
  displayLabel: string;
  moduleIds: string[];
  notionIds: string[];
  withdrawn?: boolean;
}

interface SessionConfig {
  mode: 'full' | 'micro';
  forDate: string;
  dueCount: number;
  deferredCount: number;
  deferredTo: string;
  capMinutes: number;
  estimatedSec: number;
  rationale: ReviewRationale[];
  items: SessionItemConfig[];
  /** SPEC-703 EF-3 — frozen explanatory note of the micro-session (CL-1, CL-2). */
  note?: string;
  /** SPEC-703 — duration D of the micro-session, frozen at creation (CL-6). */
  microMinutes?: number;
}

const sessionConfigSchema = z.object({
  mode: z.enum(['full', 'micro']),
  forDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueCount: z.number().int().min(0),
  deferredCount: z.number().int().min(0),
  deferredTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  capMinutes: z.number().int().min(1),
  estimatedSec: z.number().int().min(0),
  rationale: z.array(z.object({ label: z.string(), text: z.string() })),
  note: z.string().optional(),
  microMinutes: z.number().int().min(1).optional(),
  items: z.array(
    z.object({
      position: z.number().int().min(0),
      format: z.string(),
      reasonKey: z.string().nullable(),
      displayLabel: z.string(),
      moduleIds: z.array(z.string()),
      notionIds: z.array(z.string()),
      withdrawn: z.boolean().optional(),
    }),
  ),
});

function parseSessionConfig(raw: unknown): SessionConfig | null {
  const parsed = sessionConfigSchema.safeParse(raw);
  return parsed.success ? (parsed.data as SessionConfig) : null;
}

const WEEKDAY_LABELS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Lowercase weekday name of a civil day (EF-4 note, ADR-0319 §8: never « demain »). */
function weekdayLabel(day: string): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? day : (WEEKDAY_LABELS[parsed.getUTCDay()] ?? day);
}

/** « 11 novembre » of a civil day, for the session subtitle. */
function dayMonthLabel(day: string, timeZone: string): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? day
    : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone }).format(parsed);
}

/** Rail reason text by engine reason key (EF-6). */
const REASON_TEXTS: Readonly<Record<string, string>> = {
  gap_forgetting: 'Choisi pour votre oubli',
  gap_confusion: 'Choisi pour votre confusion',
  gap_misunderstanding: 'Choisi pour votre malentendu',
  gap_application: 'Choisi pour votre entraînement',
};

/** Item scope label (EF-8): « Module 2 » or « Modules 1 et 2 » (without « mêlés »). */
function itemScopeLabel(positions: readonly number[]): string {
  const sorted = [...new Set(positions)].filter((position) => position > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return `Module ${String(sorted[0])}`;
  if (sorted.length === 2) return `Modules ${String(sorted[0])} et ${String(sorted[1])}`;
  return `Modules ${sorted.map((position) => String(position)).join(', ')}`;
}

/** Header pill (EF-3): like the item scope, with « mêlés » from two modules on. */
function modulesLabel(positions: readonly number[]): string {
  const sorted = [...new Set(positions)].filter((position) => position > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return `Module ${String(sorted[0])}`;
  if (sorted.length === 2) return `Modules ${String(sorted[0])} et ${String(sorted[1])} mêlés`;
  const head = sorted
    .slice(0, -1)
    .map((position) => String(position))
    .join(', ');
  return `Modules ${head} et ${String(sorted[sorted.length - 1])} mêlés`;
}

/** ET-8 + ADR-0319 §4 — cost of one game: its format price, 30 s per additional notion. */
function itemCostSec(format: string, notionCount: number): number {
  const costs = REVIEW_FORMAT_SECONDS as Record<string, number>;
  return (costs[format] ?? 60) + REVIEW_EXTRA_NOTION_SECONDS * Math.max(0, notionCount - 1);
}

async function loadProfileTimezone(tx: DbTx, userId: string): Promise<string> {
  const rows = await tx.execute<{ timezone: string }>(sql`
    select timezone from public.profiles where id = ${userId}::uuid
  `);
  return rows[0]?.timezone ?? 'Europe/Paris';
}

interface FormationRow {
  [key: string]: unknown;
  id: string;
  title: string;
  status: string;
}

async function loadFormation(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<FormationRow | null> {
  const rows = await tx.execute<FormationRow>(sql`
    select f.id::text as id, f.title, f.status::text as status
    from public.formations f
    where f.id = ${formationId}::uuid
      and (
        f.owner_id = ${userId}::uuid
        or exists (
          select 1
          from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = ${userId}::uuid
            and gm.member_status = 'active'
            and gm.left_at is null
        )
      )
    limit 1
  `);
  return rows[0] ?? null;
}

/** All the due notion states of the day, in review or not (the count the note displays). */
async function loadDueRows(
  tx: DbTx,
  userId: string,
  formationId: string,
  bounds: { start: Date; end: Date },
): Promise<NotionRow[]> {
  return tx.execute<NotionRow>(sql`
    select
      ns.notion_id::text as notion_id,
      n.label,
      n.module_id::text as module_id,
      m.position as module_position,
      ns.in_review,
      ns.due_at,
      ns.gap_nature::text as gap_nature,
      ns.gap_detected_at,
      ns.fsrs
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    join public.modules m on m.id = n.module_id
    where ns.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
      and not ns.suspended
      and ns.due_at <= ${bounds.end.toISOString()}::timestamptz
    order by m.position asc, ns.due_at asc, n.id asc
  `);
}

async function loadActiveBricks(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<BrickVersionRow[]> {
  return tx.execute<BrickVersionRow>(sql`
    select
      b.id::text as brick_id,
      bv.id::text as version_id,
      b.type::text as type,
      b.notion_ids::text[] as notion_ids,
      bv.payload,
      b.status::text as status,
      bv.fingerprint,
      bv.origin::text as origin
    from public.bricks b
    join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
    where b.owner_id = ${userId}::uuid
      and b.formation_id = ${formationId}::uuid
      and b.status = 'active'
      and b.purpose in ('review', 'bank')
  `);
}

/** Format of the most recent answered brick of each notion (BR-MEM-04 variation). */
async function loadLastFormats(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<GlobalQuizLastFormat[]> {
  const rows = await tx.execute<{ notion_ids: string[]; type: string }>(sql`
    select b.notion_ids::text[] as notion_ids, b.type::text as type
    from public.answers a
    join public.attempts at on at.id = a.attempt_id
    join public.activities act on act.id = at.activity_id
    join public.brick_versions bv on bv.id = a.brick_version_id
    join public.bricks b on b.id = bv.brick_id
    where at.user_id = ${userId}::uuid
      and act.formation_id = ${formationId}::uuid
      and a.is_correct is not null
      and (a.response is null or (a.response ->> 'skipped') is null)
    order by a.answered_at desc
    limit 20
  `);
  const lastByNotion = new Map<string, GlobalQuizLastFormat>();
  for (const row of rows) {
    for (const notionId of row.notion_ids) {
      if (!lastByNotion.has(notionId)) {
        lastByNotion.set(notionId, { notionId, format: row.type as never });
      }
    }
  }
  return [...lastByNotion.values()];
}

async function loadAutomationParams(
  tx: DbTx,
  userId: string,
): Promise<{
  capMinutes: number;
  preference: 'vary' | 'cards' | 'matching_categorization';
  microMinutes: number;
}> {
  const rows = await tx.execute<{ key: string; params: unknown }>(sql`
    select key::text as key, params
    from public.automation_settings
    where user_id = ${userId}::uuid and key in ('plafond_quiz', 'jeu_lacune', 'micro_seance')
  `);
  let capMinutes: number = ENGINE.globalQuiz.maxMinutesDefault;
  let preference: 'vary' | 'cards' | 'matching_categorization' = 'vary';
  let microMinutes: number = ENGINE.globalQuiz.microMinutesDefault;
  for (const row of rows) {
    const params = (row.params ?? {}) as Record<string, unknown>;
    if (row.key === 'plafond_quiz' && typeof params.maxMinutes === 'number') {
      capMinutes = Math.round(params.maxMinutes);
    }
    if (row.key === 'jeu_lacune' && typeof params.preference === 'string') {
      const parsed = z
        .enum(['vary', 'cards', 'matching_categorization'])
        .safeParse(params.preference);
      if (parsed.success) preference = parsed.data;
    }
    if (row.key === 'micro_seance' && typeof params.durationMin === 'number') {
      const parsed = z
        .union([z.literal(3), z.literal(5), z.literal(10)])
        .safeParse(params.durationMin);
      if (parsed.success) microMinutes = parsed.data;
    }
  }
  return { capMinutes, preference, microMinutes };
}

/** Fingerprints of the brick variants the learner already answered (BR-MEM-07 EF-5). */
async function loadSeenFingerprints(tx: DbTx, userId: string): Promise<Set<string>> {
  const rows = await tx.execute<{ fingerprint: string | null }>(sql`
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

interface DrawnItem {
  brickId: string;
  brickVersionId: string;
  format: string;
  notionIds: string[];
  displayLabel: string;
  moduleIds: string[];
  reasonKey: string | null;
}

/**
 * ADR-0319 §1 — groups the per-notion items of the pure draw into game items served by one brick
 * each: the first drawn notion that a still-unused brick can serve opens the item, the later
 * drawn notions of the same brick join it. The order follows the engine order, hence the rail.
 */
function groupByBricks(
  engineItems: readonly { notionId: string; format: string; gapNature: string | null }[],
  notionById: ReadonlyMap<string, NotionRow>,
  selectedNotions: ReadonlySet<string>,
  bricks: readonly BrickVersionRow[],
  seenFingerprints: ReadonlySet<string>,
): { items: DrawnItem[]; exhausted: { notionId: string; format: string }[] } {
  const items: DrawnItem[] = [];
  const exhausted: { notionId: string; format: string }[] = [];
  const usedBricks = new Set<string>();
  const coveredNotions = new Set<string>();
  for (const engineItem of engineItems) {
    if (coveredNotions.has(engineItem.notionId)) continue;
    const brick = bricks
      .filter(
        (candidate) =>
          candidate.type === engineItem.format &&
          !usedBricks.has(candidate.brick_id) &&
          candidate.notion_ids.includes(engineItem.notionId) &&
          candidate.notion_ids.every((notionId) => selectedNotions.has(notionId)),
      )
      .filter(
        (candidate) =>
          candidate.fingerprint === null || !seenFingerprints.has(candidate.fingerprint),
      )
      .sort(
        (left, right) =>
          right.notion_ids.length - left.notion_ids.length ||
          left.brick_id.localeCompare(right.brick_id),
      )[0];
    if (brick === undefined) {
      exhausted.push({ notionId: engineItem.notionId, format: engineItem.format });
      continue;
    }
    usedBricks.add(brick.brick_id);
    const notionIds = brick.notion_ids.filter((notionId) => selectedNotions.has(notionId));
    for (const notionId of notionIds) coveredNotions.add(notionId);
    items.push({
      brickId: brick.brick_id,
      brickVersionId: brick.version_id,
      format: brick.type,
      notionIds,
      displayLabel: displayLabelOf(brick, notionIds, notionById),
      moduleIds: [
        ...new Set(notionIds.map((notionId) => notionById.get(notionId)?.module_id ?? '')),
      ].filter((moduleId) => moduleId !== ''),
      reasonKey: engineItem.gapNature === null ? null : `gap_${engineItem.gapNature}`,
    });
  }
  return { items, exhausted };
}

/**
 * Rail label of an item (EF-6): the notion label for a single-notion game, else the part of the
 * brick instruction before « : » (« Notions de base SAP : reliez… » → « Notions de base SAP »).
 */
function displayLabelOf(
  brick: BrickVersionRow,
  notionIds: readonly string[],
  notionById: ReadonlyMap<string, NotionRow>,
): string {
  if (notionIds.length === 1) {
    return notionById.get(notionIds[0] ?? '')?.label ?? 'Notion';
  }
  const payload = brick.payload;
  const title =
    typeof payload === 'object' && payload !== null && 'title' in payload
      ? (payload as { title?: unknown }).title
      : null;
  if (typeof title === 'string' && title.trim().length > 0) return title.trim();
  const instruction =
    typeof payload === 'object' && payload !== null && 'instruction' in payload
      ? (payload as { instruction?: unknown }).instruction
      : null;
  if (typeof instruction === 'string' && instruction.trim().length > 0) {
    return instruction.split(' : ')[0]?.trim() ?? instruction.trim();
  }
  return notionIds
    .map((notionId) => notionById.get(notionId)?.label ?? '')
    .filter((label) => label !== '')
    .slice(0, 1)
    .join(', ');
}

/**
 * SPEC-703 EF-2, ET-2, ET-3 — micro-session of D minutes: the engine order ranks the due notions
 * (gaps first, then delay); the pure composition keeps the recall cards on the most urgent
 * notions, then one question covering up to four other priority notions. Every served brick keeps
 * the display label of the daily session and the gap reason of its first notion.
 */
function composeMicro(
  engineOrder: readonly string[],
  reviewRows: readonly NotionRow[],
  bricks: readonly BrickVersionRow[],
  notionById: ReadonlyMap<string, NotionRow>,
  seenFingerprints: ReadonlySet<string>,
  durationMin: number,
): { items: DrawnItem[]; exhausted: { notionId: string; format: string }[] } {
  const priority = rankNotions(engineOrder, reviewRows);
  const candidates: MicroBrick[] = bricks
    .map((brick) => {
      const notionIds = brick.notion_ids.filter((notionId) => notionById.has(notionId));
      const gapNature = notionById.get(notionIds[0] ?? '')?.gap_nature ?? null;
      return {
        brickId: brick.brick_id,
        brickVersionId: brick.version_id,
        type: brick.type,
        notionIds,
        displayLabel: displayLabelOf(brick, notionIds, notionById),
        moduleIds: [
          ...new Set(notionIds.map((notionId) => notionById.get(notionId)?.module_id ?? '')),
        ].filter((moduleId) => moduleId !== ''),
        reasonKey: gapNature === null ? null : `gap_${gapNature}`,
        fingerprint: brick.fingerprint,
      } satisfies MicroBrick;
    })
    .filter((brick) => brick.notionIds.length > 0);

  const composition = composeMicroSession({
    durationMin,
    gamesEnabled: GAMES_ENABLED,
    priorityNotionIds: priority,
    bricks: candidates,
    seenFingerprints,
  });
  return {
    items: composition.items.map((brick) => ({
      brickId: brick.brickId,
      brickVersionId: brick.brickVersionId,
      format: brick.type,
      notionIds: brick.notionIds,
      displayLabel: brick.displayLabel,
      moduleIds: brick.moduleIds,
      reasonKey: brick.reasonKey,
    })),
    exhausted: composition.missingFormats.map((format) => ({
      notionId: priority[0] ?? '',
      format,
    })),
  };
}

/** Ranks the due notions: engine order first, then gaps before plain delays (ADR-0182 §1). */
function rankNotions(engineOrder: readonly string[], reviewRows: readonly NotionRow[]): string[] {
  const ranked = [...new Set(engineOrder.filter((notionId) => notionId !== ''))];
  const seen = new Set(ranked);
  const rest = [...reviewRows]
    .filter((row) => !seen.has(row.notion_id))
    .sort(
      (left, right) =>
        Number(right.gap_nature !== null) - Number(left.gap_nature !== null) ||
        new Date(left.due_at).getTime() - new Date(right.due_at).getTime() ||
        left.module_position - right.module_position ||
        left.notion_id.localeCompare(right.notion_id),
    );
  for (const row of rest) ranked.push(row.notion_id);
  return ranked;
}

function emptyDto(
  today: string,
  formationId: string,
  status: 'empty' | 'paused',
): GlobalQuizSessionDto {
  return GlobalQuizSessionDtoSchema.parse({
    sessionId: null,
    attemptId: null,
    formationId,
    forDate: today,
    mode: 'full',
    status,
    header: { notionCount: 0, modulesLabel: '', estimatedMinutes: 0, subtitle: '' },
    modeOptions: {
      fullMinutes: 0,
      microMinutes: ENGINE.globalQuiz.microMinutesDefault,
    },
    note: '',
    rationale: [],
    items: [],
    currentPosition: 0,
    summary: null,
  });
}

/**
 * EF-2, EF-1, CL-1 to CL-4 — reads (and creates on the first load) the session of the day.
 * An inaccessible formation is a 404; a paused formation is a `paused` DTO; nothing due is an
 * `empty` DTO without any write; a session of a previous day is closed on the way (CL-2).
 */
export function getOrCreateTodaySession(
  ctx: ServiceContext,
  formationId: string,
  mode: 'full' | 'micro',
): Promise<Result<GlobalQuizSessionDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!z.uuid().safeParse(formationId).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de formation invalide.');
    }
    const created = await db.run(async (tx) => {
      const now = ctx.clock.now();
      const timeZone = await loadProfileTimezone(tx, userId);
      const today = userLocalDay(now, timeZone);
      const formation = await loadFormation(tx, userId, formationId);
      if (formation === null) {
        throw new AppError('NOT_FOUND', 'Formation introuvable.');
      }
      if (formation.status === 'paused') {
        return { dto: emptyDto(today, formationId, 'paused'), refill: [] as const };
      }
      if (formation.status === 'completed') {
        // CL-10 — a completed formation is served by the maintenance interview (SPEC-617).
        throw new AppError('NOT_FOUND', 'Formation introuvable.');
      }

      await closeStaleSessions(tx, ctx, userId, today);

      const existing = await findTodayActivity(tx, userId, formationId, today, mode);
      if (existing !== null) {
        return {
          dto: await buildDto(
            ctx,
            tx,
            userId,
            timeZone,
            today,
            formation,
            existing.activity,
            existing.attempt,
          ),
          refill: [],
        };
      }

      const bounds = userDayBounds(today, timeZone);
      const dueRows = await loadDueRows(tx, userId, formationId, bounds);
      const dueCount = dueRows.length;
      if (dueCount === 0) {
        // CL-1 — nothing due: no activity, no attempt, badge 0.
        return { dto: emptyDto(today, formationId, 'empty'), refill: [] as const };
      }
      const reviewRows = dueRows.filter((row) => row.in_review);
      const due = await getDueNotions(ctx, formationId, now);
      if (!due.ok) throw due.error;
      const engineNotions = new Map(due.value.notions.map((notion) => [notion.notionId, notion]));
      const bricks = await loadActiveBricks(tx, userId, formationId);
      const bank: GlobalQuizBank[] = reviewRows.map((row) => ({
        notionId: row.notion_id,
        formats: [
          ...new Set(
            bricks
              .filter((brick) => brick.notion_ids.includes(row.notion_id))
              .map((brick) => brick.type),
          ),
        ] as GlobalQuizBank['formats'],
      }));
      const gaps: GlobalQuizGap[] = due.value.gaps;
      const lastFormats = await loadLastFormats(tx, userId, formationId);
      const automation = await loadAutomationParams(tx, userId);
      const microMinutes = automation.microMinutes;
      const capMinutes = mode === 'micro' ? microMinutes : automation.capMinutes;
      const drawn = buildDailySession({
        formationId,
        date: today,
        dueNotions: reviewRows.map((row) => ({
          notionId: row.notion_id,
          moduleId: row.module_id,
          modulePosition: row.module_position,
          moduleStatus: engineNotions.get(row.notion_id)?.moduleStatus ?? 'validated',
          evaluated: engineNotions.get(row.notion_id)?.evaluated ?? true,
          dueAt: new Date(row.due_at).toISOString(),
        })),
        gaps,
        bank,
        lastFormats,
        capMinutes,
        mode,
        seed: `global-quiz:${userId}:${formationId}:${today}:${mode}`,
        preference: automation.preference,
        params: {
          notionCostSec: ENGINE.globalQuiz.notionCostSec,
          sessionOverheadSec: ENGINE.globalQuiz.sessionOverheadSec,
          formatSeconds: ENGINE.globalQuiz.formatSeconds,
          maintenanceMaxMinutes: ENGINE.globalQuiz.maintenanceMaxMinutes,
        },
      });

      const notionById = new Map(dueRows.map((row) => [row.notion_id, row]));
      const selectedNotions = new Set(drawn.items.map((item) => item.notionId));
      const seenFingerprints = await loadSeenFingerprints(tx, userId);
      let grouped: { items: DrawnItem[]; exhausted: { notionId: string; format: string }[] };
      if (mode === 'micro') {
        grouped = composeMicro(
          drawn.items.map((item) => item.notionId),
          reviewRows,
          bricks,
          notionById,
          seenFingerprints,
          microMinutes,
        );
      } else {
        grouped = groupByBricks(
          drawn.items.map((item) => ({
            notionId: item.notionId,
            format: item.format,
            gapNature: item.gapNature,
          })),
          notionById,
          selectedNotions,
          bricks,
          seenFingerprints,
        );
      }
      if (grouped.items.length === 0) {
        // CL-7 / CL-8 — every drawn notion waits for a bank variant: nothing is written, but the
        // exhausted formats still ask SPEC-513 for new variants.
        return {
          dto: emptyDto(today, formationId, 'empty'),
          refill: [...grouped.exhausted, ...refillOf(drawn.exhausted)],
        };
      }

      const selectedCount = new Set(grouped.items.flatMap((item) => item.notionIds)).size;
      const deferredCount = Math.max(0, dueCount - selectedCount);
      const deferredTo = addCivilDays(today, 1);
      const estimatedSec =
        mode === 'micro'
          ? microMinutes * 60
          : grouped.items.reduce(
              (sum, item) => sum + itemCostSec(item.format, item.notionIds.length),
              0,
            );
      const microCardCount = grouped.items.filter((item) => item.format === 'recall_card').length;
      const microHasQuestion = grouped.items.some((item) => item.format !== 'recall_card');
      const rationale = buildRationale({
        ...(mode === 'micro' ? { mode, microCards: microCardCount, microHasQuestion } : {}),
        timeZone,
        now,
        dueCount,
        deferredCount,
        deferredTo,
        capMinutes,
        gapItems: gapItemsOf(grouped.items, notionById),
        modulePositions: grouped.items.flatMap((item) =>
          item.notionIds.map((notionId) => notionById.get(notionId)?.module_position ?? 0),
        ),
      });
      const config: SessionConfig = {
        mode,
        forDate: today,
        dueCount,
        deferredCount,
        deferredTo,
        capMinutes,
        estimatedSec,
        rationale,
        ...(mode === 'micro'
          ? {
              note: buildMicroNote({ cards: microCardCount, hasQuestion: microHasQuestion }),
              microMinutes,
            }
          : {}),
        items: grouped.items.map((item, index) => ({
          position: index,
          format: item.format,
          reasonKey: item.reasonKey,
          displayLabel: item.displayLabel,
          moduleIds: item.moduleIds,
          notionIds: item.notionIds,
        })),
      };

      const lockKey = `${userId}:${formationId}:${today}:${mode}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const replay = await findTodayActivity(tx, userId, formationId, today, mode);
      if (replay !== null) {
        return {
          dto: await buildDto(
            ctx,
            tx,
            userId,
            timeZone,
            today,
            formation,
            replay.activity,
            replay.attempt,
          ),
          refill: [],
        };
      }

      const activityId = randomUUID();
      const attemptId = randomUUID();
      const createdAt = now.toISOString();
      await tx.execute(sql`
        insert into public.activities
          (id, owner_id, formation_id, module_id, kind, config, items, status, for_date, created_at)
        values (
          ${activityId}::uuid,
          ${userId}::uuid,
          ${formationId}::uuid,
          null,
          ${REVIEW_ACTIVITY_KIND}::public.activity_kind,
          ${JSON.stringify(config)}::jsonb,
          ${JSON.stringify(
            grouped.items.map((item) => ({
              brickId: item.brickId,
              brickVersionId: item.brickVersionId,
            })),
          )}::jsonb,
          'ready',
          ${today}::date,
          ${createdAt}::timestamptz
        )
      `);
      await tx.execute(sql`
        insert into public.attempts (id, user_id, activity_id, attempt_no, status, started_at, created_at)
        values (
          ${attemptId}::uuid,
          ${userId}::uuid,
          ${activityId}::uuid,
          1,
          'in_progress',
          ${createdAt}::timestamptz,
          ${createdAt}::timestamptz
        )
      `);

      const activity: ActivityRow = {
        id: activityId,
        formation_id: formationId,
        config,
        items: grouped.items.map((item) => ({
          brickId: item.brickId,
          brickVersionId: item.brickVersionId,
        })),
        status: 'ready',
        for_date: today,
      };
      const attempt: AttemptRow = {
        id: attemptId,
        attempt_no: 1,
        status: 'in_progress',
        started_at: createdAt,
        review_feedback: null,
      };
      return {
        dto: await buildDto(ctx, tx, userId, timeZone, today, formation, activity, attempt),
        refill: [...grouped.exhausted, ...refillOf(drawn.exhausted)],
      };
    });

    // CL-7 — the refill request leaves the transaction: it never blocks the session creation.
    if (created.refill.length > 0) {
      const exhaustedByNotion = new Map(created.refill.map((entry) => [entry.notionId, entry]));
      await requestRefill(
        ctx,
        ctx.userId as string,
        formationId,
        [...exhaustedByNotion.keys()],
        [...new Set(created.refill.map((entry) => entry.format))],
      );
    }
    return created.dto;
  });
}

/** Formats the engine reported as exhausted, mapped to the refill request of SPEC-513 (CL-7). */
function refillOf(
  exhausted: readonly {
    notionId: string;
    requiredFormats: readonly string[];
    availableFormats: readonly string[];
  }[],
): { notionId: string; format: string }[] {
  return exhausted.flatMap((entry) => {
    const format = entry.requiredFormats[0] ?? entry.availableFormats[0];
    return format === undefined ? [] : [{ notionId: entry.notionId, format }];
  });
}

function gapItemsOf(
  items: readonly DrawnItem[],
  notionById: ReadonlyMap<string, NotionRow>,
): RationaleGapItem[] {
  const gapItems: RationaleGapItem[] = [];
  for (const item of items) {
    if (item.reasonKey === null) continue;
    const row = notionById.get(item.notionIds[0] ?? '');
    if (row === undefined) continue;
    gapItems.push({
      notionLabel: row.label,
      gapNature: item.reasonKey.replace('gap_', '') as RationaleGapItem['gapNature'],
      gapDetectedAt:
        row.gap_detected_at === null ? null : new Date(row.gap_detected_at).toISOString(),
      format: item.format,
    });
  }
  return gapItems;
}

async function findTodayActivity(
  tx: DbTx,
  userId: string,
  formationId: string,
  today: string,
  mode: string,
): Promise<{ activity: ActivityRow; attempt: AttemptRow } | null> {
  const rows = await tx.execute<
    ActivityRow & {
      attempt_id: string | null;
      attempt_no: number | null;
      attempt_status: string | null;
      started_at: Date | string | null;
      review_feedback: unknown;
    }
  >(sql`
    select
      a.id::text as id,
      a.formation_id::text as formation_id,
      a.config,
      a.items,
      a.status::text as status,
      a.for_date::text as for_date,
      at.id::text as attempt_id,
      at.attempt_no,
      at.status::text as attempt_status,
      at.started_at,
      at.review_feedback
    from public.activities a
    left join lateral (
      select * from public.attempts
      where activity_id = a.id and user_id = ${userId}::uuid
      order by attempt_no desc limit 1
    ) at on true
    where a.owner_id = ${userId}::uuid
      and a.formation_id = ${formationId}::uuid
      and a.kind = ${REVIEW_ACTIVITY_KIND}::public.activity_kind
      and a.for_date = ${today}::date
      and a.config->>'mode' = ${mode}
    order by a.created_at desc, a.id desc
    limit 1
  `);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    activity: {
      id: row.id,
      formation_id: row.formation_id,
      config: row.config,
      items: row.items,
      status: row.status,
      for_date: row.for_date,
    },
    attempt: {
      id: row.attempt_id ?? '',
      attempt_no: row.attempt_no ?? 1,
      status: row.attempt_status ?? 'in_progress',
      started_at: row.started_at ?? new Date(0).toISOString(),
      review_feedback: row.review_feedback,
    },
  };
}

/** CL-2 — a session left in progress on a previous local day is closed at the first load. */
async function closeStaleSessions(
  tx: DbTx,
  ctx: ServiceContext,
  userId: string,
  today: string,
): Promise<void> {
  const rows = await tx.execute<{ id: string; attempt_id: string }>(sql`
    select a.id::text as id, at.id::text as attempt_id
    from public.activities a
    join public.attempts at on at.activity_id = a.id and at.status = 'in_progress'
    where a.owner_id = ${userId}::uuid
      and a.kind = ${REVIEW_ACTIVITY_KIND}::public.activity_kind
      and a.for_date is not null
      and a.for_date < ${today}::date
  `);
  for (const row of rows) {
    await closeAttempt(tx, ctx, userId, row.attempt_id);
    await tx.execute(sql`
      update public.attempts
      set status = 'abandoned',
          submitted_at = ${ctx.clock.now().toISOString()}::timestamptz,
          duration_ms = greatest(0, ${ctx.clock.now().getTime()} - extract(epoch from started_at)::bigint * 1000)
      where id = ${row.attempt_id}::uuid and status = 'in_progress'
    `);
  }
}

/** Marks the untraited items of one in-progress review attempt as skipped (EF-10). */
async function closeAttempt(
  tx: DbTx,
  ctx: ServiceContext,
  userId: string,
  attemptId: string,
): Promise<void> {
  const rows = await tx.execute<{ config: unknown; items: unknown }>(sql`
    select a.config, a.items
    from public.activities a
    join public.attempts at on at.activity_id = a.id
    where at.id = ${attemptId}::uuid
      and a.owner_id = ${userId}::uuid
      and a.kind = ${REVIEW_ACTIVITY_KIND}::public.activity_kind
      and at.status = 'in_progress'
    for update of a
  `);
  const row = rows[0];
  if (row === undefined) return;
  const config = parseSessionConfig(row.config);
  if (config === null) return;
  const items = (row.items ?? []) as { brickId: string; brickVersionId: string }[];
  const answerRows = await tx.execute<{ position: number }>(sql`
    select position from public.answers where attempt_id = ${attemptId}::uuid
  `);
  const answered = new Set(answerRows.map((entry) => entry.position));
  const now = ctx.clock.now().toISOString();
  for (const item of config.items) {
    if (item.withdrawn === true || answered.has(item.position + 1)) continue;
    await tx.execute(sql`
      insert into public.answers
        (attempt_id, brick_version_id, position, response, is_correct, time_ms, graded_by, feedback, answered_at)
      values (
        ${attemptId}::uuid,
        ${items[item.position]?.brickVersionId ?? randomUUID()}::uuid,
        ${item.position + 1},
        ${JSON.stringify({ skipped: true })}::jsonb,
        null,
        0,
        'code',
        ${JSON.stringify({ clientAnswerId: randomUUID(), skippedAtClosure: true })}::jsonb,
        ${now}::timestamptz
      )
      on conflict (attempt_id, position) do nothing
    `);
  }
}

function notionWord(count: number): string {
  if (count === 1) return '1 notion';
  return `${String(count)} notions`;
}

function wasDueWord(count: number): string {
  if (count === 1) return '1 notion était due';
  return `${String(count)} notions étaient dues`;
}

/**
 * SPEC-703 EF-1, CL-6 — durations shown by the two-mode switch. Each button keeps the duration of
 * the session that exists today for its mode; when a mode has no session yet, the micro duration
 * is the automation 2 setting and the full duration the daily cap.
 */
async function loadModeOptions(
  tx: DbTx,
  userId: string,
  formationId: string,
  today: string,
  config: SessionConfig,
): Promise<{ fullMinutes: number; microMinutes: number }> {
  const rows = await tx.execute<{ config: unknown }>(sql`
    select config
    from public.activities
    where owner_id = ${userId}::uuid
      and formation_id = ${formationId}::uuid
      and kind = ${REVIEW_ACTIVITY_KIND}::public.activity_kind
      and for_date = ${today}::date
  `);
  let fullMinutes: number | null = null;
  let microMinutes: number | null = null;
  for (const row of rows) {
    const parsed = parseSessionConfig(row.config);
    if (parsed === null) continue;
    if (parsed.mode === 'full') fullMinutes = Math.max(1, Math.ceil(parsed.estimatedSec / 60));
    if (parsed.mode === 'micro') {
      microMinutes = parsed.microMinutes ?? Math.max(1, Math.ceil(parsed.estimatedSec / 60));
    }
  }
  if (fullMinutes === null && config.mode === 'full') {
    fullMinutes = Math.max(1, Math.ceil(config.estimatedSec / 60));
  }
  if (microMinutes === null && config.mode === 'micro') {
    microMinutes = config.microMinutes ?? Math.max(1, Math.ceil(config.estimatedSec / 60));
  }
  if (microMinutes === null) {
    const automation = await loadAutomationParams(tx, userId);
    microMinutes = automation.microMinutes;
  }
  return {
    fullMinutes: fullMinutes ?? ENGINE.globalQuiz.maxMinutesDefault,
    microMinutes,
  };
}

/**
 * Builds the DTO of an existing session: the frozen config, the bricks read in one query (ET-11),
 * the client-safe payloads, the FSRS previews of the recall cards and the answers state.
 */
async function buildDto(
  ctx: ServiceContext,
  tx: DbTx,
  userId: string,
  timeZone: string,
  today: string,
  formation: FormationRow,
  activity: ActivityRow,
  attempt: AttemptRow,
): Promise<GlobalQuizSessionDto> {
  const config = parseSessionConfig(activity.config);
  if (config === null) {
    throw new AppError('INTERNAL_ERROR', 'Configuration de session illisible.');
  }
  const activityItems = (activity.items ?? []) as {
    brickId: string;
    brickVersionId: string;
  }[];
  const versionIds = config.items
    .map((item) => activityItems[item.position]?.brickVersionId ?? '')
    .filter((value) => value !== '');
  const brickRows =
    versionIds.length === 0
      ? []
      : await tx.execute<BrickVersionRow>(sql`
          select
            b.id::text as brick_id,
            bv.id::text as version_id,
            b.type::text as type,
            b.notion_ids::text[] as notion_ids,
            bv.payload,
            b.status::text as status,
            bv.fingerprint,
            bv.origin::text as origin
          from public.brick_versions bv
          join public.bricks b on b.id = bv.brick_id
          where bv.id = any(
            array(select jsonb_array_elements_text(${JSON.stringify(versionIds)}::jsonb)::uuid)
          )
        `);
  const brickByVersionId = new Map(brickRows.map((row) => [row.version_id, row]));

  const answerRows =
    attempt.id === ''
      ? []
      : await tx.execute<AnswerRow>(sql`
          select id::text as id, position, is_correct, response, feedback, time_ms
          from public.answers
          where attempt_id = ${attempt.id}::uuid
          order by position
        `);
  const answerByPosition = new Map(answerRows.map((row) => [row.position, row]));
  const answeredPositions = new Set(answerByPosition.keys());

  // ET-6 (BR-MEM-09) — a brick reported after the creation withdraws its un-answered item.
  for (const item of config.items) {
    if (item.withdrawn === true || answeredPositions.has(item.position + 1)) continue;
    const brick = brickByVersionId.get(activityItems[item.position]?.brickVersionId ?? '');
    if (brick !== undefined && brick.status !== 'active') {
      item.withdrawn = true;
      await tx.execute(sql`
        update public.activities
        set config = jsonb_set(
          config,
          array[${'items'}, ${String(item.position)}, ${'withdrawn'}],
          'true'::jsonb
        )
        where id = ${activity.id}::uuid
      `);
    }
  }

  const notionIds = [...new Set(config.items.flatMap((item) => item.notionIds))];
  const notionRows =
    notionIds.length === 0
      ? []
      : await tx.execute<{
          id: string;
          label: string;
          module_position: number;
          chapter_position: number;
        }>(sql`
          select n.id::text as id, n.label, m.position as module_position, ch.position as chapter_position
          from public.notions n
          join public.modules m on m.id = n.module_id
          join public.chapters ch on ch.id = n.chapter_id
          where n.id = any(
            array(select jsonb_array_elements_text(${JSON.stringify(notionIds)}::jsonb)::uuid)
          )
        `);
  const notionById = new Map(notionRows.map((row) => [row.id, row]));

  // FSRS cards of the recall-card notions, one query (ET-11), for the interval previews (EF-9).
  const recallNotionIds = config.items
    .filter((item) => item.format === 'recall_card' && item.withdrawn !== true)
    .flatMap((item) => item.notionIds);
  const cardRows =
    recallNotionIds.length === 0
      ? []
      : await tx.execute<{ notion_id: string; fsrs: unknown }>(sql`
          select notion_id::text as notion_id, fsrs
          from public.notion_states
          where user_id = ${userId}::uuid
            and notion_id = any(
              array(select jsonb_array_elements_text(${JSON.stringify(recallNotionIds)}::jsonb)::uuid)
            )
        `);
  const cardByNotion = new Map(
    cardRows.map((row) => [row.notion_id, fromPersistenceCard(row.fsrs as never)]),
  );

  const logsByAnswer = await loadAnswerOutcomes(tx, userId, attempt.id);

  const now = ctx.clock.now();
  const dtoItems: ReviewItemDto[] = [];
  for (const item of config.items) {
    const versionId = activityItems[item.position]?.brickVersionId ?? '';
    const brick = brickByVersionId.get(versionId);
    if (brick === undefined || item.withdrawn === true) continue;
    const games = GAME_LABELS as Record<string, { name: string; tech: string } | undefined>;
    const game = games[brick.type];
    const publicBrick = toPublicBrick({
      brickId: brick.brick_id,
      versionId: brick.version_id,
      type: brick.type as BrickType,
      notionIds: brick.notion_ids,
      payload: brick.payload as never,
    });
    let intervals: ReviewItemDto['intervals'] = null;
    if (item.format === 'recall_card') {
      const card = cardByNotion.get(item.notionIds[0] ?? '');
      intervals =
        card === undefined
          ? null
          : previewGrades(card, now.toISOString(), ENGINE.fsrs.requestRetention);
    }
    const answer = answerByPosition.get(item.position + 1);
    dtoItems.push(
      ReviewItemDtoSchema.parse({
        position: item.position,
        brickId: brick.brick_id,
        brickVersionId: brick.version_id,
        type: brick.type,
        name: game?.name ?? brick.type,
        tech: game?.tech ?? '',
        displayLabel: item.displayLabel,
        scopeLabel: itemScopeLabel(
          item.notionIds.map((notionId) => {
            const notion = notionById.get(notionId);
            return notion === undefined ? 0 : notion.module_position;
          }),
        ),
        reason: item.reasonKey === null ? null : (REASON_TEXTS[item.reasonKey] ?? null),
        notionIds: item.notionIds,
        payload: publicBrick.publicPayload,
        intervals,
        state: stateOf(item, answer),
        result: resultOf(item, answer, logsByAnswer.get(answer?.id ?? '')),
      }),
    );
  }

  const notionCount = new Set(dtoItems.flatMap((item) => item.notionIds)).size;
  const modulePositions = [
    ...new Set(
      dtoItems.flatMap((item) =>
        item.notionIds.map((notionId) => notionById.get(notionId)?.module_position ?? 0),
      ),
    ),
  ];
  const currentPosition =
    config.items.find(
      (item) =>
        item.withdrawn !== true &&
        stateOf(item, answerByPosition.get(item.position + 1)) === 'todo',
    )?.position ?? config.items.length;
  const status: GlobalQuizSessionDto['status'] =
    attempt.status === 'in_progress'
      ? dtoItems.length === 0
        ? 'empty'
        : 'in_progress'
      : 'completed';
  const modeOptions = await loadModeOptions(tx, userId, activity.formation_id, today, config);

  return GlobalQuizSessionDtoSchema.parse({
    sessionId: activity.id,
    attemptId: attempt.id,
    formationId: formation.id,
    forDate: today,
    mode: config.mode,
    status,
    header: {
      notionCount,
      modulesLabel: modulesLabel(modulePositions),
      estimatedMinutes: Math.max(1, Math.ceil(config.estimatedSec / 60)),
      subtitle: `${formation.title} · session du ${weekdayLabel(today)} ${dayMonthLabel(today, timeZone)}`,
    },
    modeOptions,
    note:
      config.mode === 'micro'
        ? (config.note ?? '')
        : config.deferredCount > 0
          ? `${wasDueWord(config.dueCount)} aujourd’hui : ${String(config.deferredCount)} ${
              config.deferredCount === 1 ? 'est reportée' : 'sont reportées'
            } à ${weekdayLabel(config.deferredTo)} pour que vos révisions restent sous ${String(config.capMinutes)} min.`
          : `${notionWord(config.dueCount)} à revoir aujourd’hui, lacunes en priorité.`,
    rationale: config.rationale,
    items: dtoItems,
    currentPosition,
    summary: status === 'completed' ? parseSummary(attempt.review_feedback) : null,
  });
}

/** FSRS outcomes of one attempt's answers, one query: answer id → notion outcomes. */
async function loadAnswerOutcomes(
  tx: DbTx,
  userId: string,
  attemptId: string,
): Promise<Map<string, ReviewAnswerResultDto['notions']>> {
  if (attemptId === '') return new Map();
  const rows = await tx.execute<{
    answer_id: string;
    notion_id: string;
    grade: string;
    due_at: string | null;
  }>(sql`
    select rl.answer_id::text as answer_id, rl.notion_id::text as notion_id, rl.grade::text as grade, ns.due_at::text as due_at
    from public.review_logs rl
    join public.answers a on a.id = rl.answer_id
    join public.notion_states ns on ns.notion_id = rl.notion_id and ns.user_id = rl.user_id
    where rl.user_id = ${userId}::uuid
      and a.attempt_id = ${attemptId}::uuid
    order by rl.notion_id
  `);
  const byAnswer = new Map<string, ReviewAnswerResultDto['notions']>();
  for (const row of rows) {
    const list = byAnswer.get(row.answer_id) ?? [];
    list.push({
      notionId: row.notion_id,
      rating: row.grade,
      nextDueAt: row.due_at === null ? null : new Date(row.due_at).toISOString(),
    });
    byAnswer.set(row.answer_id, list);
  }
  return byAnswer;
}

function stateOf(item: SessionItemConfig, answer: AnswerRow | undefined): ReviewItemDto['state'] {
  if (item.withdrawn === true) return 'withdrawn';
  if (answer === undefined) return 'todo';
  if ((answer.response as { skipped?: unknown } | null)?.skipped === true) return 'skipped';
  return 'answered';
}

function resultOf(
  item: SessionItemConfig,
  answer: AnswerRow | undefined,
  notions: ReviewAnswerResultDto['notions'] | undefined,
): unknown {
  if (answer === undefined) return null;
  const feedback = (answer.feedback ?? {}) as {
    correction?: unknown;
    explanation?: string | null;
  };
  const skipped = (answer.response as { skipped?: unknown } | null)?.skipped === true;
  return {
    position: item.position,
    skipped,
    isCorrect: answer.is_correct,
    correction: feedback.correction ?? null,
    explanation: feedback.explanation ?? null,
    notions: notions ?? [],
  };
}

function parseSummary(raw: unknown): ReviewSummaryDto | null {
  const parsed = ReviewSummaryDtoSchema.safeParse(
    typeof raw === 'object' && raw !== null && 'summary' in raw ? raw.summary : raw,
  );
  return parsed.success ? parsed.data : null;
}

/** Maps the contract input to the brick response schema (recall card self-assessment). */
function resolveResponse(type: string, response: unknown): unknown {
  if (type === 'recall_card' && typeof response === 'object' && response !== null) {
    const selfRating = (response as { selfRating?: unknown }).selfRating;
    if (typeof selfRating === 'string') return { selfGrade: selfRating };
  }
  return response;
}

/**
 * EF-9, EF-10, ET-3 — records one answer of the session. Idempotent by `clientAnswerId` (CL-5);
 * a position answered with another identifier is a 409 (CL-6); a closed attempt is 422
 * `SESSION_CLOSED`; a skipped answer writes no FSRS update (CL-6 of « Passer »).
 */
export function answerReviewItem(
  ctx: ServiceContext,
  sessionId: string,
  input: ReviewAnswerInput,
): Promise<Result<ReviewAnswerResultDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const rows = await tx.execute<{
        id: string;
        owner_id: string;
        items: unknown;
        config: unknown;
        formation_id: string;
        attempt_id: string;
        attempt_status: string;
        attempt_no: number;
      }>(sql`
        select
          a.id::text as id,
          a.owner_id::text as owner_id,
          a.items,
          a.config,
          a.formation_id::text as formation_id,
          at.id::text as attempt_id,
          at.status::text as attempt_status,
          at.attempt_no
        from public.activities a
        join public.attempts at on at.activity_id = a.id
        where a.id = ${sessionId}::uuid
        order by at.attempt_no desc
        limit 1
      `);
      const row = rows[0];
      if (row === undefined || row.owner_id !== userId) {
        throw new AppError('NOT_FOUND', 'Session introuvable.');
      }
      if (row.attempt_status !== 'in_progress') {
        throw new AppError('SESSION_CLOSED', 'Cette session est déjà clôturée.', { status: 422 });
      }
      const config = parseSessionConfig(row.config);
      if (config === null) {
        throw new AppError('INTERNAL_ERROR', 'Configuration de session illisible.');
      }
      const itemConfig = config.items.find((entry) => entry.position === input.position);
      const activityItems = (row.items ?? []) as {
        brickId: string;
        brickVersionId: string;
      }[];
      const versionId = activityItems[input.position]?.brickVersionId ?? '';
      if (itemConfig === undefined || versionId === '') {
        throw new AppError('VALIDATION_FAILED', 'Jeu introuvable dans cette session.');
      }
      if (itemConfig.withdrawn === true) {
        throw new AppError('CONFLICT', 'Ce jeu a été retiré de la session.', { status: 409 });
      }

      // Idempotence by clientAnswerId (CL-5): the recorded answer replays the same result.
      const replayRows = await tx.execute<{
        id: string;
        feedback: unknown;
        response: unknown;
        is_correct: boolean | null;
        position: number;
      }>(sql`
        select id::text as id, feedback, response, is_correct, position
        from public.answers
        where attempt_id = ${row.attempt_id}::uuid
          and feedback->>'clientAnswerId' = ${input.clientAnswerId}
        limit 1
      `);
      const replay = replayRows[0];
      if (replay !== undefined) {
        return replayResultDto(tx, userId, replay);
      }
      const conflictRows = await tx.execute<{ id: string }>(sql`
        select id::text as id
        from public.answers
        where attempt_id = ${row.attempt_id}::uuid
          and position = ${input.position + 1}
        limit 1
      `);
      if (conflictRows[0] !== undefined) {
        throw new AppError('CONFLICT', 'Ce jeu a déjà été répondu.', { status: 409 });
      }

      const now = ctx.clock.now();
      const reviewedAt = now.toISOString();
      const timeMs = Math.min(3_600_000, Math.max(0, Math.round(input.timeMs)));
      const skipped = input.skipped === true;

      let isCorrect: boolean | null = null;
      let correction: unknown = null;
      let explanation: string | null = null;
      let rating: FsrsRating | null = null;
      let responseToStore: unknown = { skipped: true };
      let brickType: string | null = null;
      let brickNotionIds: string[] = [];
      if (!skipped) {
        const brickRows = await tx.execute<{
          type: string;
          payload: unknown;
          notion_ids: string[];
        }>(sql`
          select b.type::text as type, bv.payload, b.notion_ids::text[] as notion_ids
          from public.brick_versions bv
          join public.bricks b on b.id = bv.brick_id
          where bv.id = ${versionId}::uuid
        `);
        const brick = brickRows[0];
        if (brick === undefined) {
          throw new AppError('INTERNAL_ERROR', 'Brique introuvable.');
        }
        brickType = brick.type;
        brickNotionIds = brick.notion_ids;
        const { gradeBrick } = await import('@learny/bricks');
        const response = resolveResponse(brick.type, input.response);
        const graded = gradeBrick(brick.type as BrickType, brick.payload, response, versionId);
        if (!graded.ok) {
          throw new AppError('RESPONSE_INVALID', 'Réponse invalide.', { status: 422 });
        }
        isCorrect = graded.value.isCorrect;
        correction = graded.value.correction;
        explanation =
          typeof correction === 'object' && correction !== null && 'explanation' in correction
            ? ((correction as { explanation?: string | null }).explanation ?? null)
            : null;
        if (brick.type === 'recall_card') {
          rating = (response as { selfGrade?: FsrsRating }).selfGrade ?? null;
          responseToStore = { selfGrade: rating };
        } else {
          responseToStore = input.response ?? {};
        }
      }

      const answerId = randomUUID();
      await tx.execute(sql`
        insert into public.answers
          (id, attempt_id, brick_version_id, position, response, is_correct, score, max_score, time_ms, graded_by, feedback, answered_at)
        values (
          ${answerId}::uuid,
          ${row.attempt_id}::uuid,
          ${versionId}::uuid,
          ${input.position + 1},
          ${JSON.stringify(responseToStore)}::jsonb,
          ${isCorrect},
          ${skipped || isCorrect === null ? null : isCorrect ? 100 : 0},
          ${skipped || isCorrect === null ? null : 100},
          ${timeMs},
          'code',
          ${JSON.stringify({ clientAnswerId: input.clientAnswerId, correction, explanation })}::jsonb,
          ${reviewedAt}::timestamptz
        )
      `);

      const notions: ReviewAnswerResultDto['notions'] = [];
      if (!skipped && brickType !== null) {
        const perNotionMs = Math.max(1, Math.round(timeMs / Math.max(1, brickNotionIds.length)));
        for (const notionId of brickNotionIds) {
          const applied = await applyReviewResult(tx, {
            userId,
            notionId,
            source: config.mode === 'micro' ? 'micro_session' : 'global_quiz',
            format: brickType,
            correct: isCorrect,
            rating,
            timeMs: brickType === 'recall_card' ? timeMs : perNotionMs,
            answerId,
            attemptId: row.attempt_id,
            attemptNo: row.attempt_no,
            reviewedAt,
          });
          if (applied !== null) {
            notions.push({ notionId, rating: applied.rating, nextDueAt: applied.dueAt });
          }
        }
      }

      return ReviewAnswerResultDtoSchema.parse({
        position: input.position,
        skipped,
        isCorrect,
        correction,
        explanation,
        notions,
      });
    });
  });
}

/** Rebuilds the result of an already-recorded answer (idempotent replay, CL-5). */
async function replayResultDto(
  tx: DbTx,
  userId: string,
  row: {
    id: string;
    feedback: unknown;
    response: unknown;
    is_correct: boolean | null;
    position: number;
  },
): Promise<ReviewAnswerResultDto> {
  const feedback = (row.feedback ?? {}) as {
    correction?: unknown;
    explanation?: string | null;
  };
  const skipped = (row.response as { skipped?: unknown } | null)?.skipped === true;
  const logs = await tx.execute<{
    notion_id: string;
    grade: string;
    due_at: string | null;
  }>(sql`
    select rl.notion_id::text as notion_id, rl.grade::text as grade, ns.due_at::text as due_at
    from public.review_logs rl
    join public.notion_states ns on ns.notion_id = rl.notion_id and ns.user_id = rl.user_id
    where rl.user_id = ${userId}::uuid
      and rl.answer_id = ${row.id}::uuid
    order by rl.notion_id
  `);
  return ReviewAnswerResultDtoSchema.parse({
    position: row.position - 1,
    skipped,
    isCorrect: row.is_correct,
    correction: feedback.correction ?? null,
    explanation: feedback.explanation ?? null,
    notions: logs.map((log) => ({
      notionId: log.notion_id,
      rating: log.grade,
      nextDueAt: log.due_at === null ? null : new Date(log.due_at).toISOString(),
    })),
  });
}

/**
 * EF-10, EF-11, EF-13, ET-3 — closes the session: untraited items are skipped (EF-10), the
 * attempt is graded, the day becomes qualifying when at least one answer was given (EF-13,
 * CL-12: no answer, no qualification) and the summary is stored for the idempotent replays.
 */
export function completeReviewSession(
  ctx: ServiceContext,
  sessionId: string,
): Promise<Result<ReviewSummaryDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return withTransaction(db, async (tx, outbox) => {
      const rows = await tx.execute<{
        id: string;
        owner_id: string;
        config: unknown;
        items: unknown;
        formation_id: string;
      }>(sql`
        select id::text as id, owner_id::text as owner_id, config, items, formation_id::text as formation_id
        from public.activities
        where id = ${sessionId}::uuid
        for update
      `);
      const activity = rows[0];
      if (activity === undefined || activity.owner_id !== userId) {
        throw new AppError('NOT_FOUND', 'Session introuvable.');
      }
      const config = parseSessionConfig(activity.config);
      if (config === null) {
        throw new AppError('INTERNAL_ERROR', 'Configuration de session illisible.');
      }
      const attemptRows = await tx.execute<AttemptRow>(sql`
        select id::text as id, attempt_no, status::text as status, started_at, review_feedback
        from public.attempts
        where activity_id = ${sessionId}::uuid
        order by attempt_no desc
        limit 1
      `);
      const attempt = attemptRows[0];
      if (attempt === undefined) {
        throw new AppError('NOT_FOUND', 'Session introuvable.');
      }
      if (attempt.status !== 'in_progress') {
        const stored = parseSummary(attempt.review_feedback);
        if (stored !== null) return stored;
        throw new AppError('SESSION_CLOSED', 'Cette session est déjà clôturée.', { status: 422 });
      }

      const timeZone = await loadProfileTimezone(tx, userId);
      const now = ctx.clock.now();
      const day = userLocalDay(now, timeZone);
      await closeAttempt(tx, ctx, userId, attempt.id);

      const answerRows = await tx.execute<{
        id: string;
        position: number;
        is_correct: boolean | null;
        response: unknown;
        time_ms: number | null;
      }>(sql`
        select id::text as id, position, is_correct, response, time_ms
        from public.answers
        where attempt_id = ${attempt.id}::uuid
      `);
      const answerByPosition = new Map(answerRows.map((row) => [row.position, row]));

      // Résumé (EF-11): revues = items answered or explicitly skipped before the closure;
      // réussies = rated hard/good/easy; plus tôt = rated again or skipped.
      let reviewedCount = 0;
      const okNotions = new Set<string>();
      const soonNotions = new Set<string>();
      let answeredCount = 0;
      let correctCount = 0;
      for (const item of config.items) {
        if (item.withdrawn === true) continue;
        const answer = answerByPosition.get(item.position + 1);
        if (answer === undefined) continue;
        reviewedCount += item.notionIds.length;
        if ((answer.response as { skipped?: unknown } | null)?.skipped === true) {
          for (const notionId of item.notionIds) soonNotions.add(notionId);
          continue;
        }
        answeredCount += 1;
        if (answer.is_correct === true) {
          correctCount += 1;
          for (const notionId of item.notionIds) okNotions.add(notionId);
        } else {
          for (const notionId of item.notionIds) soonNotions.add(notionId);
        }
      }

      const startedAt = new Date(attempt.started_at);
      const clockMs = Math.max(0, now.getTime() - startedAt.getTime());
      const answeredMs = answerRows.reduce((sum, row) => sum + (row.time_ms ?? 0), 0);
      const durationMs = Math.max(clockMs, answeredMs);
      const minutes = Math.max(1, Math.ceil(durationMs / 60_000));
      const score = answeredCount === 0 ? null : Math.round((correctCount / answeredCount) * 100);

      await tx.execute(sql`
        update public.attempts
        set status = 'graded',
            submitted_at = ${now.toISOString()}::timestamptz,
            duration_ms = ${durationMs},
            score = ${score === null ? null : String(score)}
        where id = ${attempt.id}::uuid
      `);

      const hasAnswer = reviewedCount > 0;
      await upsertDailyActivity(tx, {
        userId,
        day,
        minutes,
        qualifying: hasAnswer,
        sources:
          config.mode === 'micro'
            ? [`micro_session`, `review-session:${sessionId}`]
            : [`review-session:${sessionId}`],
      });
      const streakDays = hasAnswer
        ? await bumpStreak(tx, userId, day)
        : await currentStreak(tx, userId);
      const nextSessionAt = await nextPlannedSlot(tx, activity.formation_id, now, day, timeZone);

      const summary = ReviewSummaryDtoSchema.parse({
        reviewedCount,
        minutes,
        okCount: okNotions.size,
        soonCount: soonNotions.size,
        streakDays,
        nextSessionAt,
      });
      await tx.execute(sql`
        update public.attempts
        set review_feedback = ${JSON.stringify({ summary })}::jsonb
        where id = ${attempt.id}::uuid
      `);
      // SPEC-703 ET-5 — after commit, SPEC-713 marks the micro-session proposal as consumed and
      // SPEC-723 notifies the milestones. A replay of a closed session returns early above.
      outbox.add('review/session-completed', {
        userId,
        formationId: activity.formation_id,
        sessionId,
        mode: config.mode,
        forDate: config.forDate,
        reviewedCount,
      });
      return summary;
    });
  });
}

/**
 * BR-GAM-01, ADR-0319 §7 — incremental streak: a qualifying day not yet counted extends the
 * streak by one when the previous local day qualified, otherwise it restarts at one. The day is
 * then marked as counted (`streak_computed_on`), which makes replays idempotent.
 */
async function bumpStreak(tx: DbTx, userId: string, day: string): Promise<number> {
  const rows = await tx.execute<{ streak_days: number; streak_computed_on: string | null }>(sql`
    select streak_days, streak_computed_on::text as streak_computed_on
    from public.profiles
    where id = ${userId}::uuid
    for update
  `);
  const profile = rows[0];
  if (profile === undefined) return 0;
  if (profile.streak_computed_on !== null && profile.streak_computed_on >= day) {
    return profile.streak_days;
  }
  const yesterdayRows = await tx.execute<{ qualifying: boolean }>(sql`
    select qualifying from public.daily_activity
    where user_id = ${userId}::uuid and day = ${addCivilDays(day, -1)}::date
  `);
  const previousQualifying = yesterdayRows[0]?.qualifying ?? false;
  const streak = previousQualifying && profile.streak_days > 0 ? profile.streak_days + 1 : 1;
  await tx.execute(sql`
    update public.profiles
    set streak_days = ${streak}, streak_computed_on = ${day}::date, updated_at = now()
    where id = ${userId}::uuid
  `);
  return streak;
}

async function currentStreak(tx: DbTx, userId: string): Promise<number> {
  const rows = await tx.execute<{ streak_days: number }>(sql`
    select streak_days from public.profiles where id = ${userId}::uuid
  `);
  return rows[0]?.streak_days ?? 0;
}

/**
 * First planned global-quiz slot of the formation after `now` and after the civil day of the
 * closure (EF-11): the session being finished, the next one is the following day's slot, which is
 * the « demain, 17:00 » text of the demonstration.
 */
async function nextPlannedSlot(
  tx: DbTx,
  formationId: string,
  now: Date,
  day: string,
  timeZone: string,
): Promise<string | null> {
  const rows = await tx.execute<{ starts_at: string }>(sql`
    select starts_at
    from public.schedule_slots
    where formation_id = ${formationId}::uuid
      and kind = 'global_quiz'
      and status = 'planned'
      and starts_at > ${now.toISOString()}::timestamptz
      and (starts_at at time zone ${timeZone})::date > ${day}::date
    order by starts_at asc
    limit 1
  `);
  const slot = rows[0];
  return slot === undefined ? null : new Date(slot.starts_at).toISOString();
}
