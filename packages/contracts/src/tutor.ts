import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';

// Public contract of the tutor action loop (SPEC-508 EF-1, EF-4, ET-4, ADR-0021, ADR-0023).
// The registry is closed: an action outside TUTOR_TOOL_NAMES can never be executed. The run result
// is the typed trace returned to the caller; it never contains a provider secret, a document body
// or another learner's identifier.

/** The three tasks that carry a versioned prompt in `packages/tutor/prompts/` (ADR-0072). */
export const TUTOR_TASKS = ['programme', 'course', 'tutor'] as const;

export type TutorTask = (typeof TUTOR_TASKS)[number];

/** BR-ACC-05 — the tutor addresses the learner with « vous » by default or « tu » (profile). */
export const TUTOR_TONES = ['vous', 'tu'] as const;

export type TutorTone = (typeof TUTOR_TONES)[number];

/** BR-ACC-06 — the course language, whatever the language of the resources. */
export const COURSE_LANGUAGES = ['fr', 'en', 'es', 'de'] as const;

export type CourseLanguage = (typeof COURSE_LANGUAGES)[number];

/**
 * EF-1 — exactly the ten actions of `docs/architecture/ai.md` §3. This list is the closed registry:
 * the loop refuses any other tool name before executing anything (CL-1).
 */
export const TUTOR_TOOL_NAMES = [
  'read_resources',
  'search_web',
  'create_or_update',
  'assemble_activity',
  'schedule',
  'schedule_reminder',
  'get_due_notions',
  'read_results',
  'grade_answer',
  'prepare_question_bank',
] as const;

export type TutorToolName = (typeof TUTOR_TOOL_NAMES)[number];

/** ET-2/EF-4 — a run stops after twelve model turns (thirteenth turn never starts). */
export const TUTOR_MAX_TURNS = 12;

/** BR-IA-11, CA-3 — an invalid brick is returned to the model at most twice. */
export const TUTOR_MAX_CORRECTIONS = 2;

export const TUTOR_TOOL_STATUSES = [
  'executed',
  'guard_refused',
  'unknown_tool',
  'invalid_input',
  'failed',
] as const;

export type TutorToolStatus = (typeof TUTOR_TOOL_STATUSES)[number];

/** EF-4 — safe payload of the notification written when the correction budget is exhausted. */
export const InvalidOutputNoticeSchema = z
  .object({
    task: z.enum(TUTOR_TASKS),
    formationId: Uuid.nullable(),
    tone: z.enum(TUTOR_TONES),
    brickKey: z.string().min(1).max(200),
  })
  .strict();

export type InvalidOutputNotice = z.infer<typeof InvalidOutputNoticeSchema>;

export const TUTOR_RUN_STATUSES = [
  'completed',
  'invalid_output',
  'turns_exhausted',
  'refused',
] as const;

export type TutorRunStatus = (typeof TUTOR_RUN_STATUSES)[number];

/** The learner profile fragment that shapes every prompt (BR-ACC-05, BR-ACC-06). */
export const TutorProfileSchema = z
  .object({
    tone: z.enum(TUTOR_TONES),
    courseLanguage: z.enum(COURSE_LANGUAGES),
  })
  .strict();

export type TutorProfile = z.infer<typeof TutorProfileSchema>;

/** One resource passage passed as data, never as an instruction (BR-IA-10, ET-3). */
export const TutorDocumentSchema = z
  .object({
    source: z.string().trim().min(1).max(200),
    chunkId: Uuid.optional(),
    title: z.string().trim().max(200).optional(),
    text: z.string().min(1).max(200_000),
  })
  .strict();

export type TutorDocument = z.infer<typeof TutorDocumentSchema>;

export const TutorMessageSchema = z
  .object({
    role: z.enum(['learner', 'tutor']),
    content: z.string().min(1).max(8_000),
  })
  .strict();

export type TutorMessage = z.infer<typeof TutorMessageSchema>;

