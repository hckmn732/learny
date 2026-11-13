import { z } from 'zod';

import { gradeBrick, parseBrickPayload, toPublicBrick, type BrickType } from '@learny/bricks';
import {
  AttemptResultDto,
  CheckAnswerOutput,
  QuizFeedback,
  SaveAnswerInput,
  type AttemptDto,
  type QuizCorrection,
  type QuizFeedback as Feedback,
  type QuizQuestionDto,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { computeScore, type ScoredAnswer } from './score';

// Read model, drafts and immediate correction of one attempt (SPEC-611 EF-1 to EF-7, ET-2, ET-5,
// BR-QUI-02, BR-QUI-04, BR-QUI-07). The correct answers, expected gaps and explanations are read
// from the immutable brick version on the server only; a question that is not checked never
// carries them. All writes run on the caller's RLS client and the answer row is locked.

interface AttemptRow extends Record<string, unknown> {
  id: string;
  activity_id: string;
  attempt_no: number;
  status: string;
  started_at: Date | string;
  submitted_at: Date | string | null;
  score: string | number | null;
  passed: boolean | null;
  per_notion: unknown;
  module_id: string;
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
  time_ms: number | null;
  graded_by: string | null;
  feedback: unknown;
  chosen_distractor_notion_id: string | null;
}

interface ItemRow {
  brickId?: unknown;
  brickVersionId?: unknown;
  points?: unknown;
  notionId?: unknown;
  notionLabel?: unknown;
  type?: unknown;
  payload?: unknown;
}

const UUID = z.uuid();
const OPEN_MAX_CHARS = 2_000;

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
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

function itemsOf(value: unknown): ItemRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ItemRow => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  );
}

function typeOf(value: unknown): 'choice_question' | 'cloze' | 'matching' | 'open_question' {
  if (value === 'choice_question' || value === 'cloze' || value === 'matching') return value;
  return 'open_question';
}

function publicPayload(item: ItemRow, type: BrickType, versionId: string): unknown {
  const payload = item.payload;
  const parsed = parseBrickPayload(type, payload);
  if (!parsed.ok) return null;
  return toPublicBrick({
    brickId: versionId,
    versionId,
    type,
    notionIds: [],
    payload: parsed.value,
  }).publicPayload;
}

function typeLabel(type: string, payload: unknown): string {
  const data = asObject(payload);
  if (type === 'choice_question') return data?.mode === 'multiple' ? 'Choix multiple' : 'Choix unique';
  if (type === 'cloze') return 'Texte à trous';
  if (type === 'matching') return 'Association';
  return 'Question ouverte';
}

function isChecked(answer: AnswerRow): boolean {
  if (answer.graded_by === 'code' || answer.graded_by === 'tutor') return true;
  const feedback = asObject(answer.feedback);
  return feedback?.checked === true;
}

function hasDraft(response: unknown): boolean {
  const value = asObject(response);
  if (value === null) return false;
  if (typeof value.text === 'string') return value.text.trim() !== '';
  if (Array.isArray(value.optionIds)) return value.optionIds.length > 0;
  const gaps = asObject(value.gaps);
  if (gaps !== null) return Object.values(gaps).some((entry) => typeof entry === 'string' && entry !== '');
  const pairs = asObject(value.pairs);
  if (pairs !== null) {
    return Object.values(pairs).some((entry) => typeof entry === 'string' && entry !== '');
  }
  return Object.keys(value).length > 0;
}

function feedbackOf(answer: AnswerRow, type: string): Feedback | undefined {
  if (!isChecked(answer)) return undefined;
  const stored = asObject(answer.feedback);
  if (type === 'open_question') {
    if (answer.graded_by === 'tutor' && stored !== null) {
      return QuizFeedback.parse({
        isCorrect: answer.is_correct,
        score: answer.score === null ? null : Number(answer.score),
        explanation: typeof stored.explanation === 'string' ? stored.explanation : null,
        title:
          stored.title === 'Exact.' || stored.title === 'Pas tout à fait.'
            ? stored.title
            : answer.is_correct === true
              ? 'Exact.'
              : 'Pas tout à fait.',
        correction: (stored.correction as QuizCorrection | undefined) ?? null,
      });
    }
    return QuizFeedback.parse({
      isCorrect: null,
      score: null,
      explanation: null,
      title: 'Réponse enregistrée.',
      pending: true,
    });
  }
  if (stored === null) {
    return QuizFeedback.parse({
      isCorrect: answer.is_correct,
      score: answer.score === null ? null : Number(answer.score),
      explanation: null,
      title: answer.is_correct === true ? 'Exact.' : 'Pas tout à fait.',
      correction: null,
    });
  }
  return QuizFeedback.parse({
    isCorrect: answer.is_correct,
    score: answer.score === null ? null : Number(answer.score),
    explanation: typeof stored.explanation === 'string' ? stored.explanation : null,
    title:
      stored.title === 'Exact.' || stored.title === 'Pas tout à fait.'
        ? stored.title
        : answer.is_correct === true
          ? 'Exact.'
          : 'Pas tout à fait.',
    correction: (stored.correction as QuizCorrection | undefined) ?? null,
  });
}

