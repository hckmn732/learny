// Deterministic draw of one validation attempt (SPEC-405, BR-QUI-03, ADR-0014, ADR-0143,
// ADR-0170, ADR-0284). The function is pure: the notions, the bank, the seen fingerprints, the
// gaps, the business parameters and the seed are explicit inputs. It never reads the clock, the
// database, the network or `@learny/config`; services pass `ENGINE.draw` and the mastery threshold.
import { z } from 'zod';

import { EngineError } from '../errors';
import { createSeededRandom, stableShuffle } from '../random';
import { BrickFormatSchema, GapNatureSchema, IdSchema } from '../types';
import type { BrickFormat, GapNature, Id, NotionRef } from '../types';

/** Share of ADR-0170: code-corrected formats (choice_question, cloze, matching) or open_question. */
export type DrawShare = 'choice' | 'open';

/** Formats counted in the choice share of a validation attempt (ADR-0170, ADR-0284). */
export const CHOICE_FORMATS = [
  'choice_question',
  'cloze',
  'matching',
] as const satisfies readonly BrickFormat[];

/** Formats counted in the open share of a validation attempt (ADR-0170, ADR-0284). */
export const OPEN_FORMATS = ['open_question'] as const satisfies readonly BrickFormat[];

const CHOICE: ReadonlySet<BrickFormat> = new Set(CHOICE_FORMATS);
const OPEN: ReadonlySet<BrickFormat> = new Set(OPEN_FORMATS);

/** Domain order of BR-LAC-03, reused to break quotas and coverage ties (ADR-0143). */
const NATURE_PRIORITY: Readonly<Record<GapNature, number>> = {
  confusion: 0,
  application: 1,
  misunderstanding: 2,
  forgetting: 3,
};

export type DrawBrickStatus = 'active' | 'reported' | 'retired';

/** A notion of the module with the mastery known at draw time (null when never measured). */
export interface DrawNotion extends NotionRef {
  mastery?: number | null | undefined;
}

const finiteNumber = () =>
  z.number().refine((value) => Number.isFinite(value) && !Object.is(value, -0), {
    message: 'Nombre fini requis, -0 refusé.',
  });
const nonNegativeInteger = () =>
  finiteNumber().refine((value) => Number.isInteger(value) && value >= 0, 'Entier positif requis.');
const positiveInteger = () =>
  finiteNumber().refine((value) => Number.isInteger(value) && value >= 1, 'Entier positif requis.');

export const DrawNotionSchema = z
  .object({
    notionId: IdSchema,
    moduleId: IdSchema,
    chapterId: IdSchema,
    modulePosition: positiveInteger(),
    position: nonNegativeInteger(),
    label: z.string().min(1),
    mastery: finiteNumber()
      .refine((value) => value >= 0 && value <= 100, 'Maîtrise hors de 0..100.')
      .nullable()
      .optional(),
  })
  .strict();

export const DrawGapSchema = z
  .object({
    notionId: IdSchema,
    nature: GapNatureSchema,
  })
  .strict();

export const DrawBrickSchema = z
  .object({
    brickId: IdSchema,
    brickVersionId: IdSchema,
    notionIds: z.array(IdSchema).min(1).max(50),
    format: BrickFormatSchema,
    status: z.enum(['active', 'reported', 'retired']),
    valid: z.boolean(),
    ownedByLearner: z.boolean(),
    fingerprint: z
      .string()
      .regex(/^[0-9a-f]{64}$/, 'Empreinte SHA-256 hexadécimale attendue.')
      .nullable(),
  })
  .strict();

/** An open gap of a notion, as returned by SPEC-404. */
export interface DrawGap {
  notionId: Id;
  nature: GapNature;
}

/** A bank brick with the flags read by the service (owner, validity, status, fingerprint). */
export interface DrawBrick {
  brickId: Id;
  brickVersionId: Id;
  notionIds: readonly Id[];
  format: BrickFormat;
  status: DrawBrickStatus;
  valid: boolean;
  ownedByLearner: boolean;
  fingerprint: string | null;
}

