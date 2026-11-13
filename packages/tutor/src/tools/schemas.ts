import { z } from 'zod';

import { BRICK_TYPES } from '@learny/bricks';
import { TutorInstant, type TutorToolName } from '@learny/contracts';

// Input and output contracts of the ten tutor actions (SPEC-508 EF-1). Every action is strict:
// unknown fields are refused before any guard or write. `docs/architecture/ai.md` §3 is normative
// for the role and guard of each action; this file is the Zod translation of that table.

const uuid = z.uuid();
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const instant = TutorInstant;
const score = z.number().min(0).max(100);
const civilDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** `read_resources` — passages of one chapter/module/formation, read-only and token-budgeted. */
export const ReadResourcesInput = z
  .object({
    formationId: uuid.optional(),
    moduleId: uuid.optional(),
    chapterId: uuid.optional(),
    query: text(2, 300),
    limit: z.int().min(1).max(20).default(8),
  })
  .strict();

export type ReadResourcesInput = z.infer<typeof ReadResourcesInput>;

export const ResourcePassage = z
  .object({
    chunkId: uuid,
    resourceId: uuid,
    title: text(1, 200),
    text: z.string().min(1).max(8_000),
    score: z.number().min(0).optional(),
  })
  .strict();

export const ReadResourcesOutput = z
  .object({
    passages: z.array(ResourcePassage).max(20),
    tokenCount: z.int().min(0),
    truncated: z.boolean(),
    source: z.literal('resources'),
  })
  .strict();

export type ReadResourcesOutput = z.infer<typeof ReadResourcesOutput>;

/** `search_web` — programme only; results are never inserted into a course (BR-IA-04). */
export const SearchWebInput = z
  .object({
    formationId: uuid.optional(),
    query: text(2, 300),
    maxResults: z.int().min(1).max(5).default(3),
  })
  .strict();

export type SearchWebInput = z.infer<typeof SearchWebInput>;

export const WebResult = z
  .object({
    title: text(1, 200),
    url: z.url().max(2_000),
    snippet: text(1, 600),
  })
  .strict();

export const SearchWebOutput = z
  .object({
    results: z.array(WebResult).max(5),
    provider: text(1, 40),
    source: z.literal('web'),
  })
  .strict();

export type SearchWebOutput = z.infer<typeof SearchWebOutput>;

/** The five writable structural objects; a brick is written with the SPEC-501 validation. */
export const StructureKind = z.enum(['module', 'chapter', 'notion', 'notion_link', 'brick']);

export const ModuleData = z
  .object({
    kind: z.literal('module'),
    position: z.int().min(1).max(200),
    title: text(1, 160),
    objectives: z.array(text(1, 160)).max(20).default([]),
    plannedStart: civilDate.optional(),
    plannedEnd: civilDate.optional(),
    threshold: z.int().min(60).max(95).optional(),
  })
  .strict();

export const ChapterData = z
  .object({
    kind: z.literal('chapter'),
    moduleId: uuid,
    position: z.int().min(1).max(200),
    title: text(1, 160),
  })
  .strict();

export const NotionData = z
  .object({
    kind: z.literal('notion'),
    chapterId: uuid,
    label: text(1, 120),
    shortDefinition: text(1, 400).optional(),
    position: z.int().min(1).max(500).optional(),
  })
  .strict();

export const NotionLinkData = z
  .object({
    kind: z.literal('notion_link'),
    fromNotionId: uuid,
    toNotionId: uuid,
    linkKind: z.enum(['prerequisite', 'confusion', 'tutor']),
    rationale: text(1, 500).optional(),
  })
  .strict();

export const BrickData = z
  .object({
    kind: z.literal('brick'),
    draft: z
      .object({
        type: z.enum(BRICK_TYPES),
        formationId: uuid,
        purpose: z.enum([
          'course',
          'validation',
          'bank',
          'remediation',
          'exercise',
          'exam',
          'warmup',
          'review',
        ]),
        notionIds: z.array(uuid).max(10),
        origin: z.enum(['resource', 'tutor']),
        payload: z.unknown(),
      })
      .strict(),
  })
  .strict();

export const StructureData = z.discriminatedUnion('kind', [
  ModuleData,
  ChapterData,
  NotionData,
  NotionLinkData,
  BrickData,
]);

export type StructureData = z.infer<typeof StructureData>;

