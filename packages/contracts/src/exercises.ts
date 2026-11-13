import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the practice exercise (SPEC-613 EF-1 to EF-3, ET-1 to ET-5; BR-PRA-01). The
// instruction payload mirrors the `instruction` brick of `@learny/bricks` but owns the exercise
// invariants: a production kind (text, file, link or typed table) and criteria whose points sum to
// 10. A submission is discriminated by the same kind, so a table never reaches a text correction.

export const EXERCISE_PRODUCTION_KINDS = ['text', 'file', 'link', 'table'] as const;
export const ExerciseProductionKind = z.enum(EXERCISE_PRODUCTION_KINDS);
export type ExerciseProductionKind = z.infer<typeof ExerciseProductionKind>;

export const EXERCISE_COLUMN_TYPES = ['text', 'number', 'select'] as const;
export const ExerciseColumnType = z.enum(EXERCISE_COLUMN_TYPES);
export type ExerciseColumnType = z.infer<typeof ExerciseColumnType>;

export const EXERCISE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/markdown',
] as const;

export const ExerciseColumnSchema = z
  .object({
    key: z.string().min(1).max(40),
    label: z.string().min(1).max(60),
    type: ExerciseColumnType,
    options: z
      .array(
        z
          .object({
            value: z.string().min(1).max(40),
            label: z.string().min(1).max(80),
          })
          .strict(),
      )
      .min(1)
      .max(20)
      .optional(),
  })
  .strict();
export type ExerciseColumn = z.infer<typeof ExerciseColumnSchema>;

export const ExerciseTableCheckSchema = z
  .object({
    type: z.literal('sum_equal'),
    numberColumn: z.string().min(1).max(40),
    groupColumn: z.string().min(1).max(40),
    left: z.array(z.string().min(1).max(80)).min(1).max(10),
    right: z.array(z.string().min(1).max(80)).min(1).max(10),
    leftLabel: z.string().min(1).max(20).optional(),
    rightLabel: z.string().min(1).max(20).optional(),
    sideColumnLabel: z.string().min(1).max(20).optional(),
  })
  .strict();
export type ExerciseTableCheck = z.infer<typeof ExerciseTableCheckSchema>;

const textProductionSchema = z
  .object({
    kind: z.literal('text'),
    minChars: z.number().int().min(0).max(2000).default(0),
    maxChars: z.number().int().min(50).max(10000),
  })
  .strict()
  .refine((production) => production.minChars <= production.maxChars, {
    message: 'minChars ne peut pas dépasser maxChars.',
    path: ['minChars'],
  });

const fileProductionSchema = z
  .object({
    kind: z.literal('file'),
    accept: z.array(z.enum(EXERCISE_MIME_TYPES)).min(1).max(6),
    maxSizeMb: z.number().int().min(1).max(50),
  })
  .strict();

const linkProductionSchema = z.object({ kind: z.literal('link') }).strict();

const tableProductionSchema = z
  .object({
    kind: z.literal('table'),
    fields: z.array(ExerciseColumnSchema).max(4).default([]),
    columns: z.array(ExerciseColumnSchema).min(1).max(8),
    minRows: z.number().int().min(1).max(20),
    maxRows: z.number().int().min(1).max(50),
    initialRows: z.number().int().min(1).max(50),
    checks: z.array(ExerciseTableCheckSchema).max(3).default([]),
  })
  .strict()
  .refine((table) => table.maxRows >= table.minRows, {
    message: 'maxRows doit être supérieur ou égal à minRows.',
    path: ['maxRows'],
  })
  .refine((table) => table.initialRows >= table.minRows && table.initialRows <= table.maxRows, {
    message: 'initialRows doit être compris entre minRows et maxRows.',
    path: ['initialRows'],
  });

