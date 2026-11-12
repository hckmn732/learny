// Public input/output contracts of the pure engine (SPEC-401 ET-2). Every type has a strict Zod
// schema: unknown fields are refused, numbers are finite (and never -0) and dates are real civil
// days. Objects produced by the engine therefore survive JSON round-trips without loss (CA-2).
import { z } from 'zod';

import { EngineError } from './errors';
import { isInstantIso, isIsoDate, isLocalTime, isTimeZone } from './time';

export type InstantIso = string;
export type IsoDate = string;
export type LocalTime = string;
export type TimeZone = string;
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Id = string;
export type FsrsRating = 'again' | 'hard' | 'good' | 'easy';
export type FsrsCardStateName = 'new' | 'learning' | 'review' | 'relearning';
export type BrickFormat =
  | 'choice_question'
  | 'open_question'
  | 'cloze'
  | 'matching'
  | 'ordering'
  | 'categorization'
  | 'recall_card'
  | 'instruction'
  | 'scripted_dialogue'
  | 'timer';
export type ReviewSource =
  | 'validation'
  | 'global_quiz'
  | 'warmup'
  | 'exercise'
  | 'exam'
  | 'self_test'
  | 'micro_session'
  | 'sprint'
  | 'offline';
export type AttemptKind =
  | 'validation_quiz'
  | 'global_quiz_session'
  | 'remediation'
  | 'exercise'
  | 'mock_exam'
  | 'warmup'
  | 'micro_session'
  | 'sprint'
  | 'self_test';
export type GapNature = 'forgetting' | 'confusion' | 'misunderstanding' | 'application';
export type StudySlot = 'matin' | 'apres_midi' | 'soir';
export type ModuleStatus = 'locked' | 'open' | 'validated';
export type SlotKind =
  | 'contributions'
  | 'course'
  | 'exercise'
  | 'validation_quiz'
  | 'global_quiz'
  | 'revision'
  | 'buffer'
  | 'sprint'
  | 'mock_exam'
  | 'warmup'
  | 'micro_session'
  | 'weekly_review';
export type SlotStatus = 'planned' | 'done' | 'missed' | 'moved' | 'cancelled';

/** A finite number; `-0` is refused because JSON would turn it into `0` (CL-9). */
const finiteNumber = () =>
  z.number().refine((value) => Number.isFinite(value) && !Object.is(value, -0), {
    message: 'Nombre fini requis, -0 refusé.',
  });

const nonNegativeNumber = () => finiteNumber().refine((value) => value >= 0, 'Valeur négative.');
const integer = () => finiteNumber().refine((value) => Number.isInteger(value), 'Entier requis.');
const nonNegativeInteger = () => integer().refine((value) => value >= 0, 'Valeur négative.');
const positiveInteger = () => integer().refine((value) => value >= 1, 'Entier positif requis.');
const masteryNumber = () =>
  nonNegativeNumber()
    .refine((value) => value <= 100, 'Maîtrise hors de 0..100.')
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
      message: 'Maîtrise limitée à deux décimales.',
    });

export const IdSchema = z.string().min(1).max(64) as z.ZodType<Id>;
export const InstantIsoSchema = z
  .string()
  .refine(isInstantIso, { message: 'Instant ISO 8601 UTC invalide.' }) as z.ZodType<InstantIso>;
export const IsoDateSchema = z
  .string()
  .refine(isIsoDate, { message: 'Date civile AAAA-MM-JJ invalide.' }) as z.ZodType<IsoDate>;
export const LocalTimeSchema = z
  .string()
  .refine(isLocalTime, { message: 'Heure locale HH:mm invalide.' }) as z.ZodType<LocalTime>;
export const TimeZoneSchema = z
  .string()
  .refine(isTimeZone, { message: 'Fuseau horaire IANA inconnu.' }) as z.ZodType<TimeZone>;
export const IsoWeekdaySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]) as z.ZodType<IsoWeekday>;

