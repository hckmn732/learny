// Persistent mock exam attempt (SPEC-614 EF-2 to EF-4, ET-3 to ET-5, BR-PRA-02 to BR-PRA-04,
// ADR-0028, ADR-0172). The attempt freezes its questions, its format and its deadline at creation;
// every read and write goes through the learner's RLS client. Answers are graded by the code
// graders of SPEC-502 at the submission only, so no correct answer leaves the server before the
// end of the exam. The deadline is authoritative on the server: a late write is refused and an
// expired attempt is submitted by the manual button, the `exam-deadline` job or a lazy read.
import { z } from 'zod';

import {
  gradeBrick,
  parseBrickPayload,
  shuffleSeeded,
  toPublicBrick,
  type BrickType,
  type CorrectionView,
} from '@learny/bricks';
import {
  ExamAttemptDto,
  ExamResultDto,
  ExamSubmitOutput,
  type ExamFormatSchema as ExamFormat,
  type ExamQuestionDto,
  type QuizFeedback,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { applyLearningResult } from '../learning/apply-result';
import { requireUser, toResult } from '../resources/result';

import { allocateQuestionCounts, isStudiedModule, proposeExamFormat } from './format';
import {
  gradeExam,
  type ExamGradedQuestion,
  type ExamGradeSummary,
  type ExamModuleInfo,
} from './grade';
import { examAcceptsAnswer, examDeadline, examExpired, examRemainingMs } from './timer';

const UUID = z.uuid();
const AUTO_GRADED = new Set<BrickType>(['choice_question', 'cloze', 'matching']);

interface FormationRow extends Record<string, unknown> {
  id: string;
  title: string;
  exam_format: unknown;
}

interface ModuleRow extends Record<string, unknown> {
  module_id: string;
  position: number;
  label: string;
  status: string;
  notion_count: number;
  seen_count: number;
}

interface BankRow extends Record<string, unknown> {
  brick_id: string;
  version_id: string;
  type: string;
  notion_ids: string[];
  purpose: string;
  payload: unknown;
  notion_id: string;
  notion_label: string;
  module_id: string;
  module_position: number;
  module_label: string;
}

export interface ExamCandidate {
  brickId: string;
  versionId: string;
  type: 'choice_question' | 'cloze' | 'matching';
  notionId: string;
  notionLabel: string;
  moduleId: string;
  modulePosition: number;
  moduleLabel: string;
  studied: boolean;
  payload: unknown;
}

interface AttemptRow extends Record<string, unknown> {
  id: string;
  activity_id: string;
  attempt_no: number;
  status: string;
  started_at: Date | string;
  deadline_at: Date | string;
  submitted_at: Date | string | null;
  duration_ms: number | null;
  score: string | null;
  passed: boolean | null;
  review_feedback: unknown;
  formation_id: string;
  config: unknown;
  items: unknown;
}

interface AnswerRow extends Record<string, unknown> {
  id: string;
  position: number;
  brick_version_id: string;
  response: unknown;
  is_correct: boolean | null;
  score: string | null;
  max_score: string | null;
  graded_by: string | null;
  feedback: unknown;
  time_ms: number | null;
}

interface ItemRow {
  brickId?: unknown;
  brickVersionId?: unknown;
  points?: unknown;
  notionId?: unknown;
  notionLabel?: unknown;
  type?: unknown;
  payload?: unknown;
  moduleId?: unknown;
  modulePosition?: unknown;
  moduleLabel?: unknown;
  studied?: unknown;
}

interface AttemptConfig {
  threshold: number;
  durationSec: number;
  questionCount: number;
  examFormat: ExamFormat;
  diagnosticPositions: number[];
  modules: ExamModuleInfo[];
}

function textField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function numberField(value: unknown, fallback = 1): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function configOf(value: unknown): AttemptConfig {
  const config = asObject(value) ?? {};
  return {
    threshold: Number(config.threshold ?? 70),
    durationSec: Number(config.durationSec ?? 2_400),
    questionCount: Number(config.questionCount ?? 20),
    examFormat: config.examFormat as ExamFormat,
    diagnosticPositions: Array.isArray(config.diagnosticPositions)
      ? config.diagnosticPositions.filter((entry): entry is number => typeof entry === 'number')
      : [],
    modules: Array.isArray(config.modules) ? (config.modules as ExamModuleInfo[]) : [],
  };
}

function itemsOf(value: unknown): ItemRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ItemRow =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  );
}

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function typeLabelOf(type: string, payload: unknown): string {
  const data = asObject(payload);
  if (type === 'choice_question') {
    return data?.mode === 'multiple' ? 'Choix multiple' : 'Choix unique';
  }
  if (type === 'cloze') return 'Texte à trous';
  if (type === 'matching') return 'Association';
  return 'Question';
}