/** Input of one tutor task; the current message is always treated as content, not as a system rule. */
export const TutorInputSchema = z
  .object({
    message: z.string().min(1).max(8_000),
    history: z.array(TutorMessageSchema).max(50).optional(),
    documents: z.array(TutorDocumentSchema).max(50).optional(),
    context: z.string().max(4_000).optional(),
  })
  .strict();

export type TutorInput = z.infer<typeof TutorInputSchema>;

export const TutorToolIssueSchema = z
  .object({
    code: z.string().max(80).optional(),
    path: z.string().max(200),
    message: z.string().max(1_000),
  })
  .strict();

export const TutorToolErrorSchema = z
  .object({
    code: z.string().min(1).max(80),
    message: z.string().min(1).max(1_000),
    issues: z.array(TutorToolIssueSchema).max(50).optional(),
  })
  .strict();

export const TutorToolCallSchema = z
  .object({
    turn: z.int().min(1).max(TUTOR_MAX_TURNS),
    toolCallId: z.string().min(1).max(200),
    toolName: z.string().min(1).max(80),
    status: z.enum(TUTOR_TOOL_STATUSES),
    output: z.unknown().optional(),
    error: TutorToolErrorSchema.optional(),
  })
  .strict();

export type TutorToolCall = z.infer<typeof TutorToolCallSchema>;

export const TutorCorrectionSchema = z
  .object({
    brickKey: z.string().min(1).max(200),
    errors: z.int().min(1).max(50),
    corrections: z.int().min(0).max(TUTOR_MAX_CORRECTIONS),
  })
  .strict();

export const TutorUsageSchema = z
  .object({
    inputTokens: z.int().min(0),
    outputTokens: z.int().min(0),
    cacheReadTokens: z.int().min(0),
    cacheWriteTokens: z.int().min(0),
  })
  .strict();

/** Prompt identity actually used by the run; the version comes from the file header (ET-3). */
export const TutorPromptRefSchema = z
  .object({
    id: z.string().min(1).max(80),
    version: z.int().min(1),
    tone: z.enum(TUTOR_TONES),
    courseLanguage: z.enum(COURSE_LANGUAGES),
  })
  .strict();

/** ET-2, CA-3 — the typed outcome of `runTutor`. No provider fallback is ever attempted. */
export const TutorRunResultSchema = z
  .object({
    status: z.enum(TUTOR_RUN_STATUSES),
    task: z.enum(TUTOR_TASKS),
    text: z.string().max(200_000),
    turns: z.int().min(0).max(TUTOR_MAX_TURNS),
    toolCalls: z.array(TutorToolCallSchema).max(200),
    corrections: z.array(TutorCorrectionSchema).max(50),
    usage: TutorUsageSchema,
    model: z.string().min(1).max(200).nullable(),
    prompt: TutorPromptRefSchema,
    notification: z
      .object({
        type: z.literal('ai_task_failed'),
        reason: z.literal('INVALID_OUTPUT'),
      })
      .strict()
      .nullable(),
    /** True only after INVALID_OUTPUT: the learner chooses another key or the provided AI. */
    modelChoiceRequired: z.boolean(),
    /** BR-IA-05 — the loop never switches to the provided AI on its own. */
    fallback: z.literal('none'),
    finishReason: z.string().min(1).max(40),
  })
  .strict();

export type TutorRunResult = z.infer<typeof TutorRunResultSchema>;

/** Lightweight description of the closed registry, used by the demonstration page. */
export const TutorActionInfoSchema = z
  .object({
    name: z.enum(TUTOR_TOOL_NAMES),
    description: z.string().min(1).max(500),
    inputKeys: z.array(z.string().min(1).max(80)),
    outputKeys: z.array(z.string().min(1).max(80)),
    transactional: z.literal(true),
    guarded: z.literal(true),
  })
  .strict();

export type TutorActionInfo = z.infer<typeof TutorActionInfoSchema>;

export interface TutorDocumentCapture {
  readonly documentTag: string;
  readonly escaped: boolean;
}

/** ISO instant helper reused by the action schemas that accept an explicit instant. */
export const TutorInstant = IsoDateTime;
