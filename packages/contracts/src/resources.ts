import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { ProgrammeModuleStatus } from './programme';
import { ResourceStatus } from './uploads';

// Contracts of the module and apports screen (SPEC-607 EF-1 to EF-5, ET-1, ET-3; BR-APP-01 to
// BR-APP-10, BR-NAV-04). The six V1 kinds are the user-facing offers; `exam_guide` marks a PDF or a
// web page as an exam guide (ADR-0008) and is never a free-standing creation form. Audio and video
// files stay V2 and are therefore absent from every V1 offer.

export const RESOURCE_KINDS_V1 = [
  'note',
  'pdf',
  'web',
  'youtube',
  'image',
  'exam_guide',
] as const;
export const RESOURCE_KINDS_V2 = ['audio', 'video'] as const;
export const ALL_RESOURCE_KINDS = [...RESOURCE_KINDS_V1, ...RESOURCE_KINDS_V2] as const;

export const ResourceKind = z.enum(ALL_RESOURCE_KINDS);
export type ResourceKind = z.infer<typeof ResourceKind>;

/** BR-APP-01 — what the V1 interface offers. `audio` and `video` are deliberately absent. */
export const V1_RESOURCE_OFFERS = ['pdf', 'image', 'web', 'youtube', 'note', 'exam_guide'] as const;
export type V1ResourceOffer = (typeof V1_RESOURCE_OFFERS)[number];

export const ModuleParams = z.object({ mid: Uuid });
export type ModuleParams = z.infer<typeof ModuleParams>;

export const SuggestionParams = z.object({ rid: Uuid });

/** SCR-06 selection: the chapter in `?chapitre=`, absent on the first visit. */
export const ModuleScreenQuery = z.object({ chapitre: Uuid.optional() });
export type ModuleScreenQuery = z.infer<typeof ModuleScreenQuery>;

/** BR-APP-04 — one chapter and its personal contributions status. */
export const ModuleChapterItem = z.strictObject({
  id: Uuid,
  position: z.number().int().min(1),
  title: z.string().min(1).max(160),
  contributionsStatus: z.enum(['in_progress', 'done']),
  doneAt: IsoDateTime.nullable(),
  resourceCount: z.number().int().min(0),
});
export type ModuleChapterItem = z.infer<typeof ModuleChapterItem>;