function questionStem(type: string, payload: unknown): string {
  const data = asObject(payload);
  if (type === 'choice_question' || type === 'open_question') {
    return typeof data?.stem === 'string' ? data.stem : '';
  }
  if (type === 'cloze') {
    return typeof data?.template === 'string' ? data.template : '';
  }
  if (type === 'matching') {
    return typeof data?.instruction === 'string' ? data.instruction : '';
  }
  return '';
}

function publicPayload(type: string, payload: unknown, versionId: string): unknown {
  if (!AUTO_GRADED.has(type as BrickType)) return payload;
  const parsed = parseBrickPayload(type as BrickType, payload);
  if (!parsed.ok) return null;
  return toPublicBrick({
    brickId: versionId,
    versionId,
    type: type as BrickType,
    notionIds: [],
    payload: parsed.value,
  }).publicPayload;
}

function hasResponse(type: string, response: unknown): boolean {
  const data = asObject(response);
  if (data === null) return false;
  if (type === 'choice_question') {
    return Array.isArray(data.optionIds) && data.optionIds.length > 0;
  }
  if (type === 'cloze') {
    const gaps = asObject(data.gaps);
    return gaps !== null && Object.values(gaps).some((value) => String(value).trim() !== '');
  }
  if (type === 'matching') {
    const pairs = asObject(data.pairs);
    return pairs !== null && Object.values(pairs).some((value) => value !== null && value !== '');
  }
  if (typeof data.text === 'string') return data.text.trim() !== '';
  return Object.keys(data).length > 0;
}

