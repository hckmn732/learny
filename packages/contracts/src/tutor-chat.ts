import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the contextual discussion with the tutor (SCR-07, SPEC-610 ET-1, ET-2,
// BR-TUT-01 to BR-TUT-07, ADR-0040, ADR-0174, ADR-0178). The server owns the context: the client
// sends which keys are included and, optionally, the selected passage; it never sends the values
// themselves. Every route runs under the caller's RLS client, so a foreign conversation is a 404.

/** ADR-0178 §1 — six context keys, in the normative display order. */
export const CONTEXT_KEYS = [
  'formation',
  'chapter',
  'passage',
  'resources',
  'gap',
  'profile',
] as const;

export const ContextKey = z.enum(CONTEXT_KEYS);
export type ContextKey = z.infer<typeof ContextKey>;

/** ET-1 — the client only chooses keys and the selected passage (12 to 1 000 characters). */
export const ChatContextInput = z
  .strictObject({
    include: z.partialRecord(ContextKey, z.boolean()),
    passage: z
      .strictObject({
        text: z.string().min(12).max(1_000),
        sectionId: Uuid.optional(),
      })
      .optional(),
  })
  .describe('Clés de contexte incluses et passage choisi par l’apprenant.');
export type ChatContextInput = z.infer<typeof ChatContextInput>;

/** ET-1 — the six retirable items shown by the panel; `value` is built by the server. */
export const ContextItemDto = z
  .strictObject({
    key: ContextKey,
    label: z.string().min(1).max(40),
    value: z.string().min(1).max(2_000),
    included: z.boolean(),
  })
  .describe('Élément du contexte transmis au tuteur, retirable et remis par l’apprenant.');
export type ContextItemDto = z.infer<typeof ContextItemDto>;

export const TUTOR_MESSAGE_ROLES = ['learner', 'tutor'] as const;
export const TutorMessageRole = z.enum(TUTOR_MESSAGE_ROLES);
export type TutorMessageRole = z.infer<typeof TutorMessageRole>;

export const FOLLOW_UP_KEYS = ['rephrase', 'example', 'compare', 'test_me'] as const;
export const FollowUpKey = z.enum(FOLLOW_UP_KEYS);
export type FollowUpKey = z.infer<typeof FollowUpKey>;

export const FollowUpDto = z
  .strictObject({
    key: FollowUpKey,
    label: z.string().min(1).max(60),
  })
  .describe('Suite cliquable proposée sous la dernière réponse du tuteur.');
export type FollowUpDto = z.infer<typeof FollowUpDto>;

export const TutorSourceDto = z
  .strictObject({
    label: z.string().min(1).max(200),
    href: z.string().max(2_048).optional(),
  })
  .describe('Source affichée sous une réponse ; jamais une source absente du contexte.');
export type TutorSourceDto = z.infer<typeof TutorSourceDto>;

export const SELF_TEST_STATUSES = ['pending', 'answered'] as const;
export const SelfTestStatus = z.enum(SELF_TEST_STATUSES);
export type SelfTestStatus = z.infer<typeof SelfTestStatus>;

export const SelfTestDto = z
  .strictObject({
    status: SelfTestStatus,
    correct: z.boolean().optional(),
    masteryBefore: z.number().int().min(0).max(100).optional(),
    masteryAfter: z.number().int().min(0).max(100).optional(),
  })
  .describe('État de la question « Teste-moi » portée par un message du tuteur (ADR-0174).');
export type SelfTestDto = z.infer<typeof SelfTestDto>;

export const TutorMessageDto = z
  .strictObject({
    id: Uuid,
    role: TutorMessageRole,
    content: z.string().min(1).max(20_000),
    sources: z.array(TutorSourceDto).max(20),
    followUps: z.array(FollowUpDto).max(4),
    selfTest: SelfTestDto.nullable(),
    createdAt: IsoDateTime,
  })
  .describe('Message de la discussion avec le tuteur, avec ses sources, suites et Teste-moi.');
export type TutorMessageDto = z.infer<typeof TutorMessageDto>;

export const ConversationDto = z
  .strictObject({
    id: Uuid,
    courseId: Uuid,
    chapterId: Uuid,
    title: z.string().max(200).nullable(),
    createdAt: IsoDateTime,
    messages: z.array(TutorMessageDto).max(500),
    contextItems: z.array(ContextItemDto).max(6),
    pendingSelfTest: z.boolean(),
  })
  .describe('Discussion d’un cours, privée et conservée par version de cours (ADR-0040).');
export type ConversationDto = z.infer<typeof ConversationDto>;

export const CreateConversationInput = z
  .strictObject({ chapterId: Uuid })
  .describe('Ouverture d’une discussion sur un chapitre du cours.');
export type CreateConversationInput = z.infer<typeof CreateConversationInput>;

export const ConversationSummaryDto = z
  .strictObject({
    id: Uuid,
    title: z.string().max(200).nullable(),
    createdAt: IsoDateTime,
    lastMessageAt: IsoDateTime,
  })
  .describe('Entrée de la liste « Discussions précédentes » d’un cours.');
export type ConversationSummaryDto = z.infer<typeof ConversationSummaryDto>;

export const ConversationListDto = z
  .strictObject({ items: z.array(ConversationSummaryDto).max(200) })
  .describe('Discussions d’un cours, de la plus récente à la plus ancienne.');
export type ConversationListDto = z.infer<typeof ConversationListDto>;

export const SendMessageInput = z
  .strictObject({
    text: z.string().trim().min(1).max(4_000),
    context: ChatContextInput,
    followUp: FollowUpKey.optional(),
  })
  .describe('Question de l’apprenant, contexte inclus et suite éventuellement choisie.');
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const SelfTestAnswerInput = z
  .strictObject({ text: z.string().trim().min(1).max(2_000) })
  .describe('Réponse à la question « Teste-moi » en attente.');
export type SelfTestAnswerInput = z.infer<typeof SelfTestAnswerInput>;

export const SelfTestAnswerDto = z
  .strictObject({ message: TutorMessageDto })
  .describe('Message de correction du tuteur après un Teste-moi.');
export type SelfTestAnswerDto = z.infer<typeof SelfTestAnswerDto>;

const CONVERSATION_ERRORS = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_KEY_REQUIRED',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
] as const;

