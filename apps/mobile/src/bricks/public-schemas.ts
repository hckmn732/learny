// Runtime mirrors of the public payloads, one per natively rendered type (SPEC-3301 BR-BRI-02,
// EF-1, CL-2).
//
// `@learny/bricks` exports the *projections* (`toPublic`) and their TypeScript types, but no zod
// schema for the public shape: the server validates the stored payload, never the projection it
// sends to a client. The mobile application therefore owns these mirrors, and two tests keep them
// honest: every `brickExamples[type]` projected by `toPublicBrick` parses here
// (`src/bricks/public-schemas.test.ts`), and every field declared by the projection type must be
// described below or the compiler refuses (`NativePublicPayloadMap`).
//
// A charge that does not parse is never rendered: the brick shows « Ce contenu ne peut pas être
// affiché » and the identifier of the charge is logged, without its content (BR-BRI-02).
import { z } from 'zod';

import type { PublicPayload } from '@learny/bricks';

import type { NativeBrickType } from './registry';

const identifier = z.string().trim().min(1).max(64);
const note = z.string().trim().min(1).max(4000);
const sources = z.array(
  z
    .object({
      chunkId: identifier,
      quote: z.string().trim().min(1).max(300).optional(),
    })
    .strict(),
);

const keyed = z.array(
  z
    .object({
      id: identifier,
      text: note,
    })
    .strict(),
);

const location = z
  .object({
    page: z.number().int().min(1).optional(),
    startSec: z.number().min(0).optional(),
    endSec: z.number().min(0).optional(),
    anchor: z.string().trim().min(1).max(200).optional(),
    charStart: z.number().int().min(0).optional(),
    charEnd: z.number().int().min(0).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'location is empty' });

/** Public charge of a `text` brick. */
export const textPublicSchema = z
  .object({ title: z.string().trim().min(1).max(120).optional(), bodyMd: note, sources })
  .strict();

/** Public charge of a `resource_excerpt` brick. */
export const resourceExcerptPublicSchema = z
  .object({
    resourceId: identifier,
    chunkId: identifier.nullable(),
    location,
    quote: note,
    label: z.string().trim().min(1).max(80),
    sources,
  })
  .strict();

/** Public charge of a `choice_question`: option texts only, never `correct` (ET-2, CA-3). */
export const choiceQuestionPublicSchema = z
  .object({
    stem: note,
    mode: z.enum(['single', 'multiple']),
    options: keyed.min(2).max(6),
    sources,
  })
  .strict();

/** Public charge of an `open_question`: expected elements and model answer stay server-side. */
export const openQuestionPublicSchema = z
  .object({
    stem: note,
    answerMaxChars: z.number().int().min(50).max(4000),
    criteria: z.array(
      z
        .object({ label: z.string().trim().min(1).max(120), points: z.number().int().min(1) })
        .strict(),
    ),
    sources,
  })
  .strict();

/** Public charge of a `cloze`: the template keeps its `{{n}}` tokens, only the hints are sent. */
export const clozePublicSchema = z
  .object({
    template: note,
    gaps: z
      .array(
        z
          .object({
            id: z.number().int().min(1).max(10),
            hint: z.string().trim().max(60).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    sources,
  })
  .strict();

/** Public charge of a `matching`: rights are opaque (`r1..rn`) and shuffled by the server. */
export const matchingPublicSchema = z
  .object({ instruction: note, lefts: keyed.min(1), rights: keyed.min(1), sources })
  .strict();

/** Public charge of an `ordering`: items are shuffled by the server. */
export const orderingPublicSchema = z
  .object({ instruction: note, items: keyed.min(1), sources })
  .strict();

/** Public charge of a `categorization`: categories stay visible, items lose their category. */
export const categorizationPublicSchema = z
  .object({
    instruction: note,
    categories: z
      .array(z.object({ id: identifier, label: z.string().trim().min(1).max(80) }).strict())
      .min(2),
    items: keyed.min(1),
    sources,
  })
  .strict();

/** Public charge of a `recall_card`: the back is sent because the learner self-assesses. */
export const recallCardPublicSchema = z
  .object({
    front: note,
    back: note,
    sourceLabel: z.string().trim().min(1).max(120).optional(),
    mnemonic: z.string().trim().min(1).max(400).optional(),
    sources,
  })
  .strict();

/** Mirrors indexed by the native type they describe. */
export const PUBLIC_PAYLOAD_SCHEMAS: Record<NativeBrickType, z.ZodType> = {
  text: textPublicSchema,
  resource_excerpt: resourceExcerptPublicSchema,
  choice_question: choiceQuestionPublicSchema,
  open_question: openQuestionPublicSchema,
  cloze: clozePublicSchema,
  matching: matchingPublicSchema,
  ordering: orderingPublicSchema,
  categorization: categorizationPublicSchema,
  recall_card: recallCardPublicSchema,
};

/** The public charge of each native type, exactly as `@learny/bricks` projects it. */
export interface NativePublicPayloadMap {
  readonly text: PublicPayload<'text'>;
  readonly resource_excerpt: PublicPayload<'resource_excerpt'>;
  readonly choice_question: PublicPayload<'choice_question'>;
  readonly open_question: PublicPayload<'open_question'>;
  readonly cloze: PublicPayload<'cloze'>;
  readonly matching: PublicPayload<'matching'>;
  readonly ordering: PublicPayload<'ordering'>;
  readonly categorization: PublicPayload<'categorization'>;
  readonly recall_card: PublicPayload<'recall_card'>;
}

/** Result of a public charge validation: the payload, or a refusal without any content. */
export type ParsedPublicPayload<T extends NativeBrickType> =
  { readonly ok: true; readonly payload: NativePublicPayloadMap[T] } | { readonly ok: false };

/**
 * Validates one public charge with the mirror of its type (BR-BRI-02). The result never carries
 * the offending content: the caller logs the brick identifier only.
 */
export function parsePublicPayload<T extends NativeBrickType>(
  type: T,
  value: unknown,
): ParsedPublicPayload<T> {
  const parsed = PUBLIC_PAYLOAD_SCHEMAS[type].safeParse(value);
  if (!parsed.success) return { ok: false };
  return { ok: true, payload: parsed.data as NativePublicPayloadMap[T] };
}
