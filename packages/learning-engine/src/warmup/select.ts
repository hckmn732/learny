// Deterministic selection of the warm-up notions (SPEC-410, BR-AUT-03, ADR-0148, ADR-0286). The
// function is pure: the learner's local day, the notion projection (local last-seen day, mastery and
// FSRS retrievability), the prerequisite links and every business bound come from the caller.
// Nothing here reads the clock, the database, the network, `@learny/config` or the AI providers.
import { z } from 'zod';

import { EngineError, assertValid } from '../errors';
import { stableShuffle } from '../random';
import { daysBetween } from '../time';
import { IdSchema, IsoDateSchema, NotionLinkRefSchema } from '../types';
import type { Id, IsoDate, NotionLinkRef } from '../types';

/** BR-AUT-03 — scope of the warm-up, mirroring `AUTOMATION_OPTIONS.echauffement.scope`. */
export type WarmupScope = 'yesterday_and_prerequisites' | 'yesterday';

/** EF-5 — why a notion is part of the selection, for the explanation of SPEC-714. */
export type WarmupReason = 'yesterday' | 'prerequisite';

const WarmupScopeSchema = z.enum(['yesterday_and_prerequisites', 'yesterday']);

const finiteNumber = () =>
  z.number().refine((value) => Number.isFinite(value) && !Object.is(value, -0), {
    message: 'Nombre fini requis, -0 refusé.',
  });

const masteryNumber = () =>
  finiteNumber()
    .refine((value) => value >= 0 && value <= 100, 'Maîtrise hors de 0..100.')
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
      message: 'Maîtrise limitée à deux décimales.',
    });

const retrievabilityNumber = () =>
  finiteNumber().refine((value) => value >= 0 && value <= 1, 'Rétrievabilité hors de 0..1.');

const positiveInteger = () =>
  finiteNumber()
    .refine((value) => Number.isInteger(value), 'Entier requis.')
    .refine((value) => value >= 1, 'Entier positif requis.');

/**
 * Business bounds of the warm-up. The service builds them from `ENGINE.warmup`; the defaults
 * mirror those normative values (ADR-0286), checked by the integration test.
 */
export interface WarmupParams {
  readonly defaultCount: number;
  readonly allowedCounts: readonly number[];
  readonly defaultScope: WarmupScope;
  /** ADR-0148 — the reference « veille » is at most this many local days before the session. */
  readonly lookbackDays: number;
}

export const WarmupParamsSchema = z
  .object({
    defaultCount: positiveInteger(),
    allowedCounts: z.array(positiveInteger()).min(1),
    defaultScope: WarmupScopeSchema,
    lookbackDays: positiveInteger(),
  })
  .strict() as z.ZodType<WarmupParams>;

/** Defaults mirror `ENGINE.warmup` (SPEC-401 ET-4, BR-AUT-03). */
export const DEFAULT_WARMUP_PARAMS = {
  defaultCount: 3,
  allowedCounts: [2, 3, 5],
  defaultScope: 'yesterday_and_prerequisites',
  lookbackDays: 7,
} as const satisfies WarmupParams;

/**
 * One notion of the learner's formation. `seenNotions` is a projection of `notion_states` plus the
 * programme: it also carries never-seen notions (`lastSeenOn: null`) so a prerequisite link can be
 * resolved and excluded as CL-3 requires. Dates are local civil days of the learner's time zone
 * (the service derives them from `last_seen_at` and the profile zone); `retrievability` is the
 * FSRS value at the session instant (SPEC-402), null when no card exists.
 */
export interface WarmupNotionState {
  readonly notionId: Id;
  readonly formationId: Id;
  readonly chapterId: Id;
  readonly lastSeenOn: IsoDate | null;
  readonly suspended: boolean;
  readonly mastery: number;
  readonly retrievability: number | null;
}

