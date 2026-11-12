import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the private file service (SPEC-206 ET-1, docs/architecture/api.md §2). Limits are
// never written here: the service reads them from `@learny/config` (BR-APP-02, SPEC-009) and
// answers a business code, not a generic validation error, when a bound is exceeded.

/** ADR-0039, BR-APP-10 — label of a citation whose source was deleted. */
export const DELETED_SOURCE_LABEL = 'source supprimée';

/** Kinds of file an upload can carry in V1; audio and video stay V2 (ADR-0008, SPEC-206 ET-7). */
export const UPLOAD_FILE_KINDS = ['pdf', 'image'] as const;
export const UploadFileKind = z.enum(UPLOAD_FILE_KINDS);
export type UploadFileKind = z.infer<typeof UploadFileKind>;

/** Processing status of a contribution (BR-APP-07). */
export const ResourceStatus = z.enum(['queued', 'processing', 'ready', 'failed']);
export type ResourceStatus = z.infer<typeof ResourceStatus>;

export const ChapterParams = z.object({ cid: Uuid });
export const ResourceParams = z.object({ rid: Uuid });

/**
 * EF-1 — what the browser announces before sending a file: its name, its declared type and its
 * size in bytes. The declared values only drive the early refusal and the quota reservation; the
 * finalization measures the real bytes (ET-2).
 */
export const CreateUploadBody = z.object({
  fileName: z.string().min(1).max(200),
  mime: z.string().min(1).max(127),
  sizeBytes: z.number().int().min(1),
  title: z.string().trim().min(1).max(200).optional(),
});
export type CreateUploadBody = z.infer<typeof CreateUploadBody>;

/** EF-1 — the signed URL targets `<userId>/<resourceId>/<name>` only and lasts ten minutes. */
export const CreateUploadOutput = z.object({
  resourceId: Uuid,
  uploadUrl: z.url(),
  expiresAt: IsoDateTime,
});
export type CreateUploadOutput = z.infer<typeof CreateUploadOutput>;

/** EF-2 — state of a file resource once its real bytes have been measured. */
export const FinalizedResource = z.object({
  id: Uuid,
  kind: UploadFileKind,
  status: ResourceStatus,
  mime: z.string(),
  sizeBytes: z.number().int().min(0),
  pages: z.number().int().min(1).nullable(),
});
export type FinalizedResource = z.infer<typeof FinalizedResource>;

const NoteBody = z.object({
  kind: z.literal('note'),
  title: z.string().trim().min(1).max(200),
  /** Text or Markdown; the 100 000-character bound is a business rule answered as a code. */
  text: z.string().min(1),
});

const WebBody = z.object({
  kind: z.literal('web'),
  url: z.url({ protocol: /^https$/ }).max(2048),
  title: z.string().trim().min(1).max(200).optional(),
});

const YoutubeBody = z.object({
  kind: z.literal('youtube'),
  url: z.url({ protocol: /^https$/ }).max(2048),
  title: z.string().trim().min(1).max(200).optional(),
});

/** EF-3 — a contribution without blob: a note, a web page or a YouTube video. */
export const CreateResourceBody = z.discriminatedUnion('kind', [NoteBody, WebBody, YoutubeBody]);
export type CreateResourceBody = z.infer<typeof CreateResourceBody>;

export const CreatedResource = z.object({
  id: Uuid,
  kind: z.enum(['note', 'web', 'youtube']),
  status: ResourceStatus,
  title: z.string(),
});
export type CreatedResource = z.infer<typeof CreatedResource>;

/** EF-4 — read URL of a finalized file, valid ten minutes and never stored. */
export const ReadUrlOutput = z.object({ url: z.url(), expiresAt: IsoDateTime });
export type ReadUrlOutput = z.infer<typeof ReadUrlOutput>;

export const uploadsCreate = defineRoute({
  id: 'uploads.create',
  method: 'POST',
  path: '/api/v1/chapters/:cid/uploads',
  auth: 'user',
  params: ChapterParams,
  body: CreateUploadBody,
  output: CreateUploadOutput,
  successStatus: 201,
  summary:
    'Réserve un apport fichier et renvoie une URL d’envoi signée de dix minutes (SPEC-206). La clé Idempotency-Key est obligatoire.',
  errors: [
    'VALIDATION_FAILED',
    'IDEMPOTENCY_KEY_REQUIRED',
    'IDEMPOTENCY_KEY_REUSED',
    'FORBIDDEN',
    'NOT_FOUND',
    'UPLOAD_TOO_LARGE',
    'UNSUPPORTED_TYPE',
    'QUOTA_EXCEEDED',
  ],
});