/** Business bounds passed by the service (`ENGINE.draw` + `ENGINE.mastery.threshold`). */
export interface DrawParams {
  defaultSize: number;
  minSize: number;
  maxSize: number;
  openShare: number;
  minOpen: number;
  gapWeight: number;
  weakWeight: number;
  baseWeight: number;
  totalPoints: number;
  masteryThreshold: number;
}

export const DrawParamsSchema = z
  .object({
    defaultSize: positiveInteger(),
    minSize: positiveInteger(),
    maxSize: positiveInteger(),
    openShare: finiteNumber().refine(
      (value) => value >= 0 && value <= 1,
      'La part ouverte doit être dans 0..1.',
    ),
    minOpen: nonNegativeInteger(),
    gapWeight: finiteNumber().refine((value) => value >= 0, 'Poids négatif.'),
    weakWeight: finiteNumber().refine((value) => value >= 0, 'Poids négatif.'),
    baseWeight: finiteNumber().refine((value) => value >= 0, 'Poids négatif.'),
    totalPoints: finiteNumber().refine((value) => value > 0, 'Total de points positif requis.'),
    masteryThreshold: finiteNumber().refine(
      (value) => value >= 0 && value <= 100,
      'Seuil de maîtrise hors de 0..100.',
    ),
  })
  .strict()
  .refine((params) => params.minSize <= params.maxSize, 'minSize doit précéder maxSize.')
  .refine(
    (params) => params.defaultSize >= params.minSize && params.defaultSize <= params.maxSize,
    'defaultSize doit être dans les bornes.',
  )
  .refine((params) => params.minOpen <= params.maxSize, 'minOpen dépasse maxSize.')
  .refine(
    (params) => params.gapWeight + params.weakWeight + params.baseWeight > 0,
    'Au moins un poids doit être positif.',
  );

export interface DrawAttemptInput {
  notions: readonly DrawNotion[];
  bank: readonly DrawBrick[];
  seenFingerprints: readonly string[];
  gaps: readonly DrawGap[];
  params: DrawParams;
  /** Defaults to `params.defaultSize` (12 for the normative configuration, ET-1). */
  targetCount?: number;
  seed: string;
}

/** One drawn question, with the notions it counts for and its share. */
export interface DrawnQuestion {
  brickId: Id;
  brickVersionId: Id;
  notionId: Id;
  notionIds: readonly Id[];
  format: BrickFormat;
  share: DrawShare;
  fingerprint: string;
  points: number;
}

export type DrawExhaustionReason = 'capacity' | 'bank_exhausted' | 'size_limit';

/** Explicit exhaustion of one notion: no question invented, the caller asks SPEC-513 for more. */
export interface DrawNotionExhaustion {
  notionId: Id;
  reason: DrawExhaustionReason;
  requested: number;
  selected: number;
  formats: readonly DrawShare[];
}

/** Quota, weight and selected count of every notion, in priority order (demonstration/report). */
export interface DrawNotionPlan {
  notionId: Id;
  priority: number;
  gap: boolean;
  mastery: number | null;
  weight: number;
  quota: number;
  selected: number;
}

export interface DrawDiagnostics {
  bankSize: number;
  eligible: number;
  seenExcluded: number;
  unseen: number;
  duplicateFingerprints: number;
  unique: number;
}

export interface DrawAttemptResult {
  questions: readonly DrawnQuestion[];
  exhausted: readonly DrawNotionExhaustion[];
  uncoveredNotionIds: readonly Id[];
  exhaustedFormats: readonly DrawShare[];
  coverageLimited: boolean;
  minimumReached: boolean;
  targetCount: number;
  size: number;
  pointsTotal: number;
  plan: readonly DrawNotionPlan[];
  diagnostics: DrawDiagnostics;
  seed: string;
}

interface InternalNotion {
  ref: DrawNotion;
  gap: GapNature | null;
  mastery: number | null;
  weight: number;
  rank: number;
  quota: number;
  served: number;
  openQuota: number;
  openServed: number;
}