function questionOf(
  item: ItemRow,
  answer: AnswerRow,
  position: number,
): QuizQuestionDto {
  const type = typeOf(item.type);
  const versionId = typeof item.brickVersionId === 'string' ? item.brickVersionId : '';
  const payload = publicPayload(item, type, versionId);
  const state = isChecked(answer) ? 'checked' : hasDraft(answer.response) ? 'draft' : 'unanswered';
  return {
    position,
    brickVersionId: UUID.parse(versionId),
    type,
    typeLabel: typeLabel(type, payload),
    notionId: UUID.parse(typeof item.notionId === 'string' ? item.notionId : versionId),
    notionLabel: typeof item.notionLabel === 'string' ? item.notionLabel : 'Notion',
    payload,
    state,
    response: state === 'unanswered' ? undefined : answer.response,
    ...(state === 'checked' ? { feedback: feedbackOf(answer, type) } : {}),
    maxScore: answer.max_score === null ? 0 : Number(answer.max_score),
  };
}

async function readAttemptRow(tx: DbTx, userId: string, attemptId: string): Promise<AttemptRow> {
  const rows = await tx.execute<AttemptRow>(sql`
    select
      at.id::text as id,
      at.activity_id::text as activity_id,
      at.attempt_no,
      at.status::text as status,
      at.started_at,
      at.submitted_at,
      at.score::text as score,
      at.passed,
      at.per_notion,
      act.module_id::text as module_id,
      act.formation_id::text as formation_id,
      act.config,
      act.items
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.id = ${attemptId}::uuid
      and at.user_id = ${userId}::uuid
      and act.kind in ('validation_quiz', 'remediation')
    limit 1
  `);
  const attempt = rows[0];
  if (attempt === undefined) throw new AppError('NOT_FOUND', 'Tentative introuvable.');
  return attempt;
}

async function readAnswers(tx: DbTx, attemptId: string): Promise<AnswerRow[]> {
  return tx.execute<AnswerRow>(sql`
    select
      id::text as id,
      position,
      brick_version_id::text as brick_version_id,
      response,
      is_correct,
      score::text as score,
      max_score::text as max_score,
      time_ms,
      graded_by::text as graded_by,
      feedback,
      chosen_distractor_notion_id::text as chosen_distractor_notion_id
    from public.answers
    where attempt_id = ${attemptId}::uuid
    order by position asc
  `);
}

async function readAnswer(
  tx: DbTx,
  userId: string,
  attemptId: string,
  position: number,
): Promise<{ answer: AnswerRow; item: ItemRow; attempt: AttemptRow }> {
  const attempt = await readAttemptRow(tx, userId, attemptId);
  const items = itemsOf(attempt.items);
  const item = items[position - 1];
  const rows = await tx.execute<AnswerRow>(sql`
    select
      id::text as id,
      position,
      brick_version_id::text as brick_version_id,
      response,
      is_correct,
      score::text as score,
      max_score::text as max_score,
      time_ms,
      graded_by::text as graded_by,
      feedback,
      chosen_distractor_notion_id::text as chosen_distractor_notion_id
    from public.answers
    where attempt_id = ${attemptId}::uuid and position = ${position}
    limit 1
  `);
  const answer = rows[0];
  if (item === undefined || answer === undefined) {
    throw new AppError('NOT_FOUND', 'Question introuvable.');
  }
  return { answer, item, attempt };
}

// `readAnswer` is only called after `readAttemptRow` has verified the owner under RLS.

