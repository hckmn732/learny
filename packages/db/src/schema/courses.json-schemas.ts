// Zod schemas of the JSON columns of the course and tutor-discussion domain (SPEC-105 ET-4).
//
// They validate `course_sections.data` according to its `kind` (a flash question, a "don't confuse"
// pair, a "to retain" card), the feedback of a chapter summary, the sources of a tutor message and
// its optional self-test. `packages/contracts` reuses them from SPEC-201 onwards; nothing here
// depends on Drizzle, so the schema module can import them without a cycle.
import { z } from 'zod';

import { chunkLocationSchema } from './resources.json-schemas';

/** ET-4 — the six section kinds and the JSON shape each one carries (`data` is null otherwise). */
export type SectionDataKind =
  'text' | 'flash_question' | 'dont_confuse' | 'tutor_completed' | 'retain' | 'summary_prompt';

/** ET-4 — a flash question section: the question and its expected answer. */
export const flashQuestionSchema = z.strictObject({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(1000),
});

const dontConfuseSideSchema = z.strictObject({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(400),
  example: z.string().min(1).max(200),
});

/** ET-4 — a "ne pas confondre" section: the two notions to tell apart. */
export const dontConfuseSchema = z.strictObject({
  left: dontConfuseSideSchema,
  right: dontConfuseSideSchema,
});

const diagramBlockSchema = z.strictObject({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(60),
});

const diagramArrowSchema = z.strictObject({
  from: z.string().min(1).max(60),
  to: z.string().min(1).max(60),
  label: z.string().min(1).max(60).optional(),
});

/** ET-4 — optional schema of a "à retenir" card. */
export const retainDiagramSchema = z.strictObject({
  blocks: z.array(diagramBlockSchema).min(1).max(8),
  arrows: z.array(diagramArrowSchema).default([]),
});

/** ET-4 — a "to retain" section: three to seven points, an optional diagram and a mnemonic. */
export const retainSchema = z.strictObject({
  points: z.array(z.string().min(1).max(200)).min(3).max(7),
  diagram: retainDiagramSchema.optional(),
  mnemonic: z.string().min(1).max(300).optional(),
});

/** ET-4 — `course_sections.data` by kind; `text`, `tutor_completed` and `summary_prompt` carry none. */
export const sectionDataSchemas = {
  text: z.null(),
  flash_question: flashQuestionSchema,
  dont_confuse: dontConfuseSchema,
  tutor_completed: z.null(),
  retain: retainSchema,
  summary_prompt: z.null(),
} as const satisfies Record<SectionDataKind, z.ZodType>;

/** Returns the schema of `course_sections.data` for a section kind (ET-4). */
export function courseSectionDataSchema(kind: SectionDataKind): z.ZodType {
  return sectionDataSchemas[kind];
}

/**
 * EF-3 — anchor of a section in its course: lower-case letters, digits and single dashes, at most
 * 80 characters. The custom migration `courses_rules` enforces the same expression in SQL.
 */
export const courseSectionAnchorSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

/** ET-4 — correction feedback of a chapter summary (BR-COU-08): verdict, message, missing points. */
export const chapterSummaryFeedbackSchema = z.strictObject({
  verdict: z.enum(['good', 'partial', 'insufficient']),
  message: z.string().max(1000),
  missing: z.array(z.string().min(1).max(200)).max(10),
});

/**
 * ET-4 — a source of a tutor message. A citation survives the deletion of its resource (ADR-0039):
 * `chunkId` and `resourceId` are then absent while the label is kept.
 */
export const tutorMessageSourceSchema = z.strictObject({
  chunkId: z.uuid().optional(),
  resourceId: z.uuid().optional(),
  label: z.string().min(1).max(120),
  location: chunkLocationSchema.optional(),
});

/** ET-4 — self-test proposed by the tutor at the end of a discussion (BR-TUT-07). */
export const selfTestSchema = z.strictObject({
  question: z.string().min(1).max(1000),
  notionId: z.uuid(),
  expected: z.string().min(1).max(1000).optional(),
  answer: z.string().max(2000).optional(),
  correct: z.boolean().optional(),
  answeredAt: z.iso.datetime({ offset: true }).optional(),
});

export type FlashQuestion = z.infer<typeof flashQuestionSchema>;
export type DontConfuse = z.infer<typeof dontConfuseSchema>;
export type RetainDiagram = z.infer<typeof retainDiagramSchema>;
export type Retain = z.infer<typeof retainSchema>;
export type ChapterSummaryFeedback = z.infer<typeof chapterSummaryFeedbackSchema>;
export type TutorMessageSource = z.infer<typeof tutorMessageSourceSchema>;
export type SelfTest = z.infer<typeof selfTestSchema>;
