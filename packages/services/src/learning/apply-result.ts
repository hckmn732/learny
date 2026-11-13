// Transactional application of the corrected answers of one attempt (SPEC-411 EF-1, EF-2, ET-1,
// ET-4, ET-5; BR-LAC-02, ADR-0020, ADR-0149, ADR-0288).
//
// The service stays an orchestrator: every pedagogical decision (FSRS grade, mastery, gap nature,
// clearance) is delegated to the pure `@learny/learning-engine`; this module only reads the locked
// rows, feeds the engine and persists its outputs in ONE user transaction under RLS. The journal
// tables are written through the `security definer` functions of migration 0037, so a learner never
// gains a direct write policy (ADR-0112 §4). Events are queued in the same transaction and sent
// after the commit by SPEC-203; a second call finds the unique `(answer_id, notion_id)` rows and
// changes nothing.
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { ENGINE } from '@learny/config/product';
import {
  LearningApplicationSummarySchema,
  type LearningApplicationSummary,
  type LearningGapEvent,
  type LearningGapState,
  type LearningStateTransition,
} from '@learny/contracts';
import { AppError, userLocalDay, type Result } from '@learny/core';
import { toFsrsCardJson, upsertDailyActivity, type DbTx, type FsrsCardJson } from '@learny/db';
import { withTransaction } from '@learny/jobs';
import {
  applyReview as applyFsrsReview,
  calculateMastery,
  clearGap,
  createNotionCard,
  detectGap,
  gradeReview,
  type AnswerRecord,
  type AttemptKind,
  type BrickFormat,
  type FsrsRating,
  type GapAttempt,
  type GapEventKind,
  type GapNature,
  type GapParams,
  type GapState,
  type MasteryAnswer,
  type ReviewSource,
  type SerializedFsrsCard,
  type TimedResponse,
} from '@learny/learning-engine';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

/** Stable mapping from an activity kind to the engine attempt kind (SPEC-402 to SPEC-406). */
const ATTEMPT_KIND_BY_ACTIVITY = {
  validation_quiz: 'validation_quiz',
  global_quiz_session: 'global_quiz_session',
  remediation: 'remediation',
  exercise: 'exercise',
  mock_exam: 'mock_exam',
  warmup: 'warmup',
  micro_session: 'micro_session',
  sprint: 'sprint',
  self_test: 'self_test',
} as const satisfies Record<string, AttemptKind>;

/** Review source written in `review_logs` for each engine attempt kind. */
const SOURCE_BY_ATTEMPT_KIND: Readonly<Record<AttemptKind, ReviewSource>> = {
  validation_quiz: 'validation',
  global_quiz_session: 'global_quiz',
  remediation: 'exercise',
  exercise: 'exercise',
  mock_exam: 'exam',
  warmup: 'warmup',
  micro_session: 'micro_session',
  sprint: 'sprint',
  self_test: 'self_test',
};

/** Answer-bearing brick formats accepted by the engine. */
const REVIEWABLE_FORMATS: ReadonlySet<string> = new Set<BrickFormat>([
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
  'instruction',
]);

const FSRS_STATE_NAMES = ['new', 'learning', 'review', 'relearning'] as const;
const FSRS_RATINGS: ReadonlySet<string> = new Set<FsrsRating>(['again', 'hard', 'good', 'easy']);

const reviewInputSchema = z.object({
  attemptId: z.uuid(),
  now: z.date().refine((value) => !Number.isNaN(value.getTime()), 'instant invalide'),
  hooks: z.object({ afterNotion: z.custom<() => void | Promise<void>>() }).strict().optional(),
});

export interface LearningApplyHooks {
  /** Test seam: runs after one notion is written, inside the transaction (CA-3 rollback). */
  afterNotion?: () => void | Promise<void>;
}

export interface ApplyLearningResultOptions {
  hooks?: LearningApplyHooks;
}

/** One corrected answer before its expansion per notion. */
export interface ReviewAnswerInput {
  answerId: string;
  position: number;
  notionIds: readonly string[];
  /** `null` when the brick format does not feed the engine. */
  format: BrickFormat | null;
  isCorrect: boolean | null;
  /** Recall-card self-assessment, when the response carries one. */
  selfRating: FsrsRating | null;
}

export interface CorrectedAnswerSelection {
  corrected: ReviewAnswerInput[];
  pending: ReviewAnswerInput[];
  ignored: ReviewAnswerInput[];
}

/**
 * EF-1, CL-5 — only an explicitly corrected answer is applied. A corrected answer is ordered by
 * its position; an answer with no verdict yet is kept for the `pendingAnswers` count and never
 * receives an invented FSRS grade. A format outside the engine is ignored explicitly.
 */
export function selectCorrectedAnswers(
  answers: readonly ReviewAnswerInput[],
): CorrectedAnswerSelection {
  const corrected: ReviewAnswerInput[] = [];
  const pending: ReviewAnswerInput[] = [];
  const ignored: ReviewAnswerInput[] = [];
  for (const answer of [...answers].sort((left, right) => left.position - right.position)) {
    if (answer.format === null) ignored.push(answer);
    else if (answer.isCorrect === null) pending.push(answer);
    else corrected.push(answer);
  }
  return { corrected, pending, ignored };
}

/** Idempotence key of one persisted review row (ADR-0149). */
export function reviewKey(answerId: string, notionId: string): string {
  return `${answerId}:${notionId}`;
}

