import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { CourseCitationMedia } from './course-media';
import { defineRoute } from './define-route';

// Contracts of the course reading interactions (SCR-07, SPEC-609 EF-1 to EF-5, ET-1 to ET-5,
// BR-COU-02, BR-COU-07 to BR-COU-09, BR-COU-11, BR-MEM-09). The read model itself stays in
// `course.ts`; this module adds the four mutations, the controlled source link and the DTOs they
// return. Every mutation runs under the caller's RLS client, an anonymous or foreign resource is a
// 404, and the writes are idempotent through the route `Idempotency-Key` or an explicit request key.

/** BR-COU-08 — monotone reading progress of a chapter and of its course. */
export const CourseReadingProgress = z
  .strictObject({
    chapterPercent: z.number().int().min(0).max(100),
    coursePercent: z.number().int().min(0).max(100),
    updatedAt: IsoDateTime.nullable(),
  })
  .describe('Progression de lecture du chapitre et du cours, monotone et bornée à 0–100.');
export type CourseReadingProgress = z.infer<typeof CourseReadingProgress>;

/** ET-5 — the client reports the sections that were visible, never a raw percentage. */
export const CourseProgressUpdate = z
  .strictObject({
    chapterId: Uuid,
    visibleSectionIds: z.array(Uuid).max(200),
  })
  .describe('Sections du chapitre effectivement visibles pendant la lecture.');
export type CourseProgressUpdate = z.infer<typeof CourseProgressUpdate>;

export const CourseProgressParams = z.object({ cid: Uuid });
export type CourseProgressParams = z.infer<typeof CourseProgressParams>;

export const courseProgress = defineRoute({
  id: 'courses.progress',
  method: 'PUT',
  path: '/api/v1/courses/:cid/progress',
  auth: 'user',
  params: CourseProgressParams,
  body: CourseProgressUpdate,
  output: CourseReadingProgress,
  successStatus: 200,
  idempotent: true,
  rateLimit: 'default',
  summary:
    'Enregistre la progression de lecture d’un chapitre sans jamais la faire reculer (SPEC-609).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'CONFLICT',
    'IDEMPOTENCY_KEY_REQUIRED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
  ],
});

/** BR-COU-07 — correction of the learner's chapter summary. */
export const COURSE_SUMMARY_VERDICTS = ['good', 'partial', 'insufficient'] as const;
export const CourseSummaryVerdict = z.enum(COURSE_SUMMARY_VERDICTS);
export type CourseSummaryVerdict = z.infer<typeof CourseSummaryVerdict>;

export const CourseSummaryFeedback = z
  .strictObject({
    verdict: CourseSummaryVerdict,
    message: z.string().min(1).max(1_000),
    missing: z.array(z.string().min(1).max(200)).max(10),
  })
  .describe('Retour structuré du tuteur : verdict, message et points manquants.');
export type CourseSummaryFeedback = z.infer<typeof CourseSummaryFeedback>;

export const COURSE_SUMMARY_STATUSES = ['corrected', 'deferred'] as const;
export const CourseSummaryStatus = z.enum(COURSE_SUMMARY_STATUSES);
export type CourseSummaryStatus = z.infer<typeof CourseSummaryStatus>;

export const CourseSummaryView = z
  .strictObject({
    id: Uuid,
    chapterId: Uuid,
    courseId: Uuid,
    text: z.string().min(1).max(2_000),
    feedback: CourseSummaryFeedback.nullable(),
    /** CL-4 — `deferred` keeps the text as a draft when the tutor is unavailable. */
    status: CourseSummaryStatus,
    createdAt: IsoDateTime,
  })
  .describe('Résumé de fin de chapitre et correction éventuelle du tuteur.');
export type CourseSummaryView = z.infer<typeof CourseSummaryView>;

export const ChapterSummaryParams = z.object({ cid: Uuid });
export type ChapterSummaryParams = z.infer<typeof ChapterSummaryParams>;

export const ChapterSummaryBody = z
  .strictObject({
    courseId: Uuid,
    text: z.string().trim().min(1).max(2_000),
  })
  .describe('Résumé rédigé avec les mots de l’apprenant (BR-COU-07).');
export type ChapterSummaryBody = z.infer<typeof ChapterSummaryBody>;

export const chapterSummary = defineRoute({
  id: 'chapters.summary',
  method: 'POST',
  path: '/api/v1/chapters/:cid/summary',
  auth: 'user',
  params: ChapterSummaryParams,
  body: ChapterSummaryBody,
  output: CourseSummaryView,
  successStatus: 201,
  idempotent: true,
  rateLimit: 'default',
  summary:
    'Enregistre le résumé d’un chapitre, le fait corriger par le tuteur et signale ce qui manque (SPEC-609).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'CONFLICT',
    'AI_UNAVAILABLE',
    'IDEMPOTENCY_KEY_REQUIRED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
  ],
});

