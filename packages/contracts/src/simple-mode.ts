import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of simple mode (SPEC-4001 ET-1, EF-1 to EF-12; ADR-4003). A formation is built from the
// documents the learner deposits instead of a scoping conversation: the same eight operations are
// served by the Python facade and consumed by the web (SPEC-4002) and the mobile app (SPEC-4003).

/** BR-APP-01, ADR-4003 D4 — how a deposited document feeds the programme. */
export const RESOURCE_ROLES = ['course', 'exercises', 'exam_papers', 'other'] as const;
export const ResourceRole = z.enum(RESOURCE_ROLES);
export type ResourceRole = z.infer<typeof ResourceRole>;

/** EF-6 — lifecycle of the single analysis of a simple-mode formation. */
export const SIMPLE_STATUSES = ['collecting', 'analysing', 'proposed', 'failed'] as const;
export const SimpleStatus = z.enum(SIMPLE_STATUSES);
export type SimpleStatus = z.infer<typeof SimpleStatus>;

/** EF-6 — the four ordered steps of the analysis, in display order. */
export const SIMPLE_STEP_KEYS = ['read', 'structure', 'practice', 'programme'] as const;
export const SimpleStepKey = z.enum(SIMPLE_STEP_KEYS);
export type SimpleStepKey = z.infer<typeof SimpleStepKey>;

export const SIMPLE_STEP_STATES = ['todo', 'running', 'done'] as const;
export const SimpleStepState = z.enum(SIMPLE_STEP_STATES);
export type SimpleStepState = z.infer<typeof SimpleStepState>;

/** EF-12 — progressive generation state of a module after validation. */
export const SIMPLE_GENERATION_STATES = ['acquired', 'ready', 'generating', 'queued'] as const;
export const SimpleGenerationState = z.enum(SIMPLE_GENERATION_STATES);
export type SimpleGenerationState = z.infer<typeof SimpleGenerationState>;

/** Document kinds a simple-mode source can carry (EF-2, EF-3). */
export const SIMPLE_SOURCE_KINDS = ['pdf', 'image', 'web', 'youtube'] as const;
export const SimpleSourceKind = z.enum(SIMPLE_SOURCE_KINDS);
export type SimpleSourceKind = z.infer<typeof SimpleSourceKind>;

export const SimpleStep = z
  .strictObject({
    key: SimpleStepKey,
    state: SimpleStepState,
    detail: z.string().max(500).nullable(),
  })
  .describe('Une étape de l’analyse, avec son détail lisible.');
export type SimpleStep = z.infer<typeof SimpleStep>;

export const SimpleChapterFound = z
  .strictObject({ position: z.number().int().min(1), title: z.string().min(1).max(160) })
  .describe('Une section détectée dans le document de cours.');
export type SimpleChapterFound = z.infer<typeof SimpleChapterFound>;

export const SimpleSource = z
  .strictObject({
    resourceId: Uuid,
    title: z.string().min(1).max(200),
    kind: SimpleSourceKind,
    role: ResourceRole,
    pages: z.number().int().min(1).nullable(),
    status: z.enum(['queued', 'processing', 'ready', 'failed']),
  })
  .describe('Un document déposé, son rôle et son état de traitement.');
export type SimpleSource = z.infer<typeof SimpleSource>;

export const SimpleGenerationModule = z
  .strictObject({
    moduleId: Uuid,
    position: z.number().int().min(1),
    title: z.string().min(1).max(160),
    state: SimpleGenerationState,
  })
  .describe('État de génération d’un module validé (EF-12).');
export type SimpleGenerationModule = z.infer<typeof SimpleGenerationModule>;

export const SimpleError = z
  .strictObject({ code: z.string().min(1), message: z.string().min(1) })
  .describe('Erreur de l’analyse, affichée avec son renvoi vers l’action de reprise (CL-3).');
export type SimpleError = z.infer<typeof SimpleError>;

/** EF-6 — everything the preparation screen reads, polled every two seconds. */
export const SimpleState = z
  .strictObject({
    formationId: Uuid,
    title: z.string().min(1).max(120),
    status: SimpleStatus,
    motivation: z.string().max(300).nullable(),
    steps: z.array(SimpleStep).length(SIMPLE_STEP_KEYS.length),
    chaptersFound: z.array(SimpleChapterFound).max(100),
    sources: z.array(SimpleSource).max(10),
    error: SimpleError.nullable(),
    proposalVersion: z.number().int().min(1).nullable(),
    /** EF-12 — only once the programme is validated and the generation has started. */
    generation: z.array(SimpleGenerationModule).max(20).optional(),
  })
  .describe('État complet de la préparation d’une formation en mode simple.');