export const ExerciseProductionSchema = z.discriminatedUnion('kind', [
  textProductionSchema,
  fileProductionSchema,
  linkProductionSchema,
  tableProductionSchema,
]);
export type ExerciseProduction = z.infer<typeof ExerciseProductionSchema>;
export type ExerciseTableProduction = Extract<ExerciseProduction, { kind: 'table' }>;

/** EF-1, ET-3 — one criterion of the 10-point scale. */
export const ExerciseCriterionSchema = z
  .object({
    key: z.string().min(1).max(40),
    label: z.string().min(2).max(120),
    points: z.number().int().min(1).max(10),
    description: z.string().min(2).max(400),
  })
  .strict();
export type ExerciseCriterion = z.infer<typeof ExerciseCriterionSchema>;

/** ET-3 — the instruction invariants of an exercise: production and criteria summing to 10. */
export const ExerciseInstructionSchema = z
  .object({
    title: z.string().min(3).max(120),
    taskMd: z.string().min(10).max(4000),
    data: z.array(z.string().min(1).max(80)).max(8).default([]),
    deliverable: z.string().min(3).max(300),
    production: ExerciseProductionSchema,
    explanationPrompt: z.string().min(3).max(300).nullable(),
    hints: z.array(z.string().min(5).max(400)).max(2).default([]),
    criteria: z.array(ExerciseCriterionSchema).min(1).max(8),
    estimatedMinutes: z.number().int().min(5).max(120),
    passPoints: z.number().int().min(1).max(10).default(8),
    sources: z.array(z.record(z.string(), z.unknown())).max(20).default([]),
  })
  .strict()
  .superRefine((instruction, ctx) => {
    const total = instruction.criteria.reduce((sum, criterion) => sum + criterion.points, 0);
    if (total !== 10) {
      ctx.addIssue({
        code: 'custom',
        path: ['criteria'],
        message: `La somme des points des critères doit valoir 10 (reçu ${String(total)}).`,
      });
    }
  });
export type ExerciseInstruction = z.infer<typeof ExerciseInstructionSchema>;

const explanationSchema = z.string().max(2000).optional();

/** ET-3 — a submission is discriminated by the production kind of the instruction. */
export const ExerciseSubmissionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('text'),
      text: z.string().max(10_000),
      explanation: explanationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('file'),
      resourceId: Uuid,
      explanation: explanationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('link'),
      url: z.url().refine((value) => value.startsWith('https://'), 'Le lien doit utiliser HTTPS.'),
      explanation: explanationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('table'),
      fields: z.record(z.string(), z.string().max(2000)),
      rows: z.array(z.record(z.string(), z.string().max(2000))),
      explanation: explanationSchema,
    })
    .strict(),
]);
export type ExerciseSubmission = z.infer<typeof ExerciseSubmissionSchema>;

/** EF-2 — one graded criterion: an earned sub-score and a readable explanation. */
export const ExerciseCriterionResultSchema = z
  .object({
    key: z.string().min(1).max(40),
    label: z.string().min(1).max(120),
    points: z.number().int().min(0).max(10),
    earned: z.number().int().min(0).max(10),
    ok: z.boolean(),
    comment: z.string().min(1).max(1000),
  })
  .strict();
export type ExerciseCriterionResult = z.infer<typeof ExerciseCriterionResultSchema>;

export const EXERCISE_VERDICTS = ['passed', 'retry'] as const;
export const ExerciseVerdict = z.enum(EXERCISE_VERDICTS);
export type ExerciseVerdict = z.infer<typeof ExerciseVerdict>;

export const ExerciseNextStepSchema = z
  .object({
    label: z.string().min(1).max(300),
    href: z.string().min(1).max(2048),
  })
  .strict();
export type ExerciseNextStep = z.infer<typeof ExerciseNextStepSchema>;