/** ET-1 — a response that does not match its brick schema creates nothing (CL-1). */
function validateResponse(item: ItemRow, response: unknown): void {
  const type = item.type as BrickType;
  if (!AUTO_GRADED.has(type)) return;
  const parsed = parseBrickPayload(type, item.payload);
  if (!parsed.ok) {
    throw new AppError('VALIDATION_FAILED', 'La question jouée est illisible.');
  }
  const graded = gradeBrick(type, item.payload, response, textField(item.brickVersionId));
  if (!graded.ok && graded.error.code === 'RESPONSE_INVALID') {
    throw new AppError('VALIDATION_FAILED', 'La réponse ne correspond pas à la question.', {
      errors: graded.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }
}

async function readFormation(tx: DbTx, userId: string, formationId: string): Promise<FormationRow> {
  const rows = await tx.execute<FormationRow>(sql`
    select f.id::text as id, f.title, f.exam_format
    from public.formations f
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
  const formation = rows[0];
  if (formation === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  return formation;
}

async function readModules(tx: DbTx, userId: string, formationId: string): Promise<ModuleRow[]> {
  return tx.execute<ModuleRow>(sql`
    select m.id::text as module_id,
           m.position,
           m.title as label,
           coalesce(mp.status, m.status)::text as status,
           count(distinct n.id)::int as notion_count,
           count(distinct ns.notion_id) filter (where ns.first_seen_at is not null)::int as seen_count
    from public.modules m
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    left join public.chapters c on c.module_id = m.id
    left join public.notions n on n.chapter_id = c.id
    left join public.notion_states ns
      on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
    where m.formation_id = ${formationId}::uuid
    group by m.id, m.position, m.title, m.status, mp.status
    order by m.position asc
  `);
}

async function readGuide(
  tx: DbTx,
  formationId: string,
): Promise<{ id: string; metadata: unknown } | null> {
  const rows = await tx.execute<{ id: string; metadata: unknown }>(sql`
    select id::text as id, metadata
    from public.resources
    where formation_id = ${formationId}::uuid
      and kind = 'exam_guide'
      and deleted_at is null
      and status in ('ready', 'processing')
    order by created_at asc, id asc
    limit 1
  `);
  return rows[0] ?? null;
}

async function readBank(tx: DbTx, userId: string, formationId: string): Promise<BankRow[]> {
  return tx.execute<BankRow>(sql`
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           b.purpose::text as purpose,
           bv.payload,
           n.id::text as notion_id,
           n.label as notion_label,
           m.id::text as module_id,
           m.position as module_position,
           m.title as module_label
    from public.bricks b
    join public.brick_versions bv
      on bv.brick_id = b.id and bv.version = b.current_version
    join public.notions n on n.id = b.notion_ids[1]
    join public.modules m on m.id = n.module_id
    where b.owner_id = ${userId}::uuid
      and b.formation_id = ${formationId}::uuid
      and b.purpose in ('exam', 'bank')
      and b.status = 'active'
    order by m.position asc, b.id asc
  `);
}

/**
 * Deterministic selection of the exam questions. The official count is shared over the modules in
 * proportion to their notions; each module draws from its own bank (exam-purpose bricks first).
 * A bank smaller than the official format yields a shorter exam instead of reusing a question.
 */
export function selectExamQuestions(
  candidates: readonly ExamCandidate[],
  modules: readonly { moduleId: string; position: number; notionCount: number }[],
  questionCount: number,
  seed: string,
): ExamCandidate[] {
  const examOnly = candidates;
  const quotas = allocateQuestionCounts(
    questionCount,
    modules.map((module) => ({
      moduleId: module.moduleId,
      notionCount: module.notionCount,
    })),
  );
  const byModule = new Map<string, ExamCandidate[]>();
  for (const module of modules) {
    const pool = examOnly.filter((candidate) => candidate.moduleId === module.moduleId);
    const preferred = pool.filter((candidate) => candidate.type === 'choice_question');
    const others = pool.filter((candidate) => candidate.type !== 'choice_question');
    byModule.set(
      module.moduleId,
      shuffleSeeded([...preferred, ...others], `${seed}:${module.moduleId}`),
    );
  }
  const selected: ExamCandidate[] = [];
  const used = new Set<string>();
  const take = (moduleId: string, count: number): number => {
    const pool = byModule.get(moduleId) ?? [];
    let taken = 0;
    for (const candidate of pool) {
      if (taken >= count || selected.length >= questionCount) break;
      if (used.has(candidate.brickId)) continue;
      used.add(candidate.brickId);
      selected.push(candidate);
      taken += 1;
    }
    return taken;
  };
  for (const module of modules) {
    take(module.moduleId, quotas.get(module.moduleId) ?? 0);
  }
  // Redistribute the shortage of a module over the modules that still have fresh candidates.
  let guard = 0;
  while (selected.length < questionCount && guard < modules.length * 4 + 4) {
    guard += 1;
    const before = selected.length;
    for (const module of modules) {
      if (selected.length >= questionCount) break;
      take(module.moduleId, 1);
    }
    if (selected.length === before) break;
  }
  return [...selected]
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (left, right) =>
        left.candidate.modulePosition - right.candidate.modulePosition || left.index - right.index,
    )
    .map((entry) => entry.candidate);
}

function candidatesOf(
  rows: readonly BankRow[],
  studiedModules: ReadonlySet<string>,
): ExamCandidate[] {
  const hasExamBricks = rows.some((row) => row.purpose === 'exam');
  const candidates: ExamCandidate[] = [];
  for (const row of rows) {
    if (hasExamBricks && row.purpose !== 'exam') continue;
    if (!AUTO_GRADED.has(row.type as BrickType)) continue;
    candidates.push({
      brickId: row.brick_id,
      versionId: row.version_id,
      type: row.type as ExamCandidate['type'],
      notionId: row.notion_id,
      notionLabel: row.notion_label,
      moduleId: row.module_id,
      modulePosition: row.module_position,
      moduleLabel: row.module_label,
      studied: studiedModules.has(row.module_id),
      payload: row.payload,
    });
  }
  return candidates;
}

async function inProgressAttempt(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<string | null> {
  const rows = await tx.execute<{ id: string }>(sql`
    select at.id::text as id
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.user_id = ${userId}::uuid
      and act.formation_id = ${formationId}::uuid
      and act.kind = 'mock_exam'
      and at.status = 'in_progress'
    order by at.created_at desc, at.id desc
    limit 1
  `);
  return rows[0]?.id ?? null;
}

async function nextAttemptNo(tx: DbTx, userId: string, formationId: string): Promise<number> {
  const rows = await tx.execute<{ count: number }>(sql`
    select count(*)::int as count
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.user_id = ${userId}::uuid
      and act.formation_id = ${formationId}::uuid
      and act.kind = 'mock_exam'
  `);
  return (rows[0]?.count ?? 0) + 1;
}

export interface StartExamOutput {
  attemptId: string;
  resumed?: boolean;
}

/**
 * EF-1, EF-2 — starts (or resumes) the single in-progress exam of the formation. A format
 * extracted from a guide must be confirmed first (ET-3); no attempt is created otherwise.
 */
export function startExamAttempt(
  ctx: ServiceContext,
  formationIdValue: string,
): Promise<Result<StartExamOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(formationIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de formation invalide.');
    }
    const formationId = formationIdValue;
    const existing = await db.run((tx) => inProgressAttempt(tx, userId, formationId));
    if (existing !== null) return { attemptId: existing, resumed: true };

    const startedAt = ctx.clock.now();
    return withTransaction(db, async (tx, outbox) => {
      await tx.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended('exam-start:' || ${userId} || ':' || ${formationId}, 0)
        )
      `);
      const replay = await inProgressAttempt(tx, userId, formationId);
      if (replay !== null) return { attemptId: replay, resumed: true };

      const formation = await readFormation(tx, userId, formationId);
      const guide = await readGuide(tx, formationId);
      const format = proposeExamFormat({
        stored: formation.exam_format,
        guide,
      });
      if (!format.confirmed) {
        throw new AppError(
          'FORMAT_NOT_CONFIRMED',
          'Confirmez le format extrait de votre guide avant de commencer.',
        );
      }
      const modules = await readModules(tx, userId, formationId);
      if (modules.length === 0) {
        throw new AppError('CONFLICT', 'Cette formation n’a pas encore de programme.', {
          status: 409,
        });
      }
      const studiedModules = new Set(
        modules
          .filter((module) =>
            isStudiedModule({
              status: module.status,
              seenCount: module.seen_count,
            }),
          )
          .map((module) => module.module_id),
      );
      const rows = await readBank(tx, userId, formationId);
      const candidates = candidatesOf(rows, studiedModules);
      if (candidates.length === 0) {
        throw new AppError('CONFLICT', 'Aucune question d’examen n’est disponible.', {
          status: 409,
        });
      }
      const attemptNo = await nextAttemptNo(tx, userId, formationId);
      const seed = `${userId}:${formationId}:exam:${String(attemptNo)}`;
      const selected = selectExamQuestions(
        candidates,
        modules.map((module) => ({
          moduleId: module.module_id,
          position: module.position,
          notionCount: module.notion_count,
        })),
        format.questionCount,
        seed,
      );
      if (selected.length === 0) {
        throw new AppError('CONFLICT', 'Aucune question d’examen n’est disponible.', {
          status: 409,
        });
      }
      const points = 100 / selected.length;
      const items = selected.map((question) => ({
        brickId: question.brickId,
        brickVersionId: question.versionId,
        points,
        notionId: question.notionId,
        notionLabel: question.notionLabel,
        type: question.type,
        payload: question.payload,
        moduleId: question.moduleId,
        modulePosition: question.modulePosition,
        moduleLabel: question.moduleLabel,
        studied: question.studied,
      }));
      const diagnosticPositions = items
        .map((item, index) => ({ item, position: index + 1 }))
        .filter((entry) => !entry.item.studied)
        .map((entry) => entry.position);
      const config = {
        threshold: format.threshold,
        durationSec: format.durationMin * 60,
        questionCount: selected.length,
        scoring: 'equal',
        examFormat: format,
        diagnosticPositions,
        modules: modules
          .map((module) => ({
            moduleId: module.module_id,
            position: module.position,
            label: module.label,
            studied: studiedModules.has(module.module_id),
          }))
          .filter((module) => selected.some((question) => question.moduleId === module.moduleId)),
      };
      const activityRows = await tx.execute<{ id: string }>(sql`
        insert into public.activities (
          owner_id, formation_id, module_id, kind, config, items, status
        ) values (
          ${userId}::uuid, ${formationId}::uuid, null, 'mock_exam',
          ${JSON.stringify(config)}::jsonb,
          ${JSON.stringify(items)}::jsonb,
          'ready'
        )
        returning id::text as id
      `);
      const activityId = activityRows[0]?.id;
      if (activityId === undefined) throw new AppError('INTERNAL_ERROR', 'Activité non créée.');

      const deadline = examDeadline(startedAt, config.durationSec);
      const attemptRows = await tx.execute<{ id: string }>(sql`
        insert into public.attempts (
          user_id, activity_id, attempt_no, status, started_at, deadline_at
        ) values (
          ${userId}::uuid, ${activityId}::uuid, ${attemptNo}, 'in_progress',
          ${startedAt.toISOString()}::timestamptz, ${deadline.toISOString()}::timestamptz
        )
        returning id::text as id
      `);
      const attemptId = attemptRows[0]?.id;
      if (attemptId === undefined) throw new AppError('INTERNAL_ERROR', 'Tentative non créée.');

      for (const [index, item] of items.entries()) {
        await tx.execute(sql`
          insert into public.answers (
            attempt_id, brick_version_id, position, response, max_score, answered_at
          ) values (
            ${attemptId}::uuid, ${item.brickVersionId}::uuid, ${index + 1},
            '{}'::jsonb, ${item.points}, ${startedAt.toISOString()}::timestamptz
          )
        `);
      }
      outbox.add(
        'exam/started',
        {
          userId,
          formationId,
          attemptId,
          deadlineAt: deadline.toISOString(),
        },
        { id: `exam-started:${attemptId}` },
      );
      return { attemptId };
    });
  });
}