/** Removes the answer × notion pairs already present in `review_logs` (EF-1 double call). */
export function unappliedCandidates<T extends { answerId: string; notionId: string }>(
  candidates: readonly T[],
  applied: ReadonlySet<string>,
): T[] {
  return candidates.filter(
    (candidate) => !applied.has(reviewKey(candidate.answerId, candidate.notionId)),
  );
}

export interface NotionReviewAnswer {
  answerId: string;
  attemptId: string;
  attemptKind: AttemptKind;
  attemptNo: number;
  source: ReviewSource;
  notionId: string;
  format: BrickFormat;
  correct: boolean;
  timeMs: number;
  selfRating: FsrsRating | null;
  answeredAt: string;
  chosenDistractorNotionId: string | null;
  confusedWithNotionId: string | null;
  normalizedResponse: string | null;
  offTopic: boolean;
  countsForGaps: boolean;
}

export interface NotionReviewHistory {
  mastery: readonly MasteryAnswer[];
  gapAnswers: readonly AnswerRecord[];
  timed: readonly TimedResponse[];
}

/** Stored state read before the transaction decides anything. */
export interface PreviousNotionState {
  fsrs: SerializedFsrsCard | null;
  mastery: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  successCount: number;
  gap: GapState | null;
  inReview: boolean;
}

export interface PlannedGapEvent {
  kind: GapEventKind;
  nature: GapNature | null;
  previousNature: GapNature | null;
  evidence: Record<string, unknown>;
}

export interface NotionReviewStep {
  answerId: string;
  notionId: string;
  format: BrickFormat;
  source: ReviewSource;
  rating: FsrsRating;
  correct: boolean;
  timeMs: number;
  reviewedAt: string;
  cardBefore: SerializedFsrsCard;
  cardAfter: SerializedFsrsCard;
  dueAt: string;
  masteryBefore: number;
  masteryAfter: number;
  successCountBefore: number;
  successCountAfter: number;
  firstSeenAt: string;
  lastSeenAt: string;
  gapBefore: GapState | null;
  gapAfter: GapState | null;
  gapEvent: PlannedGapEvent | null;
}

export interface NotionPlanInput {
  notionId: string;
  state: PreviousNotionState;
  answers: readonly NotionReviewAnswer[];
  history: NotionReviewHistory;
}

export interface LearningEngineParams {
  fsrs: typeof ENGINE.fsrs;
  gaps: GapParams;
  masteryThreshold: number;
  masteryHalfLifeDays: number;
}

const DEFAULT_ENGINE_PARAMS: LearningEngineParams = {
  fsrs: ENGINE.fsrs,
  gaps: { ...ENGINE.gaps, masteryThreshold: ENGINE.mastery.threshold },
  masteryThreshold: ENGINE.mastery.threshold,
  masteryHalfLifeDays: ENGINE.mastery.halfLifeDays,
};

function roundMastery(value: number): number {
  return Math.round(value * 100) / 100;
}

function beforeCurrent(
  candidateId: string,
  candidateAt: string,
  currentId: string,
  currentAt: string,
): boolean {
  if (candidateAt !== currentAt) return candidateAt < currentAt;
  return candidateId <= currentId;
}

function attemptsUpTo(answers: readonly AnswerRecord[], current: NotionReviewAnswer): GapAttempt[] {
  const grouped = new Map<
    string,
    { attemptId: string; attemptKind: AnswerRecord['attemptKind']; answers: AnswerRecord[] }
  >();
  for (const answer of answers) {
    if (!beforeCurrent(answer.answerId, answer.answeredAt, current.answerId, current.answeredAt)) {
      continue;
    }
    const existing = grouped.get(answer.attemptId);
    if (existing === undefined) {
      grouped.set(answer.attemptId, {
        attemptId: answer.attemptId,
        attemptKind: answer.attemptKind,
        answers: [answer],
      });
    } else {
      existing.answers.push(answer);
    }
  }
  return [...grouped.values()];
}

function gapAnswersUpTo(
  answers: readonly AnswerRecord[],
  current: NotionReviewAnswer,
): AnswerRecord[] {
  return answers.filter((answer) =>
    beforeCurrent(answer.answerId, answer.answeredAt, current.answerId, current.answeredAt),
  );
}

function masteryAnswersUpTo(
  answers: readonly MasteryAnswer[],
  current: NotionReviewAnswer,
): MasteryAnswer[] {
  return answers.filter((answer) =>
    beforeCurrent(answer.answerId, answer.answeredAt, current.answerId, current.answeredAt),
  );
}

function timedUpTo(timed: readonly TimedResponse[], current: NotionReviewAnswer): TimedResponse[] {
  return timed.filter((entry) =>
    beforeCurrent(entry.answerId ?? '', entry.answeredAt, current.answerId, current.answeredAt),
  );
}

function gapEvidence(
  event: GapEventKind,
  detection:
    | {
        evidence: string;
        triggers: readonly string[];
        repeatedErrors: readonly { key: string; attemptIds: readonly string[] }[];
      }
    | undefined,
  clearance: { evidence: string; successCount: number; intervalHours: number | null } | undefined,
): Record<string, unknown> {
  if (event === 'cleared') {
    return {
      summary: clearance?.evidence ?? '',
      successCount: clearance?.successCount ?? 0,
      intervalHours: clearance?.intervalHours ?? null,
    };
  }
  return {
    summary: detection?.evidence ?? '',
    triggers: detection?.triggers ?? [],
    repeatedErrors: detection?.repeatedErrors ?? [],
  };
}

