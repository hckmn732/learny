import type { FollowUpKey, SendMessageInput, TutorSourceDto } from '@learny/contracts';
import { AppError } from '@learny/core';
import { serviceDb, sql } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';
import { llm } from '@learny/llm';
import { buildTutorChatPrompt } from '@learny/tutor';

import type { ServiceContext } from '../context';
import { requireUser } from '../resources/result';

import { buildContext, type BuiltContext } from './context';
import { conversationMessages, getConversationRef, type ConversationRef } from './conversations';
import { buildFollowUps } from './follow-ups';
import { askSelfTest, asksForTest, looksInjection } from './self-test';
import { resolveSources, SourceMarkerFilter, tutorSource } from './sources';

// SPEC-610 ET-2, ET-3, EF-8, ADR-0066 — the reply follows the AI SDK UI message stream protocol
// (SSE `data: {type,…}` chunks): `text` parts for the body, then `data-sources`,
// `data-follow-ups` and, for a Teste-moi, `data-self-test`. The stream is produced here without
// importing a provider SDK (BR-IA-09); the route only sets the SSE headers. The learner message is
// committed before the model call; the tutor message only after a complete stream.

const STREAMING = new Set<string>();

function sse(chunk: Record<string, unknown>): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

function scenarioFor(text: string, input: SendMessageInput, context: BuiltContext): string {
  if (looksInjection(text)) return 'chat-injection';
  if (context.gapFirst) return 'chat-gap-first-question';
  if (input.followUp === 'rephrase') return 'chat-autrement';
  if (input.followUp === 'example') return 'chat-exemple';
  if (input.followUp === 'compare') return 'chat-difference';
  const lower = text.toLowerCase();
  if (/date/.test(lower)) return 'chat-dates';
  if (/[ée]quilibr|total|partie double/.test(lower)) return 'chat-equilibre';
  if (/type de pi[èe]ce|diff[ée]rence|confond/.test(lower)) return 'chat-difference';
  if (/ce passage|s[ée]lection/.test(lower)) return 'chat-selection';
  if (/exemple|concret|chiffr/.test(lower)) return 'chat-exemple';
  if (/autrement|simple|comprends? pas|r[ée]explique/.test(lower)) return 'chat-autrement';
  return 'chat-generic';
}

function summaryOf(history: readonly { role: string; content: string }[]): string {
  const older = history.slice(0, Math.max(0, history.length - 20));
  if (older.length === 0) return '';
  return older
    .slice(-10)
    .map(
      (entry) =>
        `${entry.role === 'learner' ? 'Apprenant' : 'Tuteur'} : ${entry.content.slice(0, 160)}`,
    )
    .join(' ');
}

async function saveLearnerMessage(
  ctx: ServiceContext,
  conversationId: string,
  input: SendMessageInput,
): Promise<string> {
  const { userId, db } = requireUser(ctx);
  return db.run(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      insert into public.tutor_messages (conversation_id, user_id, role, content, context)
      values (
        ${conversationId}::uuid, ${userId}::uuid, 'learner', ${input.text},
        ${JSON.stringify({
          include: input.context.include,
          ...(input.context.passage === undefined ? {} : { passage: input.context.passage }),
        })}::jsonb
      )
      returning id::text as id
    `);
    await tx.execute(sql`
      update public.tutor_conversations
      set title = coalesce(title, ${input.text.slice(0, 60)}), updated_at = ${ctx.clock.now().toISOString()}::timestamptz
      where id = ${conversationId}::uuid and user_id = ${userId}::uuid
    `);
    const row = rows[0];
    if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Message non enregistré.');
    return row.id;
  });
}

async function saveTutorMessage(
  ctx: ServiceContext,
  conversationId: string,
  input: {
    content: string;
    sources: TutorSourceDto[];
    followUps: { key: string; label: string }[];
    selfTest?: Record<string, unknown> | null;
  },
): Promise<string> {
  const { userId, db } = requireUser(ctx);
  const labels = Object.fromEntries(input.followUps.map((entry) => [entry.key, entry.label]));
  return db.run(async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      insert into public.tutor_messages (
        conversation_id, user_id, role, content, context, sources, follow_ups, self_test
      ) values (
        ${conversationId}::uuid, ${userId}::uuid, 'tutor', ${input.content},
        ${JSON.stringify({ followUpLabels: labels })}::jsonb,
        ${JSON.stringify(input.sources)}::jsonb,
        ${`{${input.followUps.map((entry) => entry.key).join(',')}}`}::text[],
        ${input.selfTest === undefined ? null : JSON.stringify(input.selfTest)}::jsonb
      )
      returning id::text as id
    `);
    const row = rows[0];
    if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Réponse non enregistrée.');
    return row.id;
  });
}