/** EF-2, CL-5 — the bounded tutor correction, never displayed before validation. */
export const ExerciseCorrectionSchema = z
  .object({
    score: z.number().int().min(0).max(10),
    maxScore: z.number().int().min(0).max(10),
    verdict: ExerciseVerdict,
    criteria: z.array(ExerciseCriterionResultSchema).min(1).max(8),
    summary: z.string().min(1).max(4000),
    nextStep: ExerciseNextStepSchema,
  })
  .strict();
export type ExerciseCorrection = z.infer<typeof ExerciseCorrectionSchema>;

export const EXERCISE_ATTEMPT_STATUSES = ['in_progress', 'graded'] as const;
export const ExerciseAttemptStatus = z.enum(EXERCISE_ATTEMPT_STATUSES);
export type ExerciseAttemptStatus = z.infer<typeof ExerciseAttemptStatus>;

/** ET-2 — the attempt state a page reload can restore. */
export const ExerciseAttemptSchema = z
  .object({
    attemptId: Uuid,
    status: ExerciseAttemptStatus,
    hintsUsed: z.number().int().min(0).max(2),
    maxScore: z.number().int().min(0).max(10),
    submission: ExerciseSubmissionSchema.nullable(),
    correction: ExerciseCorrectionSchema.nullable(),
    masteryBefore: z.number().min(0).max(100),
    masteryAfter: z.number().min(0).max(100).nullable(),
    startedAt: IsoDateTime,
    submittedAt: IsoDateTime.nullable(),
    durationMs: z.number().int().min(0).nullable(),
  })
  .strict();
export type ExerciseAttempt = z.infer<typeof ExerciseAttemptSchema>;

/** Read model of SCR-08: instruction, previous attempt, revealed hints and mastery. */
export const PracticeExerciseDto = z
  .object({
    exerciseId: Uuid,
    formationId: Uuid,
    formationTitle: z.string().min(1).max(160),
    moduleId: Uuid,
    moduleTitle: z.string().min(1).max(160),
    modulePosition: z.number().int().min(1),
    notionId: Uuid,
    notionLabel: z.string().min(1).max(120),
    instruction: ExerciseInstructionSchema,
    attempt: ExerciseAttemptSchema.nullable(),
    mastery: z.number().min(0).max(100),
    masteryThreshold: z.number().int().min(60).max(95),
    hintsUsed: z.number().int().min(0).max(2),
    hintsLeft: z.number().int().min(0).max(2),
    maxScore: z.number().int().min(0).max(10),
    revealedHints: z.array(z.string().min(1).max(400)).max(2),
    gapNature: z.enum(['forgetting', 'confusion', 'misunderstanding', 'application']).nullable(),
  })
  .strict();
export type PracticeExerciseDto = z.infer<typeof PracticeExerciseDto>;

/** POST /modules/:mid/exercises/:aid/hint — the revealed hint and the remaining maximum. */
export const ExerciseHintResult = z
  .object({
    attemptId: Uuid,
    hintIndex: z.number().int().min(1).max(2),
    hintText: z.string().min(1).max(400),
    hintsUsed: z.number().int().min(0).max(2),
    hintsLeft: z.number().int().min(0).max(2),
    maxScore: z.number().int().min(0).max(10),
  })
  .strict();
export type ExerciseHintResult = z.infer<typeof ExerciseHintResult>;

export const ExerciseAttemptState = z
  .object({
    attemptId: Uuid,
    status: ExerciseAttemptStatus,
    hintsUsed: z.number().int().min(0).max(2),
    maxScore: z.number().int().min(0).max(10),
  })
  .strict();
export type ExerciseAttemptState = z.infer<typeof ExerciseAttemptState>;

export const ExerciseDraftResult = z.object({ attemptId: Uuid, savedAt: IsoDateTime }).strict();
export type ExerciseDraftResult = z.infer<typeof ExerciseDraftResult>;

export const ExerciseSubmissionResult = z
  .object({
    attemptId: Uuid,
    status: z.literal('graded'),
    correction: ExerciseCorrectionSchema,
    masteryBefore: z.number().min(0).max(100),
    masteryAfter: z.number().min(0).max(100),
    submittedAt: IsoDateTime,
  })
  .strict();