/**
 * Pure sequence of the answers of one notion: each answer sees the state left by the previous
 * one, the FSRS card evolves in order, mastery is recomputed at the answer instant and the gap
 * lifecycle follows BR-LAC-02/06. Nothing here touches a database or the clock.
 */
export function planNotionReviews(
  input: NotionPlanInput,
  params: LearningEngineParams = DEFAULT_ENGINE_PARAMS,
): NotionReviewStep[] {
  const steps: NotionReviewStep[] = [];
  let state = input.state;
  for (const answer of input.answers) {
    const timed = timedUpTo(input.history.timed, answer);
    const decision = gradeReview({
      correct: answer.correct,
      timeMs: answer.timeMs,
      format: answer.format,
      history: timed,
      selfRating: answer.selfRating,
      settings: params.fsrs,
    });
    if (decision.rating === null) continue;

    const cardBefore =
      state.fsrs ?? createNotionCard(answer.answeredAt, params.fsrs.requestRetention);
    const applied = applyFsrsReview(
      cardBefore,
      decision.rating,
      answer.answeredAt,
      params.fsrs.requestRetention,
    );
    const mastery = calculateMastery({
      answers: masteryAnswersUpTo(input.history.mastery, answer),
      at: answer.answeredAt,
      threshold: params.masteryThreshold,
      halfLifeDays: params.masteryHalfLifeDays,
    });
    const masteryAfter = roundMastery(mastery.mastery);
    const successCountAfter = state.successCount + (answer.correct ? 1 : 0);
    const gapBefore = state.gap;
    let gapAfter = state.gap;
    let gapEvent: PlannedGapEvent | null = null;

    const activeGap = state.gap !== null && state.gap.clearedAt === null ? state.gap : null;
    if (activeGap !== null) {
      const clearance = clearGap({
        gap: activeGap,
        successes: gapAnswersUpTo(input.history.gapAnswers, answer),
        mastery: masteryAfter,
        now: answer.answeredAt,
        notion: input.notionId,
        params: params.gaps,
      });
      if (clearance.cleared && clearance.gap !== null) {
        gapAfter = clearance.gap;
        gapEvent = {
          kind: 'cleared',
          nature: activeGap.nature,
          previousNature: null,
          evidence: gapEvidence('cleared', undefined, {
            evidence: clearance.evidence,
            successCount: clearance.successCount,
            intervalHours: clearance.intervalHours,
          }),
        };
      } else {
        const detection = detectGap({
          notion: input.notionId,
          attempts: attemptsUpTo(input.history.gapAnswers, answer),
          mastery: masteryAfter,
          now: answer.answeredAt,
          existingGap: activeGap,
          fsrsLapsed:
            state.fsrs !== null && state.fsrs.state !== 'new' && decision.rating === 'again',
          params: params.gaps,
        });
        gapAfter = detection.gap ?? activeGap;
        if (detection.event !== null && detection.gap !== null) {
          gapEvent = {
            kind: detection.event,
            nature: detection.nature,
            previousNature: detection.event === 'nature_changed' ? activeGap.nature : null,
            evidence: gapEvidence(detection.event, detection, undefined),
          };
        }
      }
    } else {
      const detection = detectGap({
        notion: input.notionId,
        attempts: attemptsUpTo(input.history.gapAnswers, answer),
        mastery: masteryAfter,
        now: answer.answeredAt,
        existingGap: state.gap,
        fsrsLapsed:
          state.fsrs !== null && state.fsrs.state !== 'new' && decision.rating === 'again',
        params: params.gaps,
      });
      gapAfter = detection.gap ?? state.gap;
      if (detection.event !== null && detection.gap !== null) {
        gapEvent = {
          kind: detection.event,
          nature: detection.nature,
          previousNature: null,
          evidence: gapEvidence(detection.event, detection, undefined),
        };
      }
    }

    const firstSeenAt = state.firstSeenAt ?? answer.answeredAt;
    const step: NotionReviewStep = {
      answerId: answer.answerId,
      notionId: input.notionId,
      format: answer.format,
      source: answer.source,
      rating: decision.rating,
      correct: answer.correct,
      timeMs: answer.timeMs,
      reviewedAt: answer.answeredAt,
      cardBefore,
      cardAfter: applied.card,
      dueAt: applied.dueAt,
      masteryBefore: state.mastery,
      masteryAfter,
      successCountBefore: state.successCount,
      successCountAfter,
      firstSeenAt,
      lastSeenAt: answer.answeredAt,
      gapBefore,
      gapAfter,
      gapEvent,
    };
    steps.push(step);
    state = {
      fsrs: applied.card,
      mastery: masteryAfter,
      firstSeenAt,
      lastSeenAt: answer.answeredAt,
      successCount: successCountAfter,
      gap: gapAfter,
      inReview: true,
    };
  }
  return steps;
}

/** Converts an engine card (string state) to the persisted JSON (numeric state). */
export function toPersistenceCard(card: SerializedFsrsCard): FsrsCardJson {
  const state = FSRS_STATE_NAMES.indexOf(card.state);
  return toFsrsCardJson({ ...card, state: state as 0 | 1 | 2 | 3 });
}