export const CreateOrUpdateInput = z
  .object({
    formationId: uuid,
    action: z.enum(['create', 'update']).default('create'),
    targetId: uuid.optional(),
    /** Only a brick carries an immutable version; structure objects have no version column. */
    expectedVersion: z.int().min(1).optional(),
    data: StructureData,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === 'update' && value.targetId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetId'],
        message: 'une mise à jour exige targetId',
      });
    }
    if (value.action === 'create' && value.targetId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetId'],
        message: 'une création ne porte pas targetId',
      });
    }
    if (value.action === 'create' && value.expectedVersion !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['expectedVersion'],
        message: 'expectedVersion est réservé à une mise à jour',
      });
    }
    if (value.data.kind === 'brick' && value.data.draft.formationId !== value.formationId) {
      ctx.addIssue({
        code: 'custom',
        path: ['data', 'draft', 'formationId'],
        message: 'la brique doit appartenir à la formation du contexte',
      });
    }
    if (value.data.kind === 'notion_link' && value.data.fromNotionId === value.data.toNotionId) {
      ctx.addIssue({
        code: 'custom',
        path: ['data', 'toNotionId'],
        message: 'un lien relie deux notions distinctes',
      });
    }
  });

export type CreateOrUpdateInput = z.infer<typeof CreateOrUpdateInput>;

export const CreateOrUpdateOutput = z
  .object({
    kind: StructureKind,
    id: uuid,
    created: z.boolean(),
    version: z.int().min(1).optional(),
    fingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable()
      .optional(),
  })
  .strict();

export type CreateOrUpdateOutput = z.infer<typeof CreateOrUpdateOutput>;

/** `assemble_activity` — only valid bricks owned by the learner (BR-BRI-09). */
export const ActivityItemInput = z
  .object({
    brickId: uuid,
    brickVersionId: uuid,
    points: z.number().positive().max(100).optional(),
  })
  .strict();

export const AssembleActivityInput = z
  .object({
    formationId: uuid,
    moduleId: uuid.optional(),
    kind: z.enum([
      'course',
      'validation_quiz',
      'global_quiz_session',
      'remediation',
      'exercise',
      'mock_exam',
      'warmup',
      'micro_session',
      'sprint',
      'self_test',
    ]),
    items: z.array(ActivityItemInput).min(1).max(100),
    config: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(['draft', 'ready']).default('ready'),
    forDate: civilDate.optional(),
  })
  .strict();

export type AssembleActivityInput = z.infer<typeof AssembleActivityInput>;

export const AssembleActivityOutput = z
  .object({
    activityId: uuid,
    kind: z.string().min(1).max(40),
    status: z.enum(['draft', 'ready']),
    itemCount: z.int().min(0).max(100),
  })
  .strict();

export type AssembleActivityOutput = z.infer<typeof AssembleActivityOutput>;

/** `schedule` — delegates to the planner; the guard refuses an overlapping planned slot. */
export const ScheduleInput = z
  .object({
    formationId: uuid,
    moduleId: uuid.optional(),
    activityId: uuid.optional(),
    kind: z.enum([
      'contributions',
      'course',
      'exercise',
      'validation_quiz',
      'global_quiz',
      'revision',
      'buffer',
      'sprint',
      'mock_exam',
      'warmup',
      'micro_session',
      'weekly_review',
    ]),
    title: text(1, 200),
    meta: text(1, 1_000).optional(),
    startsAt: instant,
    endsAt: instant,
  })
  .strict()
  .refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
    path: ['endsAt'],
    message: 'la fin doit être postérieure au début',
  });

export type ScheduleInput = z.infer<typeof ScheduleInput>;

export const ScheduleOutput = z
  .object({
    slotId: uuid,
    startsAt: instant,
    endsAt: instant,
    status: z.enum(['planned']),
  })
  .strict();

export type ScheduleOutput = z.infer<typeof ScheduleOutput>;

/** `schedule_reminder` — quiet hours and daily cap are applied before insert (BR-NOT-04/05). */
export const ScheduleReminderInput = z
  .object({
    formationId: uuid.optional(),
    title: text(1, 120),
    body: text(1, 400),
    at: instant,
    href: z
      .string()
      .regex(/^\/(?!\/)[^\s\\]*$/u)
      .max(2_048)
      .default('/accueil'),
    dedupeKey: text(1, 200).optional(),
  })
  .strict();

export type ScheduleReminderInput = z.infer<typeof ScheduleReminderInput>;

export const ScheduleReminderOutput = z
  .object({
    notificationId: uuid,
    scheduledFor: instant,
    channels: z.array(z.enum(['email', 'push'])).max(2),
  })
  .strict();

export type ScheduleReminderOutput = z.infer<typeof ScheduleReminderOutput>;