export const FsrsRatingSchema = z.enum(['again', 'hard', 'good', 'easy']) as z.ZodType<FsrsRating>;
export const FsrsCardStateNameSchema = z.enum([
  'new',
  'learning',
  'review',
  'relearning',
]) as z.ZodType<FsrsCardStateName>;
export const BrickFormatSchema = z.enum([
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
  'instruction',
  'scripted_dialogue',
  'timer',
]) as z.ZodType<BrickFormat>;
export const ReviewSourceSchema = z.enum([
  'validation',
  'global_quiz',
  'warmup',
  'exercise',
  'exam',
  'self_test',
  'micro_session',
  'sprint',
  'offline',
]) as z.ZodType<ReviewSource>;
export const AttemptKindSchema = z.enum([
  'validation_quiz',
  'global_quiz_session',
  'remediation',
  'exercise',
  'mock_exam',
  'warmup',
  'micro_session',
  'sprint',
  'self_test',
]) as z.ZodType<AttemptKind>;
export const GapNatureSchema = z.enum([
  'forgetting',
  'confusion',
  'misunderstanding',
  'application',
]) as z.ZodType<GapNature>;
export const StudySlotSchema = z.enum(['matin', 'apres_midi', 'soir']) as z.ZodType<StudySlot>;
export const ModuleStatusSchema = z.enum([
  'locked',
  'open',
  'validated',
]) as z.ZodType<ModuleStatus>;
export const SlotKindSchema = z.enum([
  'contributions',
  'course',
  'exercise',
  'validation_quiz',
  'global_quiz',
  'revision',
  'buffer',
  'sprint',
  'mock_exam',
  'warmup',
  'micro_session',
  'weekly_review',
]) as z.ZodType<SlotKind>;
export const SlotStatusSchema = z.enum([
  'planned',
  'done',
  'missed',
  'moved',
  'cancelled',
]) as z.ZodType<SlotStatus>;

/** Carte ts-fsrs sérialisée, forme exacte de notion_states.fsrs + learning_steps (ts-fsrs 5). */
export interface SerializedFsrsCard {
  due: InstantIso;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: FsrsCardStateName;
  last_review: InstantIso | null;
}

export const SerializedFsrsCardSchema = z
  .object({
    due: InstantIsoSchema,
    stability: nonNegativeNumber(),
    difficulty: nonNegativeNumber(),
    elapsed_days: nonNegativeInteger(),
    scheduled_days: nonNegativeInteger(),
    learning_steps: nonNegativeInteger(),
    reps: nonNegativeInteger(),
    lapses: nonNegativeInteger(),
    state: FsrsCardStateNameSchema,
    last_review: InstantIsoSchema.nullable(),
  })
  .strict() as z.ZodType<SerializedFsrsCard>;

export interface GapState {
  nature: GapNature;
  confusedWith: Id | null;
  detectedAt: InstantIso;
  evidence: string;
  clearedAt: InstantIso | null;
}

export const GapStateSchema = z
  .object({
    nature: GapNatureSchema,
    confusedWith: IdSchema.nullable(),
    detectedAt: InstantIsoSchema,
    evidence: z.string(),
    clearedAt: InstantIsoSchema.nullable(),
  })
  .strict() as z.ZodType<GapState>;

export interface NotionState {
  userId: Id;
  notionId: Id;
  fsrs: SerializedFsrsCard | null;
  dueAt: InstantIso | null;
  mastery: number;
  firstSeenAt: InstantIso | null;
  lastSeenAt: InstantIso | null;
  successCount: number;
  gap: GapState | null;
  suspended: boolean;
  inReview: boolean;
}

export const NotionStateSchema = z
  .object({
    userId: IdSchema,
    notionId: IdSchema,
    fsrs: SerializedFsrsCardSchema.nullable(),
    dueAt: InstantIsoSchema.nullable(),
    mastery: masteryNumber(),
    firstSeenAt: InstantIsoSchema.nullable(),
    lastSeenAt: InstantIsoSchema.nullable(),
    successCount: nonNegativeInteger(),
    gap: GapStateSchema.nullable(),
    suspended: z.boolean(),
    inReview: z.boolean(),
  })
  .strict() as z.ZodType<NotionState>;

export interface AnswerRecord {
  answerId: Id;
  attemptId: Id;
  attemptKind: AttemptKind;
  attemptNo: number;
  source: ReviewSource;
  notionIds: Id[];
  format: BrickFormat;
  correct: boolean | null;
  score: number | null;
  maxScore: number | null;
  selfRating: FsrsRating | null;
  timeMs: number;
  answeredAt: InstantIso;
  chosenDistractorNotionId: Id | null;
  confusedWithNotionId: Id | null;
  normalizedResponse: string | null;
  offTopic: boolean;
  countsForGaps: boolean;
}