async function readAttempt(
  tx: DbTx,
  userId: string,
  attemptId: string,
  lock = false,
): Promise<AttemptRow> {
  const rows = await tx.execute<AttemptRow>(sql`
    select at.id::text as id,
           at.activity_id::text as activity_id,
           at.attempt_no,
           at.status::text as status,
           at.started_at,
           at.deadline_at,
           at.submitted_at,
           at.duration_ms,
           at.score::text as score,
           at.passed,
           at.review_feedback,
           act.formation_id::text as formation_id,
           act.config,
           act.items
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.id = ${attemptId}::uuid
      and at.user_id = ${userId}::uuid
      and act.kind = 'mock_exam'
    limit 1
    ${lock ? sql`for update of at` : sql``}
  `);
  const attempt = rows[0];
  if (attempt === undefined) throw new AppError('NOT_FOUND', 'Examen introuvable.');
  return attempt;
}

async function readAnswers(tx: DbTx, attemptId: string): Promise<AnswerRow[]> {
  return tx.execute<AnswerRow>(sql`
    select id::text as id,
           position,
           brick_version_id::text as brick_version_id,
           response,
           is_correct,
           score::text as score,
           max_score::text as max_score,
           graded_by::text as graded_by,
           feedback,
           time_ms
    from public.answers
    where attempt_id = ${attemptId}::uuid
    order by position asc
  `);
}