export function fromPersistenceCard(card: FsrsCardJson): SerializedFsrsCard {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: FSRS_STATE_NAMES[card.state],
    last_review: card.last_review,
  };
}

function toGapState(row: {
  gapNature: GapNature | null;
  gapConfusedWith: string | null;
  gapDetectedAt: Date | string | null;
  gapEvidence: string | null;
  gapClearedAt: Date | string | null;
}): GapState | null {
  if (row.gapNature === null || row.gapDetectedAt === null) return null;
  return {
    nature: row.gapNature,
    confusedWith: row.gapConfusedWith,
    detectedAt: new Date(row.gapDetectedAt).toISOString(),
    evidence: row.gapEvidence ?? '',
    clearedAt: row.gapClearedAt === null ? null : new Date(row.gapClearedAt).toISOString(),
  };
}

function toContractGap(gap: GapState | null): LearningGapState | null {
  if (gap === null) return null;
  return {
    nature: gap.nature,
    confusedWith: gap.confusedWith,
    detectedAt: gap.detectedAt,
    evidence: gap.evidence,
    clearedAt: gap.clearedAt,
  };
}

function toGapNature(value: string): GapNature | null {
  const parsed = z
    .enum(['forgetting', 'confusion', 'misunderstanding', 'application'])
    .safeParse(value);
  return parsed.success ? parsed.data : null;
}

interface AttemptRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  activity_id: string;
  attempt_no: number;
  status: string;
  started_at: Date | string;
  submitted_at: Date | string | null;
  duration_ms: number | null;
  activity_kind: string;
  module_id: string | null;
  formation_id: string;
  owner_id: string;
}

interface AnswerRow {
  [key: string]: unknown;
  id: string;
  attempt_id: string;
  position: number;
  brick_version_id: string;
  brick_type: string;
  notion_ids: string[];
  is_correct: boolean | null;
  score: string | null;
  max_score: string | null;
  time_ms: number | null;
  answered_at: Date | string;
  chosen_distractor_notion_id: string | null;
  response: unknown;
  feedback: unknown;
}

interface NotionRow {
  [key: string]: unknown;
  id: string;
  formation_id: string;
}

interface NotionStateRow {
  [key: string]: unknown;
  notion_id: string;
  fsrs: FsrsCardJson;
  due_at: Date | string | null;
  mastery: string;
  first_seen_at: Date | string | null;
  last_seen_at: Date | string | null;
  success_count: number;
  gap_nature: string | null;
  gap_confused_with: string | null;
  gap_detected_at: Date | string | null;
  gap_evidence: string | null;
  gap_cleared_at: Date | string | null;
  in_review: boolean;
}

interface HistoryRow {
  [key: string]: unknown;
  answer_id: string;
  attempt_id: string;
  attempt_no: number;
  attempt_kind: string;
  brick_type: string;
  notion_ids: string[];
  position: number;
  is_correct: boolean | null;
  score: string | null;
  max_score: string | null;
  time_ms: number | null;
  answered_at: Date | string;
  chosen_distractor_notion_id: string | null;
  response: unknown;
  feedback: unknown;
}

function stringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' && field.length > 0 ? field : null;
}

function ratingField(value: unknown): FsrsRating | null {
  for (const key of ['rating', 'selfRating', 'self_rating']) {
    const candidate = stringField(value, key);
    if (candidate !== null && FSRS_RATINGS.has(candidate)) return candidate as FsrsRating;
  }
  return null;
}

function offTopicField(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.offTopic === true || record.off_topic === true) return true;
  const criteria = record.criteria;
  if (!Array.isArray(criteria)) return false;
  return criteria.some((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const criterion = entry as Record<string, unknown>;
    const key = typeof criterion.key === 'string' ? criterion.key : '';
    return ['off_topic', 'hors_sujet', 'off-topic'].includes(key) && criterion.ok === false;
  });
}

function normalizedResponse(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  for (const key of ['text', 'answer', 'value', 'response']) {
    const candidate = stringField(value, key);
    if (candidate !== null) return candidate;
  }
  return null;
}

function confusedWithField(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  for (const key of ['confusedWithNotionId', 'confusedWith']) {
    const candidate = stringField(value, key);
    if (candidate !== null && z.uuid().safeParse(candidate).success) return candidate;
  }
  return null;
}

function scoreValue(
  score: string | null,
  maxScore: string | null,
  correct: boolean | null,
): number {
  if (score !== null && maxScore !== null) {
    const max = Number(maxScore);
    const value = Number(score);
    if (Number.isFinite(max) && max > 0 && Number.isFinite(value)) {
      return Math.min(1, Math.max(0, value / max));
    }
  }
  return correct === true ? 1 : 0;
}

function activityKind(value: string): AttemptKind | null {
  const mapping = ATTEMPT_KIND_BY_ACTIVITY as Readonly<Record<string, AttemptKind | undefined>>;
  return mapping[value] ?? null;
}

function formatOf(brickType: string): BrickFormat | null {
  return REVIEWABLE_FORMATS.has(brickType) ? (brickType as BrickFormat) : null;
}

