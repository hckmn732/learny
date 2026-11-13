import { z } from 'zod';

import { QuizFeedback, QuizQuestionType } from './attempts';
import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the mock exam (SCR-11, SPEC-614 EF-1 to EF-6, ET-1 to ET-5, BR-PRA-02 to
// BR-PRA-05, ADR-0028, ADR-0172). The exam is a timed, help-free reproduction of the official
// format. While the attempt is in progress, a question never carries a correct answer, an
// expected response or an explanation: those leave the server after the submission only.

export const EXAM_FORMAT_SOURCES = ['guide', 'default'] as const;
export const ExamFormatSource = z.enum(EXAM_FORMAT_SOURCES);
export type ExamFormatSource = z.infer<typeof ExamFormatSource>;

/**
 * ET-3 — format of the official exam. `secondsPerQuestion` is null when the guide states a total
 * duration instead; `durationMin` is always the total duration actually applied.
 */
export const ExamFormatSchema = z
  .strictObject({
    questionCount: z.number().int().min(1).max(200),
    secondsPerQuestion: z.number().int().min(1).max(3_600).nullable(),
    durationMin: z.number().int().min(1).max(600),
    threshold: z.number().int().min(1).max(100),
    source: ExamFormatSource,
    /** A format extracted from a guide is inactive until the learner confirms it (ET-3, CA-1). */
    confirmed: z.boolean(),
    sourceResourceId: Uuid.nullable().optional(),
  })
  .describe('Format de l’examen : questions, durée, seuil et origine (guide ou défaut).');
export type ExamFormatSchema = z.infer<typeof ExamFormatSchema>;

export const EXAM_QUESTION_STATES = ['unanswered', 'draft', 'marked'] as const;
export const ExamQuestionState = z.enum(EXAM_QUESTION_STATES);
export type ExamQuestionState = z.infer<typeof ExamQuestionState>;

export const ExamQuestionDto = z
  .strictObject({
    position: z.number().int().min(1),
    brickVersionId: Uuid,
    type: QuizQuestionType,
    typeLabel: z.string().min(1),
    notionId: Uuid,
    notionLabel: z.string().min(1),
    moduleId: Uuid,
    modulePosition: z.number().int().min(1),
    moduleLabel: z.string().min(1),
    /** Public view of the brick: never a correct option, an expected answer or a model answer. */
    payload: z.unknown(),
    response: z.unknown().optional(),
    marked: z.boolean(),
    maxScore: z.number().min(0).max(100),
    /** Present only once the attempt is graded (review, BR-PRA-04). */
    feedback: QuizFeedback.optional(),
  })
  .describe('Question d’examen, sans aucune bonne réponse pendant l’épreuve.');
export type ExamQuestionDto = z.infer<typeof ExamQuestionDto>;

export const ExamAttemptDto = z
  .strictObject({
    id: Uuid,
    attemptNo: z.number().int().min(1),
    formationId: Uuid,
    status: z.enum(['in_progress', 'submitted', 'graded', 'timed_out', 'abandoned']),
    threshold: z.number().int().min(1).max(100),
    total: z.number().int().min(1),
    questions: z.array(ExamQuestionDto),
    startedAt: IsoDateTime,
    deadlineAt: IsoDateTime,
    serverTime: IsoDateTime,
    /** ET-4 — `max(0, deadlineAt - clock.now())`, computed by the server on every read. */
    remainingSeconds: z.number().int().min(0),
    answeredCount: z.number().int().min(0),
    markedCount: z.number().int().min(0),
  })
  .describe('Tentative d’examen blanc avec son échéance serveur.');
export type ExamAttemptDto = z.infer<typeof ExamAttemptDto>;

export const ExamIntroDto = z
  .strictObject({
    formationId: Uuid,
    title: z.string().min(1),
    format: ExamFormatSchema,
    hasGuide: z.boolean(),
    studiedModules: z.array(
      z.strictObject({
        moduleId: Uuid,
        position: z.number().int().min(1),
        label: z.string().min(1),
      }),
    ),
    diagnosticModules: z.array(
      z.strictObject({
        moduleId: Uuid,
        position: z.number().int().min(1),
        label: z.string().min(1),
      }),
    ),
    diagnosticQuestionCount: z.number().int().min(0),
    nextExams: z.array(
      z.strictObject({
        startsAt: IsoDateTime,
        label: z.string().min(1),
      }),
    ),
    lastAttempt: z
      .strictObject({
        attemptId: Uuid,
        status: z.enum(['in_progress', 'submitted', 'graded', 'timed_out', 'abandoned']),
        score: z.number().min(0).max(100).nullable(),
      })
      .nullable(),
  })
  .describe('Introduction de l’examen blanc : format, modules étudiés, diagnostic et échéances.');
export type ExamIntroDto = z.infer<typeof ExamIntroDto>;

export const ConfirmExamFormatInput = z
  .strictObject({ confirmed: z.literal(true) })
  .describe('Confirmation explicite du format extrait d’un guide (ET-3).');
export type ConfirmExamFormatInput = z.infer<typeof ConfirmExamFormatInput>;

export const ExamSubmitOutput = z
  .strictObject({
    status: z.enum(['in_progress', 'submitted', 'graded', 'timed_out', 'abandoned']),
    /** Unanswered and marked questions at the moment of the submission (BR-PRA-03). */
    unansweredCount: z.number().int().min(0),
    markedCount: z.number().int().min(0),
  })
  .describe('Accusé de fin d’examen ; la correction est immédiate.');
export type ExamSubmitOutput = z.infer<typeof ExamSubmitOutput>;

export const MarkExamQuestionInput = z
  .strictObject({ marked: z.boolean() })
  .describe('Marque ou démarque une question « à revoir » (BR-PRA-03).');
export type MarkExamQuestionInput = z.infer<typeof MarkExamQuestionInput>;

export const MarkExamQuestionOutput = z
  .strictObject({
    position: z.number().int().min(1),
    marked: z.boolean(),
  })
  .describe('État du marqueur après écriture.');
export type MarkExamQuestionOutput = z.infer<typeof MarkExamQuestionOutput>;

export const ExamModuleResult = z
  .strictObject({
    moduleId: Uuid,
    position: z.number().int().min(1),
    label: z.string().min(1),
    studied: z.boolean(),
    correct: z.number().int().min(0),
    total: z.number().int().min(0),
    score: z.number().min(0).max(100),
  })
  .describe('Détail du score d’un module, étudié ou diagnostique.');
export type ExamModuleResult = z.infer<typeof ExamModuleResult>;

export const ExamReviewRow = z
  .strictObject({
    position: z.number().int().min(1),
    brickVersionId: Uuid,
    typeLabel: z.string().min(1),
    question: z.string().min(1),
    notionLabel: z.string().min(1),
    modulePosition: z.number().int().min(1),
    moduleLabel: z.string().min(1),
    studied: z.boolean(),
    isCorrect: z.boolean(),
    /** Human-readable answer given by the learner, or « sans réponse ». */
    given: z.string().min(1),
    expected: z.string().nullable(),
    explanation: z.string().nullable(),
  })
  .describe('Ligne de revue conservant la version de question réellement jouée (ET-5).');
export type ExamReviewRow = z.infer<typeof ExamReviewRow>;

export const EXAM_REVIEW_FILTERS = ['all', 'errors'] as const;
export const ExamReviewFilter = z.enum(EXAM_REVIEW_FILTERS);
export type ExamReviewFilter = z.infer<typeof ExamReviewFilter>;

export const ExamResultDto = z
  .strictObject({
    attemptId: Uuid,
    formationId: Uuid,
    status: z.enum(['in_progress', 'submitted', 'graded', 'timed_out', 'abandoned']),
    threshold: z.number().int().min(1).max(100),
    durationMin: z.number().int().min(1),
    timeUsedMin: z.number().int().min(0),
    timedOut: z.boolean(),
    score: z.number().min(0).max(100),
    passed: z.boolean(),
    answeredCount: z.number().int().min(0),
    total: z.number().int().min(1),
    studied: z.strictObject({
      score: z.number().min(0).max(100),
      correct: z.number().int().min(0),
      total: z.number().int().min(0),
    }),
    diagnostic: z.strictObject({
      score: z.number().min(0).max(100),
      correct: z.number().int().min(0),
      total: z.number().int().min(0),
    }),
    modules: z.array(ExamModuleResult),
    gaps: z.array(
      z.strictObject({
        notionId: Uuid,
        notionLabel: z.string().min(1),
        moduleId: Uuid,
        modulePosition: z.number().int().min(1),
        moduleLabel: z.string().min(1),
      }),
    ),
    plan: z.array(z.string().min(1)),
    review: z.array(ExamReviewRow),
  })
  .describe('Résultats d’examen : score global, étudiés, diagnostic, lacunes, plan et revue.');
export type ExamResultDto = z.infer<typeof ExamResultDto>;

export const ExamFormationParams = z.object({ fid: Uuid });
export type ExamFormationParams = z.infer<typeof ExamFormationParams>;

export const ExamAttemptParams = z.object({ aid: Uuid });
export type ExamAttemptParams = z.infer<typeof ExamAttemptParams>;

export const ExamAnswerParams = z.object({ aid: Uuid, pos: z.coerce.number().int().min(1) });
export type ExamAnswerParams = z.infer<typeof ExamAnswerParams>;

const EXAM_ERRORS = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'EXAM_TIME_OVER',
  'FORMAT_NOT_CONFIRMED',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const getExamIntro = defineRoute({
  id: 'exam.intro',
  method: 'GET',
  path: '/api/v1/formations/:fid/mock-exams',
  auth: 'user',
  params: ExamFormationParams,
  output: ExamIntroDto,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Renvoie le format proposé, les modules étudiés et les prochains examens blancs (SPEC-614).',
  errors: [...EXAM_ERRORS],
});

export const confirmExamFormatRoute = defineRoute({
  id: 'exam.format.confirm',
  method: 'POST',
  path: '/api/v1/formations/:fid/mock-exams/format',
  auth: 'user',
  params: ExamFormationParams,
  body: ConfirmExamFormatInput,
  output: ExamFormatSchema,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Confirme le format d’examen extrait d’un guide avant de lancer une épreuve (SPEC-614).',
  errors: [...EXAM_ERRORS],
});

export const startExamAttempt = defineRoute({
  id: 'exam.attempts.create',
  method: 'POST',
  path: '/api/v1/formations/:fid/mock-exams/attempts',
  auth: 'user',
  params: ExamFormationParams,
  output: z.strictObject({ attemptId: Uuid, resumed: z.boolean().optional() }),
  successStatus: 201,
  idempotent: true,
  rateLimit: 'default',
  summary: 'Lance un examen blanc ou reprend la tentative en cours avec son temps restant (SPEC-614).',
  errors: [...EXAM_ERRORS, 'IDEMPOTENCY_KEY_REQUIRED'],
});

export const getExamAttempt = defineRoute({
  id: 'exam.attempts.get',
  method: 'GET',
  path: '/api/v1/mock-exams/:aid',
  auth: 'user',
  params: ExamAttemptParams,
  output: ExamAttemptDto,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Renvoie la tentative d’examen, ses réponses, ses marqueurs et le temps restant serveur (SPEC-614).',
  errors: [...EXAM_ERRORS],
});

export const saveExamAnswer = defineRoute({
  id: 'exam.answers.save',
  method: 'PUT',
  path: '/api/v1/mock-exams/:aid/answers/:pos',
  auth: 'user',
  params: ExamAnswerParams,
  body: z.strictObject({ response: z.unknown(), timeMs: z.number().int().min(0).max(1_800_000) }),
  output: z.strictObject({ position: z.number().int().min(1), savedAt: IsoDateTime }),
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Enregistre une réponse d’examen sans révéler sa correction (SPEC-614).',
  errors: [...EXAM_ERRORS],
});

export const markExamQuestion = defineRoute({
  id: 'exam.questions.mark',
  method: 'PUT',
  path: '/api/v1/mock-exams/:aid/marks/:pos',
  auth: 'user',
  params: ExamAnswerParams,
  body: MarkExamQuestionInput,
  output: MarkExamQuestionOutput,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Marque ou démarque une question « à revoir » pendant l’examen (SPEC-614).',
  errors: [...EXAM_ERRORS],
});

export const submitExamAttempt = defineRoute({
  id: 'exam.attempts.submit',
  method: 'POST',
  path: '/api/v1/mock-exams/:aid/submit',
  auth: 'user',
  params: ExamAttemptParams,
  output: ExamSubmitOutput,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Termine l’examen, corrige toutes les réponses et calcule les scores séparés (SPEC-614).',
  errors: [...EXAM_ERRORS],
});

export const getExamResult = defineRoute({
  id: 'exam.attempts.result',
  method: 'GET',
  path: '/api/v1/mock-exams/:aid/result',
  auth: 'user',
  params: ExamAttemptParams,
  output: ExamResultDto,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Renvoie les résultats, les lacunes des modules étudiés et la revue filtrable (SPEC-614).',
  errors: [...EXAM_ERRORS],
});

export const examRoutes = {
  getExamIntro,
  confirmExamFormatRoute,
  startExamAttempt,
  getExamAttempt,
  saveExamAnswer,
  markExamQuestion,
  submitExamAttempt,
  getExamResult,
} as const;