function markedPositionsOf(value: unknown): number[] {
  const review = asObject(value);
  if (review === null) return [];
  return Array.isArray(review.markedPositions)
    ? review.markedPositions.filter((entry): entry is number => typeof entry === 'number')
    : [];
}

function buildQuestions(
  items: readonly ItemRow[],
  answers: readonly AnswerRow[],
  marked: ReadonlySet<number>,
  graded: boolean,
): ExamQuestionDto[] {
  const byPosition = new Map(answers.map((answer) => [answer.position, answer]));
  return items.map((item, index) => {
    const position = index + 1;
    const answer = byPosition.get(position);
    const feedback = graded && answer !== undefined ? feedbackOf(answer) : null;
    return {
      position,
      brickVersionId: textField(item.brickVersionId),
      type: item.type as ExamQuestionDto['type'],
      typeLabel: typeLabelOf(textField(item.type), item.payload),
      notionId: textField(item.notionId),
      notionLabel: textField(item.notionLabel),
      moduleId: textField(item.moduleId),
      modulePosition: numberField(item.modulePosition),
      moduleLabel: textField(item.moduleLabel),
      payload: publicPayload(textField(item.type), item.payload, textField(item.brickVersionId)),
      ...(answer === undefined || !hasResponse(textField(item.type), answer.response)
        ? {}
        : { response: answer.response }),
      marked: marked.has(position),
      maxScore: Number(item.points ?? 0),
      ...(feedback === null ? {} : { feedback }),
    };
  });
}

function feedbackOf(answer: AnswerRow): QuizFeedback | null {
  const feedback = asObject(answer.feedback);
  if (feedback === null) return null;
  return feedback as QuizFeedback;
}

/**
 * ET-4, BR-PRA-03, ADR-0172 — the read model of the attempt. An expired in-progress attempt is
 * submitted lazily before the answer, so a reload always shows the graded result.
 */
export function getExamAttempt(
  ctx: ServiceContext,
  attemptIdValue: string,
): Promise<Result<ExamAttemptDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    const first = await db.run((tx) => readAttempt(tx, userId, attemptId));
    if (first.status === 'in_progress' && examExpired(first.deadline_at, ctx.clock.now())) {
      const submitted = await submitExam(ctx, attemptId, { trigger: 'lazy' });
      if (!submitted.ok) throw submitted.error;
    }
    return db.run(async (tx) => {
      const attempt = await readAttempt(tx, userId, attemptId);
      const answers = await readAnswers(tx, attemptId);
      const config = configOf(attempt.config);
      const items = itemsOf(attempt.items);
      const marked = new Set(markedPositionsOf(attempt.review_feedback));
      const graded = attempt.status === 'graded';
      const questions = buildQuestions(items, answers, marked, graded);
      const remaining = Math.ceil(examRemainingMs(attempt.deadline_at, ctx.clock.now()) / 1000);
      return ExamAttemptDto.parse({
        id: attempt.id,
        attemptNo: attempt.attempt_no,
        formationId: attempt.formation_id,
        status: attempt.status,
        threshold: config.threshold,
        total: questions.length,
        questions,
        startedAt: isoOf(attempt.started_at),
        deadlineAt: isoOf(attempt.deadline_at),
        serverTime: ctx.clock.now().toISOString(),
        remainingSeconds: remaining,
        answeredCount: questions.filter((question) => question.response !== undefined).length,
        markedCount: marked.size,
      });
    });
  });
}

function readItemForPosition(tx: DbTx, attempt: AttemptRow, position: number): ItemRow {
  const items = itemsOf(attempt.items);
  const item = items[position - 1];
  if (item === undefined) {
    throw new AppError('VALIDATION_FAILED', 'Cette question n’existe pas dans l’examen.');
  }
  return item;
}

/** EF-2, ET-4 — writes one answer before the deadline; a late answer is refused. */
export function saveExamAnswer(
  ctx: ServiceContext,
  attemptIdValue: string,
  position: number,
  input: { response: unknown; timeMs: number },
): Promise<Result<{ position: number; savedAt: string }>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    return withTransaction(db, async (tx) => {
      const attempt = await readAttempt(tx, userId, attemptId, true);
      if (attempt.status !== 'in_progress') {
        throw new AppError('CONFLICT', 'Cet examen est terminé.', { status: 409 });
      }
      if (!examAcceptsAnswer(attempt.deadline_at, ctx.clock.now())) {
        throw new AppError('EXAM_TIME_OVER', 'Le temps de l’examen est écoulé.');
      }
      const item = readItemForPosition(tx, attempt, position);
      validateResponse(item, input.response);
      const now = ctx.clock.now();
      await tx.execute(sql`
        update public.answers
        set response = ${JSON.stringify(input.response)}::jsonb,
            time_ms = ${Math.min(1_800_000, Math.max(0, Math.trunc(input.timeMs)))},
            answered_at = ${now.toISOString()}::timestamptz
        where attempt_id = ${attemptId}::uuid and position = ${position}
      `);
      return { position, savedAt: now.toISOString() };
    });
  });
}

