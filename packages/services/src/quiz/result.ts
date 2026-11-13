import {
  ENGINE,
  GAP_NATURE_LABELS,
  GAP_PROPOSALS,
  REMEDIATION_RULES,
} from '@learny/config/product';
import {
  GapCardDto,
  QuizResultDto,
  type AttemptHistoryEntry,
  type RemediationStatus,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { trainingTarget } from '../gaps/links';
import { requireUser, toResult } from '../resources/result';

import { readRetryGate } from './retry-gate';
import { computeScore, type ScoredAnswer } from './score';

// Read model of SCR-09 after correction (SPEC-612 EF-1 to EF-5, ET-1, BR-QUI-05, BR-QUI-06,
// BR-QUI-08, BR-LAC-04, ADR-0179). Every value comes from the persisted attempt, the module, the
// learner's notion states and the retry gate; the screen never recomputes a verdict.

interface AttemptRow extends Record<string, unknown> {
  id: string;
  attempt_no: number;
  status: string;
  started_at: Date | string;
  submitted_at: Date | string | null;
  score: string | null;
  passed: boolean | null;
  per_notion: unknown;
  items: unknown;
  module_id: string;
  formation_id: string;
  position: number;
  module_title: string;
  threshold: number;
}

interface AnswerRow extends Record<string, unknown> {
  position: number;
  brick_version_id: string;
  is_correct: boolean | null;
  score: string | null;
  max_score: string | null;
  feedback: unknown;
}

interface HistoryRow extends Record<string, unknown> {
  attempt_no: number;
  score: string | null;
  passed: boolean | null;
}

interface NotionRow extends Record<string, unknown> {
  id: string;
  label: string;
  position: number;
  mastery: string | null;
  gap_nature: string | null;
  gap_evidence: string | null;
  gap_confused_with: string | null;
}

interface NextModuleRow extends Record<string, unknown> {
  id: string;
  position: number;
  title: string;
}

interface RemediationRow extends Record<string, unknown> {
  id: string;
  status: string;
  attempt_id: string | null;
  attempt_status: string | null;
  checked: number;
  preparing: boolean;
}

const UUID = /^[0-9a-f-]{36}$/i;

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

function itemsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  );
}

function perNotionOf(
  value: unknown,
): Record<string, { correct: number; total: number; score: number }> {
  const raw = asObject(value);
  if (raw === null) return {};
  const out: Record<string, { correct: number; total: number; score: number }> = {};
  for (const [notionId, entry] of Object.entries(raw)) {
    if (!UUID.test(notionId)) continue;
    const parsed = asObject(entry);
    if (parsed === null) continue;
    out[notionId] = {
      correct: typeof parsed.correct === 'number' ? parsed.correct : 0,
      total: typeof parsed.total === 'number' ? parsed.total : 0,
      score: typeof parsed.score === 'number' ? parsed.score : 0,
    };
  }
  return out;
}

export function natureLabelOf(nature: string): string {
  return (GAP_NATURE_LABELS as Record<string, string | undefined>)[nature] ?? 'Lacune';
}

/** BR-LAC-04, ET-6 — code fallback of the tutor answer when no proposal was persisted. */
export function proposalOf(nature: string): string {
  return (GAP_PROPOSALS as Record<string, string | undefined>)[nature] ?? GAP_PROPOSALS.forgetting;
}

export function evidenceOf(nature: string, persisted: string | null): string {
  const text = persisted?.trim() ?? '';
  if (text !== '') return text;
  if (nature === 'confusion') return 'Confondue avec une autre notion dans vos réponses.';
  if (nature === 'misunderstanding') return 'Réponses incomplètes ou à côté du sujet.';
  if (nature === 'application') return 'Définition juste, mais l’exercice n’a pas abouti.';
  return 'Notion oubliée depuis la dernière révision.';
}

/**
 * CL-11 — the gap to the threshold is rounded up on the unrounded score, so 79.99 shows
 * « Encore 1 point pour valider. » even though the ring prints « 80 % ».
 */
export function pointsMissingOf(score: number, threshold: number): number {
  if (!Number.isFinite(score) || score >= threshold) return 0;
  return Math.max(0, Math.ceil(threshold - score));
}

export function headlineOf(input: {
  passed: boolean;
  pointsMissing: number;
  nextModule: { position: number } | null;
  isLastModule: boolean;
}): string {
  if (input.passed) {
    return input.isLastModule
      ? 'La formation est terminée.'
      : `Le module ${String((input.nextModule?.position ?? 0) || 0)} est débloqué.`;
  }
  const missing = input.pointsMissing;
  return missing <= 1
    ? 'Encore 1 point pour valider.'
    : `Encore ${String(missing)} points pour valider.`;
}

