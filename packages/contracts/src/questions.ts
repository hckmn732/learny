import { z } from 'zod';

import { Uuid } from './common';

// Contracts of the question banks (SPEC-513 EF-1 to EF-5, ET-1, ET-2, ADR-0026).
//
// A bank is personal: the input always targets a course version owned by the caller. The four
// formats are the ones a quiz and the memorisation games can draw from; a bank never exports a
// source passage, a raw provider response or another learner's identifier. The fingerprint is the
// SHA-256 of the normalised stem and answer (BR-BRI-07), so two variants with the same fingerprint
// are the same question even when their brick identifiers differ.

/** Formats relevant to a personal bank (BR-MEM-07, ADR-0026, ADR-0170). */
export const QUESTION_BANK_FORMATS = [
  'choice_question',
  'open_question',
  'cloze',
  'matching',
] as const;

export type QuestionBankFormat = (typeof QUESTION_BANK_FORMATS)[number];

/** BR-MEM-07 — at least four distinct variants per notion and format. */
export const QUESTION_BANK_MIN_VARIANTS = 4;

/** A batch never produces more than this many variants for one notion and format. */
export const QUESTION_BANK_MAX_VARIANTS = 20;

/** Why the bank is prepared; the reason is part of the job key and of the safe journal. */
export const QUESTION_BANK_REASONS = [
  'course_generated',
  'exhaustion',
  'nightly',
  'manual',
] as const;

export type QuestionBankReason = (typeof QUESTION_BANK_REASONS)[number];

/** Lifecycle of one `(learner, notion, format, course version)` job. */
export const QUESTION_BANK_JOB_STATUSES = ['queued', 'running', 'done', 'failed'] as const;

export type QuestionBankJobStatus = (typeof QUESTION_BANK_JOB_STATUSES)[number];

const formats = z.array(z.enum(QUESTION_BANK_FORMATS)).min(1).max(QUESTION_BANK_FORMATS.length);

const count = z
  .int()
  .min(QUESTION_BANK_MIN_VARIANTS)
  .max(QUESTION_BANK_MAX_VARIANTS)
  .default(QUESTION_BANK_MIN_VARIANTS);

/** ET-1 — one notion, its course version and the requested formats. */
export const QuestionBankPrepareInput = z
  .strictObject({
    courseVersionId: Uuid,
    notionId: Uuid,
    formats: formats.default([...QUESTION_BANK_FORMATS]),
    count,
    reason: z.enum(QUESTION_BANK_REASONS).default('manual'),
  })
  .describe('Préparation synchrone de la banque d’une notion et de ses formats.');

export type QuestionBankPrepareInput = z.input<typeof QuestionBankPrepareInput>;
export type ParsedQuestionBankPrepareInput = z.infer<typeof QuestionBankPrepareInput>;

/** ET-2 — one request may cover the notions of a module; the job key stays per notion/format. */
export const QuestionBankRequestInput = z
  .strictObject({
    courseVersionId: Uuid,
    notionIds: z.array(Uuid).min(1).max(20),
    formats: formats.default([...QUESTION_BANK_FORMATS]),
    count,
    reason: z.enum(QUESTION_BANK_REASONS).default('manual'),
  })
  .describe('Mise en file des banques de plusieurs notions d’une version de cours.');

export type QuestionBankRequestInput = z.input<typeof QuestionBankRequestInput>;
export type ParsedQuestionBankRequestInput = z.infer<typeof QuestionBankRequestInput>;

/** EF-1 — an annotated distractor: the notion it represents, never a private passage. */
export const QuestionBankDistractor = z
  .strictObject({
    notionId: Uuid,
    label: z.string().trim().min(1).max(160),
    rationale: z.string().trim().max(300).nullable(),
  })
  .describe('Distracteur annoté par la notion qu’il confond.');

export type QuestionBankDistractor = z.infer<typeof QuestionBankDistractor>;

/** EF-1 — one stored variant, with a maskable fingerprint and no raw payload. */
export const QuestionBankVariant = z
  .strictObject({
    brickId: Uuid,
    brickVersionId: Uuid,
    notionId: Uuid,
    format: z.enum(QUESTION_BANK_FORMATS),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    stem: z.string().trim().min(1).max(600),
    status: z.enum(['active', 'reported', 'retired']),
    distractors: z.array(QuestionBankDistractor).max(5),
  })
  .describe('Variante de banque affichable, sans énoncé de source privée.');

export type QuestionBankVariant = z.infer<typeof QuestionBankVariant>;

/** EF-1, EF-5 — availability of one notion and format. */
export const QuestionBankGroup = z
  .strictObject({
    notionId: Uuid,
    format: z.enum(QUESTION_BANK_FORMATS),
    required: z.int().min(1).max(QUESTION_BANK_MAX_VARIANTS),
    available: z.int().min(0),
    inserted: z.int().min(0),
    duplicates: z.int().min(0),
    complete: z.boolean(),
  })
  .describe('État d’une banque pour une notion et un format.');

export type QuestionBankGroup = z.infer<typeof QuestionBankGroup>;

/** ET-1 — result of a synchronous preparation. `complete` never lies about a short bank. */
export const QuestionBankResult = z
  .strictObject({
    requestId: Uuid,
    courseVersionId: Uuid,
    reason: z.enum(QUESTION_BANK_REASONS),
    groups: z.array(QuestionBankGroup),
    variants: z.array(QuestionBankVariant),
    complete: z.boolean(),
  })
  .describe('Banques préparées pour une notion, avec les empreintes et l’état d’épuisement.');

export type QuestionBankResult = z.infer<typeof QuestionBankResult>;

/** ET-2 — state of one durable job, safe to display. */
export const QuestionBankJob = z
  .strictObject({
    jobId: Uuid,
    notionId: Uuid,
    format: z.enum(QUESTION_BANK_FORMATS),
    status: z.enum(QUESTION_BANK_JOB_STATUSES),
    reason: z.enum(QUESTION_BANK_REASONS),
    required: z.int().min(1).max(QUESTION_BANK_MAX_VARIANTS),
    available: z.int().min(0),
    inserted: z.int().min(0),
    duplicates: z.int().min(0),
    complete: z.boolean(),
    errorCode: z.string().trim().min(1).max(80).nullable(),
  })
  .describe('Job de banque : clé, état et compteurs, sans contenu privé.');

export type QuestionBankJob = z.infer<typeof QuestionBankJob>;

/** ET-2 — response of the asynchronous request used by the tutor port. */
export const QuestionBankRequestResult = z
  .strictObject({
    requestId: Uuid,
    jobs: z.array(QuestionBankJob),
  })
  .describe('Banques mises en file pour une ou plusieurs notions.');

export type QuestionBankRequestResult = z.infer<typeof QuestionBankRequestResult>;

/** EF-5 — exhaustion signal carried by a draw result (SPEC-405/406). */
export const QuestionBankExhaustionInput = z
  .strictObject({
    courseVersionId: Uuid,
    notionIds: z.array(Uuid).min(1).max(20),
    formats: formats.default([...QUESTION_BANK_FORMATS]),
    count,
  })
  .describe('Épuisement déclaré : demander une nouvelle génération sans resservir une empreinte.');

export type QuestionBankExhaustionInput = z.input<typeof QuestionBankExhaustionInput>;

/** Renders a fingerprint without revealing it in full. */
export function maskFingerprint(fingerprint: string): string {
  return fingerprint.length <= 12 ? '…' : `${fingerprint.slice(0, 6)}…${fingerprint.slice(-6)}`;
}