function emitQuestion(
  ctx: ServiceContext,
  ref: ConversationRef,
  context: BuiltContext,
  messageId: string,
  text: string,
): Promise<void> {
  const { userId, db } = requireUser(ctx);
  return emitAfterCommit(
    db,
    'tutor/question-asked',
    {
      userId,
      formationId: context.formationId,
      courseId: ref.courseId,
      conversationId: ref.id,
      messageId,
      chapterId: ref.chapterId,
      notionIds: context.notionIds.slice(0, 3),
      text: text.slice(0, 500),
    },
    { id: `tutor/question-asked:${messageId}` },
    { clock: ctx.clock, logger: ctx.logger },
  );
}

function textChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += 60) chunks.push(text.slice(index, index + 60));
  return chunks.length === 0 ? [''] : chunks;
}

async function moduleOf(ctx: ServiceContext, courseId: string): Promise<string> {
  const { userId, db } = requireUser(ctx);
  const rows = await db.run((tx) =>
    tx.execute<{ module_id: string }>(sql`
      select module_id::text as module_id from public.courses
      where id = ${courseId}::uuid and owner_id = ${userId}::uuid
    `),
  );
  const moduleId = rows[0]?.module_id;
  if (moduleId === undefined) throw new AppError('NOT_FOUND', 'Cours introuvable.');
  return moduleId;
}