interface Candidate {
  brick: DrawBrick;
  linked: readonly Id[];
  share: DrawShare;
  fingerprint: string;
  weight: number;
}

interface SelectedCandidate {
  candidate: Candidate;
  servedNotion: Id;
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function shareOf(format: BrickFormat): DrawShare | null {
  if (CHOICE.has(format)) return 'choice';
  if (OPEN.has(format)) return 'open';
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseInput(input: DrawAttemptInput): DrawAttemptInput {
  if (!Array.isArray(input.notions)) {
    throw new EngineError('INVALID_INPUT', 'notions doit être un tableau.', { path: 'notions' });
  }
  if (!Array.isArray(input.bank)) {
    throw new EngineError('INVALID_INPUT', 'bank doit être un tableau.', { path: 'bank' });
  }
  if (!Array.isArray(input.seenFingerprints)) {
    throw new EngineError('INVALID_INPUT', 'seenFingerprints doit être un tableau.', {
      path: 'seenFingerprints',
    });
  }
  if (!Array.isArray(input.gaps)) {
    throw new EngineError('INVALID_INPUT', 'gaps doit être un tableau.', { path: 'gaps' });
  }
  if (typeof input.seed !== 'string') {
    throw new EngineError('INVALID_INPUT', 'seed doit être une chaîne.', { path: 'seed' });
  }

  const params = DrawParamsSchema.safeParse(input.params);
  if (!params.success) {
    const issue = params.error.issues[0];
    throw new EngineError('INVALID_INPUT', issue?.message ?? 'Paramètres invalides.', {
      path: ['params', ...(issue?.path.map(String) ?? [])].join('.'),
    });
  }

  const targetCount = input.targetCount ?? params.data.defaultSize;
  if (
    !Number.isInteger(targetCount) ||
    targetCount < params.data.minSize ||
    targetCount > params.data.maxSize
  ) {
    throw new EngineError(
      'INVALID_INPUT',
      `targetCount doit être un entier entre ${String(params.data.minSize)} et ${String(params.data.maxSize)}.`,
      { path: 'targetCount' },
    );
  }

  const notions = validateCollection(DrawNotionSchema, input.notions, 'notions');
  const bank = validateCollection(DrawBrickSchema, input.bank, 'bank');
  const gaps = validateCollection(DrawGapSchema, input.gaps, 'gaps');
  const seenFingerprints = validateCollection(
    z.string(),
    input.seenFingerprints,
    'seenFingerprints',
  );

  return {
    notions,
    bank,
    gaps,
    seenFingerprints,
    params: params.data,
    targetCount,
    seed: input.seed,
  };
}

function validateCollection<T>(
  schema: z.ZodType<T>,
  values: readonly unknown[],
  path: string,
): T[] {
  return values.map((value, index) => {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    throw new EngineError('INVALID_INPUT', issue?.message ?? 'Entrée invalide.', {
      path: `${path}.${String(index)}${issue?.path.length ? `.${issue.path.map(String).join('.')}` : ''}`,
    });
  });
}

function compareRawNotions(left: DrawNotion, right: DrawNotion): number {
  return (
    left.modulePosition - right.modulePosition ||
    left.position - right.position ||
    compareText(left.notionId, right.notionId) ||
    compareText(left.label, right.label) ||
    (left.mastery ?? -1) - (right.mastery ?? -1)
  );
}

function gapPriority(nature: GapNature | null): number {
  return nature === null ? Number.POSITIVE_INFINITY : NATURE_PRIORITY[nature];
}

function compareNotions(left: InternalNotion, right: InternalNotion): number {
  const leftGap = left.gap === null ? 0 : 1;
  const rightGap = right.gap === null ? 0 : 1;
  if (leftGap !== rightGap) return rightGap - leftGap;
  if (left.gap !== null && right.gap !== null) {
    const nature = gapPriority(left.gap) - gapPriority(right.gap);
    if (nature !== 0) return nature;
  }
  const leftMastery = left.mastery ?? Number.POSITIVE_INFINITY;
  const rightMastery = right.mastery ?? Number.POSITIVE_INFINITY;
  if (leftMastery !== rightMastery) return leftMastery - rightMastery;
  return (
    left.ref.modulePosition - right.ref.modulePosition ||
    left.ref.position - right.ref.position ||
    compareText(left.ref.notionId, right.ref.notionId)
  );
}

function canonicalNotions(
  notions: readonly DrawNotion[],
  gaps: readonly DrawGap[],
  params: DrawParams,
): InternalNotion[] {
  const gapByNotion = new Map<Id, GapNature>();
  const orderedGaps = [...gaps].sort(
    (left, right) =>
      gapPriority(left.nature) - gapPriority(right.nature) ||
      compareText(left.notionId, right.notionId),
  );
  for (const gap of orderedGaps) {
    if (!gapByNotion.has(gap.notionId)) gapByNotion.set(gap.notionId, gap.nature);
  }

  const unique = new Map<Id, DrawNotion>();
  for (const notion of [...notions].sort(compareRawNotions)) {
    if (!unique.has(notion.notionId)) unique.set(notion.notionId, notion);
  }

  const internal = [...unique.values()].map((ref) => {
    const gap = gapByNotion.get(ref.notionId) ?? null;
    const mastery = ref.mastery ?? null;
    const weight =
      gap !== null
        ? params.gapWeight
        : mastery !== null && mastery < params.masteryThreshold
          ? params.weakWeight
          : params.baseWeight;
    return {
      ref,
      gap,
      mastery,
      weight,
      rank: 0,
      quota: 0,
      served: 0,
      openQuota: 0,
      openServed: 0,
    };
  });

  internal.sort(compareNotions);
  for (const [rank, notion] of internal.entries()) notion.rank = rank;
  return internal;
}

function compareCandidateForDedupe(left: Candidate, right: Candidate): number {
  return (
    right.linked.length - left.linked.length ||
    (left.linked[0] !== undefined && right.linked[0] !== undefined
      ? compareText(left.linked[0], right.linked[0])
      : 0) ||
    compareText(left.brick.brickId, right.brick.brickId) ||
    compareText(left.brick.brickVersionId, right.brick.brickVersionId)
  );
}

function compareCandidate(left: Candidate, right: Candidate): number {
  return (
    compareText(left.linked[0] ?? '', right.linked[0] ?? '') ||
    compareText(left.brick.brickId, right.brick.brickId) ||
    compareText(left.brick.brickVersionId, right.brick.brickVersionId)
  );
}

interface CandidateSet {
  unique: Candidate[];
  byNotion: Map<Id, Candidate[]>;
  diagnostics: DrawDiagnostics;
}

function buildCandidates(
  notions: readonly InternalNotion[],
  bank: readonly DrawBrick[],
  seenFingerprints: readonly string[],
  params: DrawParams,
): CandidateSet {
  const rankById = new Map(notions.map((notion) => [notion.ref.notionId, notion.rank]));
  const weightById = new Map(notions.map((notion) => [notion.ref.notionId, notion.weight]));
  const seen = new Set(seenFingerprints);
  const candidates: Candidate[] = [];
  let eligible = 0;
  let seenExcluded = 0;

  for (const brick of bank) {
    if (
      brick.status !== 'active' ||
      !brick.valid ||
      !brick.ownedByLearner ||
      brick.fingerprint === null
    ) {
      continue;
    }
    const share = shareOf(brick.format);
    if (share === null) continue;
    const linked = [...new Set(brick.notionIds)]
      .filter((notionId) => rankById.has(notionId))
      .sort((left, right) => (rankById.get(left) ?? 0) - (rankById.get(right) ?? 0));
    if (linked.length === 0) continue;
    eligible += 1;
    if (seen.has(brick.fingerprint)) {
      seenExcluded += 1;
      continue;
    }
    const weight = Math.max(
      ...linked.map((notionId) => weightById.get(notionId) ?? params.baseWeight),
    );
    candidates.push({
      brick,
      linked,
      share,
      fingerprint: brick.fingerprint,
      weight,
    });
  }

  const seenCandidates = candidates.length;
  const byFingerprint = new Map<string, Candidate>();
  const ordered = [...candidates].sort(compareCandidateForDedupe);
  for (const candidate of ordered) {
    if (!byFingerprint.has(candidate.fingerprint)) {
      byFingerprint.set(candidate.fingerprint, candidate);
    }
  }
  const unique = [...byFingerprint.values()].sort(compareCandidate);
  const byNotion = new Map<Id, Candidate[]>();
  for (const candidate of unique) {
    for (const notionId of candidate.linked) {
      const list = byNotion.get(notionId);
      if (list === undefined) byNotion.set(notionId, [candidate]);
      else list.push(candidate);
    }
  }

  return {
    unique,
    byNotion,
    diagnostics: {
      bankSize: bank.length,
      eligible,
      seenExcluded,
      unseen: seenCandidates,
      duplicateFingerprints: seenCandidates - unique.length,
      unique: unique.length,
    },
  };
}

function allocateQuotas(coverage: readonly InternalNotion[], targetCount: number): void {
  const extra = targetCount - coverage.length;
  if (coverage.length === 0) return;
  const totalWeight = coverage.reduce((sum, notion) => sum + notion.weight, 0);
  const remainders: Array<{ notion: InternalNotion; remainder: number }> = [];

  for (const notion of coverage) {
    const exact = totalWeight > 0 ? (extra * notion.weight) / totalWeight : extra / coverage.length;
    const floor = Math.floor(exact + 1e-9);
    notion.quota = 1 + floor;
    remainders.push({ notion, remainder: exact - floor });
  }

  let leftover = targetCount - coverage.reduce((sum, notion) => sum + notion.quota, 0);
  remainders.sort(
    (left, right) => right.remainder - left.remainder || left.notion.rank - right.notion.rank,
  );
  for (const entry of remainders) {
    if (leftover <= 0) break;
    entry.notion.quota += 1;
    leftover -= 1;
  }
  // Floating-point safety: the quotas always add up to the requested size.
  let cursor = 0;
  while (leftover > 0 && coverage.length > 0) {
    const notion = coverage[cursor % coverage.length];
    if (notion !== undefined) notion.quota += 1;
    leftover -= 1;
    cursor += 1;
  }
}

function allocateOpenQuotas(
  coverage: readonly InternalNotion[],
  targetCount: number,
  params: DrawParams,
): number {
  if (coverage.length === 0) return 0;
  const total = Math.min(
    targetCount,
    Math.max(params.minOpen, Math.round(params.openShare * targetCount)),
  );
  let assigned = 0;
  let cursor = 0;
  const guard = coverage.length * (total + 1);
  while (assigned < total && cursor < guard) {
    const notion = coverage[cursor % coverage.length];
    if (notion !== undefined && notion.openQuota < notion.quota) {
      notion.openQuota += 1;
      assigned += 1;
    }
    cursor += 1;
  }
  return total;
}

function pickUniform(pool: readonly Candidate[], random: () => number): Candidate | undefined {
  if (pool.length === 0) return undefined;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}

function pickWeighted(pool: readonly Candidate[], random: () => number): Candidate | undefined {
  if (pool.length === 0) return undefined;
  const total = pool.reduce((sum, candidate) => sum + candidate.weight, 0);
  if (total <= 0) return pickUniform(pool, random);
  let threshold = random() * total;
  for (const candidate of pool) {
    threshold -= candidate.weight;
    if (threshold < 0) return candidate;
  }
  return pool[pool.length - 1];
}

function missingShares(candidates: readonly Candidate[]): DrawShare[] {
  const shares: DrawShare[] = [];
  if (!candidates.some((candidate) => candidate.share === 'choice')) shares.push('choice');
  if (!candidates.some((candidate) => candidate.share === 'open')) shares.push('open');
  return shares;
}

function pointsFor(size: number, totalPoints: number): number[] {
  if (size === 0) return [];
  const unit = round2(totalPoints / size);
  const points: number[] = [];
  let allocated = 0;
  for (let index = 0; index < size; index += 1) {
    if (index === size - 1) {
      points.push(round2(totalPoints - allocated));
    } else {
      points.push(unit);
      allocated = round2(allocated + unit);
    }
  }
  return points;
}

/**
 * Draws one validation attempt (ET-1/ET-2). Returns a deterministic list of `brickId` /
 * `brickVersionId` references and an exhaustion report; no question is ever invented. The same
 * seed and the same data in any input order produce the same result after canonical sorting (CL-5).
 */
export function drawAttempt(rawInput: DrawAttemptInput): DrawAttemptResult {
  const input = parseInput(rawInput);
  const params = input.params;
  const targetCount = input.targetCount ?? params.defaultSize;
  const notions = canonicalNotions(input.notions, input.gaps, params);
  const candidateSet = buildCandidates(notions, input.bank, input.seenFingerprints, params);
  const byId = new Map(notions.map((notion) => [notion.ref.notionId, notion]));

  const coverageCount = Math.min(notions.length, targetCount, params.maxSize);
  const coverage = notions.slice(0, coverageCount);
  const coverageLimited = coverageCount < notions.length;
  allocateQuotas(coverage, targetCount);
  const openTarget = allocateOpenQuotas(coverage, targetCount, params);

  const random = createSeededRandom(input.seed);
  const used = new Set<Candidate>();
  const selected: SelectedCandidate[] = [];
  const shortageByNotion = new Map<Id, Set<DrawShare>>();
  const markShortage = (notionId: Id, share: DrawShare): void => {
    const set = shortageByNotion.get(notionId);
    if (set === undefined) shortageByNotion.set(notionId, new Set([share]));
    else set.add(share);
  };
  const select = (candidate: Candidate, servedNotion: Id): void => {
    used.add(candidate);
    selected.push({ candidate, servedNotion });
    for (const notionId of candidate.linked) {
      const notion = byId.get(notionId);
      if (notion === undefined) continue;
      notion.served += 1;
      if (candidate.share === 'open') notion.openServed += 1;
    }
  };
  const pickFor = (notionId: Id, share: DrawShare): Candidate | undefined => {
    const pool = (candidateSet.byNotion.get(notionId) ?? []).filter(
      (candidate) => !used.has(candidate) && candidate.share === share,
    );
    return pickUniform(pool, random);
  };

  for (const notion of coverage) {
    let guard = 0;
    while (notion.served < notion.quota && selected.length < targetCount) {
      guard += 1;
      if (guard > targetCount * 2 + 10) break;
      const desired: DrawShare = notion.openServed < notion.openQuota ? 'open' : 'choice';
      let picked = pickFor(notion.ref.notionId, desired);
      if (picked === undefined) {
        markShortage(notion.ref.notionId, desired);
        const other: DrawShare = desired === 'open' ? 'choice' : 'open';
        picked = pickFor(notion.ref.notionId, other);
        if (picked === undefined) {
          markShortage(notion.ref.notionId, other);
          break;
        }
        markShortage(notion.ref.notionId, desired);
      }
      select(picked, notion.ref.notionId);
    }
    if (selected.length >= targetCount) break;
  }

  while (selected.length < targetCount) {
    const remaining = candidateSet.unique.filter((candidate) => !used.has(candidate));
    if (remaining.length === 0) break;
    const opens = selected.filter((entry) => entry.candidate.share === 'open').length;
    const choices = selected.length - opens;
    const choiceTarget = targetCount - openTarget;
    let pool = remaining;
    if (opens < openTarget) {
      const openPool = remaining.filter((candidate) => candidate.share === 'open');
      if (openPool.length > 0) pool = openPool;
    } else if (choices < choiceTarget) {
      const choicePool = remaining.filter((candidate) => candidate.share === 'choice');
      if (choicePool.length > 0) pool = choicePool;
    }
    const picked = pickWeighted(pool, random);
    if (picked === undefined) break;
    select(picked, picked.linked[0] ?? '');
  }

  const opensSelected = selected.filter((entry) => entry.candidate.share === 'open').length;
  const choicesSelected = selected.length - opensSelected;
  const exhaustedFormats: DrawShare[] = [];
  if (openTarget > 0 && opensSelected < openTarget) exhaustedFormats.push('open');
  if (targetCount - openTarget > 0 && choicesSelected < targetCount - openTarget) {
    exhaustedFormats.push('choice');
  }

  const plan: DrawNotionPlan[] = notions.map((notion) => ({
    notionId: notion.ref.notionId,
    priority: notion.rank,
    gap: notion.gap !== null,
    mastery: notion.mastery,
    weight: notion.weight,
    quota: notion.quota,
    selected: notion.served,
  }));

  const uncoveredNotionIds = notions
    .filter((notion) => notion.served === 0)
    .map((notion) => notion.ref.notionId);

  const exhausted: DrawNotionExhaustion[] = [];
  for (const notion of notions) {
    if (notion.quota === 0) {
      if (notion.served === 0) {
        exhausted.push({
          notionId: notion.ref.notionId,
          reason: 'capacity',
          requested: 0,
          selected: 0,
          formats: [],
        });
      }
      continue;
    }
    if (notion.served >= notion.quota) continue;
    const unused = (candidateSet.byNotion.get(notion.ref.notionId) ?? []).filter(
      (candidate) => !used.has(candidate),
    );
    exhausted.push({
      notionId: notion.ref.notionId,
      reason: unused.length === 0 ? 'bank_exhausted' : 'size_limit',
      requested: notion.quota,
      selected: notion.served,
      formats:
        shortageByNotion.get(notion.ref.notionId) === undefined
          ? missingShares(unused)
          : [...(shortageByNotion.get(notion.ref.notionId) ?? []), ...missingShares(unused)].filter(
              (share, index, all) => all.indexOf(share) === index,
            ),
    });
  }

  const buckets = new Map<string, SelectedCandidate[]>();
  for (const entry of selected) {
    const key = `${entry.candidate.share}|${entry.servedNotion}`;
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [entry]);
    else bucket.push(entry);
  }
  for (const [key, bucket] of buckets) {
    bucket.sort(
      (left, right) =>
        compareText(left.candidate.brick.brickId, right.candidate.brick.brickId) ||
        compareText(left.candidate.brick.brickVersionId, right.candidate.brick.brickVersionId),
    );
    buckets.set(
      key,
      stableShuffle(
        bucket,
        `${input.seed}|${key}`,
        (entry) => `${entry.candidate.brick.brickId}|${entry.candidate.brick.brickVersionId}`,
      ),
    );
  }

  const ordered: SelectedCandidate[] = [];
  for (const share of ['choice', 'open'] as const) {
    const notionIds = notions.map((notion) => notion.ref.notionId);
    const maxSize = Math.max(
      0,
      ...notionIds.map((notionId) => buckets.get(`${share}|${notionId}`)?.length ?? 0),
    );
    for (let index = 0; index < maxSize; index += 1) {
      for (const notionId of notionIds) {
        const entry = buckets.get(`${share}|${notionId}`)?.[index];
        if (entry !== undefined) ordered.push(entry);
      }
    }
  }

  const points = pointsFor(ordered.length, params.totalPoints);
  const questions: DrawnQuestion[] = ordered.map((entry, index) => ({
    brickId: entry.candidate.brick.brickId,
    brickVersionId: entry.candidate.brick.brickVersionId,
    notionId: entry.servedNotion,
    notionIds: entry.candidate.linked,
    format: entry.candidate.brick.format,
    share: entry.candidate.share,
    fingerprint: entry.candidate.fingerprint,
    points: points[index] ?? 0,
  }));

  return {
    questions,
    exhausted,
    uncoveredNotionIds,
    exhaustedFormats,
    coverageLimited,
    minimumReached: questions.length >= params.minSize,
    targetCount,
    size: questions.length,
    pointsTotal: params.totalPoints,
    plan,
    diagnostics: candidateSet.diagnostics,
    seed: input.seed,
  };
}
