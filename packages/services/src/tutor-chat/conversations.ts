import type {
  ChatContextInput,
  ContextItemDto,
  ConversationDto,
  ConversationListDto,
  FollowUpDto,
  FollowUpKey,
  SelfTestDto,
  TutorMessageDto,
  TutorSourceDto,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { buildContext, type BuiltContext } from './context';
import { buildFollowUps } from './follow-ups';

// SPEC-610 ET-3, BR-TUT-07, ADR-0040 — conversations are private, kept per course version, and
// every read runs under the caller's RLS client. A foreign or missing conversation is a 404, never
// a leak of its existence. The greeting is composed by the code: no model call when opening.

export const ALL_KEYS_INCLUDED: ChatContextInput = {
  include: { formation: true, chapter: true, resources: true, gap: true, profile: true },
};

export interface ConversationRef {
  id: string;
  courseId: string;
  chapterId: string;
}

interface MessageRow extends Record<string, unknown> {
  id: string;
  role: 'learner' | 'tutor';
  content: string;
  sources: unknown;
  follow_ups: string[] | string;
  self_test: unknown;
  context: unknown;
  created_at: Date | string;
}

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === 'string');
  if (typeof value === 'string') {
    return value
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((entry) => entry.replace(/^"|"$/g, '').trim())
      .filter((entry) => entry !== '');
  }
  return [];
}

function sourcesOf(value: unknown): TutorSourceDto[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is TutorSourceDto =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof (entry as { label?: unknown }).label === 'string',
  );
}

function selfTestOf(value: unknown): SelfTestDto | null {
  if (value === null || value === undefined) return null;
  const record = asRecord(value);
  if (record.status !== 'pending' && record.status !== 'answered') return null;
  return {
    status: record.status,
    ...(typeof record.correct === 'boolean' ? { correct: record.correct } : {}),
    ...(typeof record.masteryBefore === 'number' ? { masteryBefore: record.masteryBefore } : {}),
    ...(typeof record.masteryAfter === 'number' ? { masteryAfter: record.masteryAfter } : {}),
  };
}

function followUpsOf(row: MessageRow): FollowUpDto[] {
  const keys = asStringArray(row.follow_ups);
  const labels = asRecord(asRecord(row.context).followUpLabels);
  return keys
    .filter((key): key is FollowUpKey =>
      ['rephrase', 'example', 'compare', 'test_me'].includes(key),
    )
    .map((key) => ({ key, label: typeof labels[key] === 'string' ? labels[key] : key }));
}

export function messageDto(row: MessageRow): TutorMessageDto {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sources: sourcesOf(row.sources),
    followUps: followUpsOf(row),
    selfTest: selfTestOf(row.self_test),
    createdAt: isoOf(row.created_at),
  };
}

export function greetingText(context: BuiltContext): string {
  const included = context.includedKeys;
  const resourcesIncluded = included.includes('resources');
  const titles = context.resourceTitles
    .slice(0, 4)
    .map((title) => title.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase())
    .join(', ');
  const parts: string[] = [];
  if (context.passageLabel !== null) {
    parts.push(
      resourcesIncluded && context.resourceTitles.length > 0
        ? `Vous lisez « ${context.passageLabel} ». Je pars de ce passage, de vos ${String(context.resourceTitles.length)} apports et du reste du chapitre.`
        : `Vous lisez « ${context.passageLabel} ». Je pars de ce passage et du reste du chapitre.`,
    );
  } else if (resourcesIncluded && context.resourceTitles.length > 0) {
    parts.push(
      `Je connais ce chapitre, vos ${String(context.resourceTitles.length)} apports (${titles}) et votre objectif.`,
    );
  } else {
    parts.push('Je connais ce chapitre et votre objectif.');
  }
  if (included.includes('gap') && context.gapLabel !== null && context.gapNatureText !== null) {
    parts.push(
      `Vos quiz montrent que ${context.gapLabel.toLowerCase()} ${context.gapNatureText} : j’y ferai attention.`,
    );
  }
  parts.push('Que voulez-vous que je vous explique ?');
  return parts.join(' ');
}

export interface GreetingMessage {
  content: string;
  followUps: FollowUpDto[];
}

export function greetingOf(context: BuiltContext): GreetingMessage {
  return {
    content: greetingText(context),
    followUps: buildFollowUps({ confusion: context.confusion }),
  };
}

async function conversationRef(ctx: ServiceContext, id: string): Promise<ConversationRef> {
  const { userId, db } = requireUser(ctx);
  const rows = await db.run((tx) =>
    tx.execute<{ id: string; course_id: string; chapter_id: string }>(sql`
      select conv.id::text as id, conv.course_id::text as course_id,
        coalesce(conv.chapter_id::text, ch.id::text) as chapter_id
      from public.tutor_conversations conv
      join public.courses c on c.id = conv.course_id
      left join public.chapters ch on ch.module_id = c.module_id
      where conv.id = ${id}::uuid and conv.user_id = ${userId}::uuid
      order by ch.position
      limit 1
    `),
  );
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Discussion introuvable.');
  return { id: row.id, courseId: row.course_id, chapterId: row.chapter_id };
}

