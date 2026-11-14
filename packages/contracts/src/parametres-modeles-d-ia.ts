import { z } from 'zod';

import { UsdAmount } from './ai';
import { AiCredentialProvider } from './ai-credentials';
import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the « Modèles d'IA » tab of the settings screen (SPEC-709 EF-1 to EF-5, ET-1 to
// ET-5; BR-SET-05, BR-IA-02 to BR-IA-04). The state is read with the learner's RLS client: no
// provider key, ciphertext, prompt or qualification secret ever crosses this boundary (BR-IA-03).
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

/** EF-2 — « Par défaut » is the provided model of the task; « Personnalisé » anything else. */
export const AI_MODEL_SELECTIONS = ['default', 'custom'] as const;
export const AiModelSelection = z.enum(AI_MODEL_SELECTIONS);
export type AiModelSelection = z.infer<typeof AiModelSelection>;

/** EF-1 — the option comes from the provided AI or from a personal key. */
export const AI_MODEL_ORIGINS = ['provided', 'personal'] as const;
export const AiModelOrigin = z.enum(AI_MODEL_ORIGINS);
export type AiModelOrigin = z.infer<typeof AiModelOrigin>;

/** BR-SET-05 — « Qualifié », « Non qualifié »; `pending` is the asynchronous battery (ET-4). */
export const AI_PROVIDER_STATUSES = ['qualified', 'unqualified', 'pending'] as const;
export const AiProviderStatus = z.enum(AI_PROVIDER_STATUSES);
export type AiProviderStatus = z.infer<typeof AiProviderStatus>;

/** CL-3 — why the resolved task model cannot run, without any paid fallback. */
export const AI_MODEL_UNAVAILABLE_REASONS = [
  'credential_not_qualified',
  'personal_model_missing',
] as const;
export const AiModelUnavailableReason = z.enum(AI_MODEL_UNAVAILABLE_REASONS);
export type AiModelUnavailableReason = z.infer<typeof AiModelUnavailableReason>;

/** EF-1 — one selectable model. Only qualified personal models reach this list (CA-1). */
export const AiModelOption = z.object({
  modelId: z.string().min(1).max(200),
  label: z.string().min(1).max(120),
  origin: AiModelOrigin,
  credentialId: Uuid.nullable(),
  provider: AiCredentialProvider,
  providerLabel: z.string().min(1).max(80),
  outsideEu: z.boolean(),
});
export type AiModelOption = z.infer<typeof AiModelOption>;

export const AI_MODEL_OPTIONS_MAX = 50;

/**
 * EF-1, EF-2 — one row of « Modèle par tâche ». `modelId` is the model that resolution would use
 * (or the stored choice when it became unusable, CL-3); the pills derive from `selection` and
 * `outsideEu`, never from the client.
 */
export const AiTaskModelState = z.object({
  task: AiModelsTaskId,
  requiredCapabilities: z.array(AiTaskCapabilityId).max(AI_TASK_CAPABILITY_IDS.length),
  defaultModelId: z.string().min(1).max(200),
  selection: AiModelSelection,
  modelId: z.string().min(1).max(200),
  origin: AiModelOrigin,
  credentialId: Uuid.nullable(),
  /** `null` when the stored personal key was deleted: the row still shows the refused model. */
  provider: AiCredentialProvider.nullable(),
  providerLabel: z.string().min(1).max(80),
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

/** BR-SET-05, BR-IA-03 — one provider card: provided AI or personal key, always masked. */
export const AiProviderCard = z.object({
  /** `null` for the provided Anthropic card (BR-IA-01). */
  id: Uuid.nullable(),
  origin: AiModelOrigin,
  provider: AiCredentialProvider,
  providerLabel: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  keyMasked: z.string().max(96).nullable(),
  status: AiProviderStatus,
  outsideEu: z.boolean(),
  dataNote: z.string().min(1).max(300),
  models: z.array(z.string().min(1).max(200)).max(10),
  qualifiedAt: IsoDateTime.nullable(),
  failure: AiProviderFailure.nullable(),
});
export type AiProviderCard = z.infer<typeof AiProviderCard>;

/**
 * ADR-0012, BR-IA-07 — the guard shown with the tab: a personal key never consumes the provided
 * allowance. The amounts come from configuration; the actual spend stays in `/me/ai/usage`
 * (SPEC-507), so no second source of truth is created here.
 */
export const AiModelsGuard = z.object({
  personalKeysExemptFromCap: z.literal(true),
  managedDailyCapUsd: UsdAmount,
  alertThresholdPercent: z.int().min(1).max(100),
});
export type AiModelsGuard = z.infer<typeof AiModelsGuard>;

/** EF-1, EF-2 — everything the tab renders, read in one RLS transaction. */
export const AiModelsState = z.object({
  tasks: z.array(AiTaskModelState).length(AI_MODELS_TASK_IDS.length),
  providers: z.array(AiProviderCard).max(11),
  guard: AiModelsGuard,
  /** Last write of a task choice, or the current instant when nothing was chosen (ET-2). */
  updatedAt: IsoDateTime,
});
export type AiModelsState = z.infer<typeof AiModelsState>;

const MODEL_ID_MAX_LENGTH = 200;

/**
 * ET-1, EF-2 — one PATCH saves one task choice or removes every personal choice. Selecting the
 * provided model of the task is the per-task « revenir au défaut » and stores no row; the whole
 * reset removes the rows in one transaction and never deletes a key (BR-SET-05).
 */
export const AiModelsUpdateBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign'),
    task: AiModelsTaskId,
    modelId: z.string().trim().min(1).max(MODEL_ID_MAX_LENGTH),
    /** `null` or absent for a provided model; the owned credential for a personal model. */
    credentialId: Uuid.nullable().optional(),
  }),
  z.object({ action: z.literal('reset') }),
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
    'État de l’onglet Modèles d’IA : cinq tâches, modèles qualifiés, fournisseurs masqués et garde-fou (SPEC-709).',
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
    'Affecte un modèle qualifié à une tâche ou revient aux modèles fournis, sans supprimer les clés (SPEC-709).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'AI_MODEL_NOT_QUALIFIED',
    'IDEMPOTENCY_KEY_REQUIRED',
    'UNAUTHENTICATED',
  ],
});

export const parametresModelesRoutes = { meAiModelsGet, meAiModelsUpdate } as const;