export const WarmupNotionStateSchema = z
  .object({
    notionId: IdSchema,
    formationId: IdSchema,
    chapterId: IdSchema,
    lastSeenOn: IsoDateSchema.nullable(),
    suspended: z.boolean(),
    mastery: masteryNumber(),
    retrievability: retrievabilityNumber().nullable(),
  })
  .strict() as z.ZodType<WarmupNotionState>;

/** ET-1 — explicit input of the selection. */
export interface SelectWarmupInput {
  /** Formation of the upcoming session: notions of another formation are excluded (EF-3). */
  readonly formationId: Id;
  readonly seenNotions: readonly WarmupNotionState[];
  /** Programme and personal `notion_links`; only `prerequisite` links are read (ET-2). */
  readonly prerequisiteLinks: readonly NotionLinkRef[];
  readonly nextChapterId: Id;
  /** Chapters the learner may currently open; the upcoming chapter belongs to it (EF-3). */
  readonly accessibleChapterIds: readonly Id[];
  /** Local civil day of the session in the learner's time zone (ET-2). */
  readonly localDate: IsoDate;
  readonly scope?: WarmupScope;
  /** 2, 3 or 5 by default; any value outside `params.allowedCounts` is refused. */
  readonly count?: number;
  readonly seed: string;
  readonly params?: WarmupParams;
}

export const SelectWarmupInputSchema = z
  .object({
    formationId: IdSchema,
    seenNotions: z.array(WarmupNotionStateSchema),
    prerequisiteLinks: z.array(NotionLinkRefSchema),
    nextChapterId: IdSchema,
    accessibleChapterIds: z.array(IdSchema),
    localDate: IsoDateSchema,
    scope: WarmupScopeSchema.optional(),
    count: positiveInteger().optional(),
    seed: z.string(),
    params: WarmupParamsSchema.optional(),
  })
  .strict() as z.ZodType<SelectWarmupInput>;

/** EF-5 — one reasoned choice, in display order. */
export interface WarmupChoice {
  readonly notionId: Id;
  readonly reason: WarmupReason;
}

/** A candidate with the data that ranked it, exposed for explanations (SPEC-714) and the demo. */
export interface WarmupCandidate {
  readonly notionId: Id;
  readonly reason: WarmupReason;
  readonly lastSeenOn: IsoDate | null;
  readonly mastery: number;
  readonly retrievability: number | null;
}

/**
 * Candidate sets of the selection. `yesterdayOn` is the reference local day of ADR-0148 (the most
 * recent day at most `lookbackDays` before the session where an eligible notion was studied), or
 * null when no such day exists.
 */
export interface WarmupCandidates {
  readonly yesterdayOn: IsoDate | null;
  readonly yesterday: readonly WarmupCandidate[];
  readonly prerequisites: readonly WarmupCandidate[];
}

interface ResolvedWarmup {
  readonly scope: WarmupScope;
  readonly count: number;
  readonly seed: string;
  readonly candidates: WarmupCandidates;
}

function invalidInput(path: string, message: string): EngineError {
  return new EngineError('INVALID_INPUT', message, { path });
}

function invalidParam(path: string, message: string): EngineError {
  return new EngineError('INVALID_PARAM', message, { path });
}

function resolveParams(params: WarmupParams | undefined): WarmupParams {
  const resolved = assertValid(WarmupParamsSchema, params ?? DEFAULT_WARMUP_PARAMS);
  if (new Set(resolved.allowedCounts).size !== resolved.allowedCounts.length) {
    throw invalidParam('allowedCounts', 'allowedCounts ne contient pas de doublon.');
  }
  if (!resolved.allowedCounts.includes(resolved.defaultCount)) {
    throw invalidParam('defaultCount', 'defaultCount doit figurer dans allowedCounts.');
  }
  return resolved;
}

function compareCandidates(left: WarmupCandidate, right: WarmupCandidate): number {
  // ADR-0148 — increasing retrievability (weakest memory first), then increasing mastery, then id.
  const leftRetrievability = left.retrievability ?? Number.POSITIVE_INFINITY;
  const rightRetrievability = right.retrievability ?? Number.POSITIVE_INFINITY;
  if (leftRetrievability !== rightRetrievability) {
    return leftRetrievability - rightRetrievability;
  }
  if (left.mastery !== right.mastery) return left.mastery - right.mastery;
  if (left.notionId === right.notionId) return 0;
  return left.notionId < right.notionId ? -1 : 1;
}