function answerRecordOf(row: HistoryRow): AnswerRecord | null {
  const attemptKind = activityKind(row.attempt_kind);
  const format = formatOf(row.brick_type);
  if (attemptKind === null || format === null) return null;
  return {
    answerId: row.answer_id,
    attemptId: row.attempt_id,
    attemptKind,
    attemptNo: row.attempt_no,
    source: SOURCE_BY_ATTEMPT_KIND[attemptKind],
    notionIds: row.notion_ids,
    format,
    correct: row.is_correct,
    score: row.score === null ? null : Number(row.score),
    maxScore: row.max_score === null ? null : Number(row.max_score),
    selfRating: ratingField(row.response),
    timeMs: row.time_ms ?? 0,
    answeredAt: new Date(row.answered_at).toISOString(),
    chosenDistractorNotionId: row.chosen_distractor_notion_id,
    confusedWithNotionId: confusedWithField(row.response),
    normalizedResponse: normalizedResponse(row.response),
    offTopic: offTopicField(row.feedback),
    countsForGaps: true,
  };
}

async function loadAttemptForUpdate(
  tx: DbTx,
  userId: string,
  attemptId: string,
): Promise<AttemptRow> {
  const rows = await tx.execute<AttemptRow>(sql`
    select
      a.id::text as id,
      a.user_id::text as user_id,
      a.activity_id::text as activity_id,
      a.attempt_no,
      a.status::text as status,
      a.started_at,
      a.submitted_at,
      a.duration_ms,
      act.kind::text as activity_kind,
      act.module_id::text as module_id,
      act.formation_id::text as formation_id,
      act.owner_id::text as owner_id
    from public.attempts a
    join public.activities act on act.id = a.activity_id
    where a.id = ${attemptId}::uuid
      and a.user_id = ${userId}::uuid
    for update of a
  `);
  const attempt = rows[0];
  if (attempt === undefined) {
    throw new AppError('NOT_FOUND', 'Tentative introuvable.');
  }
  return attempt;
}

async function loadAnswers(tx: DbTx, attemptId: string): Promise<AnswerRow[]> {
  return tx.execute<AnswerRow>(sql`
    select
      a.id::text as id,
      a.attempt_id::text as attempt_id,
      a.position,
      a.brick_version_id::text as brick_version_id,
      b.type::text as brick_type,
      b.notion_ids::text[] as notion_ids,
      a.is_correct,
      a.score::text as score,
      a.max_score::text as max_score,
      a.time_ms,
      a.answered_at,
      a.chosen_distractor_notion_id::text as chosen_distractor_notion_id,
      a.response,
      a.feedback
    from public.answers a
    join public.brick_versions bv on bv.id = a.brick_version_id
    join public.bricks b on b.id = bv.brick_id
    where a.attempt_id = ${attemptId}::uuid
    order by a.position
  `);
}