export function statusTextOf(input: { passed: boolean; fragile: number; gaps: number }): string {
  if (input.passed) {
    if (input.fragile === 0) {
      return 'Bravo. Les notions du module rejoignent votre quiz global ; aucune ne reste fragile.';
    }
    if (input.fragile === 1) {
      return 'Bravo. Les notions du module rejoignent votre quiz global ; une seule reste fragile.';
    }
    return `Bravo. Les notions du module rejoignent votre quiz global ; ${String(input.fragile)} restent fragiles.`;
  }
  return `Votre prochaine tentative portera surtout sur les ${String(input.gaps)} notions ci-dessous, avec de nouvelles questions.`;
}

function attemptHistory(rows: readonly HistoryRow[]): AttemptHistoryEntry[] {
  return rows
    .filter((row) => row.score !== null && row.passed !== null)
    .map((row) => ({
      attemptNo: row.attempt_no,
      score: Number(row.score),
      passed: row.passed === true,
    }));
}

async function readAttempt(tx: DbTx, userId: string, attemptId: string): Promise<AttemptRow> {
  const rows = await tx.execute<AttemptRow>(sql`
    select at.id::text as id,
           at.attempt_no,
           at.status::text as status,
           at.started_at,
           at.submitted_at,
           at.score::text as score,
           at.passed,
           at.per_notion,
           act.items,
           act.module_id::text as module_id,
           act.formation_id::text as formation_id,
           m.position::int as position,
           m.title as module_title,
           m.threshold::int as threshold
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    join public.modules m on m.id = act.module_id
    where at.id = ${attemptId}::uuid
      and at.user_id = ${userId}::uuid
      and act.kind = 'validation_quiz'
    limit 1
  `);
  const attempt = rows[0];
  if (attempt === undefined) throw new AppError('NOT_FOUND', 'Tentative introuvable.');
  return attempt;
}

async function readAnswers(tx: DbTx, attemptId: string): Promise<AnswerRow[]> {
  return tx.execute<AnswerRow>(sql`
    select position,
           brick_version_id::text as brick_version_id,
           is_correct,
           score::text as score,
           max_score::text as max_score,
           feedback
    from public.answers
    where attempt_id = ${attemptId}::uuid
    order by position asc
  `);
}

async function readHistory(tx: DbTx, userId: string, moduleId: string): Promise<HistoryRow[]> {
  return tx.execute<HistoryRow>(sql`
    select at.attempt_no, at.score::text as score, at.passed
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.user_id = ${userId}::uuid
      and act.module_id = ${moduleId}::uuid
      and act.kind = 'validation_quiz'
      and at.status = 'graded'
    order by at.attempt_no asc
  `);
}

async function readNotions(tx: DbTx, userId: string, moduleId: string): Promise<NotionRow[]> {
  return tx.execute<NotionRow>(sql`
    select n.id::text as id,
           n.label,
           n.position::int as position,
           ns.mastery::text as mastery,
           ns.gap_nature::text as gap_nature,
           ns.gap_evidence,
           ns.gap_confused_with::text as gap_confused_with
    from public.notions n
    left join public.notion_states ns
      on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
    where n.module_id = ${moduleId}::uuid
    order by n.position asc, n.id asc
  `);
}

async function readNextModule(
  tx: DbTx,
  formationId: string,
  position: number,
): Promise<NextModuleRow | null> {
  const rows = await tx.execute<NextModuleRow>(sql`
    select id::text as id, position::int as position, title
    from public.modules
    where formation_id = ${formationId}::uuid and position > ${position}
    order by position asc
    limit 1
  `);
  return rows[0] ?? null;
}

async function readLatestFailedAttempt(
  tx: DbTx,
  userId: string,
  moduleId: string,
): Promise<string | null> {
  const rows = await tx.execute<{ attempt_id: string }>(sql`
    select at.id::text as attempt_id
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.user_id = ${userId}::uuid
      and act.module_id = ${moduleId}::uuid
      and act.kind = 'validation_quiz'
      and at.status = 'graded'
      and at.passed = false
    order by at.attempt_no desc, at.created_at desc
    limit 1
  `);
  return rows[0]?.attempt_id ?? null;
}

async function readRemediation(
  tx: DbTx,
  userId: string,
  moduleId: string,
  sourceAttemptId: string | null,
): Promise<{ status: RemediationStatus; href: string | null }> {
  if (sourceAttemptId === null) return { status: 'none', href: null };
  const rows = await tx.execute<RemediationRow>(sql`
    select act.id::text as id,
           act.status::text as status,
           at.id::text as attempt_id,
           at.status::text as attempt_status,
           (select count(*)::int
              from public.answers a
              where a.attempt_id = at.id and a.graded_by is not null) as checked,
           coalesce((act.config ->> 'preparing')::boolean, false) as preparing
    from public.activities act
    left join public.attempts at
      on at.activity_id = act.id and at.user_id = ${userId}::uuid
    where act.owner_id = ${userId}::uuid
      and act.module_id = ${moduleId}::uuid
      and act.kind = 'remediation'
      and (act.config ->> 'sourceAttemptId') = ${sourceAttemptId}
    order by act.created_at desc, act.id desc
    limit 1
  `);
  const row = rows[0];
  if (row === undefined) return { status: 'none', href: null };
  const href = `/formations/__FID__/modules/__MID__/remediation`;
  if (row.preparing) return { status: 'preparing', href };
  if (row.attempt_status === 'graded') return { status: 'completed', href };
  if (row.attempt_status === null) return { status: 'preparing', href };
  return { status: row.checked > 0 ? 'in_progress' : 'ready', href };
}