function toCandidate(state: WarmupNotionState, reason: WarmupReason): WarmupCandidate {
  return {
    notionId: state.notionId,
    reason,
    lastSeenOn: state.lastSeenOn,
    mastery: state.mastery,
    retrievability: state.retrievability,
  };
}

function assertConsistency(input: SelectWarmupInput): void {
  if (!input.accessibleChapterIds.includes(input.nextChapterId)) {
    throw invalidInput(
      'nextChapterId',
      'Le chapitre à venir doit appartenir aux chapitres accessibles.',
    );
  }
  const notionIds = new Set<Id>();
  input.seenNotions.forEach((notion, index) => {
    if (notionIds.has(notion.notionId)) {
      throw invalidInput(`seenNotions.${String(index)}.notionId`, 'Notion en double.');
    }
    notionIds.add(notion.notionId);
    if (notion.lastSeenOn !== null && notion.lastSeenOn > input.localDate) {
      throw invalidInput(
        `seenNotions.${String(index)}.lastSeenOn`,
        'Une notion ne peut pas être vue après le jour local de la séance.',
      );
    }
  });
}

function buildCandidates(
  seenNotions: readonly WarmupNotionState[],
  links: readonly NotionLinkRef[],
  formationId: Id,
  nextChapterId: Id,
  accessibleChapterIds: readonly Id[],
  localDate: IsoDate,
  lookbackDays: number,
): WarmupCandidates {
  const accessible = new Set(accessibleChapterIds);
  const notionById = new Map<Id, WarmupNotionState>();
  for (const notion of seenNotions) notionById.set(notion.notionId, notion);

  const base = seenNotions.filter(
    (notion) =>
      notion.formationId === formationId &&
      !notion.suspended &&
      accessible.has(notion.chapterId) &&
      notion.lastSeenOn !== null,
  );

  // ADR-0148 1 — the most recent local study day, strictly before the session, within the bound.
  let yesterdayOn: IsoDate | null = null;
  for (const notion of base) {
    const day = notion.lastSeenOn;
    if (day === null || day >= localDate) continue;
    if (daysBetween(day, localDate) > lookbackDays) continue;
    if (yesterdayOn === null || day > yesterdayOn) yesterdayOn = day;
  }
  const yesterday =
    yesterdayOn === null
      ? []
      : base
          .filter((notion) => notion.lastSeenOn === yesterdayOn)
          .map((notion) => toCandidate(notion, 'yesterday'))
          .sort(compareCandidates);

  // ADR-0148 2 — direct origins of prerequisite links whose target belongs to the next chapter.
  const nextChapterNotions = new Set<Id>();
  for (const notion of seenNotions) {
    if (notion.formationId === formationId && notion.chapterId === nextChapterId) {
      nextChapterNotions.add(notion.notionId);
    }
  }
  const originIds = new Set<Id>();
  for (const link of links) {
    if (link.kind !== 'prerequisite') continue;
    if (!nextChapterNotions.has(link.toNotionId)) continue;
    if (link.fromNotionId === link.toNotionId) continue;
    originIds.add(link.fromNotionId);
  }
  const baseById = new Map<Id, WarmupNotionState>();
  for (const notion of base) baseById.set(notion.notionId, notion);
  const prerequisites = [...originIds]
    .flatMap((notionId) => {
      const notion = baseById.get(notionId);
      // Never seen, suspended, other formation or inaccessible chapter (EF-3).
      if (notion === undefined) return [];
      // The upcoming chapter cannot be its own prerequisite (ADR-0148 2).
      if (notion.chapterId === nextChapterId) return [];
      return [toCandidate(notion, 'prerequisite')];
    })
    .sort(compareCandidates);

  return { yesterdayOn, yesterday, prerequisites };
}

