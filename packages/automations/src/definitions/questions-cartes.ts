// « Questions transformées en cartes » (SPEC-717, BR-AUT-06, ADR-0190, ADR-0193).
//
// A question asked to the tutor consumes `tutor/question-asked` (SPEC-610). The definition reads
// the verified answer that follows the question in the same private conversation, validates the
// `recall_card` schema of SPEC-501, and drafts one `card_created` action:
//   - `confirm` (default): the action waits in `pending_consent`; the home banner accepts or
//     refuses it; accepting creates exactly one brick in the global quiz.
//   - `auto`: the action is applied immediately, then journaled.
// The dedupe key freezes `(conversation, notion)`: a repeated question never creates a second
// card. A reported source, an absent notion or a missing tutor answer logs a reason and writes
// nothing (CL-3). The undo retires the brick from future draws without deleting past answers.
import { z } from 'zod';

import { brickFingerprint, parseBrickPayload, type BrickPayload } from '@learny/bricks';
import { ENGINE } from '@learny/config/product';
import {
  parseEventData,
  QuestionCardPayload,
  QuestionsCartesParams,
  type QuestionCardSkipReason,
} from '@learny/contracts';
import {
  addCivilDays,
  AppError,
  ok,
  startOfUserDay,
  userLocalDay,
  type Result,
} from '@learny/core';
import { sql, type Db, type DbTx } from '@learny/db';
import { createNotionCard } from '@learny/learning-engine';
import { toPersistenceCard } from '@learny/services';

import {
  defineAutomation,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
  type AutomationDomainContext,
  type AutomationEffectContext,
} from '../moteur-d-automatismes';

const SUMMARY_MAX = 160;
const FRONT_MAX = 300;
const BACK_MAX = 600;
const SOURCE_MAX = 120;
const UUID = z.uuid();

interface ConversationSourceRow extends Record<string, unknown> {
  conversation_id: string;
  course_id: string;
  title: string | null;
  question_message_id: string;
  question: string;
  tutor_message_id: string | null;
  answer: string | null;
}