export type ExerciseSubmissionResult = z.infer<typeof ExerciseSubmissionResult>;

export const ExerciseDraftBody = z.object({ submission: ExerciseSubmissionSchema }).strict();
export type ExerciseDraftBody = z.infer<typeof ExerciseDraftBody>;

export const ExerciseSubmissionBody = z.object({ submission: ExerciseSubmissionSchema }).strict();
export type ExerciseSubmissionBody = z.infer<typeof ExerciseSubmissionBody>;

export const ExerciseDetailParams = z.object({ fid: Uuid, mid: Uuid, aid: Uuid }).strict();
export type ExerciseDetailParams = z.infer<typeof ExerciseDetailParams>;

export const ExerciseParams = z.object({ mid: Uuid, aid: Uuid }).strict();
export type ExerciseParams = z.infer<typeof ExerciseParams>;

export const ExerciseIdParams = z.object({ aid: Uuid }).strict();
export type ExerciseIdParams = z.infer<typeof ExerciseIdParams>;

const exerciseErrors = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'RESPONSE_INVALID',
  'CONFLICT',
  'IDEMPOTENCY_KEY_REQUIRED',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const exerciseDetail = defineRoute({
  id: 'exercises.detail',
  method: 'GET',
  path: '/api/v1/formations/:fid/modules/:mid/exercises/:aid',
  auth: 'user',
  params: ExerciseDetailParams,
  output: PracticeExerciseDto,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Renvoie l’exercice pratique, sa dernière tentative, les indices révélés et la maîtrise (SPEC-613).',
  errors: [...exerciseErrors],
});

export const exerciseStart = defineRoute({
  id: 'exercises.start',
  method: 'POST',
  path: '/api/v1/modules/:mid/exercises/:aid/attempts',
  auth: 'user',
  params: ExerciseParams,
  body: z.object({}).strict(),
  output: ExerciseAttemptState,
  successStatus: 201,
  idempotent: true,
  rateLimit: 'default',
  summary: 'Démarre ou reprend l’unique tentative en cours d’un exercice (SPEC-613).',
  errors: [...exerciseErrors],
});

export const exerciseSaveDraft = defineRoute({
  id: 'exercises.saveDraft',
  method: 'PUT',
  path: '/api/v1/exercises/:aid/draft',
  auth: 'user',
  params: ExerciseIdParams,
  body: ExerciseDraftBody,
  output: ExerciseDraftResult,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Enregistre le brouillon d’une production sans correction ni appel au tuteur (SPEC-613).',
  errors: [...exerciseErrors],
});

export const exerciseSubmit = defineRoute({
  id: 'exercises.submit',
  method: 'POST',
  path: '/api/v1/exercises/:aid/submissions',
  auth: 'user',
  params: ExerciseIdParams,
  body: ExerciseSubmissionBody,
  output: ExerciseSubmissionResult,
  successStatus: 201,
  idempotent: true,
  rateLimit: 'default',
  summary:
    'Valide la production, applique les contrôles automatiques puis rend la correction du tuteur par critère (SPEC-613).',
  errors: [...exerciseErrors],
});

export const exerciseHint = defineRoute({
  id: 'exercises.hint',
  method: 'POST',
  path: '/api/v1/modules/:mid/exercises/:aid/hint',
  auth: 'user',
  params: ExerciseParams,
  body: z.object({}).strict(),
  output: ExerciseHintResult,
  successStatus: 201,
  idempotent: true,
  rateLimit: 'default',
  summary: 'Révèle le prochain indice d’un exercice, plafonné à deux (SPEC-613).',
  errors: [...exerciseErrors],
});

export const exerciseRoutes = {
  exerciseDetail,
  exerciseStart,
  exerciseSaveDraft,
  exerciseSubmit,
  exerciseHint,
} as const;
