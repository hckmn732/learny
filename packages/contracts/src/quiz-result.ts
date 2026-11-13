import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { LEARNING_GAP_NATURES } from './learning';
import { QuizAttemptParams, QuizModuleParams, QuizQuestionDto } from './attempts';

// Result of a corrected validation attempt and the targeted remediation (SCR-09, SPEC-612 EF-1 to
// EF-8, ET-1, ET-2, BR-QUI-05, BR-QUI-06, BR-QUI-08, BR-LAC-04, ADR-0173, ADR-0179). Everything the
// result screen displays is computed by the server from the persisted attempt, the module and the
// learner's notion states; the client never derives a passed/failed verdict.

export const GAP_NATURE_LABELS = {
  confusion: 'Confusion',
  misunderstanding: 'Incompréhension',
  application: "Difficulté d'application",
  forgetting: 'Oubli',
} as const;

export const RemediationStatus = z.enum([
  'none',
  'preparing',
  'ready',
  'in_progress',
  'completed',
]);
export type RemediationStatus = z.infer<typeof RemediationStatus>;

export const RetryReason = z.enum(['delay', 'remediation_required']);

export const GapCardDto = z
  .strictObject({
    notionId: Uuid,
    label: z.string().min(1),
    nature: z.enum(LEARNING_GAP_NATURES),
    natureLabel: z.string().min(1),
    evidence: z.string().min(1),
    proposal: z.string().min(1),
    mastery: z.number().min(0).max(100),
    trainHref: z.string().min(1),
  })
  .describe('Lacune ouverte du module, avec la réponse proposée par le tuteur (BR-LAC-04).');
export type GapCardDto = z.infer<typeof GapCardDto>;

export const AttemptHistoryEntry = z
  .strictObject({
    attemptNo: z.number().int().min(1),
    score: z.number().min(0).max(100),
    passed: z.boolean(),
  })
  .describe('Une tentative corrigée, pour le graphique d’historique.');
export type AttemptHistoryEntry = z.infer<typeof AttemptHistoryEntry>;

export const QuizResultDto = z
  .strictObject({
    attemptId: Uuid,
    attemptNo: z.number().int().min(1),
    status: z.enum(['in_progress', 'submitted', 'graded', 'timed_out', 'abandoned']),
    score: z.number().min(0).max(100).nullable(),
    provisionalScore: z.number().min(0).max(100).nullable(),
    threshold: z.number().int().min(60).max(95),
    passed: z.boolean().nullable(),
    /** CL-11 — ceil(threshold − score) of an unrounded below-threshold score. */
    pointsMissing: z.number().int().min(0).nullable(),
    isLastModule: z.boolean(),
    nextModule: z
      .strictObject({
        id: Uuid,
        position: z.number().int().min(1),
        title: z.string().min(1),
      })
      .nullable(),
    history: z.array(AttemptHistoryEntry).max(50),
    gaps: z.array(GapCardDto).max(10),
    mastered: z.array(z.strictObject({ notionId: Uuid, label: z.string().min(1) })).max(100),
    perNotion: z
      .array(
        z.strictObject({
          notionId: Uuid,
          label: z.string().min(1),
          correct: z.number().int().min(0),
          total: z.number().int().min(0),
          score: z.number().min(0).max(100),
        }),
      )
      .max(100),
    retry: z.strictObject({
      allowed: z.boolean(),
      availableAt: IsoDateTime.nullable(),
      reason: RetryReason.nullable(),
    }),
    remediation: z.strictObject({
      status: RemediationStatus,
      href: z.string().nullable(),
    }),
    pendingOpenCount: z.number().int().min(0),
  })
  .describe('Résultat complet de la tentative, prêt pour SCR-09.');
export type QuizResultDto = z.infer<typeof QuizResultDto>;

export const RemediationExcerptDto = z
  .strictObject({ label: z.string().min(1), href: z.string().min(1) })
  .describe('Extrait de cours cité dans la remédiation, lien contrôlé.');
