import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the validation quiz attempt (SCR-09, SPEC-611 EF-1 to EF-10, ET-1 to ET-3,
// BR-QUI-01 to BR-QUI-04, BR-QUI-07, BR-FOR-06, ADR-0014, ADR-0170). The public payload of a
// question never carries a correct answer before it is checked; the score is computed by the
// server and returned only once the attempt is graded.

export const QUIZ_QUESTION_TYPES = [
  'choice_question',
  'cloze',
  'matching',
  'open_question',
] as const;
export const QuizQuestionType = z.enum(QUIZ_QUESTION_TYPES);
export type QuizQuestionType = z.infer<typeof QuizQuestionType>;

export const QUIZ_ATTEMPT_STATUSES = [
  'in_progress',
  'submitted',
  'graded',
  'timed_out',
  'abandoned',
] as const;
export const QuizAttemptStatus = z.enum(QUIZ_ATTEMPT_STATUSES);
export type QuizAttemptStatus = z.infer<typeof QuizAttemptStatus>;

export const QUIZ_QUESTION_STATES = ['unanswered', 'draft', 'checked'] as const;
export const QuizQuestionState = z.enum(QUIZ_QUESTION_STATES);
export type QuizQuestionState = z.infer<typeof QuizQuestionState>;

/** Correction of one question, narrowed by the brick format (SPEC-502). */
export const QuizChoiceCorrection = z
  .strictObject({
    kind: z.literal('choice_question'),
    explanation: z.string(),
    options: z.array(
      z.strictObject({
        id: z.string().min(1),
        text: z.string(),
        correct: z.boolean(),
        chosen: z.boolean(),
      }),
    ),
  })
  .describe('Correction d’une question à choix : bonne option et option choisie.');
export type QuizChoiceCorrection = z.infer<typeof QuizChoiceCorrection>;

export const QuizClozeCorrection = z
  .strictObject({
    kind: z.literal('cloze'),
    explanation: z.string(),
    gaps: z.array(
      z.strictObject({
        id: z.number().int().min(1),
        given: z.string(),
        expected: z.string(),
        correct: z.boolean(),
      }),
    ),
  })
  .describe('Correction d’un texte à trous, trou par trou.');
export type QuizClozeCorrection = z.infer<typeof QuizClozeCorrection>;

export const QuizMatchingCorrection = z
  .strictObject({
    kind: z.literal('matching'),
    explanation: z.string(),
    pairs: z.array(
      z.strictObject({
        pairId: z.string().min(1),
        left: z.string(),
        expectedRight: z.string(),
        givenRight: z.string().nullable(),
        correct: z.boolean(),
      }),
    ),
  })
  .describe('Correction d’une association, paire par paire.');
export type QuizMatchingCorrection = z.infer<typeof QuizMatchingCorrection>;

export const QuizOpenCorrection = z
  .strictObject({
    kind: z.literal('open_question'),
    explanation: z.string(),
    criteria: z.array(
      z.strictObject({
        key: z.string(),
        label: z.string().optional(),
        ok: z.boolean(),
        comment: z.string().nullable().optional(),
      }),
    ),
    missing: z.array(z.string()),
  })
  .describe('Correction différée d’une question ouverte par le tuteur.');
export type QuizOpenCorrection = z.infer<typeof QuizOpenCorrection>;

export const QuizCorrection = z.union([
  QuizChoiceCorrection,
  QuizClozeCorrection,
  QuizMatchingCorrection,
  QuizOpenCorrection,
]);
export type QuizCorrection = z.infer<typeof QuizCorrection>;

export const QuizFeedback = z
  .strictObject({
    /** Null while an open answer waits for the tutor (CL-6). */
    isCorrect: z.boolean().nullable(),
    /** Points earned on the question scale, null while uncorrected. */
    score: z.number().min(0).max(100).nullable(),
    explanation: z.string().nullable(),
    title: z.enum(['Exact.', 'Pas tout à fait.', 'Réponse enregistrée.']).nullable().optional(),
    correction: QuizCorrection.nullable().optional(),
    /** CL-6 — the tutor could not correct this answer yet. */
    pending: z.boolean().optional(),
  })
  .describe('Retour immédiat d’une question vérifiée.');
export type QuizFeedback = z.infer<typeof QuizFeedback>;

export const QuizQuestionDto = z
  .strictObject({
    position: z.number().int().min(1),
    brickVersionId: Uuid,
    type: QuizQuestionType,
    typeLabel: z.string().min(1),
    notionId: Uuid,
    notionLabel: z.string().min(1),
    /** Public view of the brick: never a correct option, an expected answer or a model answer. */
    payload: z.unknown(),
    state: QuizQuestionState,
    response: z.unknown().optional(),
    feedback: QuizFeedback.optional(),
    maxScore: z.number().min(0).max(100),
  })
  .describe('Question d’une tentative, sans aucune bonne réponse avant vérification.');
export type QuizQuestionDto = z.infer<typeof QuizQuestionDto>;

export const AttemptDto = z
  .strictObject({
    id: Uuid,
    kind: z.literal('validation_quiz'),
    attemptNo: z.number().int().min(1),
    status: QuizAttemptStatus,
    moduleId: Uuid,
    formationId: Uuid,
    threshold: z.number().int().min(60).max(95),
    total: z.number().int().min(1),
    questions: z.array(QuizQuestionDto),
    startedAt: IsoDateTime,
    submittedAt: IsoDateTime.nullable().optional(),
    score: z.number().min(0).max(100).nullable().optional(),
    passed: z.boolean().nullable().optional(),
    serverTime: IsoDateTime,
  })
  .describe('Tentative de quiz de validation telle que l’écran la reçoit.');
export type AttemptDto = z.infer<typeof AttemptDto>;

export const SaveAnswerInput = z
  .strictObject({
    response: z.unknown(),
    timeMs: z.number().int().min(0).max(1_800_000),
  })
  .describe('Brouillon d’une réponse et temps passé, borné à 30 minutes (CL-12).');
export type SaveAnswerInput = z.infer<typeof SaveAnswerInput>;

export const SaveAnswerOutput = z
  .strictObject({
    position: z.number().int().min(1),
    savedAt: IsoDateTime,
  })
  .describe('Accusé d’enregistrement d’un brouillon.');
export type SaveAnswerOutput = z.infer<typeof SaveAnswerOutput>;

export const CheckAnswerOutput = z
  .strictObject({
    position: z.number().int().min(1),
    feedback: QuizFeedback,
    locked: z.literal(true),
  })
  .describe('Correction immédiate d’une réponse, désormais verrouillée.');
export type CheckAnswerOutput = z.infer<typeof CheckAnswerOutput>;

export const CreateQuizAttemptCreated = z
  .strictObject({ attemptId: Uuid })
  .describe('Tentative créée (201).');
export const CreateQuizAttemptResumed = z
  .strictObject({ attemptId: Uuid, resumed: z.literal(true) })
  .describe('Tentative en cours reprise (200).');
export const CreateQuizAttemptPreparing = z
  .strictObject({ preparing: z.literal(true), retryAfterSec: z.number().int().min(1).max(60) })
  .describe('Banque épuisée : le tuteur prépare de nouvelles questions (202).');
export const CreateQuizAttemptOutput = z.union([
  CreateQuizAttemptCreated,
  CreateQuizAttemptResumed,
  CreateQuizAttemptPreparing,
]);
export type CreateQuizAttemptOutput = z.infer<typeof CreateQuizAttemptOutput>;

export const SubmitAttemptOutput = z
  .strictObject({
    status: QuizAttemptStatus,
    /** CL-6 — open answers still waiting for the tutor. */
    pendingOpenCount: z.number().int().min(0).default(0),
  })
  .describe('Accusé de soumission (202) ; la correction continue en tâche de fond.');
export type SubmitAttemptOutput = z.infer<typeof SubmitAttemptOutput>;

export const AttemptResultDto = z
  .strictObject({
    attemptId: Uuid,
    status: QuizAttemptStatus,
    score: z.number().min(0).max(100).nullable(),
    provisionalScore: z.number().min(0).max(100).nullable(),
    passed: z.boolean().nullable(),
    threshold: z.number().int().min(60).max(95),
    perNotion: z
      .record(
        Uuid,
        z.strictObject({
          correct: z.number().int().min(0),
          total: z.number().int().min(0),
          score: z.number().min(0).max(100),
        }),
      )
      .optional(),
    pendingOpenCount: z.number().int().min(0),
    tutorPending: z.boolean(),
  })
  .describe('Résultat de la tentative, provisoire tant que les ouvertes ne sont pas corrigées.');
export type AttemptResultDto = z.infer<typeof AttemptResultDto>;

export const QuizModuleParams = z.object({ mid: Uuid });
export type QuizModuleParams = z.infer<typeof QuizModuleParams>;

export const QuizAttemptParams = z.object({ aid: Uuid });
export type QuizAttemptParams = z.infer<typeof QuizAttemptParams>;

export const QuizAnswerParams = z.object({ aid: Uuid, pos: z.coerce.number().int().min(1) });
export type QuizAnswerParams = z.infer<typeof QuizAnswerParams>;

const ATTEMPT_ERRORS = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'MODULE_LOCKED',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

/** ET-2 — creation of one attempt, or the resume of the in-progress one. */
export const startQuizAttempt = defineRoute({
  id: 'quiz.attempts.create',
  method: 'POST',
  path: '/api/v1/modules/:mid/quiz/attempts',
  auth: 'user',
  params: QuizModuleParams,
  output: CreateQuizAttemptOutput,
  successStatus: 201,
  idempotent: true,
  rateLimit: 'default',
  summary:
    'Crée une tentative de quiz de validation à partir de la banque, ou reprend la tentative en cours (SPEC-611).',
  errors: [...ATTEMPT_ERRORS, 'IDEMPOTENCY_KEY_REQUIRED'],
});

export const getQuizAttempt = defineRoute({
  id: 'quiz.attempts.get',
  method: 'GET',
  path: '/api/v1/attempts/:aid',
  auth: 'user',
  params: QuizAttemptParams,
  output: AttemptDto,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Renvoie une tentative de quiz sans révéler les bonnes réponses non vérifiées (SPEC-611).',
  errors: [...ATTEMPT_ERRORS],
});

export const saveQuizAnswer = defineRoute({
  id: 'quiz.answers.save',
  method: 'PUT',
  path: '/api/v1/attempts/:aid/answers/:pos',
  auth: 'user',
  params: QuizAnswerParams,
  body: SaveAnswerInput,
  output: SaveAnswerOutput,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Enregistre le brouillon d’une réponse non vérifiée (SPEC-611).',
  errors: [...ATTEMPT_ERRORS],
});

export const checkQuizAnswer = defineRoute({
  id: 'quiz.answers.check',
  method: 'POST',
  path: '/api/v1/attempts/:aid/answers/:pos/check',
  auth: 'user',
  params: QuizAnswerParams,
  body: SaveAnswerInput,
  output: CheckAnswerOutput,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Vérifie immédiatement une réponse corrigée par le code ou verrouille une réponse ouverte (SPEC-611).',
  errors: [...ATTEMPT_ERRORS],
});

export const submitQuizAttempt = defineRoute({
  id: 'quiz.attempts.submit',
  method: 'POST',
  path: '/api/v1/attempts/:aid/submit',
  auth: 'user',
  params: QuizAttemptParams,
  output: SubmitAttemptOutput,
  successStatus: 202,
  rateLimit: 'default',
  summary:
    'Soumet la tentative, lance la correction des ouvertes et réémet la correction si elle est en attente (SPEC-611).',
  errors: [...ATTEMPT_ERRORS],
});

export const quizRoutes = {
  startQuizAttempt,
  getQuizAttempt,
  saveQuizAnswer,
  checkQuizAnswer,
  submitQuizAttempt,
} as const;
