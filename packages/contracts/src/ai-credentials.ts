import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the personal AI keys (SPEC-505 EF-1 to EF-6, §9). The DTO never contains `apiKey`,
// `encryptedKey` or a raw qualification report: only the mask, the region flag and the note.

export const AI_CREDENTIAL_PROVIDERS = [
  'anthropic',
  'openai',
  'mistral',
  'deepseek',
  'openai_compatible',
  'local',
] as const;
export const AiCredentialProvider = z.enum(AI_CREDENTIAL_PROVIDERS);
export type AiCredentialProvider = z.infer<typeof AiCredentialProvider>;

export const AI_CREDENTIAL_STATUSES = ['untested', 'qualified', 'failed'] as const;
export const AiCredentialStatus = z.enum(AI_CREDENTIAL_STATUSES);
export type AiCredentialStatus = z.infer<typeof AiCredentialStatus>;

/** EF-5 — model identifier accepted by the providers (1..120 characters). */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/-]+$/;
export const MODEL_ID_MAX_LENGTH = 120;
export const MODEL_IDS_MAX = 10;
export const API_KEY_MIN_LENGTH = 8;
export const API_KEY_MAX_LENGTH = 512;
export const BASE_URL_MAX_LENGTH = 2048;
export const CREDENTIAL_LIMIT = 10;
export const CREDENTIAL_LIMIT_MESSAGE =
  'Vous avez atteint 10 fournisseurs enregistrés. Supprimez-en un pour en ajouter un autre.';

/** EF-1 — creation body. The asynchronous public-URL check happens in the service (ET-6). */
export const AiCredentialCreateBody = z
  .object({
    provider: AiCredentialProvider,
    label: z.string().trim().min(1).max(80).optional(),
    modelIds: z
      .array(
        z.string().min(1).max(MODEL_ID_MAX_LENGTH).regex(MODEL_ID_PATTERN, {
          message: 'un identifiant de modèle ne contient que lettres, chiffres, `. _ : / -`',
        }),
      )
      .min(1)
      .max(MODEL_IDS_MAX),
    baseUrl: z.string().trim().min(1).max(BASE_URL_MAX_LENGTH).optional(),
    apiKey: z
      .string()
      .min(API_KEY_MIN_LENGTH)
      .max(API_KEY_MAX_LENGTH)
      .regex(/^\S+$/, { message: 'la clé ne contient aucun blanc' })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (new Set(value.modelIds).size !== value.modelIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['modelIds'],
        message: 'les identifiants de modèle doivent être uniques',
      });
    }
    const needsKey = value.provider !== 'local';
    if (needsKey && value.apiKey === undefined) {
      ctx.addIssue({ code: 'custom', path: ['apiKey'], message: 'la clé d’API est obligatoire' });
    }
    const needsUrl = value.provider === 'openai_compatible' || value.provider === 'local';
    if (needsUrl && value.baseUrl === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message: 'l’adresse du point d’accès est obligatoire pour ce fournisseur',
      });
    }
    if (!needsUrl && value.baseUrl !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message: 'ce fournisseur n’accepte pas d’adresse personnalisée',
      });
    }
  });
export type AiCredentialCreateBody = z.infer<typeof AiCredentialCreateBody>;

/** EF-4 — the only shape a browser receives. */
export const CredentialDto = z.object({
  id: Uuid,
  provider: AiCredentialProvider,
  providerLabel: z.string().min(1),
  label: z.string().min(1).max(80),
  baseUrl: z.string().max(BASE_URL_MAX_LENGTH).nullable(),
  modelIds: z.array(z.string()).max(MODEL_IDS_MAX),
  keyMasked: z.string().nullable(),
  status: AiCredentialStatus,
  outsideEu: z.boolean(),
  dataNote: z.string(),
  qualifiedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type CredentialDto = z.infer<typeof CredentialDto>;

export const CredentialListDto = z.object({
  items: z.array(CredentialDto).max(CREDENTIAL_LIMIT),
});
export type CredentialListDto = z.infer<typeof CredentialListDto>;

export const CredentialParams = z.object({ id: Uuid });

export const meAiCredentialsCreate = defineRoute({
  id: 'me.ai.credentials.create',
  method: 'POST',
  path: '/api/v1/me/ai/credentials',
  auth: 'user',
  body: AiCredentialCreateBody,
  output: CredentialDto,
  successStatus: 201,
  idempotent: true,
  rateLimit: 'ai',
  validationStatus: 422,
  summary: 'Enregistre une clé personnelle chiffrée auprès d’un fournisseur d’IA (SPEC-505).',
  errors: [
    'VALIDATION_FAILED',
    'LOCAL_MODELS_DISABLED',
    'CREDENTIAL_LIMIT_REACHED',
    'CONFLICT',
    'URL_INVALID',
    'URL_BLOCKED_HOST',
  ],
});

export const meAiCredentialsList = defineRoute({
  id: 'me.ai.credentials.list',
  method: 'GET',
  path: '/api/v1/me/ai/credentials',
  auth: 'user',
  output: CredentialListDto,
  successStatus: 200,
  rateLimit: 'ai',
  summary: 'Liste les identifiants d’IA de l’apprenant, du plus ancien au plus récent (SPEC-505).',
  errors: [],
});

export const meAiCredentialsDelete = defineRoute({
  id: 'me.ai.credentials.delete',
  method: 'DELETE',
  path: '/api/v1/me/ai/credentials/:id',
  auth: 'user',
  params: CredentialParams,
  output: null,
  successStatus: 204,
  rateLimit: 'ai',
  summary:
    'Supprime une clé personnelle et les affectations de tâches qui la référencent (SPEC-505).',
  errors: ['NOT_FOUND'],
});

export const aiCredentialRoutes = {
  meAiCredentialsCreate,
  meAiCredentialsList,
  meAiCredentialsDelete,
} as const;