export const resourcesCreate = defineRoute({
  id: 'resources.create',
  method: 'POST',
  path: '/api/v1/chapters/:cid/resources',
  auth: 'user',
  params: ChapterParams,
  body: CreateResourceBody,
  output: CreatedResource,
  successStatus: 201,
  idempotent: true,
  summary: 'Crée un apport sans fichier : note, page web ou vidéo YouTube (SPEC-206).',
  errors: [
    'VALIDATION_FAILED',
    'FORBIDDEN',
    'NOT_FOUND',
    'UPLOAD_TOO_LARGE',
    'QUOTA_EXCEEDED',
    'IDEMPOTENCY_IN_PROGRESS',
  ],
});

export const resourcesFinalize = defineRoute({
  id: 'resources.finalize',
  method: 'POST',
  path: '/api/v1/resources/:rid/finalize',
  auth: 'user',
  params: ResourceParams,
  output: FinalizedResource,
  successStatus: 200,
  summary:
    'Mesure le fichier réellement envoyé (type, octets, pages) et accepte définitivement l’apport (SPEC-206).',
  errors: [
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'UPLOAD_TOO_LARGE',
    'UNSUPPORTED_TYPE',
    'QUOTA_EXCEEDED',
    'UPLOAD_INCOMPLETE',
    'SERVICE_UNAVAILABLE',
  ],
});

export const resourcesReadUrl = defineRoute({
  id: 'resources.readUrl',
  method: 'GET',
  path: '/api/v1/resources/:rid/url',
  auth: 'user',
  params: ResourceParams,
  output: ReadUrlOutput,
  successStatus: 200,
  summary: 'Renvoie une URL de lecture signée de dix minutes pour un apport fichier (SPEC-206).',
  errors: ['FORBIDDEN', 'NOT_FOUND', 'SERVICE_UNAVAILABLE'],
});

export const resourcesDelete = defineRoute({
  id: 'resources.delete',
  method: 'DELETE',
  path: '/api/v1/resources/:rid',
  auth: 'user',
  params: ResourceParams,
  output: null,
  successStatus: 204,
  summary:
    'Supprime un apport : fichier et passages retirés, citations conservées « source supprimée » (SPEC-206).',
  errors: ['FORBIDDEN', 'NOT_FOUND'],
});

export const uploadsRoutes = {
  uploadsCreate,
  resourcesCreate,
  resourcesFinalize,
  resourcesReadUrl,
  resourcesDelete,
} as const;

// Demonstration of the upload limits (SPEC-206 EF-7): simulated sizes, never a real file.
export const SIMULATED_UPLOAD_CASES = [
  'pdf-limit',
  'pdf-too-many-pages',
  'image-limit',
  'image-too-large',
  'executable-as-png',
  'note-too-long',
  'chapter-full',
  'quota-reached',
] as const;
export const SimulatedUploadCase = z.enum(SIMULATED_UPLOAD_CASES);
export type SimulatedUploadCase = z.infer<typeof SimulatedUploadCase>;

export const SimulateUploadBody = z.object({ case: SimulatedUploadCase });
export type SimulateUploadBody = z.infer<typeof SimulateUploadBody>;

export const SimulateUploadOutput = z.object({
  case: SimulatedUploadCase,
  accepted: z.literal(true),
  kind: UploadFileKind,
  sizeBytes: z.number().int().min(0),
  pages: z.number().int().min(1).nullable(),
});
export type SimulateUploadOutput = z.infer<typeof SimulateUploadOutput>;

export const devUploadSimulation = defineRoute({
  id: 'dev.uploadSimulation',
  method: 'POST',
  path: '/api/v1/dev/sdd/uploads',
  auth: 'user',
  body: SimulateUploadBody,
  output: SimulateUploadOutput,
  successStatus: 200,
  summary: 'Route de démonstration : essais simulés des limites d’envoi (SPEC-206).',
  errors: ['VALIDATION_FAILED', 'UPLOAD_TOO_LARGE', 'UNSUPPORTED_TYPE', 'QUOTA_EXCEEDED'],
});

export const uploadsDevRoutes = { devUploadSimulation } as const;
