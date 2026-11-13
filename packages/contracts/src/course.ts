import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { CourseCitationMedia } from './course-media';
import { CourseReadingProgress, CourseSummaryView } from './course-reading';
import { defineRoute } from './define-route';

// Read model and routes of the course screen (SCR-07, SPEC-608 EF-1 to EF-5, ET-1, ET-3,
// BR-COU-01 to BR-COU-06, BR-COU-10). The DTO is exactly what the page renders: one selected
// chapter of the current ready version, its typed sections, their verified citations and the
// pending resource suggestions of a base course. Everything is read through the caller's RLS
// client, so a foreign module or course is a 404 and never leaks its existence.

export const COURSE_VIEW_STATUSES = ['none', 'generating', 'ready', 'failed'] as const;
export const CourseViewStatus = z.enum(COURSE_VIEW_STATUSES);
export type CourseViewStatus = z.infer<typeof CourseViewStatus>;

/** Mirrors the `section_kind` enumeration of the stored course. */
export const COURSE_SECTION_KINDS = [
  'text',
  'flash_question',
  'dont_confuse',
  'tutor_completed',
  'retain',
  'summary_prompt',
] as const;
export const CourseSectionKind = z.enum(COURSE_SECTION_KINDS);
export type CourseSectionKind = z.infer<typeof CourseSectionKind>;

/** Mirrors the `citation_media` enumeration used to render the source chip. */
export { COURSE_CITATION_MEDIA, CourseCitationMedia } from './course-media';
export type { CourseCitationMedia as CourseCitationMediaType } from './course-media';

/** BR-COU-06 — one side of the "Ne pas confondre" block. */
export const CourseComparisonSide = z.strictObject({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(400),
  example: z.string().min(1).max(200),
});
export type CourseComparisonSide = z.infer<typeof CourseComparisonSide>;

/** BR-COU-04 — persisted "À retenir" payload. */
export const CourseRetain = z.strictObject({
  points: z.array(z.string().min(1).max(200)).min(3).max(7),
  diagram: z
    .strictObject({
      blocks: z.array(
        z.strictObject({ id: z.string().min(1).max(60), label: z.string().min(1).max(60) }),
      ),
      arrows: z.array(
        z.strictObject({
          from: z.string().min(1).max(60),
          to: z.string().min(1).max(60),
          label: z.string().min(1).max(60).optional(),
        }),
      ),
    })
    .optional(),
  mnemonic: z.string().min(1).max(300).optional(),
});
export type CourseRetain = z.infer<typeof CourseRetain>;

export const CourseFlashQuestion = z.strictObject({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(1_000),
});
export type CourseFlashQuestion = z.infer<typeof CourseFlashQuestion>;

export const CourseComparison = z.strictObject({
  left: CourseComparisonSide,
  right: CourseComparisonSide,
});
export type CourseComparison = z.infer<typeof CourseComparison>;

/** BR-COU-02, BR-COU-10 — one verified citation; a deleted source keeps its label (ADR-0039). */
export const CourseCitation = z
  .strictObject({
    id: Uuid,
    chunkId: Uuid.nullable(),
    resourceId: Uuid.nullable(),
    label: z.string().min(1).max(120),
    quote: z.string().max(2_000).nullable(),
    location: z.record(z.string(), z.unknown()).nullable(),
    mediaKind: CourseCitationMedia,
    /** ADR-0039 — the source was deleted or is no longer ready. */
    deleted: z.boolean(),
  })
  .describe('Citation vérifiée d’une section du cours.');
export type CourseCitation = z.infer<typeof CourseCitation>;

export const CourseSection = z
  .strictObject({
    id: Uuid,
    kind: CourseSectionKind,
    anchor: z.string().min(1).max(80),
    title: z.string().max(200).nullable(),
    contentMd: z.string().max(50_000).nullable(),
    data: z.record(z.string(), z.unknown()).nullable(),
    /** BR-COU-02 — `resource` when every quoted passage is sourced, `tutor` otherwise. */
    origin: z.enum(['resource', 'tutor']),
    notionIds: z.array(Uuid),
    citations: z.array(CourseCitation),
    /** BR-COU-09 — current version; a PATCH must quote it (optimistic concurrency). */
    version: z.number().int().min(1),
    /** BR-COU-09, BR-MEM-09 — reported content leaves the new quiz draws until corrected. */
    reported: z.boolean(),
  })
  .describe('Section typée d’un chapitre de cours.');
export type CourseSection = z.infer<typeof CourseSection>;