/** BR-APP-07 — one learner contribution with its processing status and readable failure. */
export const ResourceListItem = z.strictObject({
  id: Uuid,
  kind: ResourceKind,
  title: z.string().min(1).max(200),
  status: ResourceStatus,
  errorCode: z.string().max(64).nullable(),
  errorMessage: z.string().max(1000).nullable(),
  sizeBytes: z.number().int().min(0).nullable(),
  pages: z.number().int().min(1).nullable(),
  url: z.url().max(2048).nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ResourceListItem = z.infer<typeof ResourceListItem>;

/** BR-APP-05 — a pending tutor suggestion: title, URL and reason. */
export const ResourceSuggestionItem = z.strictObject({
  id: Uuid,
  title: z.string().min(1).max(200),
  url: z.url().max(2048),
  reason: z.string().min(1).max(500),
  createdAt: IsoDateTime,
});
export type ResourceSuggestionItem = z.infer<typeof ResourceSuggestionItem>;

export const ModuleScreen = z.strictObject({
  formation: z.strictObject({
    id: Uuid,
    title: z.string().min(1).max(200),
  }),
  module: z.strictObject({
    id: Uuid,
    position: z.number().int().min(1),
    positionTotal: z.number().int().min(1),
    title: z.string().min(1).max(200),
    plannedStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    plannedEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    threshold: z.number().int().min(0).max(100),
    status: ProgrammeModuleStatus,
  }),
  chapters: z.array(ModuleChapterItem).max(1000),
  selectedChapterId: Uuid,
  resources: z.array(ResourceListItem).max(100),
  suggestions: z.array(ResourceSuggestionItem).max(100),
  counts: z.strictObject({
    chaptersDone: z.number().int().min(0),
    chaptersTotal: z.number().int().min(0),
    chapterResources: z.number().int().min(0),
    chapterResourceLimit: z.number().int().min(1),
    storageUsedBytes: z.number().int().min(0),
    storageQuotaBytes: z.number().int().min(1),
  }),
  allChaptersDone: z.boolean(),
});
export type ModuleScreen = z.infer<typeof ModuleScreen>;

export const moduleScreen = defineRoute({
  id: 'modules.screen',
  method: 'GET',
  path: '/api/v1/modules/:mid',
  auth: 'user',
  params: ModuleParams,
  query: ModuleScreenQuery,
  output: ModuleScreen,
  successStatus: 200,
  summary:
    'Lit un module, ses chapitres, les apports et suggestions du chapitre choisi (SPEC-607).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND'],
});

/** BR-APP-04 — declare a chapter finished, or reopen it. */
export const CompleteChapterBody = z.object({ done: z.boolean().default(true) });
export type CompleteChapterBody = z.infer<typeof CompleteChapterBody>;

export const ChapterCompletion = z.strictObject({
  chapterId: Uuid,
  moduleId: Uuid,
  contributionsStatus: z.enum(['in_progress', 'done']),
  doneAt: IsoDateTime.nullable(),
  chaptersDone: z.number().int().min(0),
  chaptersTotal: z.number().int().min(0),
  generationRequested: z.boolean(),
});
export type ChapterCompletion = z.infer<typeof ChapterCompletion>;

export const chapterComplete = defineRoute({
  id: 'chapters.complete',
  method: 'POST',
  path: '/api/v1/chapters/:cid/complete',
  auth: 'user',
  params: z.object({ cid: Uuid }),
  body: CompleteChapterBody,
  output: ChapterCompletion,
  successStatus: 200,
  idempotent: true,
  summary:
    'Déclare les apports du chapitre terminés (ou les rouvre) et demande la génération quand le module est complet (SPEC-607).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'FORBIDDEN', 'CONFLICT'],
});

export const GenerateCourseOutput = z.strictObject({
  moduleId: Uuid,
  requested: z.literal(true),
});
export type GenerateCourseOutput = z.infer<typeof GenerateCourseOutput>;

export const moduleGenerateCourse = defineRoute({
  id: 'modules.generateCourse',
  method: 'POST',
  path: '/api/v1/modules/:mid/course-generation',
  auth: 'user',
  params: ModuleParams,
  output: GenerateCourseOutput,
  successStatus: 202,
  idempotent: true,
  summary:
    'Demande la génération du cours maintenant, même si un chapitre reste ouvert (SPEC-607).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'FORBIDDEN', 'CONFLICT'],
});

/** BR-APP-10 — rename a contribution; the passages and citations are kept. */
export const RenameResourceBody = z.object({
  title: z.string().trim().min(1).max(200),
  /** CL-2 — the version read by the client: a stale value is refused with the current state. */
  expectedUpdatedAt: IsoDateTime.optional(),
});
export type RenameResourceBody = z.infer<typeof RenameResourceBody>;

export const RenameResourceOutput = z.strictObject({
  id: Uuid,
  title: z.string().min(1).max(200),
  status: ResourceStatus,
  updatedAt: IsoDateTime,
});
export type RenameResourceOutput = z.infer<typeof RenameResourceOutput>;

export const resourcesRename = defineRoute({
  id: 'resources.rename',
  method: 'PATCH',
  path: '/api/v1/resources/:rid',
  auth: 'user',
  params: z.object({ rid: Uuid }),
  body: RenameResourceBody,
  output: RenameResourceOutput,
  successStatus: 200,
  idempotent: true,
  summary: 'Renomme un apport sans toucher à ses passages ni à ses citations (SPEC-607).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT'],
});

/** BR-APP-07 — retry a failed contribution. */
export const RetryResourceOutput = z.strictObject({
  id: Uuid,
  status: ResourceStatus,
  errorCode: z.string().max(64).nullable(),
  errorMessage: z.string().max(1000).nullable(),
  updatedAt: IsoDateTime,
});
export type RetryResourceOutput = z.infer<typeof RetryResourceOutput>;

export const resourcesRetry = defineRoute({
  id: 'resources.retry',
  method: 'POST',
  path: '/api/v1/resources/:rid/retry',
  auth: 'user',
  params: z.object({ rid: Uuid }),
  output: RetryResourceOutput,
  successStatus: 200,
  idempotent: true,
  summary: 'Relance le traitement d’un apport en échec, une seule fois par tentative (SPEC-607).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT'],
});

/** BR-APP-05 — the learner imports or dismisses a tutor suggestion, never silently. */
export const SuggestionDecisionOutput = z.strictObject({
  id: Uuid,
  status: z.enum(['imported', 'dismissed']),
  resourceId: Uuid.nullable(),
});
export type SuggestionDecisionOutput = z.infer<typeof SuggestionDecisionOutput>;

export const suggestionsImport = defineRoute({
  id: 'suggestions.import',
  method: 'POST',
  path: '/api/v1/resources/:rid/import',
  auth: 'user',
  params: SuggestionParams,
  output: SuggestionDecisionOutput,
  successStatus: 200,
  idempotent: true,
  summary: 'Importe une suggestion du tuteur comme apport du chapitre (SPEC-607).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT'],
});

export const suggestionsDismiss = defineRoute({
  id: 'suggestions.dismiss',
  method: 'POST',
  path: '/api/v1/resources/:rid/dismiss',
  auth: 'user',
  params: SuggestionParams,
  output: SuggestionDecisionOutput,
  successStatus: 200,
  idempotent: true,
  summary: 'Ignore une suggestion du tuteur sans créer d’apport (SPEC-607).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'CONFLICT'],
});

export const moduleRoutes = {
  moduleScreen,
  chapterComplete,
  moduleGenerateCourse,
  resourcesRename,
  resourcesRetry,
  suggestionsImport,
  suggestionsDismiss,
} as const;