/** `get_due_notions` — dates come from the engine, never from the model (BR-MEM-02). */
export const GetDueNotionsInput = z
  .object({
    formationId: uuid,
    at: instant.optional(),
  })
  .strict();

export type GetDueNotionsInput = z.infer<typeof GetDueNotionsInput>;

/** `read_results` — read-only results and memory state of the learner. */
export const ReadResultsInput = z
  .object({
    formationId: uuid,
    moduleId: uuid.optional(),
    limit: z.int().min(1).max(20).default(10),
  })
  .strict();

export type ReadResultsInput = z.infer<typeof ReadResultsInput>;

export const AttemptResult = z
  .object({
    attemptId: uuid,
    activityId: uuid,
    activityKind: z.string().min(1).max(40),
    status: z.string().min(1).max(20),
    score: z.number().min(0).max(100).nullable(),
    passed: z.boolean().nullable(),
    submittedAt: instant.nullable(),
  })
  .strict();

export const NotionResult = z
  .object({
    notionId: uuid,
    label: text(1, 120),
    mastery: z.number().min(0).max(100),
    dueAt: instant.nullable(),
    gapNature: z
      .enum(['forgetting', 'confusion', 'misunderstanding', 'application'])
      .nullable(),
  })
  .strict();

export const ReadResultsOutput = z
  .object({
    attempts: z.array(AttemptResult).max(20),
    states: z.array(NotionResult).max(20),
    source: z.literal('results'),
  })
  .strict();

export type ReadResultsOutput = z.infer<typeof ReadResultsOutput>;

/** `grade_answer` — the score is bounded by the scale (BR-BRI-08). */
export const GradeAnswerInput = z
  .object({
    attemptId: uuid,
    position: z.int().min(1).max(200),
    score,
    maxScore: score.default(100),
    isCorrect: z.boolean(),
    feedback: z
      .object({
        explanation: text(1, 4_000),
        criteria: z
          .array(
            z
              .object({
                key: text(1, 32),
                ok: z.boolean(),
                comment: text(1, 500).optional(),
              })
              .strict(),
          )
          .max(50)
          .optional(),
        missing: z.array(text(1, 500)).max(50).optional(),
      })
      .strict(),
  })
  .strict()
  .refine((value) => value.score <= value.maxScore, {
    path: ['score'],
    message: 'la note ne peut pas dépasser le barème',
  });

export type GradeAnswerInput = z.infer<typeof GradeAnswerInput>;

export const GradeAnswerOutput = z
  .object({
    answerId: uuid,
    score,
    maxScore: score,
    isCorrect: z.boolean(),
    gradedBy: z.literal('tutor'),
  })
  .strict();

export type GradeAnswerOutput = z.infer<typeof GradeAnswerOutput>;

/** `prepare_question_bank` — batch request, only when the bank is exhausted (BR-MEM-07). */
export const PrepareQuestionBankInput = z
  .object({
    formationId: uuid,
    notionIds: z.array(uuid).min(1).max(20),
    format: z.enum(BRICK_TYPES),
    count: z.int().min(4).max(40).default(8),
  })
  .strict();

export type PrepareQuestionBankInput = z.infer<typeof PrepareQuestionBankInput>;

export const PrepareQuestionBankOutput = z
  .object({
    requestId: uuid,
    accepted: z.literal(true),
    notionIds: z.array(uuid).min(1).max(20),
    format: z.enum(BRICK_TYPES),
    count: z.int().min(4).max(40),
  })
  .strict();

export type PrepareQuestionBankOutput = z.infer<typeof PrepareQuestionBankOutput>;

/** `notify_invalid_output` is not a model action; it is the safe notification of EF-4. */
export const InvalidOutputNotice = z
  .object({
    task: z.string().min(1).max(40),
    formationId: uuid.nullable(),
    tone: z.enum(['vous', 'tu']),
    brickKey: z.string().min(1).max(200),
  })
  .strict();

export type InvalidOutputNotice = z.infer<typeof InvalidOutputNotice>;

export const TOOL_NAMES = {
  readResources: 'read_resources',
  searchWeb: 'search_web',
  createOrUpdate: 'create_or_update',
  assembleActivity: 'assemble_activity',
  schedule: 'schedule',
  scheduleReminder: 'schedule_reminder',
  getDueNotions: 'get_due_notions',
  readResults: 'read_results',
  gradeAnswer: 'grade_answer',
  prepareQuestionBank: 'prepare_question_bank',
} as const satisfies Record<string, TutorToolName>;