interface NotionRow extends Record<string, unknown> {
  id: string;
  label: string;
  formation_id: string;
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function stringOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/**
 * CL-3 — pure decision of the source: a card needs a question, a verified answer and a known
 * notion; a reported source content is excluded before any write.
 */
export function questionCardSkipReason(input: {
  question: string | null | undefined;
  answer: string | null | undefined;
  notionId: string | null | undefined;
  notionExists: boolean;
  reported: boolean;
}): QuestionCardSkipReason | null {
  if (typeof input.notionId !== 'string' || !UUID.safeParse(input.notionId).success) {
    return 'missing_notion';
  }
  if (typeof input.question !== 'string' || input.question.trim().length < 3) {
    return 'missing_question';
  }
  if (typeof input.answer !== 'string' || input.answer.trim().length === 0) {
    return 'missing_answer';
  }
  if (!input.notionExists) return 'unknown_notion';
  if (input.reported) return 'reported_source';
  return null;
}

/** ET-4 — stable key of the pair (conversation, notion): a repeated question is deduplicated. */
export function questionCardDedupeKey(conversationId: string, notionId: string): string {
  return `question_card:${conversationId}:${notionId}`;
}

/** EF-2 — one line for every status of the journal; no pronoun, same text in `vous` and `tu`. */
export function explainQuestionsCartes(action: AutomationActionView): string {
  const notion = clip(stringOf(action.payload.notionLabel, 'cette notion'), 60);
  const text =
    action.status === 'declined'
      ? `Refusé : la question sur « ${notion} » ne devient pas une carte.`
      : action.status === 'undone'
        ? `Annulé : carte de rappel « ${notion} » retirée des prochains tirages.`
        : action.status === 'expired'
          ? `Expiré : la question sur « ${notion} » ne devient pas une carte.`
          : action.status === 'consumed'
            ? `Carte de rappel « ${notion} » jouée.`
            : action.status === 'applied'
              ? `Carte de rappel « ${notion} » ajoutée au quiz global.`
              : `Une question sur « ${notion} » peut devenir une carte de rappel : acceptez pour l’ajouter au quiz global.`;
  return text.length <= SUMMARY_MAX ? text : `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

async function readSource(
  db: Db | DbTx,
  userId: string,
  messageId: string,
): Promise<ConversationSourceRow | null> {
  if (!UUID.safeParse(messageId).success) return null;
  const rows = await db.execute<ConversationSourceRow>(sql`
    select c.id::text as conversation_id,
           c.course_id::text as course_id,
           c.title,
           m.id::text as question_message_id,
           m.content as question,
           t.id::text as tutor_message_id,
           t.content as answer
    from public.tutor_messages m
    join public.tutor_conversations c
      on c.id = m.conversation_id and c.user_id = m.user_id
    left join lateral (
      select tm.id, tm.content
      from public.tutor_messages tm
      where tm.conversation_id = m.conversation_id
        and tm.user_id = m.user_id
        and tm.role = 'tutor'
        and (tm.created_at, tm.id) > (m.created_at, m.id)
      order by tm.created_at asc, tm.id asc
      limit 1
    ) t on true
    where m.id = ${messageId}::uuid
      and m.user_id = ${userId}::uuid
      and m.role = 'learner'
    limit 1
  `);
  return rows[0] ?? null;
}

async function readNotion(
  db: Db | DbTx,
  notionId: string,
  formationId: string,
): Promise<NotionRow | null> {
  if (!UUID.safeParse(notionId).success || !UUID.safeParse(formationId).success) return null;
  const rows = await db.execute<NotionRow>(sql`
    select n.id::text as id, n.label, n.formation_id::text as formation_id
    from public.notions n
    where n.id = ${notionId}::uuid and n.formation_id = ${formationId}::uuid
    limit 1
  `);
  return rows[0] ?? null;
}

async function sourceIsReported(
  db: Db | DbTx,
  courseId: string,
  notionId: string,
): Promise<boolean> {
  const rows = await db.execute<{ reported: boolean }>(sql`
    select true as reported
    from public.course_sections s
    where s.course_id = ${courseId}::uuid
      and s.reported = true
      and ${notionId}::uuid = any(s.notion_ids)
    limit 1
  `);
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Proposal                                                            */
/* ------------------------------------------------------------------ */

async function eventDrafts(
  ctx: AutomationDomainContext<z.output<typeof QuestionsCartesParams>>,
  trigger: { type: 'event'; name: string; data?: Record<string, unknown> },
): Promise<AutomationActionDraft[]> {
  if (trigger.name !== 'tutor/question-asked') return [];
  let event;
  try {
    event = parseEventData('tutor/question-asked', trigger.data ?? {});
  } catch {
    ctx.logger.warn('question card skipped', {
      outcome: 'question_card_skipped',
      code: 'invalid_event',
    });
    return [];
  }
  if (event.userId !== ctx.userId) return [];

  const notionId = event.notionIds[0] ?? '';
  const source = await readSource(ctx.db, ctx.userId, event.messageId);
  const notion = notionId === '' ? null : await readNotion(ctx.db, notionId, event.formationId);
  const reported =
    source === null || notion === null
      ? false
      : await sourceIsReported(ctx.db, source.course_id, notionId);
  const skipped = questionCardSkipReason({
    question: source?.question ?? null,
    answer: source?.answer ?? null,
    notionId,
    notionExists: notion !== null,
    reported,
  });
  if (skipped !== null || source === null || notion === null) {
    ctx.logger.info('question card skipped', {
      outcome: 'question_card_skipped',
      code: skipped ?? 'missing_question',
    });
    return [];
  }

  const question = clip(source.question, FRONT_MAX);
  const answer = clip(source.answer ?? '', BACK_MAX);
  const sourceLabel = clip(source.title ?? 'Votre question au tuteur', SOURCE_MAX);
  const dedupeKey = questionCardDedupeKey(source.conversation_id, notion.id);
  return [
    {
      kind: 'card_created',
      formationId: event.formationId,
      requiresConsent: ctx.params.mode !== 'auto',
      payload: {
        dedupeKey,
        conversationId: source.conversation_id,
        questionMessageId: source.question_message_id,
        tutorMessageId: source.tutor_message_id ?? '',
        courseId: source.course_id,
        chapterId: event.chapterId,
        notionId: notion.id,
        notionLabel: notion.label,
        question,
        answer,
        sourceLabel,
        mode: ctx.params.mode,
        brickId: null,
      } satisfies QuestionCardPayload,
      dedupeKey,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */

async function insertRecallCard(
  tx: DbTx,
  userId: string,
  formationId: string,
  notionId: string,
  card: BrickPayload<'recall_card'>,
): Promise<string> {
  const fingerprint = brickFingerprint('recall_card', card);
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.bricks (
      owner_id, formation_id, type, notion_ids, purpose, status, current_version
    ) values (
      ${userId}::uuid,
      ${formationId}::uuid,
      'recall_card',
      ${`{${notionId}}`}::uuid[],
      'review',
      'active',
      1
    )
    returning id::text as id
  `);
  const brickId = rows[0]?.id;
  if (brickId === undefined) throw new AppError('INTERNAL_ERROR', 'Carte non créée.');
  await tx.execute(sql`
    insert into public.brick_versions (
      brick_id, version, payload, fingerprint, origin, created_by
    ) values (
      ${brickId}::uuid,
      1,
      ${JSON.stringify(card)}::jsonb,
      ${fingerprint},
      'tutor',
      'tutor'
    )
  `);
  return brickId;
}