async function loadNotions(
  tx: DbTx,
  formationId: string,
  notionIds: readonly string[],
): Promise<Map<string, NotionRow>> {
  if (notionIds.length === 0) return new Map();
  const rows = await tx.execute<NotionRow>(sql`
    select id::text as id, formation_id::text as formation_id
    from public.notions
    where formation_id = ${formationId}::uuid
      and id = any(array(select jsonb_array_elements_text(${JSON.stringify(notionIds)}::jsonb)::uuid))
  `);
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadStates(
  tx: DbTx,
  userId: string,
  notionIds: readonly string[],
): Promise<Map<string, NotionStateRow>> {
  if (notionIds.length === 0) return new Map();
  const rows = await tx.execute<NotionStateRow>(sql`
    select
      notion_id::text as notion_id,
      fsrs,
      due_at,
      mastery::text as mastery,
      first_seen_at,
      last_seen_at,
      success_count,
      gap_nature::text as gap_nature,
      gap_confused_with::text as gap_confused_with,
      gap_detected_at,
      gap_evidence,
      gap_cleared_at,
      in_review
    from public.notion_states
    where user_id = ${userId}::uuid
      and notion_id = any(array(select jsonb_array_elements_text(${JSON.stringify(notionIds)}::jsonb)::uuid))
    for update
  `);
  return new Map(rows.map((row) => [row.notion_id, row]));
}

async function loadHistory(tx: DbTx, userId: string, notionId: string): Promise<HistoryRow[]> {
  return tx.execute<HistoryRow>(sql`
    select
      a.id::text as answer_id,
      a.attempt_id::text as attempt_id,
      at.attempt_no,
      act.kind::text as attempt_kind,
      b.type::text as brick_type,
      b.notion_ids::text[] as notion_ids,
      a.position,
      a.is_correct,
      a.score::text as score,
      a.max_score::text as max_score,
      a.time_ms,
      a.answered_at,
      a.chosen_distractor_notion_id::text as chosen_distractor_notion_id,
      a.response,
      a.feedback
    from public.answers a
    join public.attempts at on at.id = a.attempt_id
    join public.activities act on act.id = at.activity_id
    join public.brick_versions bv on bv.id = a.brick_version_id
    join public.bricks b on b.id = bv.brick_id
    where at.user_id = ${userId}::uuid
      and b.notion_ids @> array[${notionId}::uuid]
      and a.is_correct is not null
    order by a.answered_at, a.id
  `);
}

async function loadTimedHistory(tx: DbTx, userId: string): Promise<TimedResponse[]> {
  const rows = await tx.execute<{
    answer_id: string;
    answered_at: Date | string;
    time_ms: number | null;
    brick_type: string;
  }>(sql`
    select
      a.id::text as answer_id,
      a.answered_at,
      a.time_ms,
      b.type::text as brick_type
    from public.answers a
    join public.attempts at on at.id = a.attempt_id
    join public.brick_versions bv on bv.id = a.brick_version_id
    join public.bricks b on b.id = bv.brick_id
    where at.user_id = ${userId}::uuid
      and a.time_ms is not null
      and a.time_ms > 0
    order by a.answered_at desc, a.id desc
    limit 500
  `);
  const timed: TimedResponse[] = [];
  for (const row of rows) {
    const format = formatOf(row.brick_type);
    if (format === null) continue;
    timed.push({
      answerId: row.answer_id,
      answeredAt: new Date(row.answered_at).toISOString(),
      timeMs: row.time_ms,
      format,
    });
  }
  return timed;
}

async function loadAppliedKeys(
  tx: DbTx,
  userId: string,
  answerIds: readonly string[],
): Promise<Set<string>> {
  if (answerIds.length === 0) return new Set();
  const rows = await tx.execute<{ answer_id: string; notion_id: string }>(sql`
    select answer_id::text as answer_id, notion_id::text as notion_id
    from public.review_logs
    where user_id = ${userId}::uuid
      and answer_id = any(array(select jsonb_array_elements_text(${JSON.stringify(answerIds)}::jsonb)::uuid))
  `);
  return new Set(rows.map((row) => reviewKey(row.answer_id, row.notion_id)));
}

async function loadTimezone(tx: DbTx, userId: string): Promise<string> {
  const rows = await tx.execute<{ timezone: string }>(sql`
    select timezone from public.profiles where id = ${userId}::uuid
  `);
  return rows[0]?.timezone ?? 'Europe/Paris';
}

function previousStateOf(row: NotionStateRow | undefined): PreviousNotionState {
  if (row === undefined) {
    return {
      fsrs: null,
      mastery: 0,
      firstSeenAt: null,
      lastSeenAt: null,
      successCount: 0,
      gap: null,
      inReview: false,
    };
  }
  return {
    fsrs: fromPersistenceCard(row.fsrs),
    mastery: Number(row.mastery),
    firstSeenAt: row.first_seen_at === null ? null : new Date(row.first_seen_at).toISOString(),
    lastSeenAt: row.last_seen_at === null ? null : new Date(row.last_seen_at).toISOString(),
    successCount: row.success_count,
    gap: toGapState({
      gapNature: row.gap_nature === null ? null : toGapNature(row.gap_nature),
      gapConfusedWith: row.gap_confused_with,
      gapDetectedAt: row.gap_detected_at,
      gapEvidence: row.gap_evidence,
      gapClearedAt: row.gap_cleared_at,
    }),
    inReview: row.in_review,
  };
}

async function persistStep(tx: DbTx, userId: string, step: NotionReviewStep): Promise<boolean> {
  const gap = step.gapAfter;
  await tx.execute(sql`
    insert into public.notion_states (
      user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at, success_count,
      in_review, gap_nature, gap_confused_with, gap_detected_at, gap_evidence, gap_cleared_at,
      revision
    ) values (
      ${userId}::uuid,
      ${step.notionId}::uuid,
      ${JSON.stringify(toPersistenceCard(step.cardAfter))}::jsonb,
      ${step.dueAt}::timestamptz,
      ${String(step.masteryAfter)}::numeric,
      ${step.firstSeenAt}::timestamptz,
      ${step.lastSeenAt}::timestamptz,
      ${step.successCountAfter},
      true,
      ${gap?.nature ?? null}::public.gap_nature,
      ${gap?.confusedWith ?? null}::uuid,
      ${gap?.detectedAt ?? null}::timestamptz,
      ${gap?.evidence ?? null},
      ${gap?.clearedAt ?? null}::timestamptz,
      1
    )
    on conflict (user_id, notion_id) do update set
      fsrs = excluded.fsrs,
      due_at = excluded.due_at,
      mastery = excluded.mastery,
      first_seen_at = coalesce(notion_states.first_seen_at, excluded.first_seen_at),
      last_seen_at = excluded.last_seen_at,
      success_count = excluded.success_count,
      in_review = true,
      gap_nature = excluded.gap_nature,
      gap_confused_with = excluded.gap_confused_with,
      gap_detected_at = excluded.gap_detected_at,
      gap_evidence = excluded.gap_evidence,
      gap_cleared_at = excluded.gap_cleared_at,
      revision = notion_states.revision + 1
  `);

  const logRows = await tx.execute<{ id: string | null }>(sql`
    select public.append_review_log(
      ${userId}::uuid,
      ${step.notionId}::uuid,
      ${step.answerId}::uuid,
      ${step.source}::public.review_source,
      ${step.rating}::public.fsrs_grade,
      ${step.correct},
      ${step.timeMs},
      ${step.reviewedAt}::timestamptz,
      ${JSON.stringify(toPersistenceCard(step.cardBefore))}::jsonb,
      ${JSON.stringify(toPersistenceCard(step.cardAfter))}::jsonb
    ) as id
  `);
  const logId = logRows[0]?.id ?? null;
  if (logId === null) return false;

  if (step.gapEvent !== null) {
    await tx.execute(sql`
      select public.append_gap_event(
        ${userId}::uuid,
        ${step.notionId}::uuid,
        ${step.gapEvent.kind}::public.gap_event_kind,
        ${step.gapEvent.nature}::public.gap_nature,
        ${JSON.stringify(step.gapEvent.evidence)}::jsonb,
        ${step.reviewedAt}::timestamptz
      )
    `);
  }
  return true;
}

function transitionOf(
  notionId: string,
  before: PreviousNotionState,
  after: NotionReviewStep | undefined,
): LearningStateTransition {
  return {
    notionId,
    masteryBefore: before.mastery,
    masteryAfter: after?.masteryAfter ?? before.mastery,
    dueAtBefore: before.fsrs?.due ?? null,
    dueAtAfter: after?.dueAt ?? before.fsrs?.due ?? null,
    gapBefore: toContractGap(before.gap),
    gapAfter: toContractGap(after?.gapAfter ?? before.gap),
  };
}

async function applyInTransaction(
  tx: DbTx,
  userId: string,
  attemptId: string,
  now: Date,
  hooks: LearningApplyHooks,
): Promise<LearningApplicationSummary> {
  await tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended('learning:' || ${userId}, 0))
  `);
  const attempt = await loadAttemptForUpdate(tx, userId, attemptId);
  if (attempt.owner_id !== userId) {
    throw new AppError('NOT_FOUND', 'Tentative introuvable.');
  }
  if (attempt.status !== 'graded') {
    throw new AppError(
      'CONFLICT',
      'La tentative n’est pas corrigée : ses résultats ne peuvent pas encore être appliqués.',
    );
  }
  const attemptKind = activityKind(attempt.activity_kind);
  if (attemptKind === null) {
    throw new AppError(
      'VALIDATION_FAILED',
      'Ce type d’activité n’alimente pas le moteur d’apprentissage.',
    );
  }

  const answers = await loadAnswers(tx, attemptId);
  const selection = selectCorrectedAnswers(
    answers.map((answer) => ({
      answerId: answer.id,
      position: answer.position,
      notionIds: answer.notion_ids,
      format: formatOf(answer.brick_type),
      isCorrect: answer.is_correct,
      selfRating: ratingField(answer.response),
    })),
  );
  if (selection.corrected.length === 0) {
    return LearningApplicationSummarySchema.parse({
      attemptId,
      status: selection.pending.length > 0 ? 'pending_correction' : 'not_applicable',
      reviewCount: 0,
      notionIds: [],
      pendingAnswers: selection.pending.length,
      gapEvents: [],
      events: [],
      dailyActivity: null,
      states: [],
    });
  }

  const notionIds = [...new Set(selection.corrected.flatMap((answer) => answer.notionIds))].sort();
  const notions = await loadNotions(tx, attempt.formation_id, notionIds);
  if (notions.size !== notionIds.length) {
    throw new AppError('NOT_FOUND', 'Notion introuvable.');
  }
  const states = await loadStates(tx, userId, notionIds);
  const applied = await loadAppliedKeys(
    tx,
    userId,
    selection.corrected.map((answer) => answer.answerId),
  );

  const candidates: (NotionReviewAnswer & { notionId: string })[] = [];
  const seen = new Set<string>();
  for (const answer of selection.corrected) {
    for (const notionId of answer.notionIds) {
      const key = reviewKey(answer.answerId, notionId);
      if (applied.has(key) || seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        answerId: answer.answerId,
        attemptId,
        attemptKind,
        attemptNo: attempt.attempt_no,
        source: SOURCE_BY_ATTEMPT_KIND[attemptKind],
        notionId,
        format: answer.format as BrickFormat,
        correct: answer.isCorrect as boolean,
        timeMs: 0,
        selfRating: answer.selfRating,
        answeredAt: '',
        chosenDistractorNotionId: null,
        confusedWithNotionId: null,
        normalizedResponse: null,
        offTopic: false,
        countsForGaps: true,
      });
    }
  }
  if (candidates.length === 0) {
    return LearningApplicationSummarySchema.parse({
      attemptId,
      status: 'already_applied',
      reviewCount: 0,
      notionIds,
      pendingAnswers: selection.pending.length,
      gapEvents: [],
      events: [],
      dailyActivity: null,
      states: notionIds.map((notionId) =>
        transitionOf(notionId, previousStateOf(states.get(notionId)), undefined),
      ),
    });
  }

  const timed = await loadTimedHistory(tx, userId);
  const answerById = new Map(answers.map((answer) => [answer.id, answer]));
  const steps: NotionReviewStep[] = [];
  const gapEvents: LearningGapEvent[] = [];
  const events: string[] = [];
  const transitions: LearningStateTransition[] = [];

  for (const notionId of notionIds) {
    const notionCandidates = candidates.filter((candidate) => candidate.notionId === notionId);
    if (notionCandidates.length === 0) {
      transitions.push(transitionOf(notionId, previousStateOf(states.get(notionId)), undefined));
      continue;
    }
    const historyRows = await loadHistory(tx, userId, notionId);
    const gapAnswers: AnswerRecord[] = [];
    for (const row of historyRows) {
      const record = answerRecordOf(row);
      if (record !== null) gapAnswers.push(record);
    }
    const masteryHistory: MasteryAnswer[] = historyRows.map((row) => ({
      answerId: row.answer_id,
      attemptId: row.attempt_id,
      score: scoreValue(row.score, row.max_score, row.is_correct),
      answeredAt: new Date(row.answered_at).toISOString(),
    }));

    const reviewAnswers: NotionReviewAnswer[] = notionCandidates.map((candidate) => {
      const row = answerById.get(candidate.answerId);
      if (row === undefined) {
        throw new AppError('INTERNAL_ERROR', 'Réponse de la tentative introuvable.');
      }
      return {
        answerId: row.id,
        attemptId,
        attemptKind,
        attemptNo: attempt.attempt_no,
        source: SOURCE_BY_ATTEMPT_KIND[attemptKind],
        notionId,
        format: candidate.format,
        correct: row.is_correct as boolean,
        timeMs: row.time_ms ?? 0,
        selfRating: ratingField(row.response),
        answeredAt: new Date(row.answered_at).toISOString(),
        chosenDistractorNotionId: row.chosen_distractor_notion_id,
        confusedWithNotionId: confusedWithField(row.response),
        normalizedResponse: normalizedResponse(row.response),
        offTopic: offTopicField(row.feedback),
        countsForGaps: true,
      };
    });

    const before = previousStateOf(states.get(notionId));
    const plan = planNotionReviews({
      notionId,
      state: before,
      answers: reviewAnswers,
      history: { mastery: masteryHistory, gapAnswers, timed },
    });
    let last: NotionReviewStep | undefined;
    for (const step of plan) {
      const written = await persistStep(tx, userId, step);
      if (!written) continue;
      steps.push(step);
      last = step;
      if (step.gapEvent !== null) {
        gapEvents.push({
          notionId,
          kind: step.gapEvent.kind,
          nature: step.gapEvent.nature,
        });
      }
    }
    transitions.push(transitionOf(notionId, before, last));
    await hooks.afterNotion?.();
  }

  let dailyActivity: LearningApplicationSummary['dailyActivity'] = null;
  if (steps.length > 0) {
    const timezone = await loadTimezone(tx, userId);
    const submitted = attempt.submitted_at === null ? now : new Date(attempt.submitted_at);
    const totalMs =
      attempt.duration_ms ?? answers.reduce((sum, answer) => sum + (answer.time_ms ?? 0), 0);
    const minutes = Math.max(1, Math.ceil(totalMs / 60_000));
    const activity = await upsertDailyActivity(tx, {
      userId,
      day: userLocalDay(submitted, timezone),
      minutes,
      qualifying: true,
      sources: [`attempt:${attemptId}`],
    });
    dailyActivity = {
      day: activity.day,
      minutes: activity.minutes,
      qualifying: activity.qualifying,
    };
  }

  const summary = LearningApplicationSummarySchema.parse({
    attemptId,
    status: steps.length > 0 ? 'applied' : 'already_applied',
    reviewCount: steps.length,
    notionIds,
    pendingAnswers: selection.pending.length,
    gapEvents,
    events,
    dailyActivity,
    states: transitions,
  });
  return summary;
}

/**
 * ET-1, ET-4, CL-1 to CL-5 — applies the corrected answers of one graded attempt in one user
 * transaction. The attempt row is locked, the learner's notion states are locked, every engine
 * call is pure and the journals are appended through the security-definer functions. A replayed
 * attempt finds its `(answer_id, notion_id)` rows and writes nothing.
 */
export async function applyLearningResult(
  ctx: ServiceContext,
  attemptId: string,
  options: ApplyLearningResultOptions = {},
): Promise<Result<LearningApplicationSummary>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const input = reviewInputSchema.parse({
      attemptId,
      now: ctx.clock.now(),
      ...(options.hooks === undefined ? {} : { hooks: options.hooks }),
    });
    const summary = await withTransaction(db, async (tx, outbox) => {
      const applied = await applyInTransaction(
        tx,
        userId,
        input.attemptId,
        input.now,
        options.hooks ?? {},
      );
      for (const [index, gapEvent] of applied.gapEvents.entries()) {
        const notion = await tx.execute<{ formation_id: string }>(sql`
          select formation_id::text as formation_id
          from public.notions
          where id = ${gapEvent.notionId}::uuid
        `);
        const formationId = notion[0]?.formation_id;
        if (formationId === undefined) continue;
        const nature = gapEvent.nature;
        if (nature === null) continue;
        if (gapEvent.kind === 'cleared') {
          outbox.add(
            'gap/cleared',
            { userId, formationId, notionId: gapEvent.notionId },
            { id: `gap/cleared:${gapEvent.notionId}:${String(index)}:${applied.attemptId}` },
          );
          applied.events.push('gap/cleared');
          continue;
        }
        if (gapEvent.kind === 'nature_changed') {
          const previous = applied.states.find((state) => state.notionId === gapEvent.notionId)
            ?.gapBefore?.nature;
          if (previous === undefined) continue;
          outbox.add(
            'gap/nature-changed',
            {
              userId,
              formationId,
              notionId: gapEvent.notionId,
              nature,
              previousNature: previous,
            },
            { id: `gap/nature-changed:${gapEvent.notionId}:${String(index)}:${applied.attemptId}` },
          );
          applied.events.push('gap/nature-changed');
          continue;
        }
        outbox.add(
          'gap/detected',
          { userId, formationId, notionId: gapEvent.notionId, nature },
          { id: `gap/detected:${gapEvent.notionId}:${String(index)}:${applied.attemptId}` },
        );
        applied.events.push('gap/detected');
      }
      return LearningApplicationSummarySchema.parse(applied);
    });
    return summary;
  });
}