/** BR-COU-03, BR-APP-05 — a pending suggestion shown with a base course. */
export const CourseSuggestion = z.strictObject({
  id: Uuid,
  title: z.string().min(1).max(200),
  url: z.url().max(2_048),
  reason: z.string().min(1).max(500),
});
export type CourseSuggestion = z.infer<typeof CourseSuggestion>;

/** SPEC-610 EF-2 — a starter question computed by the code from the current chapter. */
export const CourseStarter = z.strictObject({
  label: z.string().min(1).max(120),
  prompt: z.string().min(1).max(300),
});
export type CourseStarter = z.infer<typeof CourseStarter>;

export const CourseChapterSummary = z.strictObject({
  id: Uuid,
  position: z.number().int().min(1),
  title: z.string().min(1).max(160),
  hasCourse: z.boolean(),
  /** BR-COU-08 — persisted percentage of this chapter (0 when it was never opened). */
  percent: z.number().int().min(0).max(100),
});
export type CourseChapterSummary = z.infer<typeof CourseChapterSummary>;

export const CourseView = z
  .strictObject({
    id: Uuid,
    version: z.number().int().min(1),
    status: CourseViewStatus,
    generatedAt: IsoDateTime,
    model: z.string().max(120).nullable(),
    /** BR-COU-11 — estimated reading time of the selected chapter, at 200 words per minute. */
    readingMinutes: z.number().int().min(1),
    /** Distinct contributions the chapter is built from (0 for a base course). */
    resourceCount: z.number().int().min(0),
    /** BR-COU-03 — no contribution: the tutor wrote a flagged base course. */
    baseCourse: z.boolean(),
    chapter: CourseChapterSummary,
    previousChapterId: Uuid.nullable(),
    nextChapterId: Uuid.nullable(),
    sections: z.array(CourseSection),
    suggestions: z.array(CourseSuggestion),
    /** SPEC-610 EF-2 — the three questions suggested by the tutor card. */
    tutorStarters: z.array(CourseStarter).max(3),
    /** SPEC-610 EF-1 — the open gap of the module shown by the tutor card, if any. */
    tutorGap: z.string().max(200).nullable(),
    /** BR-COU-08 — persisted progress of the selected chapter and of the whole course. */
    progress: CourseReadingProgress,
    /** BR-COU-07 — latest summary of this chapter for this course version, if any. */
    summary: CourseSummaryView.nullable(),
    /** BR-COU-11 — quiz card of the module. */
    quiz: z.strictObject({
      threshold: z.number().int().min(0).max(100),
      href: z.string().min(1).max(300),
    }),
  })
  .describe('Version courante du cours, pour un chapitre sélectionné.');
export type CourseView = z.infer<typeof CourseView>;

export const CourseGenerationState = z.strictObject({
  status: CourseViewStatus,
  version: z.number().int().min(1).nullable(),
  error: z.string().max(2_000).nullable(),
});
export type CourseGenerationState = z.infer<typeof CourseGenerationState>;

export const ModuleCourseScreen = z
  .strictObject({
    formation: z.strictObject({
      id: Uuid,
      title: z.string().min(1).max(200),
    }),
    module: z.strictObject({
      id: Uuid,
      position: z.number().int().min(1),
      positionTotal: z.number().int().min(1),
      title: z.string().min(1).max(200),
    }),
    chapters: z.array(CourseChapterSummary).max(100),
    selectedChapterId: Uuid,
    course: CourseView.nullable(),
    generation: CourseGenerationState,
  })
  .describe('État complet de l’écran Cours (SCR-07).');
export type ModuleCourseScreen = z.infer<typeof ModuleCourseScreen>;

/** SCR-07 selection: the chapter in `?chapitre=`, absent on the first visit. */
export const ModuleCourseQuery = z.object({ chapitre: Uuid.optional() });
export type ModuleCourseQuery = z.infer<typeof ModuleCourseQuery>;

export const ModuleCourseParams = z.object({ mid: Uuid });
export type ModuleCourseParams = z.infer<typeof ModuleCourseParams>;

export const moduleCourse = defineRoute({
  id: 'modules.course',
  method: 'GET',
  path: '/api/v1/modules/:mid/course',
  auth: 'user',
  params: ModuleCourseParams,
  query: ModuleCourseQuery,
  output: ModuleCourseScreen,
  successStatus: 200,
  summary: 'Lit le cours courant d’un module, chapitre par chapitre (SPEC-608).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'FORBIDDEN'],
});

export const courseRoutes = { moduleCourse } as const;