function scoredOf(
  answers: readonly AnswerRow[],
  items: readonly Record<string, unknown>[],
): ScoredAnswer[] {
  return answers
    .filter((answer) => answer.is_correct !== null)
    .map((answer) => {
      const item = items[answer.position - 1];
      return {
        position: answer.position,
        notionId: typeof item?.notionId === 'string' ? item.notionId : answer.brick_version_id,
        score: answer.score === null ? 0 : Number(answer.score),
        maxScore: answer.max_score === null ? 0 : Number(answer.max_score),
        isCorrect: answer.is_correct,
      };
    });
}

export function getQuizResult(
  ctx: ServiceContext,
  attemptIdValue: string,
): Promise<Result<QuizResultDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.test(attemptIdValue)) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    return db.run(async (tx): Promise<QuizResultDto> => {
      const attempt = await readAttempt(tx, userId, attemptId);
      const items = itemsOf(attempt.items);
      const answers = await readAnswers(tx, attemptId);
      const notions = await readNotions(tx, userId, attempt.module_id);
      const history = attemptHistory(await readHistory(tx, userId, attempt.module_id));
      const nextModule = await readNextModule(tx, attempt.formation_id, attempt.position);
      const scored = scoredOf(answers, items);
      const provisional = computeScore(scored).score;
      const graded = attempt.status === 'graded';
      const score = attempt.score === null ? null : Number(attempt.score);
      const passed = graded ? attempt.passed === true : null;
      const pendingOpenCount = answers.filter((answer) => answer.is_correct === null).length;
      const gate = await readRetryGate(tx, userId, attempt.module_id, ctx.clock.now());

      const openGaps = notions.filter((notion) => notion.gap_nature !== null);
      const orderedGaps = [...openGaps].sort(
        (left, right) => Number(left.mastery ?? 0) - Number(right.mastery ?? 0),
      );
      const shownGaps =
        passed === true ? orderedGaps : orderedGaps.slice(0, REMEDIATION_RULES.maxGaps);
      const gaps: GapCardDto[] = shownGaps.map((notion) => {
        const nature = notion.gap_nature ?? 'forgetting';
        return GapCardDto.parse({
          notionId: notion.id,
          label: notion.label,
          nature,
          natureLabel: natureLabelOf(nature),
          evidence: evidenceOf(nature, notion.gap_evidence),
          proposal: proposalOf(nature),
          mastery: Number(notion.mastery ?? 0),
          trainHref: trainingTarget({
            formationId: attempt.formation_id,
            moduleId: attempt.module_id,
            notionId: notion.id,
            nature: nature as never,
          }).href,
        });
      });
      const mastered = notions
        .filter(
          (notion) =>
            Number(notion.mastery ?? 0) >= ENGINE.mastery.threshold && notion.gap_nature === null,
        )
        .map((notion) => ({ notionId: notion.id, label: notion.label }));

      const perNotion = perNotionOf(attempt.per_notion);
      const latestFailed =
        passed === false ? attemptId : await readLatestFailedAttempt(tx, userId, attempt.module_id);
      const remediation = await readRemediation(tx, userId, attempt.module_id, latestFailed);
      const remediationHref =
        remediation.status === 'none'
          ? null
          : `/formations/${encodeURIComponent(attempt.formation_id)}/modules/${encodeURIComponent(
              attempt.module_id,
            )}/remediation`;

      const labelOf = new Map(notions.map((notion) => [notion.id, notion.label]));
      const pointsMissing =
        passed === false && score !== null ? pointsMissingOf(score, attempt.threshold) : null;

      return QuizResultDto.parse({
        attemptId,
        attemptNo: attempt.attempt_no,
        module: {
          id: attempt.module_id,
          position: attempt.position,
          title: attempt.module_title,
        },
        status: attempt.status,
        score: graded ? score : null,
        provisionalScore: graded ? score : provisional,
        threshold: attempt.threshold,
        passed,
        pointsMissing,
        isLastModule: nextModule === null,
        nextModule:
          nextModule === null
            ? null
            : { id: nextModule.id, position: nextModule.position, title: nextModule.title },
        history: history.slice(-6),
        gaps,
        mastered,
        perNotion: Object.entries(perNotion).map(([notionId, value]) => ({
          notionId,
          label: labelOf.get(notionId) ?? 'Notion',
          correct: value.correct,
          total: value.total,
          score: value.score,
        })),
        retry: gate,
        remediation: { status: remediation.status, href: remediationHref },
        pendingOpenCount,
      });
    });
  });
}