export function getAttempt(ctx: ServiceContext, attemptIdValue: string): Promise<Result<AttemptDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    return db.run(async (tx): Promise<AttemptDto> => {
      const attempt = await readAttemptRow(tx, userId, attemptId);
      const items = itemsOf(attempt.items);
      const answers = await readAnswers(tx, attemptId);
      const config = asObject(attempt.config);
      const threshold = typeof config?.threshold === 'number' ? config.threshold : 80;
      const questions = answers.map((answer, index) => {
        const item = items[index] ?? {};
        return questionOf(item, answer, answer.position);
      });
      return {
        id: attempt.id,
        kind: 'validation_quiz',
        attemptNo: attempt.attempt_no,
        status: attempt.status as AttemptDto['status'],
        moduleId: attempt.module_id,
        formationId: attempt.formation_id,
        threshold,
        total: questions.length,
        questions,
        startedAt: isoOf(attempt.started_at),
        submittedAt: attempt.submitted_at === null ? null : isoOf(attempt.submitted_at),
        score: attempt.score === null ? null : Number(attempt.score),
        passed: attempt.passed,
        serverTime: ctx.clock.now().toISOString(),
      };
    });
  });
}

function validateResponse(
  type: string,
  payload: unknown,
  response: unknown,
  versionId: string,
): void {
  const parsed = parseBrickPayload(
    type === 'choice_question' || type === 'cloze' || type === 'matching' || type === 'open_question'
      ? type
      : 'open_question',
    payload,
  );
  if (!parsed.ok) throw new AppError('INTERNAL_ERROR', 'La charge de la brique est invalide.');
  if (type === 'open_question') {
    const value = asObject(response);
    const text = typeof value?.text === 'string' ? value.text.trim() : '';
    if (text === '') {
      throw new AppError('VALIDATION_FAILED', 'La réponse est vide.', {
        errors: [{ path: 'response.text', message: 'Écrivez au moins un caractère.' }],
      });
    }
    if (text.length > OPEN_MAX_CHARS) {
      throw new AppError('VALIDATION_FAILED', 'La réponse est trop longue.', {
        errors: [{ path: 'response.text', message: '2 000 caractères au maximum.' }],
      });
    }
    return;
  }
  const graded = gradeBrick(
    type as 'choice_question' | 'cloze' | 'matching',
    parsed.value as never,
    response,
    versionId,
  );
  // Grading doubles as the response validator; a valid response is never rejected for its content.
  if (!graded.ok && graded.error.code === 'RESPONSE_INVALID') {
    throw new AppError('VALIDATION_FAILED', 'La réponse envoyée est invalide.', {
      errors: graded.error.issues,
    });
  }
}

function clampTime(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 0), 1_800_000);
}

