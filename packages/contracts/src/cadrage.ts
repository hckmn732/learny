import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the cadrage by chat (SPEC-604 EF-1 to EF-13, ET-1; BR-FOR-01 to BR-FOR-03).
// The structured turn is produced by the tutor package; this module only defines what crosses the
// API and what the screen consumes. A suggestion never carries an internal identifier.

/** BR-FOR-02 — the five rubrics of the “Profil de la formation” panel, in display order. */
export const CADRAGE_RUBRIC_KEYS = [
  'scope',
  'starting_point',
  'target_level',
  'volume',
  'dates',
] as const;
export const CadrageRubricKey = z.enum(CADRAGE_RUBRIC_KEYS);
export type CadrageRubricKey = z.infer<typeof CadrageRubricKey>;

/** BR-FOR-01 — question key stored on a tutor message, `other` for a question outside the five. */
export const CADRAGE_QUESTION_KEYS = [...CADRAGE_RUBRIC_KEYS, 'other'] as const;
export const CadrageQuestionKey = z.enum(CADRAGE_QUESTION_KEYS);
export type CadrageQuestionKey = z.infer<typeof CadrageQuestionKey>;

export const CADRAGE_STATES = ['todo', 'waiting', 'done'] as const;
export const CadrageRubricState = z.enum(CADRAGE_STATES);
export type CadrageRubricState = z.infer<typeof CadrageRubricState>;

export const CadrageProfileValue = z.object({
  value: z.string().max(200).nullable(),
  state: CadrageRubricState,
});
export type CadrageProfileValue = z.infer<typeof CadrageProfileValue>;

export const CadrageProfile = z.record(CadrageRubricKey, CadrageProfileValue);
export type CadrageProfile = z.infer<typeof CadrageProfile>;

/** A tappable answer: the label is shown, the value is sent back verbatim. */
export const CadrageSuggestion = z.object({
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(60),
  description: z.string().max(120).nullable(),
  multi: z.boolean(),
});
export type CadrageSuggestion = z.infer<typeof CadrageSuggestion>;

export const CadrageMessage = z.object({
  id: Uuid,
  role: z.enum(['tutor', 'learner']),
  content: z.string().min(1),
  /** 1..5 when the tutor message carries a question, null otherwise (EF-5). */
  questionNumber: z.number().int().min(1).max(5).nullable(),
  suggestions: z.array(CadrageSuggestion).nullable(),
  multi: z.boolean(),
  createdAt: IsoDateTime,
});
export type CadrageMessage = z.infer<typeof CadrageMessage>;

export const CadragePendingQuestion = z.object({
  messageId: Uuid,
  questionKey: CadrageQuestionKey,
  multi: z.boolean(),
});
export type CadragePendingQuestion = z.infer<typeof CadragePendingQuestion>;

/** ET-1 — the whole screen state, returned by creation and by both message routes. */
export const CadrageStateDto = z.object({
  formationId: Uuid,
  title: z.string().min(1).max(120),
  messages: z.array(CadrageMessage),
  profile: CadrageProfile,
  questionsAsked: z.number().int().min(0).max(5),
  finished: z.boolean(),
  canGenerate: z.boolean(),
  pendingQuestion: CadragePendingQuestion.nullable(),
  /** CL-1 / CL-2 — a tutor failure is rendered in the thread with its retry action. */
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }).nullable(),
});
export type CadrageStateDto = z.infer<typeof CadrageStateDto>;

export const FormationSummary = z.object({
  id: Uuid,
  title: z.string().min(1).max(120),
  status: z.enum([
    'cadrage',
    'programme_proposed',
    'active',
    'paused',
    'completed',
    'archived',
  ]),
});
export type FormationSummary = z.infer<typeof FormationSummary>;

export const FormationsList = z.object({ items: z.array(FormationSummary) });
export type FormationsList = z.infer<typeof FormationsList>;