export async function createConversation(
  ctx: ServiceContext,
  courseId: string,
  chapterId: string,
): Promise<Result<ConversationDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const created = await db.run(async (tx) => {
      const rows = await tx.execute<{ id: string }>(sql`
        insert into public.tutor_conversations (user_id, course_id, chapter_id, title)
        select ${userId}::uuid, c.id, ch.id, null
        from public.courses c
        join public.chapters ch on ch.id = ${chapterId}::uuid and ch.module_id = c.module_id
        where c.id = ${courseId}::uuid and c.owner_id = ${userId}::uuid
        returning id::text as id
      `);
      const row = rows[0];
      if (row === undefined) throw new AppError('NOT_FOUND', 'Cours introuvable.');
      return row.id;
    });
    const ref: ConversationRef = { id: created, courseId, chapterId };
    const context = await buildContext(ctx, ref, ALL_KEYS_INCLUDED, '');
    const greeting = greetingOf(context);
    await db.run(async (tx) => {
      await tx.execute(sql`
        insert into public.tutor_messages (
          conversation_id, user_id, role, content, context, sources, follow_ups
        ) values (
          ${created}::uuid, ${userId}::uuid, 'tutor', ${greeting.content},
          ${JSON.stringify({ followUpLabels: Object.fromEntries(greeting.followUps.map((entry) => [entry.key, entry.label])) })}::jsonb,
          '[]'::jsonb, ${`{${greeting.followUps.map((entry) => entry.key).join(',')}}`}::text[]
        )
      `);
    });
    return conversationById(ctx, created);
  });
}

export async function listConversations(
  ctx: ServiceContext,
  courseId: string,
): Promise<Result<ConversationListDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const rows = await db.run((tx) =>
      tx.execute<{
        id: string;
        title: string | null;
        created_at: Date | string;
        last_message_at: Date | string;
      }>(sql`
        select conv.id::text as id, conv.title, conv.created_at,
          coalesce(max(m.created_at), conv.created_at) as last_message_at
        from public.tutor_conversations conv
        left join public.tutor_messages m on m.conversation_id = conv.id
        where conv.user_id = ${userId}::uuid and conv.course_id = ${courseId}::uuid
        group by conv.id, conv.title, conv.created_at
        order by last_message_at desc, conv.id
        limit 200
      `),
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: isoOf(row.created_at),
        lastMessageAt: isoOf(row.last_message_at),
      })),
    };
  });
}

export async function conversationMessages(
  ctx: ServiceContext,
  conversationId: string,
): Promise<MessageRow[]> {
  const { userId, db } = requireUser(ctx);
  const rows = await db.run((tx) =>
    tx.execute<MessageRow>(sql`
      select id::text as id, role::text as role, content, sources, follow_ups, self_test, context, created_at
      from public.tutor_messages
      where conversation_id = ${conversationId}::uuid and user_id = ${userId}::uuid
      order by created_at, id
      limit 500
    `),
  );
  return rows;
}

export function lastContextOf(messages: readonly MessageRow[]): ChatContextInput {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== 'learner') continue;
    const context = asRecord(message.context);
    const include = context.include;
    const passage = context.passage;
    if (include !== null && include !== undefined && typeof include === 'object') {
      return {
        include: include,
        ...(passage !== null && passage !== undefined && typeof passage === 'object'
          ? { passage: passage as NonNullable<ChatContextInput['passage']> }
          : {}),
      };
    }
  }
  return ALL_KEYS_INCLUDED;
}

export function contextItemsOf(context: BuiltContext): ContextItemDto[] {
  return context.items;
}

export async function conversationById(ctx: ServiceContext, id: string): Promise<ConversationDto> {
  const userId = requireUser(ctx).userId;
  const ref = await conversationRef(ctx, id);
  const rows = await conversationMessages(ctx, id);
  const contextInput = lastContextOf(rows);
  const context = await buildContext(ctx, ref, contextInput, '');
  const conversation = await requireUser(ctx).db.run((tx) =>
    tx.execute<{
      id: string;
      course_id: string;
      title: string | null;
      created_at: Date | string;
    }>(sql`
      select id::text as id, course_id::text as course_id, title, created_at
      from public.tutor_conversations
      where id = ${id}::uuid and user_id = ${userId}::uuid
    `),
  );
  const row = conversation[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Discussion introuvable.');
  const messages = rows.map(messageDto);
  return {
    id: row.id,
    courseId: row.course_id,
    chapterId: ref.chapterId,
    title: row.title,
    createdAt: isoOf(row.created_at),
    messages,
    contextItems: contextItemsOf(context),
    pendingSelfTest: messages.some(
      (message) => message.selfTest?.status === 'pending' && message.role === 'tutor',
    ),
  };
}

/** Used by the stream: the chapter and course of a conversation, with ownership already checked. */
export async function getConversationRef(
  ctx: ServiceContext,
  id: string,
): Promise<ConversationRef> {
  return conversationRef(ctx, id);
}

export async function conversationByCourse(
  ctx: ServiceContext,
  courseId: string,
  chapterId: string,
): Promise<ConversationRef | null> {
  const { userId, db } = requireUser(ctx);
  const rows = await db.run((tx) =>
    tx.execute<{ id: string; course_id: string; chapter_id: string }>(sql`
      select conv.id::text as id, conv.course_id::text as course_id,
        coalesce(conv.chapter_id::text, ch.id::text) as chapter_id
      from public.tutor_conversations conv
      join public.courses c on c.id = conv.course_id
      left join public.chapters ch on ch.id = ${chapterId}::uuid and ch.module_id = c.module_id
      where conv.user_id = ${userId}::uuid and conv.course_id = ${courseId}::uuid
      order by conv.updated_at desc, conv.id
      limit 1
    `),
  );
  const row = rows[0];
  return row === undefined
    ? null
    : { id: row.id, courseId: row.course_id, chapterId: row.chapter_id };
}