export type SimpleState = z.infer<typeof SimpleState>;

/** EF-1 — the optional motivation of at most 300 characters. */
export const SimpleCreateInput = z
  .strictObject({ motivation: z.string().trim().max(300).optional() })
  .describe('Création d’une formation en mode simple.');
export type SimpleCreateInput = z.input<typeof SimpleCreateInput>;

export const SimpleCreateOutput = SimpleState;
export type SimpleCreateOutput = z.infer<typeof SimpleCreateOutput>;

/** EF-4 — the upload announces the declared type; the finalization measures the real bytes. */
export const SimpleUploadBody = z
  .strictObject({
    fileName: z.string().min(1).max(200),
    mime: z.string().min(1).max(127),
    sizeBytes: z.number().int().min(1),
    role: ResourceRole.optional(),
  })
  .describe('Dépôt d’un fichier de cours : nom, type annoncé, taille et rôle.');
export type SimpleUploadBody = z.infer<typeof SimpleUploadBody>;

export const SimpleUploadOutput = z
  .strictObject({
    resourceId: Uuid,
    uploadUrl: z.url(),
    expiresAt: IsoDateTime,
    role: ResourceRole,
  })
  .describe('URL d’envoi signée et rôle retenu pour le document.');
export type SimpleUploadOutput = z.infer<typeof SimpleUploadOutput>;

/** EF-3 — a web page or a YouTube video, named by its URL only. */
export const SimpleLinkBody = z
  .strictObject({
    url: z.url({ protocol: /^https$/ }).max(2048),
    role: ResourceRole.optional(),
  })
  .describe('Dépôt d’un lien de cours ou d’exercices.');
export type SimpleLinkBody = z.infer<typeof SimpleLinkBody>;

export const SimpleLinkOutput = z
  .strictObject({
    resourceId: Uuid,
    kind: z.enum(['web', 'youtube']),
    title: z.string().min(1).max(200),
    status: z.enum(['queued', 'processing', 'ready', 'failed']),
    role: ResourceRole,
  })
  .describe('Ressource de lien créée avec son rôle deviné ou demandé.');
export type SimpleLinkOutput = z.infer<typeof SimpleLinkOutput>;

/** EF-4 — the learner corrects the guessed role until the analysis starts. */
export const SimpleRoleBody = z.strictObject({ role: ResourceRole });
export type SimpleRoleBody = z.infer<typeof SimpleRoleBody>;

export const SimpleRoleOutput = z.strictObject({ resourceId: Uuid, role: ResourceRole });
export type SimpleRoleOutput = z.infer<typeof SimpleRoleOutput>;

/** EF-10 — creation returns the attempt the answers are posted to, like `quiz.attempts.create`. */
export const DiagnosticCreateOutput = z.strictObject({ attemptId: Uuid });
export type DiagnosticCreateOutput = z.infer<typeof DiagnosticCreateOutput>;

const idParams = z.object({ fid: Uuid });
const resourceParams = z.object({ rid: Uuid });

const SIMPLE_ERRORS = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'FORBIDDEN',
  'CONFLICT',
  'UNAUTHENTICATED',
  'SIMPLE_NOT_SIMPLE',
  'INTERNAL_ERROR',
] as const;