/** BR-COU-09 — correction or completion of one section, versioned and optimistic. */
export const CourseSectionParams = z.object({ sid: Uuid });
export type CourseSectionParams = z.infer<typeof CourseSectionParams>;

export const CourseSectionEditBody = z
  .strictObject({
    expectedVersion: z.number().int().min(1),
    title: z.string().trim().max(200).optional(),
    contentMd: z.string().max(50_000).optional(),
  })
  .refine((value) => value.title !== undefined || value.contentMd !== undefined, {
    message: 'Au moins un champ doit être corrigé.',
    path: ['contentMd'],
  })
  .describe('Correction d’une section à la version attendue par le lecteur.');
export type CourseSectionEditBody = z.infer<typeof CourseSectionEditBody>;

export const CourseSectionView = z
  .strictObject({
    sectionId: Uuid,
    version: z.number().int().min(1),
    title: z.string().max(200).nullable(),
    contentMd: z.string().max(50_000).nullable(),
    reported: z.boolean(),
    updatedAt: IsoDateTime,
  })
  .describe('État courant d’une section après correction.');
export type CourseSectionView = z.infer<typeof CourseSectionView>;

export const courseSectionEdit = defineRoute({
  id: 'course-sections.edit',
  method: 'PATCH',
  path: '/api/v1/course-sections/:sid',
  auth: 'user',
  params: CourseSectionParams,
  body: CourseSectionEditBody,
  output: CourseSectionView,
  successStatus: 200,
  idempotent: true,
  rateLimit: 'default',
  summary:
    'Corrige ou complète une section du cours en créant la version suivante (SPEC-609).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'CONFLICT',
    'IDEMPOTENCY_KEY_REQUIRED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
  ],
});

/** BR-COU-09, BR-MEM-09 — report a section; it leaves the new quiz draws until corrected. */
export const CourseSectionReportBody = z
  .strictObject({ reason: z.string().trim().min(1).max(500) })
  .describe('Motif du signalement d’une section.');
export type CourseSectionReportBody = z.infer<typeof CourseSectionReportBody>;

export const CourseSectionReportView = z
  .strictObject({
    reportId: Uuid,
    sectionId: Uuid,
    status: z.literal('open'),
    reported: z.literal(true),
    createdAt: IsoDateTime,
  })
  .describe('Signalement ouvert d’une section.');
export type CourseSectionReportView = z.infer<typeof CourseSectionReportView>;

export const courseSectionReport = defineRoute({
  id: 'course-sections.report',
  method: 'POST',
  path: '/api/v1/course-sections/:sid/report',
  auth: 'user',
  params: CourseSectionParams,
  body: CourseSectionReportBody,
  output: CourseSectionReportView,
  successStatus: 201,
  idempotent: true,
  rateLimit: 'default',
  summary:
    'Signale une section du cours et la retire des nouveaux tirages jusqu’à correction (SPEC-609).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'IDEMPOTENCY_KEY_REQUIRED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
  ],
});

/** EF-2 — controlled link to the passage quoted by a citation. */
export const CourseCitationSource = z
  .strictObject({
    citationId: Uuid,
    mediaKind: CourseCitationMedia,
    deleted: z.boolean(),
    /** Never a model-produced URL: the service resolves the owner's resource. */
    url: z.url().max(2_048).nullable(),
    page: z.number().int().min(1).nullable(),
    startSec: z.number().int().min(0).nullable(),
    anchor: z.string().max(200).nullable(),
  })
  .describe('Extrait source résolu pour une citation, ou étiquette « source supprimée ».');
export type CourseCitationSource = z.infer<typeof CourseCitationSource>;

export const CourseCitationParams = z.object({ cid: Uuid });
export type CourseCitationParams = z.infer<typeof CourseCitationParams>;

export const courseCitationSource = defineRoute({
  id: 'course-citations.source',
  method: 'GET',
  path: '/api/v1/course-citations/:cid/source',
  auth: 'user',
  params: CourseCitationParams,
  output: CourseCitationSource,
  successStatus: 200,
  summary:
    'Résout le lien contrôlé d’une citation (page PDF, minute vidéo, ancre web) pour son propriétaire (SPEC-609).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'SERVICE_UNAVAILABLE', 'UNAUTHENTICATED'],
});

export const courseReadingRoutes = {
  courseProgress,
  chapterSummary,
  courseSectionEdit,
  courseSectionReport,
  courseCitationSource,
} as const;
