import { z } from 'zod';

import { AiCredentialProvider } from './ai-credentials';
import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the « Modèles d'IA » tab of the settings screen (SPEC-709 EF-1 to EF-5, ET-1 to
// ET-5; BR-SET-05, BR-IA-02 to BR-IA-04). The platform provides no model and no task has a default
// one: the learner assigns a model of a qualified personal key to each task. The state is read with
// the learner's RLS client: no provider key, ciphertext, prompt or qualification secret ever crosses
// Credentials themselves stay owned by SPEC-505/SPEC-506: this module only projects the mask, the
// status and the region flag that the screen renders.

/** EF-1 — the five AI tasks, in the order of `docs/architecture/ai.md` §1. */
export const AI_MODELS_TASK_IDS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;
export const AiModelsTaskId = z.enum(AI_MODELS_TASK_IDS);
export type AiModelsTaskId = z.infer<typeof AiModelsTaskId>;

/** EF-1 — capabilities a model must prove for a task (mirror of `TASK_CONFIG`). */
export const AI_TASK_CAPABILITY_IDS = [
  'tools',
  'structured',
  'web_search',
  'passage_refs',
  'vision',
] as const;
export const AiTaskCapabilityId = z.enum(AI_TASK_CAPABILITY_IDS);
export type AiTaskCapabilityId = z.infer<typeof AiTaskCapabilityId>;

/** BR-SET-05 — « Qualifié », « Non qualifié »; `pending` is the asynchronous battery (ET-4). */
export const AI_PROVIDER_STATUSES = ['qualified', 'unqualified', 'pending'] as const;
export const AiProviderStatus = z.enum(AI_PROVIDER_STATUSES);
export type AiProviderStatus = z.infer<typeof AiProviderStatus>;

/** CL-3 — why the task cannot run: nothing chosen, or the chosen model is no longer usable. */
export const AI_MODEL_UNAVAILABLE_REASONS = [
  'no_model_selected',
  'credential_not_qualified',
  'personal_model_missing',
] as const;
export const AiModelUnavailableReason = z.enum(AI_MODEL_UNAVAILABLE_REASONS);
export type AiModelUnavailableReason = z.infer<typeof AiModelUnavailableReason>;

/** EF-1 — one selectable model. Only qualified personal models reach this list (CA-1). */
export const AiModelOption = z.object({
  modelId: z.string().min(1).max(200),
  label: z.string().min(1).max(120),
  credentialId: Uuid,
  provider: AiCredentialProvider,
  providerLabel: z.string().min(1).max(80),
  outsideEu: z.boolean(),
  qualificationStatus: z.enum(['qualified', 'unqualified']),
});
export type AiModelOption = z.infer<typeof AiModelOption>;

export const AI_MODEL_OPTIONS_MAX = 500;
/**
 * EF-1, EF-2 — one row of « Modèle par tâche ». `modelId` is the model the learner chose (or the
 * stored choice when it became unusable, CL-3) and is `null` while nothing is chosen; the pills
 * derive from `outsideEu` and `available`, never from the client.
 */
export const AiTaskModelState = z.object({
  task: AiModelsTaskId,
  requiredCapabilities: z.array(AiTaskCapabilityId).max(AI_TASK_CAPABILITY_IDS.length),
  modelId: z.string().min(1).max(200).nullable(),
  credentialId: Uuid.nullable(),
  /** `null` when nothing is chosen or when the stored personal key was deleted. */
  provider: AiCredentialProvider.nullable(),
  providerLabel: z.string().min(1).max(80).nullable(),
  outsideEu: z.boolean(),
  available: z.boolean(),
  unavailableReason: AiModelUnavailableReason.nullable(),
  options: z.array(AiModelOption).max(AI_MODEL_OPTIONS_MAX),
});
export type AiTaskModelState = z.infer<typeof AiTaskModelState>;

/** CL-5 — the faulty stage, kept on the card without exposing a prompt or a key. */
export const AiProviderFailure = z.object({
  step: z.enum(['connection', 'tools', 'structured', 'bricks']),
  brickType: z.string().min(1).max(64).nullable(),
});
export type AiProviderFailure = z.infer<typeof AiProviderFailure>;

/** BR-SET-05, BR-IA-03 — one provider card: a personal key, always masked. */
export const AiProviderCard = z.object({
  id: Uuid,
  provider: AiCredentialProvider,
  providerLabel: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  keyMasked: z.string().max(96).nullable(),
  status: AiProviderStatus,
  outsideEu: z.boolean(),
  dataNote: z.string().min(1).max(300),
  models: z.array(z.string().min(1).max(200)).max(AI_MODEL_OPTIONS_MAX),
  qualifiedAt: IsoDateTime.nullable(),
  failure: AiProviderFailure.nullable(),
});
export type AiProviderCard = z.infer<typeof AiProviderCard>;

/** EF-1, EF-2 — everything the tab renders, read in one RLS transaction. */
export const AiModelsState = z.object({
  tasks: z.array(AiTaskModelState).length(AI_MODELS_TASK_IDS.length),
  providers: z.array(AiProviderCard).max(10),
  /** Last write of a task choice, or the current instant when nothing was chosen (ET-2). */
  updatedAt: IsoDateTime,
});
export type AiModelsState = z.infer<typeof AiModelsState>;

const MODEL_ID_MAX_LENGTH = 200;

/**
 * ET-1, EF-2 — one PATCH assigns a model of an owned qualified key to a task, or clears the choice
 * of a task. There is no provided model to fall back on: a cleared task is unavailable.
 */
export const AiModelsUpdateBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign'),
    task: AiModelsTaskId,
    modelId: z.string().trim().min(1).max(MODEL_ID_MAX_LENGTH),
    credentialId: Uuid,
  }),
  z.object({ action: z.literal('clear'), task: AiModelsTaskId }),
]);
export type AiModelsUpdateBody = z.infer<typeof AiModelsUpdateBody>;

export const meAiModelsGet = defineRoute({
  id: 'me.ai.models.get',
  method: 'GET',
  path: '/api/v1/me/ai/models',
  auth: 'user',
  output: AiModelsState,
  successStatus: 200,
  summary:
    'État de l’onglet Modèles d’IA : cinq tâches, modèles qualifiés et fournisseurs masqués (SPEC-709).',
  errors: ['UNAUTHENTICATED'],
});

export const meAiModelsUpdate = defineRoute({
  id: 'me.ai.models.update',
  method: 'PATCH',
  path: '/api/v1/me/ai/models',
  auth: 'user',
  body: AiModelsUpdateBody,
  output: AiModelsState,
  successStatus: 200,
  idempotent: true,
  summary:
    'Affecte un modèle qualifié à une tâche ou retire le choix d’une tâche, sans supprimer les clés (SPEC-709).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'AI_MODEL_NOT_QUALIFIED',
    'IDEMPOTENCY_KEY_REQUIRED',
    'UNAUTHENTICATED',
  ],
});

export const parametresModelesRoutes = { meAiModelsGet, meAiModelsUpdate } as const;