export type RemediationExcerptDto = z.infer<typeof RemediationExcerptDto>;

export const RemediationGapDto = z
  .strictObject({
    notionId: Uuid,
    label: z.string().min(1),
    nature: z.enum(LEARNING_GAP_NATURES),
    natureLabel: z.string().min(1),
    textMd: z.string().min(1),
    excerpts: z.array(RemediationExcerptDto).max(5),
    questions: z.array(QuizQuestionDto),
  })
  .describe('Une notion en lacune et sa remédiation ciblée (ADR-0173).');
export type RemediationGapDto = z.infer<typeof RemediationGapDto>;

export const RemediationDto = z
  .strictObject({
    status: RemediationStatus,
    activityId: Uuid.nullable(),
    attemptId: Uuid.nullable(),
    gaps: z.array(RemediationGapDto),
    retryAvailableAt: IsoDateTime.nullable(),
  })
  .describe('Remédiation en cours du module, telle que l’écran la reçoit.');
export type RemediationDto = z.infer<typeof RemediationDto>;

export const RemediationPreparingOutput = z
  .strictObject({ status: z.literal('preparing') })
  .describe('Préparation de la remédiation lancée (202).');
export type RemediationPreparingOutput = z.infer<typeof RemediationPreparingOutput>;

export const RemediationCompleteOutput = z
  .strictObject({ retryAvailableAt: IsoDateTime.nullable() })
  .describe('Remédiation terminée ; date de la nouvelle tentative.');
export type RemediationCompleteOutput = z.infer<typeof RemediationCompleteOutput>;

const REMEDIATION_ERRORS = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'NO_FAILED_ATTEMPT',
  'RETRY_NOT_YET_ALLOWED',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export const getQuizResult = defineRoute({
  id: 'quiz.attempts.result',
  method: 'GET',
  path: '/api/v1/attempts/:aid/result',
  auth: 'user',
  params: QuizAttemptParams,
  output: QuizResultDto,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Renvoie le résultat complet d’une tentative corrigée : score, seuil, lacunes, acquis, historique, nouvelle tentative et remédiation (SPEC-612).',
  errors: [...REMEDIATION_ERRORS],
});

export const getRemediation = defineRoute({
  id: 'remediation.get',
  method: 'GET',
  path: '/api/v1/modules/:mid/remediation',
  auth: 'user',
  params: QuizModuleParams,
  output: RemediationDto,
  successStatus: 200,
  rateLimit: 'default',
  summary: 'Renvoie la remédiation en cours du module, ou un statut none (SPEC-612).',
  errors: [...REMEDIATION_ERRORS],
});

export const prepareRemediation = defineRoute({
  id: 'remediation.prepare',
  method: 'POST',
  path: '/api/v1/modules/:mid/remediation',
  auth: 'user',
  params: QuizModuleParams,
  output: RemediationPreparingOutput,
  successStatus: 202,
  idempotent: true,
  rateLimit: 'default',
  summary:
    'Prépare une remédiation à la demande (automatisme désactivé ou remédiation archivée) ; 409 si une remédiation est déjà prête (SPEC-612).',
  errors: [...REMEDIATION_ERRORS, 'IDEMPOTENCY_KEY_REQUIRED'],
});

export const completeRemediation = defineRoute({
  id: 'remediation.complete',
  method: 'POST',
  path: '/api/v1/modules/:mid/remediation/complete',
  auth: 'user',
  params: QuizModuleParams,
  output: RemediationCompleteOutput,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Termine la remédiation quand toutes les questions sont vérifiées et renvoie la date de nouvelle tentative (SPEC-612).',
  errors: [...REMEDIATION_ERRORS],
});

export const remediationRoutes = {
  getRemediation,
  prepareRemediation,
  completeRemediation,
  getQuizResult,
} as const;
