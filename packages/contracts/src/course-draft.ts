import { z } from 'zod';

import { Uuid } from './common';

// Structured output of the course task (SPEC-608 ET-3, BR-COU-01 to BR-COU-06, BR-COU-10).
//
// The model writes one chapter at a time; the service aggregates the chapters into a `CourseDraft`
// before versioning. A section is discriminated by its kind, and every passage taken from a
// contribution carries the exact `chunkId` it quotes. A passage written from the tutor's own
// knowledge uses `tutor_addition` and is displayed with the fixed "Complété par le tuteur" label.
// The chapter always closes with one "À retenir" card (three to seven points); only the summary
// invitation may follow it. A chapter without any contribution is a base course: no source at all,
// explicitly flagged, with resource suggestions.

export const COURSE_DRAFT_SECTION_KINDS = [
  'markdown',
  'quick_question',
  'comparison',
  'tutor_addition',
  'takeaway',
  'summary_prompt',
] as const;
export const CourseDraftSectionKind = z.enum(COURSE_DRAFT_SECTION_KINDS);
export type CourseDraftSectionKind = z.infer<typeof CourseDraftSectionKind>;

export const COURSE_DRAFT_LINK_KINDS = ['prerequisite', 'confusion'] as const;
export const CourseDraftLinkKind = z.enum(COURSE_DRAFT_LINK_KINDS);
export type CourseDraftLinkKind = z.infer<typeof CourseDraftLinkKind>;

const SourceChunkIds = z.array(Uuid).max(20);
const NotionIds = z.array(Uuid).max(30);
const SectionTitle = z.string().trim().min(1).max(120);

const diagramBlockSchema = z.strictObject({
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(60),
});

const diagramArrowSchema = z.strictObject({
  from: z.string().trim().min(1).max(60),
  to: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(60).optional(),
});

/** BR-COU-04 — simple block/arrow diagram of a "À retenir" card. */
export const CourseDiagramSchema = z
  .strictObject({
    blocks: z.array(diagramBlockSchema).min(1).max(8),
    arrows: z.array(diagramArrowSchema).max(12).default([]),
  })
  .superRefine((value, ctx) => {
    const ids = new Set(value.blocks.map((block) => block.id));
    for (const arrow of value.arrows) {
      if (!ids.has(arrow.from) || !ids.has(arrow.to)) {
        ctx.addIssue({
          code: 'custom',
          path: ['arrows'],
          message: 'Chaque flèche relie deux blocs du schéma.',
        });
      }
    }
  });
export type CourseDiagram = z.infer<typeof CourseDiagramSchema>;

const markdownSection = z.strictObject({
  kind: z.literal('markdown'),
  title: SectionTitle.optional(),
  contentMd: z.string().trim().min(1).max(50_000),
  sourceChunkIds: SourceChunkIds.min(1),
  notionIds: NotionIds.default([]),
});

/** BR-COU-05 — a flash question, its answer hidden behind "Afficher la réponse". */
const quickQuestionSection = z.strictObject({
  kind: z.literal('quick_question'),
  title: SectionTitle.optional(),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(1_000),
  sourceChunkIds: SourceChunkIds.default([]),
  notionIds: NotionIds.default([]),
});

const comparisonSideSchema = z.strictObject({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(400),
  example: z.string().trim().min(1).max(200),
});

/** BR-COU-06 — two close notions opposed in a "Ne pas confondre" block. */
const comparisonSection = z.strictObject({
  kind: z.literal('comparison'),
  title: SectionTitle.optional(),
  left: comparisonSideSchema,
  right: comparisonSideSchema,
  sourceChunkIds: SourceChunkIds.default([]),
  notionIds: NotionIds.default([]),
});

/** BR-COU-02 — a passage written by the tutor, never presented as a sourced passage. */
const tutorAdditionSection = z.strictObject({
  kind: z.literal('tutor_addition'),
  title: SectionTitle.optional(),
  contentMd: z.string().trim().min(1).max(50_000),
  notionIds: NotionIds.default([]),
});

/** BR-COU-04 — the closing card: three to seven points, an optional diagram and mnemonic. */
const takeawaySection = z.strictObject({
  kind: z.literal('takeaway'),
  title: SectionTitle.optional(),
  points: z.array(z.string().trim().min(1).max(200)).min(3).max(7),
  diagram: CourseDiagramSchema.optional(),
  mnemonic: z.string().trim().min(1).max(300).optional(),
  sourceChunkIds: SourceChunkIds.max(20).default([]),
  notionIds: NotionIds.default([]),
});

/** BR-COU-08 — the chapter closes with an invitation to write a summary. */
const summaryPromptSection = z.strictObject({
  kind: z.literal('summary_prompt'),
  title: SectionTitle.optional(),
  prompt: z.string().trim().min(1).max(500).optional(),
  notionIds: NotionIds.default([]),
});