export const AnswerRecordSchema = z
  .object({
    answerId: IdSchema,
    attemptId: IdSchema,
    attemptKind: AttemptKindSchema,
    attemptNo: positiveInteger(),
    source: ReviewSourceSchema,
    notionIds: z.array(IdSchema).min(1),
    format: BrickFormatSchema,
    correct: z.boolean().nullable(),
    score: nonNegativeNumber().nullable(),
    maxScore: nonNegativeNumber().nullable(),
    selfRating: FsrsRatingSchema.nullable(),
    timeMs: nonNegativeNumber(),
    answeredAt: InstantIsoSchema,
    chosenDistractorNotionId: IdSchema.nullable(),
    confusedWithNotionId: IdSchema.nullable(),
    normalizedResponse: z.string().nullable(),
    offTopic: z.boolean(),
    countsForGaps: z.boolean(),
  })
  .strict() as z.ZodType<AnswerRecord>;

export interface ReviewEvent {
  notionId: Id;
  answerId: Id | null;
  source: ReviewSource;
  rating: FsrsRating;
  correct: boolean;
  timeMs: number;
  reviewedAt: InstantIso;
  before: SerializedFsrsCard | null;
  after: SerializedFsrsCard;
  applied: boolean;
}

export const ReviewEventSchema = z
  .object({
    notionId: IdSchema,
    answerId: IdSchema.nullable(),
    source: ReviewSourceSchema,
    rating: FsrsRatingSchema,
    correct: z.boolean(),
    timeMs: nonNegativeNumber(),
    reviewedAt: InstantIsoSchema,
    before: SerializedFsrsCardSchema.nullable(),
    after: SerializedFsrsCardSchema,
    applied: z.boolean(),
  })
  .strict() as z.ZodType<ReviewEvent>;

export interface Availability {
  hoursPerDay: number;
  studyDays: IsoWeekday[];
  preferredSlots: StudySlot[];
}

const SLOT_ORDER: Readonly<Record<StudySlot, number>> = {
  matin: 0,
  apres_midi: 1,
  soir: 2,
};

function isStrictlyIncreasing(values: readonly number[]): boolean {
  return values.every((value, index) => index === 0 || value > (values[index - 1] ?? value));
}

export const AvailabilitySchema = z
  .object({
    hoursPerDay: integer().refine((value) => value >= 1 && value <= 6, 'heuresPerDay hors 1..6'),
    studyDays: z
      .array(IsoWeekdaySchema)
      .min(1)
      .refine(isStrictlyIncreasing, 'studyDays doit être trié sans doublon'),
    preferredSlots: z
      .array(StudySlotSchema)
      .min(1)
      .refine((slots) => new Set(slots).size === slots.length, 'preferredSlots en double')
      .refine(
        (slots) => isStrictlyIncreasing(slots.map((slot) => SLOT_ORDER[slot])),
        'preferredSlots hors de l’ordre matin < apres_midi < soir',
      ),
  })
  .strict() as z.ZodType<Availability>;

/** Availability with its dedicated error code (SPEC-401 CL-6), path carried in `details.path`. */
export function assertAvailability(value: unknown): Availability {
  const parsed = AvailabilitySchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const path = issue?.path.map(String).join('.') ?? '';
  throw new EngineError('INVALID_AVAILABILITY', issue?.message ?? 'Disponibilité invalide.', {
    path,
  });
}

export interface DateRange {
  startsOn: IsoDate;
  endsOn: IsoDate;
}

export const DateRangeSchema = z
  .object({
    startsOn: IsoDateSchema,
    endsOn: IsoDateSchema,
  })
  .strict()
  .refine(
    (range) => range.endsOn >= range.startsOn,
    'endsOn doit suivre startsOn',
  ) as z.ZodType<DateRange>;

export interface NotionRef {
  notionId: Id;
  moduleId: Id;
  chapterId: Id;
  modulePosition: number;
  position: number;
  label: string;
}

export const NotionRefSchema = z
  .object({
    notionId: IdSchema,
    moduleId: IdSchema,
    chapterId: IdSchema,
    modulePosition: positiveInteger(),
    position: nonNegativeInteger(),
    label: z.string().min(1),
  })
  .strict() as z.ZodType<NotionRef>;

export type NotionLinkKind = 'prerequisite' | 'confusion' | 'tutor';

export interface NotionLinkRef {
  fromNotionId: Id;
  toNotionId: Id;
  kind: NotionLinkKind;
}

export const NotionLinkRefSchema = z
  .object({
    fromNotionId: IdSchema,
    toNotionId: IdSchema,
    kind: z.enum(['prerequisite', 'confusion', 'tutor']),
  })
  .strict()
  .refine(
    (link) => link.fromNotionId !== link.toNotionId,
    'Un lien ne vise pas sa source',
  ) as z.ZodType<NotionLinkRef>;