export const FormationPatchInput = z
  .strictObject({
    title: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.title !== undefined, {
    message: 'Indiquez le titre de la formation.',
  });
export type FormationPatchInput = z.infer<typeof FormationPatchInput>;

export const FormationPatchOutput = FormationSummary;
export type FormationPatchOutput = z.infer<typeof FormationPatchOutput>;

/** ET-1 — creation starts the cadrage with the same request. */
export const FormationCreateInput = z.strictObject({
  title: z.string().trim().min(1).max(120),
});
export type FormationCreateInput = z.input<typeof FormationCreateInput>;

export const FormationCreateOutput = z.object({
  formation: FormationSummary,
  cadrage: CadrageStateDto,
});
export type FormationCreateOutput = z.infer<typeof FormationCreateOutput>;

/** EF-7 / CL-6 — exactly one of a free answer, suggested answers, or a retry of a failed turn. */
export const CadrageMessageCreateInput = z
  .strictObject({
    content: z.string().trim().min(1).max(1000).optional(),
    selections: z.array(z.string().trim().min(1).max(60)).min(1).max(6).optional(),
    retry: z.literal(true).optional(),
  })
  .refine(
    (value) =>
      [value.content, value.selections, value.retry].filter(
        (candidate) => candidate !== undefined,
      ).length === 1,
    { message: 'Envoyez une réponse, une sélection ou une nouvelle tentative.' },
  );
export type CadrageMessageCreateInput = z.input<typeof CadrageMessageCreateInput>;

/** ET-1 — conclusion accepted: the programme design of SPEC-605 takes over. */
export const CadrageCompleteOutput = z.object({ formationId: Uuid });
export type CadrageCompleteOutput = z.infer<typeof CadrageCompleteOutput>;

const idParams = z.object({ fid: Uuid });

export const formationRoutes = {
  formationsCreate: defineRoute({
    id: 'formations.create',
    method: 'POST',
    path: '/api/v1/formations',
    auth: 'user',
    body: FormationCreateInput,
    output: FormationCreateOutput,
    successStatus: 201,
    idempotent: true,
    summary:
      'Crée une formation au statut cadrage et lance la première question du tuteur (SPEC-604).',
    errors: [
      'VALIDATION_FAILED',
      'IDEMPOTENCY_KEY_REQUIRED',
      'AI_UNAVAILABLE',
      'UNAUTHENTICATED',
      'INTERNAL_ERROR',
    ],
  }),
  formationsList: defineRoute({
    id: 'formations.list',
    method: 'GET',
    path: '/api/v1/formations',
    auth: 'user',
    output: FormationsList,
    successStatus: 200,
    summary: 'Liste minimale des formations du propriétaire (SPEC-604).',
    errors: ['UNAUTHENTICATED', 'INTERNAL_ERROR'],
  }),
  formationUpdate: defineRoute({
    id: 'formations.update',
    method: 'PATCH',
    path: '/api/v1/formations/:fid',
    auth: 'user',
    params: idParams,
    body: FormationPatchInput,
    output: FormationPatchOutput,
    successStatus: 200,
    summary: 'Met à jour le titre d’une formation pendant le cadrage (SPEC-604 EF-11).',
    errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
  }),
} as const;

export const cadrageRoutes = {
  cadrageGet: defineRoute({
    id: 'cadrage.get',
    method: 'GET',
    path: '/api/v1/formations/:fid/cadrage/messages',
    auth: 'user',
    params: idParams,
    output: CadrageStateDto,
    successStatus: 200,
    summary: 'Historique, profil et question en attente d’un cadrage (SPEC-604).',
    errors: ['NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
  }),
  cadrageMessageCreate: defineRoute({
    id: 'cadrage.message',
    method: 'POST',
    path: '/api/v1/formations/:fid/cadrage/messages',
    auth: 'user',
    params: idParams,
    body: CadrageMessageCreateInput,
    output: CadrageStateDto,
    successStatus: 200,
    idempotent: true,
    rateLimit: 'ai',
    summary: 'Envoie une réponse au tuteur et renvoie le cadrage à jour (SPEC-604).',
    errors: [
      'VALIDATION_FAILED',
      'CONFLICT',
      'AI_UNAVAILABLE',
      'AI_TASK_FAILED',
      'AI_RATE_LIMITED',
      'RATE_LIMITED',
      'NOT_FOUND',
      'UNAUTHENTICATED',
      'INTERNAL_ERROR',
    ],
  }),
  cadrageComplete: defineRoute({
    id: 'cadrage.complete',
    method: 'POST',
    path: '/api/v1/formations/:fid/cadrage/complete',
    auth: 'user',
    params: idParams,
    output: CadrageCompleteOutput,
    successStatus: 202,
    summary: 'Conclut le cadrage et prépare la génération du programme (SPEC-604).',
    errors: [
      'CADRAGE_INCOMPLETE',
      'CONFLICT',
      'NOT_FOUND',
      'UNAUTHENTICATED',
      'INTERNAL_ERROR',
    ],
  }),
} as const;
