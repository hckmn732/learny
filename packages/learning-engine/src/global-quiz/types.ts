// Contracts of the daily global quiz session (SPEC-406 ET-1, BR-MEM-03, BR-MEM-04). Every input
// is explicit and every collection is canonicalised by the builder: the session depends on the
// supplied date, seed, FSRS state (through `dueAt`) and bank only, never on the clock or config.
import { z } from 'zod';

import {
  BrickFormatSchema,
  GapNatureSchema,
  IdSchema,
  InstantIsoSchema,
  IsoDateSchema,
  ModuleStatusSchema,
} from '../types';
import type { BrickFormat, GapNature, Id, InstantIso, IsoDate, ModuleStatus } from '../types';

/** Full daily session, short micro-session or five-minute maintenance interview. */
export type GlobalQuizMode = 'full' | 'micro' | 'maintenance';

/** BR-AUT-05 — learner preference for the game chosen from a gap. */
export type GlobalQuizFormatPreference = 'vary' | 'cards' | 'matching_categorization';

export const GlobalQuizModeSchema = z.enum([
  'full',
  'micro',
  'maintenance',
]) as z.ZodType<GlobalQuizMode>;

export const GlobalQuizFormatPreferenceSchema = z.enum([
  'vary',
  'cards',
  'matching_categorization',
]) as z.ZodType<GlobalQuizFormatPreference>;

/**
 * A due notion of one formation. `moduleStatus` drives BR-MEM-03: a validated module contributes
 * every due notion, the current open module only once it has been evaluated (CL-5).
 */
export interface GlobalQuizDueNotion {
  notionId: Id;
  moduleId: Id;
  modulePosition: number;
  moduleStatus: ModuleStatus;
  evaluated: boolean;
  dueAt: InstantIso;
}

export const GlobalQuizDueNotionSchema = z
  .object({
    notionId: IdSchema,
    moduleId: IdSchema,
    modulePosition: z.number().int().min(1),
    moduleStatus: ModuleStatusSchema,
    evaluated: z.boolean(),
    dueAt: InstantIsoSchema,
  })
  .strict() as z.ZodType<GlobalQuizDueNotion>;

/** Active gap of a notion; `confusedWith` is irrelevant to format choice and not repeated here. */
export interface GlobalQuizGap {
  notionId: Id;
  nature: GapNature;
}

export const GlobalQuizGapSchema = z
  .object({
    notionId: IdSchema,
    nature: GapNatureSchema,
  })
  .strict() as z.ZodType<GlobalQuizGap>;

/** Formats available in the learner's bank for one notion (BR-MEM-07, SPEC-513). */
export interface GlobalQuizBank {
  notionId: Id;
  formats: readonly BrickFormat[];
}

export const GlobalQuizBankSchema = z
  .object({
    notionId: IdSchema,
    formats: z.array(BrickFormatSchema),
  })
  .strict() as z.ZodType<GlobalQuizBank>;

/** Last format presented for a notion (BR-MEM-04). */
export interface GlobalQuizLastFormat {
  notionId: Id;
  format: BrickFormat;
}

export const GlobalQuizLastFormatSchema = z
  .object({
    notionId: IdSchema,
    format: BrickFormatSchema,
  })
  .strict() as z.ZodType<GlobalQuizLastFormat>;

/**
 * Business bounds passed by the service (never imported by this module): average notion cost,
 * one-off session overhead, estimated seconds per quiz format and the BR-AUT-07/ADR-0015
 * five-minute maintenance bound.
 */
export interface GlobalQuizParams {
  notionCostSec: number;
  sessionOverheadSec: number;
  formatSeconds: Readonly<Partial<Record<BrickFormat, number>>>;
  maintenanceMaxMinutes: number;
}

export const GlobalQuizParamsSchema = z.object({
  notionCostSec: z.number().positive(),
  sessionOverheadSec: z.number().min(0),
  formatSeconds: z.partialRecord(BrickFormatSchema, z.number().positive()),
  maintenanceMaxMinutes: z.number().int().positive(),
}) as z.ZodType<GlobalQuizParams>;

export interface BuildDailySessionInput {
  formationId: Id;
  date: IsoDate;
  dueNotions: readonly GlobalQuizDueNotion[];
  gaps: readonly GlobalQuizGap[];
  bank: readonly GlobalQuizBank[];
  lastFormats: readonly GlobalQuizLastFormat[];
  capMinutes: number;
  mode: GlobalQuizMode;
  seed: string;
  preference?: GlobalQuizFormatPreference;
  params: GlobalQuizParams;
}

export const BuildDailySessionInputSchema = z
  .object({
    formationId: IdSchema,
    date: IsoDateSchema,
    dueNotions: z.array(GlobalQuizDueNotionSchema),
    gaps: z.array(GlobalQuizGapSchema),
    bank: z.array(GlobalQuizBankSchema),
    lastFormats: z.array(GlobalQuizLastFormatSchema),
    capMinutes: z.number().int().positive(),
    mode: GlobalQuizModeSchema,
    seed: z.string(),
    preference: GlobalQuizFormatPreferenceSchema.optional(),
    params: GlobalQuizParamsSchema,
  })
  .strict() as z.ZodType<BuildDailySessionInput>;

/** Why the notion enters the session: an active gap or its FSRS due date alone. */
export type SessionSelectionReason = 'gap' | 'due';

/** Why the format was chosen; `bank_constraint` asks SPEC-513 for a new variant (CL-4). */
export type SessionFormatReason =
  'gap_nature' | 'preference' | 'varied' | 'first_use' | 'only_format' | 'bank_constraint';

export interface DailySessionItem {
  notionId: Id;
  moduleId: Id;
  modulePosition: number;
  format: BrickFormat;
  gapNature: GapNature | null;
  selectionReason: SessionSelectionReason;
  formatReason: SessionFormatReason;
  /** CL-4 — the last format was the only one available: a variant must be generated. */
  variantRequested: boolean;
  estimatedSeconds: number;
}

/** EF-2 — a notion that is not played today; its FSRS state is never modified. */
export type DeferredReason =
  'cap' | 'awaiting_variant' | 'module_not_eligible' | 'maintenance_validated_only';

export interface DeferredNotion {
  notionId: Id;
  moduleId: Id;
  dueAt: InstantIso;
  reason: DeferredReason;
  /** Next civil day proposed for `cap`/`awaiting_variant`; `null` when not playable yet. */
  proposedFor: IsoDate | null;
}

/** ET-3 — explicit exhaustion signal for SPEC-513, never a fake item. */
export type ExhaustedReason = 'missing_bank' | 'no_valid_format' | 'imposed_format_unavailable';

export interface ExhaustedNotion {
  notionId: Id;
  moduleId: Id;
  reason: ExhaustedReason;
  requiredFormats: readonly BrickFormat[];
  availableFormats: readonly BrickFormat[];
}

export interface DailySession {
  formationId: Id;
  date: IsoDate;
  mode: GlobalQuizMode;
  seed: string;
  requestedCapMinutes: number;
  /** Effective cap: `capMinutes`, bounded by `maintenanceMaxMinutes` in maintenance mode. */
  capMinutes: number;
  items: DailySessionItem[];
  deferred: DeferredNotion[];
  exhausted: ExhaustedNotion[];
  estimatedMinutes: number;
}