/** ET-3 — returns the SSE body; every error before the first byte is a typed AppError. */
export async function streamReply(
  ctx: ServiceContext,
  conversationId: string,
  input: SendMessageInput,
): Promise<ReadableStream<string>> {
  if (STREAMING.has(conversationId)) {
    throw new AppError('CONFLICT', 'Une réponse est déjà en cours sur cette discussion.');
  }
  const ref = await getConversationRef(ctx, conversationId);
  const messages = await conversationMessages(ctx, conversationId);
  if (
    messages.some(
      (row) =>
        row.role === 'tutor' && (row.self_test as { status?: string } | null)?.status === 'pending',
    )
  ) {
    throw new AppError('CONFLICT', 'Répondez d’abord à la question Teste-moi en attente.');
  }
  const context = await buildContext(ctx, ref, input.context, input.text);
  const { userId } = requireUser(ctx);
  const created = await llm.session(
    { userId, db: serviceDb() },
    {
      task: 'tutor',
      promptId: 'tutor-chat.tutor-chat',
      formationId: context.formationId,
      mock: { scenario: scenarioFor(input.text, input, context) },
    },
  );
  if (!created.ok) throw created.error;
  const session = created.value;
  const learnerId = await saveLearnerMessage(ctx, conversationId, input);
  await emitQuestion(ctx, ref, context, learnerId, input.text);
  STREAMING.add(conversationId);

  const history = messages.map((row) => ({ role: row.role, content: row.content }));
  const summary = summaryOf(history);
  const contextBlock =
    summary === '' ? context.promptBlock : `${context.promptBlock}\n<summary>${summary}</summary>`;
  const prompt = buildTutorChatPrompt({
    profile: context.profile,
    includedKeys: context.includedKeys,
    contextBlock,
    history: history.slice(-20),
    message: input.text,
    gapFirst: context.gapFirst,
  });

  const testMe = input.followUp === 'test_me' || asksForTest(input.text);
  const moduleId = testMe ? await moduleOf(ctx, ref.courseId) : null;
  const streamedResult = testMe
    ? null
    : await session.stream({ system: prompt.system, messages: prompt.messages });
  if (streamedResult !== null && !streamedResult.ok) {
    STREAMING.delete(conversationId);
    throw streamedResult.error;
  }
  const textStream = streamedResult === null ? null : streamedResult.value.textStream;

  return new ReadableStream<string>({
    async start(controller) {
      const write = (chunk: Record<string, unknown>): void => {
        controller.enqueue(sse(chunk));
      };
      try {
        write({ type: 'start', messageId: crypto.randomUUID() });
        if (testMe) {
          const asked = await askSelfTest(
            ctx,
            ref,
            {
              profile: context.profile,
              promptBlock: context.promptBlock,
              gapNotionId: context.gapNotionId,
              notionIds: context.notionIds,
              notionLabels: context.notionLabels,
              formationId: context.formationId,
            },
            moduleId ?? '',
          );
          const content = `Une question, sans regarder le cours :\n\n${asked.question}`;
          write({ type: 'text-start', id: 'self-test' });
          for (const chunk of textChunks(content))
            write({ type: 'text-delta', id: 'self-test', delta: chunk });
          write({ type: 'text-end', id: 'self-test' });
          write({ type: 'data-self-test', data: { status: 'pending' } });
          await saveTutorMessage(ctx, conversationId, {
            content,
            sources: [],
            followUps: [],
            selfTest: { status: 'pending', ...asked.pending },
          });
          write({ type: 'finish' });
          controller.enqueue('data: [DONE]\n\n');
          controller.close();
          return;
        }
        const filter = new SourceMarkerFilter();
        let visible = '';
        write({ type: 'text-start', id: 'tutor' });
        if (textStream === null) throw new AppError('AI_TASK_FAILED', 'Flux absent.');
        for await (const delta of textStream) {
          const text = filter.push(delta);
          if (text !== '') {
            visible += text;
            write({ type: 'text-delta', id: 'tutor', delta: text });
          }
        }
        const finished = filter.finish();
        if (finished.text.length > visible.length) {
          write({ type: 'text-delta', id: 'tutor', delta: finished.text.slice(visible.length) });
          visible = finished.text;
        }
        write({ type: 'text-end', id: 'tutor' });
        const tokens =
          finished.tokens.length === 0
            ? context.includedKeys.includes('chapter')
              ? ['course']
              : ['tutor']
            : finished.tokens;
        const resolved = resolveSources(
          tokens,
          {
            candidates: context.sources,
            chapterPosition: context.chapterPosition,
            primaryResourceTitle: context.primaryResourceTitle,
          },
          {
            warn: (message, fields) => {
              ctx.logger.warn(message, fields);
            },
          },
        );
        const sources =
          resolved.sources.length === 0
            ? [tutorSource(context.primaryResourceTitle)]
            : resolved.sources;
        const followUps = buildFollowUps({ confusion: context.confusion, served: input.followUp });
        write({ type: 'data-sources', data: { sources } });
        write({ type: 'data-follow-ups', data: { followUps } });
        await saveTutorMessage(ctx, conversationId, { content: visible, sources, followUps });
        write({ type: 'finish' });
        controller.enqueue('data: [DONE]\n\n');
        controller.close();
      } catch (error) {
        const code = error instanceof AppError ? error.code : 'AI_TASK_FAILED';
        const { userId: uid, db } = requireUser(ctx);
        await db.run((tx) =>
          tx.execute(sql`
            update public.tutor_messages
            set context = coalesce(context, '{}'::jsonb) || ${JSON.stringify({ error: code })}::jsonb
            where id = ${learnerId}::uuid and user_id = ${uid}::uuid
          `),
        );
        write({ type: 'error', errorText: 'La réponse n’a pas pu être obtenue.' });
        controller.close();
      } finally {
        STREAMING.delete(conversationId);
      }
    },
    cancel() {
      STREAMING.delete(conversationId);
    },
  });
}

export type { FollowUpKey };