export const simpleModeRoutes = {
  simpleCreate: defineRoute({
    id: 'formations.simple.create',
    legalAcceptance: true,
    method: 'POST',
    path: '/api/v1/formations/simple',
    auth: 'user',
    body: SimpleCreateInput,
    output: SimpleCreateOutput,
    successStatus: 201,
    idempotent: true,
    summary:
      'Crée une formation en mode simple (titre provisoire, motivation facultative) et sa ligne d’analyse au statut collecting (SPEC-4001).',
    errors: [
      ...SIMPLE_ERRORS,
      'IDEMPOTENCY_KEY_REQUIRED',
      'PAYLOAD_TOO_LARGE',
      'FORMATION_LIMIT_REACHED',
    ],
  }),
  simpleGet: defineRoute({
    id: 'formations.simple.get',
    method: 'GET',
    path: '/api/v1/formations/:fid/simple',
    auth: 'user',
    params: idParams,
    output: SimpleState,
    successStatus: 200,
    summary:
      'Renvoie l’état de la préparation : statut, quatre étapes, sections détectées, sources, erreur et version proposée (SPEC-4001).',
    errors: [...SIMPLE_ERRORS],
  }),
  simpleAnalysis: defineRoute({
    id: 'formations.simple.analysis',
    method: 'POST',
    path: '/api/v1/formations/:fid/simple/analysis',
    auth: 'user',
    params: idParams,
    output: SimpleState,
    successStatus: 202,
    idempotent: true,
    summary:
      'Lance l’analyse des documents déposés et met en file l’événement simple.analysis.requested (SPEC-4001).',
    errors: [
      ...SIMPLE_ERRORS,
      'IDEMPOTENCY_KEY_REQUIRED',
      'AI_NOT_CONFIGURED',
      'SIMPLE_NO_COURSE_SOURCE',
    ],
  }),
  simpleUpload: defineRoute({
    id: 'sources.uploads.create',
    method: 'POST',
    path: '/api/v1/formations/:fid/sources/uploads',
    auth: 'user',
    params: idParams,
    body: SimpleUploadBody,
    output: SimpleUploadOutput,
    successStatus: 201,
    idempotent: true,
    summary:
      'Réserve un document de la formation, devine son rôle et renvoie une URL d’envoi signée (SPEC-4001).',
    errors: [
      ...SIMPLE_ERRORS,
      'IDEMPOTENCY_KEY_REQUIRED',
      'SIMPLE_TOO_MANY_SOURCES',
      'SIMPLE_ANALYSIS_LOCKED',
      'UPLOAD_TOO_LARGE',
      'UNSUPPORTED_TYPE',
      'QUOTA_EXCEEDED',
    ],
  }),
  simpleLink: defineRoute({
    id: 'sources.links.create',
    method: 'POST',
    path: '/api/v1/formations/:fid/sources/links',
    auth: 'user',
    params: idParams,
    body: SimpleLinkBody,
    output: SimpleLinkOutput,
    successStatus: 201,
    idempotent: true,
    summary:
      'Dépose un lien de page web ou de vidéo YouTube comme document de la formation (SPEC-4001).',
    errors: [
      ...SIMPLE_ERRORS,
      'IDEMPOTENCY_KEY_REQUIRED',
      'SIMPLE_TOO_MANY_SOURCES',
      'SIMPLE_ANALYSIS_LOCKED',
      'URL_INVALID',
      'YOUTUBE_INVALID_URL',
      'QUOTA_EXCEEDED',
    ],
  }),
  resourceRole: defineRoute({
    id: 'resources.role',
    method: 'PATCH',
    path: '/api/v1/resources/:rid/role',
    auth: 'user',
    params: resourceParams,
    body: SimpleRoleBody,
    output: SimpleRoleOutput,
    successStatus: 200,
    summary: 'Corrige le rôle deviné d’un document avant le lancement de l’analyse (SPEC-4001).',
    errors: [...SIMPLE_ERRORS, 'SIMPLE_ANALYSIS_LOCKED'],
  }),
  diagnosticCreate: defineRoute({
    id: 'diagnostic.create',
    method: 'POST',
    path: '/api/v1/formations/:fid/diagnostic',
    auth: 'user',
    params: idParams,
    output: DiagnosticCreateOutput,
    successStatus: 201,
    idempotent: true,
    summary:
      'Crée le diagnostic global facultatif : une à deux questions par module, générées depuis les résumés (SPEC-4001).',
    errors: [
      ...SIMPLE_ERRORS,
      'IDEMPOTENCY_KEY_REQUIRED',
      'AI_NOT_CONFIGURED',
      'DIAGNOSTIC_ALREADY_DONE',
    ],
  }),
  diagnosticSkip: defineRoute({
    id: 'diagnostic.skip',
    method: 'POST',
    path: '/api/v1/formations/:fid/diagnostic/skip',
    auth: 'user',
    params: idParams,
    output: null,
    successStatus: 204,
    summary: 'Passe le diagnostic : la tentative est abandonnée et rien n’est validé (SPEC-4001).',
    errors: [...SIMPLE_ERRORS, 'DIAGNOSTIC_ALREADY_DONE'],
  }),
} as const;