/**
 * ADR-0193 §2 — a new notion enters review with a fresh card due at the start of local day J+2;
 * a notion already in review keeps its FSRS due date so the card is played at the next review.
 */
async function ensureNotionInReview(
  tx: DbTx,
  userId: string,
  notionId: string,
  now: Date,
  timeZone: string,
): Promise<void> {
  const dueDay = addCivilDays(userLocalDay(now, timeZone), 2);
  const dueAt = startOfUserDay(dueDay, timeZone);
  const card = JSON.stringify(
    toPersistenceCard(createNotionCard(now.toISOString(), ENGINE.fsrs.requestRetention)),
  );
  await tx.execute(sql`
    insert into public.notion_states (
      user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at,
      success_count, in_review, revision
    ) values (
      ${userId}::uuid,
      ${notionId}::uuid,
      ${card}::jsonb,
      ${dueAt.toISOString()}::timestamptz,
      0,
      null,
      null,
      0,
      true,
      0
    )
    on conflict (user_id, notion_id) do update set
      in_review = true,
      due_at = case
        when notion_states.in_review then notion_states.due_at
        else excluded.due_at
      end,
      fsrs = case
        when notion_states.in_review then notion_states.fsrs
        else excluded.fsrs
      end,
      revision = notion_states.revision + 1
  `);
}

async function applyQuestionsCartes(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<{ payload: Record<string, unknown>; undoPayload: Record<string, unknown> }>> {
  const parsed = QuestionCardPayload.safeParse(action.payload);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Carte de rappel incomplète.', {
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
  const payload = parsed.data;
  if (payload.brickId !== null) {
    return ok({ payload, undoPayload: { brickId: payload.brickId } });
  }
  const validCard = parseBrickPayload('recall_card', {
    front: payload.question,
    back: payload.answer,
    sourceLabel: payload.sourceLabel,
    sources: [],
  });
  if (!validCard.ok) {
    throw new AppError('VALIDATION_FAILED', 'Le schéma de la carte de rappel est refusé.', {
      errors: validCard.error.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    });
  }
  const brickId = await insertRecallCard(
    ctx.tx,
    ctx.userId,
    stringOf(action.formationId),
    payload.notionId,
    validCard.value,
  );
  await ensureNotionInReview(ctx.tx, ctx.userId, payload.notionId, ctx.now, ctx.timeZone);
  return ok({
    payload: { ...payload, brickId },
    undoPayload: { brickId, notionId: payload.notionId },
  });
}

async function undoQuestionsCartes(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<Record<string, unknown> | null>> {
  const undo = action.undoPayload ?? {};
  const brickId = stringOf(undo.brickId, stringOf(action.payload.brickId));
  if (brickId !== '' && UUID.safeParse(brickId).success) {
    await ctx.tx.execute(sql`
      update public.bricks
      set status = 'retired'
      where id = ${brickId}::uuid and owner_id = ${ctx.userId}::uuid
    `);
  }
  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export const questionsCartesAutomation: AutomationDefinition<typeof QuestionsCartesParams> =
  defineAutomation({
    key: 'questions_cartes',
    triggers: [{ type: 'event', name: 'tutor/question-asked' }],
    params: QuestionsCartesParams,
    run: async (ctx, trigger) => {
      if (trigger.type !== 'event') return [];
      return eventDrafts(ctx, trigger);
    },
    explain: explainQuestionsCartes,
    apply: applyQuestionsCartes,
    undo: undoQuestionsCartes,
  });