/** BR-PRA-03 — marks a question « à revoir »; the marker survives a reload. */
export function markExamQuestion(
  ctx: ServiceContext,
  attemptIdValue: string,
  position: number,
  marked: boolean,
): Promise<Result<{ position: number; marked: boolean }>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    return db.run(async (tx) => {
      const attempt = await readAttempt(tx, userId, attemptId, true);
      if (attempt.status !== 'in_progress') {
        throw new AppError('CONFLICT', 'Cet examen est terminé.', { status: 409 });
      }
      void readItemForPosition(tx, attempt, position);
      const current = new Set(markedPositionsOf(attempt.review_feedback));
      if (marked) current.add(position);
      else current.delete(position);
      const positions = [...current].sort((left, right) => left - right);
      await tx.execute(sql`
        update public.attempts
        set review_feedback = jsonb_set(
          coalesce(review_feedback, '{}'::jsonb),
          '{markedPositions}',
          ${JSON.stringify(positions)}::jsonb,
          true
        )
        where id = ${attemptId}::uuid
      `);
      return { position, marked };
    });
  });
}

function labelList(labels: readonly string[]): string | null {
  const filtered = labels.filter((label) => label.trim() !== '');
  return filtered.length === 0 ? null : filtered.join(', ');
}

function correctionLabels(correction: CorrectionView | undefined): {
  given: string;
  expected: string | null;
  explanation: string | null;
} {
  if (correction === undefined || correction.kind === 'none') {
    return { given: 'sans réponse', expected: null, explanation: null };
  }
  if (correction.kind === 'choice_question') {
    return {
      given:
        labelList(
          correction.options.filter((option) => option.chosen).map((option) => option.text),
        ) ?? 'sans réponse',
      expected: labelList(
        correction.options.filter((option) => option.correct).map((option) => option.text),
      ),
      explanation: correction.explanation,
    };
  }
  if (correction.kind === 'cloze') {
    return {
      given:
        labelList(
          correction.gaps.map((gap) => (gap.given === '' ? '' : `${String(gap.id)}. ${gap.given}`)),
        ) ?? 'sans réponse',
      expected: labelList(correction.gaps.map((gap) => `${String(gap.id)}. ${gap.expected}`)),
      explanation: correction.explanation,
    };
  }
  if (correction.kind === 'matching') {
    return {
      given:
        labelList(
          correction.pairs.map((pair) =>
            pair.givenRight === null ? '' : `${pair.left} → ${pair.givenRight}`,
          ),
        ) ?? 'sans réponse',
      expected: labelList(correction.pairs.map((pair) => `${pair.left} → ${pair.expectedRight}`)),
      explanation: correction.explanation,
    };
  }
  return { given: 'sans réponse', expected: null, explanation: null };
}

function expectedFromPayload(type: string, payload: unknown): string | null {
  const data = asObject(payload);
  if (data === null) return null;
  if (type === 'choice_question') {
    const options = Array.isArray(data.options) ? data.options : [];
    return (
      labelList(
        options
          .filter(
            (option): option is { text: string; correct: boolean } =>
              typeof option === 'object' && option !== null && asObject(option)?.correct === true,
          )
          .map((option) => option.text),
      ) ?? null
    );
  }
  if (type === 'cloze') {
    const gaps = Array.isArray(data.gaps) ? data.gaps : [];
    return (
      labelList(
        gaps.map((gap) => {
          const entry = asObject(gap);
          const answers = Array.isArray(entry?.answers) ? entry.answers : [];
          return `${textField(entry?.id)}. ${textField(answers[0])}`;
        }),
      ) ?? null
    );
  }
  if (type === 'matching') {
    const pairs = Array.isArray(data.pairs) ? data.pairs : [];
    return (
      labelList(
        pairs.map((pair) => {
          const entry = asObject(pair);
          return `${textField(entry?.left)} → ${textField(entry?.right)}`;
        }),
      ) ?? null
    );
  }
  return null;
}

interface GradedItem {
  question: ExamGradedQuestion;
  feedback: QuizFeedback;
  answerId: string;
}