/** ET-3 — discriminated section of one generated chapter. */
export const CourseSectionDraftSchema = z.discriminatedUnion('kind', [
  markdownSection,
  quickQuestionSection,
  comparisonSection,
  tutorAdditionSection,
  takeawaySection,
  summaryPromptSection,
]);
export type CourseSectionDraft = z.infer<typeof CourseSectionDraftSchema>;

/** BR-COU-03 — suggestion attached to a base course; never imported silently. */
export const CourseResourceSuggestionSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  url: z.url().max(2_048),
  reason: z.string().trim().min(1).max(500),
});
export type CourseResourceSuggestion = z.infer<typeof CourseResourceSuggestionSchema>;

/** ET-3 — typed link between two notions of the formation. */
export const CourseDraftLinkSchema = z.strictObject({
  fromNotionId: Uuid,
  toNotionId: Uuid,
  kind: CourseDraftLinkKind,
});
export type CourseDraftLink = z.infer<typeof CourseDraftLinkSchema>;

function sectionSources(section: CourseSectionDraft): readonly string[] {
  return 'sourceChunkIds' in section ? section.sourceChunkIds : [];
}

function sectionNotions(section: CourseSectionDraft): readonly string[] {
  return 'notionIds' in section ? section.notionIds : [];
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

const chapterShape = {
  chapterId: Uuid,
  title: z.string().trim().min(1).max(160),
  baseCourse: z.boolean().default(false),
  sections: z.array(CourseSectionDraftSchema).min(1).max(40),
  sourceChunkIds: SourceChunkIds.max(20).default([]),
  notionIds: NotionIds.default([]),
  links: z.array(CourseDraftLinkSchema).max(30).default([]),
  resourceSuggestions: z.array(CourseResourceSuggestionSchema).max(5).default([]),
};

/** One chapter of the draft, with every structural rule of BR-COU-02 to BR-COU-06. */
export const CourseChapterDraftSchema = z.strictObject(chapterShape).superRefine((chapter, ctx) => {
  const takeawayIndex = chapter.sections.findIndex((section) => section.kind === 'takeaway');
  if (takeawayIndex === -1) {
    ctx.addIssue({
      code: 'custom',
      path: ['sections'],
      message: 'Le chapitre se termine par une fiche « À retenir ».',
    });
  } else {
    const after = chapter.sections.slice(takeawayIndex + 1);
    if (after.some((section) => section.kind !== 'summary_prompt')) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'Seule l’invitation au résumé peut suivre la fiche « À retenir ».',
      });
    }
    if (chapter.sections.filter((section) => section.kind === 'takeaway').length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'Un chapitre contient exactement une fiche « À retenir ».',
      });
    }
  }

  for (const kind of ['quick_question', 'comparison'] as const) {
    if (chapter.sections.filter((section) => section.kind === kind).length > 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['sections'],
        message:
          kind === 'quick_question'
            ? 'Un chapitre contient au plus une question éclair.'
            : 'Un chapitre contient au plus un bloc « Ne pas confondre ».',
      });
    }
  }

  const unionSources = [...new Set(chapter.sections.flatMap((section) => sectionSources(section)))];
  if (!sameSet(unionSources, chapter.sourceChunkIds)) {
    ctx.addIssue({
      code: 'custom',
      path: ['sourceChunkIds'],
      message: 'Les sources du chapitre reprennent exactement celles de ses sections.',
    });
  }
  const unionNotions = [...new Set(chapter.sections.flatMap((section) => sectionNotions(section)))];
  if (!sameSet(unionNotions, chapter.notionIds)) {
    ctx.addIssue({
      code: 'custom',
      path: ['notionIds'],
      message: 'Les notions du chapitre reprennent exactement celles de ses sections.',
    });
  }

  if (chapter.baseCourse) {
    if (unionSources.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseCourse'],
        message: 'Un cours de base ne cite aucune source.',
      });
    }
    if (chapter.resourceSuggestions.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['resourceSuggestions'],
        message: 'Un cours de base propose au moins une ressource.',
      });
    }
  } else {
    if (unionSources.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseCourse'],
        message: 'Un chapitre avec apports cite au moins une source.',
      });
    }
    if (chapter.resourceSuggestions.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['resourceSuggestions'],
        message: 'Les suggestions sont réservées au cours de base.',
      });
    }
  }
});
export type CourseChapterDraft = z.infer<typeof CourseChapterDraftSchema>;

/**
 * ET-3 — the complete course of one module: ordered chapters, each carrying its sections,
 * cited passages, notion ids and typed notion links. The service validates every citation against
 * the owner's ready passages before persisting the version.
 */
export const CourseDraftSchema = z.strictObject({
  chapters: z.array(CourseChapterDraftSchema).min(1).max(40),
});
export type CourseDraft = z.infer<typeof CourseDraftSchema>;

/** Fixed label of a passage written from the tutor's knowledge (BR-COU-02). */
export const TUTOR_COMPLETED_LABEL = 'Complété par le tuteur · à confirmer dans vos sources';