function resolveWarmup(input: SelectWarmupInput): ResolvedWarmup {
  const parsed = assertValid(SelectWarmupInputSchema, input);
  assertConsistency(parsed);
  const params = resolveParams(parsed.params);
  const scope = parsed.scope ?? params.defaultScope;
  const count = parsed.count ?? params.defaultCount;
  if (!params.allowedCounts.includes(count)) {
    throw invalidParam(
      'count',
      `${String(count)} n’est pas une taille autorisée (${params.allowedCounts.join(', ')}).`,
    );
  }
  const candidates = buildCandidates(
    parsed.seenNotions,
    parsed.prerequisiteLinks,
    parsed.formationId,
    parsed.nextChapterId,
    parsed.accessibleChapterIds,
    parsed.localDate,
    params.lookbackDays,
  );
  return {
    scope,
    count,
    seed: parsed.seed,
    candidates,
  };
}

/**
 * The reference « veille » and the ranked candidate sets, without drawing. Exposed for the SDD
 * demonstration and for SPEC-714 explanations: the engine itself never corrects a learner answer.
 */
export function warmupCandidates(input: SelectWarmupInput): WarmupCandidates {
  return resolveWarmup(input).candidates;
}

/**
 * ET-1, EF-1 to EF-5, CL-1 to CL-5 — selects at most `count` notions. ADR-0148 gives the two
 * priority picks (best prerequisite, then best notion of the reference day, deduplicated with the
 * `yesterday` reason winning); the canonical order (retrievability, mastery, identifier) fixes the
 * base order of the remaining candidates and a seeded stable shuffle brings the variety required
 * by EF-4 without ever depending on the caller's input order. Less than `count` eligible notions
 * returns only those notions, never a placeholder.
 */
export function selectWarmup(input: SelectWarmupInput): WarmupChoice[] {
  const resolved = resolveWarmup(input);
  const { candidates, count, scope, seed } = resolved;
  const yesterdayIds = new Set(candidates.yesterday.map((candidate) => candidate.notionId));
  const choices: WarmupChoice[] = [];
  const chosen = new Set<Id>();
  const add = (notionId: Id, reason: WarmupReason): void => {
    if (chosen.has(notionId)) return;
    chosen.add(notionId);
    choices.push({ notionId, reason });
  };

  if (scope === 'yesterday_and_prerequisites' && candidates.prerequisites.length > 0) {
    // Prefer a prerequisite that is not also a notion of the reference day, so both priorities are
    // represented when possible; an overlapping notion keeps `yesterday` (CL-4).
    const first =
      candidates.prerequisites.find((candidate) => !yesterdayIds.has(candidate.notionId)) ??
      candidates.prerequisites[0];
    if (first !== undefined) {
      add(first.notionId, yesterdayIds.has(first.notionId) ? 'yesterday' : 'prerequisite');
    }
  }

  if (choices.length < count) {
    const firstYesterday = candidates.yesterday.find(
      (candidate) => !chosen.has(candidate.notionId),
    );
    if (firstYesterday !== undefined) add(firstYesterday.notionId, 'yesterday');
  }

  if (choices.length < count) {
    const pool = new Map<Id, WarmupCandidate>();
    const sources =
      scope === 'yesterday_and_prerequisites'
        ? [...candidates.yesterday, ...candidates.prerequisites]
        : candidates.yesterday;
    for (const candidate of sources) {
      if (chosen.has(candidate.notionId)) continue;
      const current = pool.get(candidate.notionId);
      if (current === undefined || candidate.reason === 'yesterday') {
        pool.set(candidate.notionId, candidate);
      }
    }
    const remaining = [...pool.values()].sort(compareCandidates);
    for (const candidate of stableShuffle(remaining, seed, (item) => item.notionId)) {
      if (choices.length >= count) break;
      add(candidate.notionId, yesterdayIds.has(candidate.notionId) ? 'yesterday' : 'prerequisite');
    }
  }

  return choices;
}