function gradeItem(item: ItemRow, answer: AnswerRow, studied: boolean): GradedItem {
  const type = textField(item.type);
  const payload = item.payload;
  const maxScore = Number(answer.max_score ?? item.points ?? 0);
  const response = answer.response;
  const answered = hasResponse(type, response);
  const outcome =
    answered && AUTO_GRADED.has(type as BrickType)
      ? gradeBrick(type as BrickType, payload, response, answer.brick_version_id)
      : null;
  const correction = outcome !== null && outcome.ok ? outcome.value.correction : undefined;
  const labels = correctionLabels(correction);
  const ratio = outcome !== null && outcome.ok ? outcome.value.score : 0;
  const isCorrect = outcome !== null && outcome.ok ? outcome.value.isCorrect : false;
  const explanation =
    labels.explanation ?? (asObject(payload)?.explanation as string | undefined) ?? null;
  const feedback: QuizFeedback = {
    isCorrect,
    title: isCorrect ? 'Exact.' : 'Pas tout à fait.',
    score: Math.round(ratio * maxScore * 100) / 100,
    explanation,
    ...(correction === undefined || correction.kind === 'none'
      ? {}
      : { correction: correction as QuizFeedback['correction'] }),
  };
  return {
    answerId: answer.id,
    feedback,
    question: {
      position: answer.position,
      brickVersionId: answer.brick_version_id,
      typeLabel: typeLabelOf(type, payload),
      question: questionStem(type, payload),
      notionId: textField(item.notionId),
      notionLabel: textField(item.notionLabel),
      moduleId: textField(item.moduleId),
      modulePosition: numberField(item.modulePosition),
      moduleLabel: textField(item.moduleLabel),
      studied,
      isCorrect,
      score: Math.round(ratio * maxScore * 100) / 100,
      maxScore,
      given: labels.given === 'sans réponse' && answered ? 'réponse incomplète' : labels.given,
      expected: labels.expected ?? expectedFromPayload(type, payload),
      explanation,
    },
  };
}

function perNotionOf(
  questions: readonly ExamGradedQuestion[],
): Record<string, { correct: number; total: number; score: number }> {
  const map = new Map<string, { correct: number; total: number }>();
  for (const question of questions) {
    const key = question.notionId;
    const entry = map.get(key) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (question.isCorrect) entry.correct += 1;
    map.set(key, entry);
  }
  const result: Record<string, { correct: number; total: number; score: number }> = {};
  for (const [notionId, entry] of map) {
    result[notionId] = {
      correct: entry.correct,
      total: entry.total,
      score: entry.total === 0 ? 0 : Math.round((entry.correct / entry.total) * 100),
    };
  }
  return result;
}

export interface SubmitExamOptions {
  trigger?: 'manual' | 'deadline' | 'lazy';
}

export interface SubmitExamOutcome {
  status: ExamSubmitOutput['status'];
  unansweredCount: number;
  markedCount: number;
  timedOut: boolean;
  outcome: ExamGradeSummary | null;
}

/**
 * EF-3, EF-4, CL-3, CL-4, ADR-0172 — submits and grades the attempt once. The advisory lock and
 * the row lock make the button and the deadline job converge on a single result. A deadline
 * trigger before the end of the tolerance does nothing; a lazy read after it grades as timed out.
 */