export function saveDraft(
  ctx: ServiceContext,
  attemptIdValue: string,
  position: number,
  input: unknown,
): Promise<Result<{ position: number; savedAt: string }>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const body = SaveAnswerInput.parse(input);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const now = ctx.clock.now().toISOString();
    return withTransaction(db, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`quiz-answer:${attemptIdValue}:${String(position)}`}, 0))`,
      );
      const attempt = await readAttemptRow(tx, userId, attemptIdValue);
      if (attempt.status !== 'in_progress') {
        throw new AppError('CONFLICT', 'Cette tentative n’est plus en cours.', { status: 409 });
      }
      const { answer, item } = await readAnswer(tx, userId, attemptIdValue, position);
      if (isChecked(answer)) {
        throw new AppError('CONFLICT', 'Cette question est déjà vérifiée.', { status: 409 });
      }
      const type = typeOf(item.type);
      validateResponse(type, item.payload, body.response, answer.brick_version_id);
      await tx.execute(sql`
        update public.answers
        set response = ${JSON.stringify(body.response)}::jsonb,
            time_ms = ${clampTime(body.timeMs)},
            answered_at = ${now}::timestamptz
        where id = ${answer.id}::uuid
      `);
      return { position, savedAt: now };
    });
  });
}

function toFeedback(
  isCorrect: boolean,
  points: number,
  explanation: string,
  title: 'Exact.' | 'Pas tout à fait.',
  correction: QuizCorrection | null,
): Feedback {
  return QuizFeedback.parse({
    isCorrect,
    score: points,
    explanation,
    title,
    correction,
  });
}

export function checkAnswer(
  ctx: ServiceContext,
  attemptIdValue: string,
  position: number,
  input: unknown,
): Promise<Result<ReturnType<typeof CheckAnswerOutput.parse>>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const body = SaveAnswerInput.parse(input);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const now = ctx.clock.now().toISOString();
    return withTransaction(db, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`quiz-answer:${attemptIdValue}:${String(position)}`}, 0))`,
      );
      const attempt = await readAttemptRow(tx, userId, attemptIdValue);
      if (attempt.status !== 'in_progress') {
        throw new AppError('CONFLICT', 'Cette tentative n’est plus en cours.', { status: 409 });
      }
      const { answer, item } = await readAnswer(tx, userId, attemptIdValue, position);
      const type = typeOf(item.type);

      // CL-2, CL-8 — a second check returns the correction already stored.
      if (isChecked(answer)) {
        const existing = feedbackOf(answer, type);
        if (existing === undefined) {
          throw new AppError('INTERNAL_ERROR', 'Correction introuvable.');
        }
        return { position, feedback: existing, locked: true as const };
      }

      validateResponse(type, item.payload, body.response, answer.brick_version_id);
      const timeMs = clampTime(body.timeMs);
      const maxScore = answer.max_score === null ? 0 : Number(answer.max_score);

      if (type === 'open_question') {
        await tx.execute(sql`
          update public.answers
          set response = ${JSON.stringify(body.response)}::jsonb,
              time_ms = ${timeMs},
              answered_at = ${now}::timestamptz,
              max_score = ${maxScore},
              feedback = '{"checked": true}'::jsonb
          where id = ${answer.id}::uuid
        `);
        return {
          position,
          feedback: QuizFeedback.parse({
            isCorrect: null,
            score: null,
            explanation: null,
            title: 'Réponse enregistrée.',
            pending: true,
          }),
          locked: true as const,
        };
      }

      const parsed = parseBrickPayload(type, item.payload);
      if (!parsed.ok) throw new AppError('INTERNAL_ERROR', 'La charge de la brique est invalide.');
      const graded = gradeBrick(type, parsed.value, body.response, answer.brick_version_id);
      if (!graded.ok) {
        if (graded.error.code === 'GRADED_BY_TUTOR') {
          throw new AppError('INTERNAL_ERROR', 'Cette question doit être corrigée par le tuteur.');
        }
        throw new AppError('VALIDATION_FAILED', 'La réponse envoyée est invalide.', {
          errors: graded.error.issues,
        });
      }
      const outcome = graded.value;
      const correction = outcome.correction as unknown as QuizCorrection;
      const points = Math.round(outcome.score * maxScore * 100) / 100;
      const feedback = {
        isCorrect: outcome.isCorrect,
        title: outcome.feedbackTitle,
        explanation: correction.explanation,
        correction: outcome.correction,
        scoreRatio: outcome.score,
      };
      await tx.execute(sql`
        update public.answers
        set response = ${JSON.stringify(body.response)}::jsonb,
            is_correct = ${outcome.isCorrect},
            score = ${points},
            max_score = ${maxScore},
            time_ms = ${timeMs},
            graded_by = 'code',
            feedback = ${JSON.stringify(feedback)}::jsonb,
            chosen_distractor_notion_id = ${outcome.chosenDistractorNotionId}::uuid,
            answered_at = ${now}::timestamptz
        where id = ${answer.id}::uuid
      `);
      return {
        position,
        feedback: toFeedback(
          outcome.isCorrect,
          points,
          correction.explanation,
          outcome.feedbackTitle,
          correction,
        ),
        locked: true as const,
      };
    });
  });
}

export function getAttemptResult(
  ctx: ServiceContext,
  attemptIdValue: string,
): Promise<Result<AttemptResultDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    return db.run(async (tx) => {
      const attempt = await readAttemptRow(tx, userId, attemptIdValue);
      const answers = await readAnswers(tx, attemptIdValue);
      const config = asObject(attempt.config);
      const threshold = typeof config?.threshold === 'number' ? config.threshold : 80;
      const openAnswers = answers.filter((answer) => {
        const item = itemsOf(attempt.items)[answer.position - 1];
        return typeOf(item?.type) === 'open_question';
      });
      const pendingOpenCount = openAnswers.filter((answer) => answer.is_correct === null).length;
      const scored: ScoredAnswer[] = answers
        .filter((answer) => answer.is_correct !== null)
        .map((answer) => {
          const item = itemsOf(attempt.items)[answer.position - 1];
          return {
            position: answer.position,
            notionId:
              typeof item?.notionId === 'string' ? item.notionId : answer.brick_version_id,
            score: answer.score === null ? 0 : Number(answer.score),
            maxScore: answer.max_score === null ? 0 : Number(answer.max_score),
            isCorrect: answer.is_correct,
          };
        });
      const provisional = computeScore(scored);
      const graded = attempt.status === 'graded';
      return AttemptResultDto.parse({
        attemptId: attempt.id,
        status: attempt.status,
        score: attempt.score === null ? null : Number(attempt.score),
        provisionalScore: graded ? (attempt.score === null ? null : Number(attempt.score)) : provisional.score,
        passed: attempt.passed,
        threshold,
        perNotion: graded ? attempt.per_notion : undefined,
        pendingOpenCount,
        tutorPending: pendingOpenCount > 0 && attempt.status === 'submitted',
      });
    });
  });
}