const AI_CONVERSATION_ERRORS = [
  ...CONVERSATION_ERRORS,
  'AI_UNAVAILABLE',
  'AI_RATE_LIMITED',
  'AI_TASK_FAILED',
  'AI_REFUSED',
] as const;

export const CourseConversationParams = z.object({ cid: Uuid });
export type CourseConversationParams = z.infer<typeof CourseConversationParams>;

export const ConversationParams = z.object({ id: Uuid });
export type ConversationParams = z.infer<typeof ConversationParams>;

export const courseConversationCreate = defineRoute({
  id: 'courses.conversations.create',
  method: 'POST',
  path: '/api/v1/courses/:cid/conversations',
  auth: 'user',
  params: CourseConversationParams,
  body: CreateConversationInput,
  output: ConversationDto,
  successStatus: 201,
  idempotent: true,
  rateLimit: 'default',
  summary: 'Ouvre une discussion avec le tuteur sur un chapitre du cours (SPEC-610).',
  errors: [...CONVERSATION_ERRORS, 'INTERNAL_ERROR'],
});

export const courseConversationList = defineRoute({
  id: 'courses.conversations.list',
  method: 'GET',
  path: '/api/v1/courses/:cid/conversations',
  auth: 'user',
  params: CourseConversationParams,
  output: ConversationListDto,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Liste les discussions privées d’un cours (SPEC-610).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'RATE_LIMITED', 'INTERNAL_ERROR'],
});

export const conversationGet = defineRoute({
  id: 'conversations.get',
  method: 'GET',
  path: '/api/v1/conversations/:id',
  auth: 'user',
  params: ConversationParams,
  output: ConversationDto,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Relit une discussion et son contexte courant (SPEC-610).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'RATE_LIMITED', 'INTERNAL_ERROR'],
});

export const conversationMessage = defineRoute({
  id: 'conversations.messages',
  method: 'POST',
  path: '/api/v1/conversations/:id/messages',
  auth: 'user',
  params: ConversationParams,
  body: SendMessageInput,
  output: null,
  successStatus: 200,
  rateLimit: 'ai',
  summary: 'Envoie une question et diffuse la réponse du tuteur en flux SSE (SPEC-610).',
  errors: [...AI_CONVERSATION_ERRORS, 'INTERNAL_ERROR'],
});

export const conversationSelfTestAnswer = defineRoute({
  id: 'conversations.self-test.answer',
  method: 'POST',
  path: '/api/v1/conversations/:id/self-test/answer',
  auth: 'user',
  params: ConversationParams,
  body: SelfTestAnswerInput,
  output: SelfTestAnswerDto,
  successStatus: 200,
  rateLimit: 'ai',
  summary: 'Corrige la réponse à une question Teste-moi et applique la maîtrise (SPEC-610).',
  errors: [...AI_CONVERSATION_ERRORS, 'INTERNAL_ERROR'],
});

export const tutorChatRoutes = {
  courseConversationCreate,
  courseConversationList,
  conversationGet,
  conversationMessage,
  conversationSelfTestAnswer,
} as const;