export function submitExam(
  ctx: ServiceContext,
  attemptIdValue: string,
  options: SubmitExamOptions = {},
): Promise<Result<SubmitExamOutcome>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    const trigger = options.trigger ?? 'manual';
    const now = ctx.clock.now();
    const prepared = await withTransaction(db, async (tx, outbox) => {
      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtextextended('exam-submit:' || ${attemptId}, 0))
      `);
      const attempt = await readAttempt(tx, userId, attemptId, true);
      const answers = await readAnswers(tx, attemptId);
      const items = itemsOf(attempt.items);
      const config = configOf(attempt.config);
      const marked = markedPositionsOf(attempt.review_feedback);
      const answeredCount = items.filter((item, index) => {
        const answer = answers[index];
        return answer !== undefined && hasResponse(textField(item.type), answer.response);
      }).length;
      const unansweredCount = items.length - answeredCount;
      const timedOut = now.getTime() > new Date(attempt.deadline_at).getTime();
      if (attempt.status !== 'in_progress') {
        return {
          status: attempt.status as SubmitExamOutcome['status'],
          unansweredCount,
          markedCount: marked.length,
          timedOut,
          outcome: null,
        };
      }
      if (trigger === 'deadline' && !examExpired(attempt.deadline_at, now)) {
        return {
          status: 'in_progress' as const,
          unansweredCount,
          markedCount: marked.length,
          timedOut: false,
          outcome: null,
        };
      }
      if (trigger === 'lazy' && !examExpired(attempt.deadline_at, now)) {
        return {
          status: 'in_progress' as const,
          unansweredCount,
          markedCount: marked.length,
          timedOut: false,
          outcome: null,
        };
      }

      const gradedItems: GradedItem[] = [];
      for (const [index, item] of items.entries()) {
        const answer = answers[index];
        if (answer === undefined) continue;
        const graded = gradeItem(item, answer, item.studied === true);
        gradedItems.push(graded);
        await tx.execute(sql`
          update public.answers
          set is_correct = ${graded.question.isCorrect},
              score = ${graded.question.score},
              max_score = ${graded.question.maxScore},
              graded_by = 'code',
              feedback = ${JSON.stringify(graded.feedback)}::jsonb,
              answered_at = coalesce(answered_at, ${now.toISOString()}::timestamptz)
          where id = ${answer.id}::uuid
        `);
      }
      const questions = gradedItems.map((entry) => entry.question);
      const summary = gradeExam({
        questions,
        modules: config.modules,
        threshold: config.threshold,
      });
      const submittedAt = new Date(attempt.started_at);
      const durationMs = Math.max(
        0,
        Math.min(config.durationSec * 1000, now.getTime() - submittedAt.getTime()),
      );
      const reviewFeedback = {
        ...(asObject(attempt.review_feedback) ?? {}),
        markedPositions: marked,
        timedOut,
        plan: summary.plan,
      };
      await tx.execute(sql`
        update public.attempts
        set status = 'graded',
            score = ${summary.score},
            passed = ${summary.passed},
            per_notion = ${JSON.stringify(perNotionOf(questions))}::jsonb,
            submitted_at = ${now.toISOString()}::timestamptz,
            duration_ms = ${durationMs},
            review_feedback = ${JSON.stringify(reviewFeedback)}::jsonb
        where id = ${attemptId}::uuid
      `);
      outbox.add(
        'exam/submitted',
        { userId, formationId: attempt.formation_id, attemptId },
        { id: `exam-submitted:${attemptId}` },
      );
      return {
        status: 'graded' as const,
        unansweredCount,
        markedCount: marked.length,
        timedOut,
        outcome: summary,
      };
    });
    if (prepared.outcome !== null) {
      const applied = await applyLearningResult(ctx, attemptId);
      if (!applied.ok) {
        ctx.logger.warn('exam.learning.failed', { outcome: applied.error.code });
      }
    }
    return prepared;
  });
}

interface ResultContext {
  attempt: AttemptRow;
  config: AttemptConfig;
  answers: AnswerRow[];
  items: ItemRow[];
  summary: ExamGradeSummary;
  timedOut: boolean;
  durationMs: number;
  answeredCount: number;
}

async function readGradedContext(
  tx: DbTx,
  userId: string,
  attemptId: string,
): Promise<ResultContext> {
  const attempt = await readAttempt(tx, userId, attemptId);
  if (attempt.status !== 'graded') {
    throw new AppError('CONFLICT', 'Cet examen n’est pas encore corrigé.', { status: 409 });
  }
  const answers = await readAnswers(tx, attemptId);
  const items = itemsOf(attempt.items);
  const config = configOf(attempt.config);
  const gradedItems = items
    .map((item, index) => {
      const answer = answers[index];
      return answer === undefined ? null : gradeItem(item, answer, item.studied === true);
    })
    .filter((entry): entry is GradedItem => entry !== null);
  const summary = gradeExam({
    questions: gradedItems.map((entry) => entry.question),
    modules: config.modules,
    threshold: config.threshold,
  });
  const review = asObject(attempt.review_feedback);
  return {
    attempt,
    config,
    answers,
    items,
    summary,
    timedOut: review?.timedOut === true,
    durationMs: attempt.duration_ms ?? 0,
    answeredCount: gradedItems.filter((entry) =>
      hasResponse(
        String(items[entry.question.position - 1]?.type),
        answers[entry.question.position - 1]?.response,
      ),
    ).length,
  };
}

/** EF-4, BR-PRA-04 — the complete result with separated scores, studied gaps and review. */
export function getExamResult(
  ctx: ServiceContext,
  attemptIdValue: string,
): Promise<Result<ExamResultDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    const first = await db.run((tx) => readAttempt(tx, userId, attemptId));
    if (first.status === 'in_progress' && examExpired(first.deadline_at, ctx.clock.now())) {
      const submitted = await submitExam(ctx, attemptId, { trigger: 'lazy' });
      if (!submitted.ok) throw submitted.error;
    }
    return db.run(async (tx) => {
      const context = await readGradedContext(tx, userId, attemptId);
      const durationMin = Math.round(context.config.durationSec / 60);
      const timeUsedMin = Math.max(
        0,
        Math.min(durationMin, Math.round(context.durationMs / 60_000)),
      );
      const review = context.summary.review;
      return ExamResultDto.parse({
        attemptId,
        formationId: context.attempt.formation_id,
        status: context.attempt.status,
        threshold: context.config.threshold,
        durationMin,
        timeUsedMin,
        timedOut: context.timedOut,
        score: context.summary.score,
        passed: context.summary.passed,
        answeredCount: context.answeredCount,
        total: context.summary.review.length,
        studied: context.summary.studied,
        diagnostic: context.summary.diagnostic,
        modules: context.summary.modules,
        gaps: context.summary.gaps,
        plan: context.summary.plan,
        review,
      });
    });
  });
}
