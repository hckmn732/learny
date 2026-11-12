// Daily global quiz session of one formation (SPEC-406, BR-MEM-03, BR-MEM-04). Pure and
// deterministic: dates, FSRS dues, gaps, bank formats, business bounds and seed are explicit
// inputs. The result is ordered, reports every deferred notion and signals a missing imposed
// format to SPEC-513 instead of inventing an item (ET-3).
import { assertValid } from '../errors';
import { stableShuffle } from '../random';
import { addDays } from '../time';
import { BrickFormatSchema } from '../types';
import type { BrickFormat, GapNature, Id, InstantIso, IsoDate, ModuleStatus } from '../types';

import { interleaveByModule } from './interleave';
import { BuildDailySessionInputSchema } from './types';
import type {
  BuildDailySessionInput,
  DailySession,
  DailySessionItem,
  DeferredNotion,
  DeferredReason,
  ExhaustedNotion,
  GlobalQuizDueNotion,
  GlobalQuizFormatPreference,
  GlobalQuizParams,
  SessionFormatReason,
} from './types';

/** BR-LAC-03 order: confusion > application > misunderstanding > forgetting. */
const NATURE_PRIORITY: Readonly<Record<GapNature, number>> = {
  confusion: 0,
  application: 1,
  misunderstanding: 2,
  forgetting: 3,
};

/** BR-AUT-05 / BR-LAC-04 — format imposed by the nature of a gap. */
export const IMPOSED_GAP_FORMATS: Readonly<Record<GapNature, readonly BrickFormat[]>> = {
  forgetting: ['recall_card'],
  confusion: ['matching', 'categorization'],
  application: ['open_question'],
  misunderstanding: [],
};

const MODULE_STATUS_PRIORITY: Readonly<Record<ModuleStatus, number>> = {
  validated: 0,
  open: 1,
  locked: 2,
};

interface Candidate {
  notionId: Id;
  moduleId: Id;
  modulePosition: number;
  dueAt: InstantIso;
  gapNature: GapNature | null;
  format: BrickFormat;
  formatReason: SessionFormatReason;
  variantRequested: boolean;
  estimatedSeconds: number;
}

interface DeferredRecord extends DeferredNotion {
  gapNature: GapNature | null;
  modulePosition: number;
}

interface NotionIdentity {
  notionId: Id;
  moduleId: Id;
  modulePosition: number;
  dueAt: InstantIso;
}

interface FormatDecision {
  format: BrickFormat;
  reason: SessionFormatReason;
  variantRequested: boolean;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function earliestInstant(left: InstantIso, right: InstantIso): InstantIso {
  return left <= right ? left : right;
}

function mergeDueNotions(
  existing: GlobalQuizDueNotion,
  candidate: GlobalQuizDueNotion,
): GlobalQuizDueNotion {
  const existingRank = MODULE_STATUS_PRIORITY[existing.moduleStatus];
  const candidateRank = MODULE_STATUS_PRIORITY[candidate.moduleStatus];
  const keepCandidateModule =
    candidateRank < existingRank ||
    (candidateRank === existingRank &&
      (candidate.modulePosition < existing.modulePosition ||
        (candidate.modulePosition === existing.modulePosition &&
          candidate.moduleId < existing.moduleId)));
  const module = keepCandidateModule ? candidate : existing;
  return {
    notionId: existing.notionId,
    moduleId: module.moduleId,
    modulePosition: module.modulePosition,
    moduleStatus: module.moduleStatus,
    evaluated: existing.evaluated || candidate.evaluated,
    dueAt: earliestInstant(existing.dueAt, candidate.dueAt),
  };
}

/** One row per notion, strongest module, earliest due date; input order never matters. */
function canonicalNotions(notions: readonly GlobalQuizDueNotion[]): GlobalQuizDueNotion[] {
  const byNotion = new Map<Id, GlobalQuizDueNotion>();
  for (const notion of notions) {
    const existing = byNotion.get(notion.notionId);
    byNotion.set(
      notion.notionId,
      existing === undefined ? notion : mergeDueNotions(existing, notion),
    );
  }
  return [...byNotion.values()].sort((left, right) => compareText(left.notionId, right.notionId));
}

function canonicalGaps(gaps: readonly { notionId: Id; nature: GapNature }[]): Map<Id, GapNature> {
  const byNotion = new Map<Id, GapNature>();
  for (const gap of gaps) {
    const existing = byNotion.get(gap.notionId);
    if (existing === undefined || NATURE_PRIORITY[gap.nature] < NATURE_PRIORITY[existing]) {
      byNotion.set(gap.notionId, gap.nature);
    }
  }
  return byNotion;
}

function canonicalBank(
  bank: readonly { notionId: Id; formats: readonly BrickFormat[] }[],
  params: GlobalQuizParams,
): { formats: Map<Id, BrickFormat[]>; present: Set<Id> } {
  const valid = new Set<BrickFormat>(
    Object.keys(params.formatSeconds).filter(
      (format) => BrickFormatSchema.safeParse(format).success,
    ) as BrickFormat[],
  );
  const formats = new Map<Id, BrickFormat[]>();
  for (const entry of bank) {
    const current = formats.get(entry.notionId) ?? [];
    const merged = new Set(current);
    for (const format of entry.formats) {
      if (valid.has(format)) merged.add(format);
    }
    formats.set(entry.notionId, [...merged].sort(compareText));
  }
  return { formats, present: new Set(bank.map((entry) => entry.notionId)) };
}

function canonicalLastFormats(
  lastFormats: readonly { notionId: Id; format: BrickFormat }[],
): Map<Id, BrickFormat> {
  const byNotion = new Map<Id, BrickFormat>();
  for (const entry of lastFormats) {
    const existing = byNotion.get(entry.notionId);
    if (existing === undefined || entry.format < existing) {
      byNotion.set(entry.notionId, entry.format);
    }
  }
  return byNotion;
}

function preferenceTargets(preference: GlobalQuizFormatPreference): readonly BrickFormat[] {
  if (preference === 'cards') return ['recall_card'];
  if (preference === 'matching_categorization') return ['matching', 'categorization'];
  return [];
}

/**
 * Picks the next format for one notion. Gap nature first, then learner preference, then
 * variation from the last presentation (BR-MEM-04); reusing the last format is only possible
 * when no other valid candidate exists and always asks SPEC-513 for a variant (CL-4).
 */
function chooseFormat(
  available: readonly BrickFormat[],
  gapNature: GapNature | null,
  lastFormat: BrickFormat | null,
  preference: GlobalQuizFormatPreference,
  seed: string,
  notionId: Id,
): FormatDecision | null {
  const imposed = gapNature === null ? [] : IMPOSED_GAP_FORMATS[gapNature];
  const pool = imposed.length === 0 ? [...available] : available.filter((f) => imposed.includes(f));
  if (pool.length === 0) return null;

  const targets = preferenceTargets(preference);
  const order = (values: readonly BrickFormat[]): BrickFormat[] =>
    stableShuffle(values, `${seed}|${notionId}|format`, (value) => value);
  const preferred = order(pool.filter((format) => targets.includes(format)));
  const remaining = order(pool.filter((format) => !targets.includes(format)));
  let ordered = [...preferred, ...remaining];

  if (lastFormat !== null && ordered.length > 1) {
    ordered = ordered.filter((format) => format !== lastFormat);
  }
  const format = ordered[0];
  if (format === undefined) return null;

  const reused = lastFormat !== null && format === lastFormat;
  if (reused) {
    return { format, reason: 'bank_constraint', variantRequested: true };
  }
  if (imposed.length > 0) {
    return { format, reason: 'gap_nature', variantRequested: false };
  }
  if (targets.includes(format)) {
    return { format, reason: 'preference', variantRequested: false };
  }
  if (lastFormat === null) {
    return {
      format,
      reason: ordered.length > 1 ? 'first_use' : 'only_format',
      variantRequested: false,
    };
  }
  return { format, reason: 'varied', variantRequested: false };
}

function compareCandidates(left: Candidate, right: Candidate): number {
  const leftGap = left.gapNature === null ? 1 : 0;
  const rightGap = right.gapNature === null ? 1 : 0;
  if (leftGap !== rightGap) return leftGap - rightGap;
  if (left.gapNature !== null && right.gapNature !== null) {
    const nature = NATURE_PRIORITY[left.gapNature] - NATURE_PRIORITY[right.gapNature];
    if (nature !== 0) return nature;
  }
  const due = compareText(left.dueAt, right.dueAt);
  if (due !== 0) return due;
  if (left.modulePosition !== right.modulePosition)
    return left.modulePosition - right.modulePosition;
  const module = compareText(left.moduleId, right.moduleId);
  if (module !== 0) return module;
  return compareText(left.notionId, right.notionId);
}

function compareDeferred(left: DeferredRecord, right: DeferredRecord): number {
  const leftGap = left.gapNature === null ? 1 : 0;
  const rightGap = right.gapNature === null ? 1 : 0;
  if (leftGap !== rightGap) return leftGap - rightGap;
  if (left.gapNature !== null && right.gapNature !== null) {
    const nature = NATURE_PRIORITY[left.gapNature] - NATURE_PRIORITY[right.gapNature];
    if (nature !== 0) return nature;
  }
  const due = compareText(left.dueAt, right.dueAt);
  if (due !== 0) return due;
  if (left.modulePosition !== right.modulePosition)
    return left.modulePosition - right.modulePosition;
  const module = compareText(left.moduleId, right.moduleId);
  if (module !== 0) return module;
  const notion = compareText(left.notionId, right.notionId);
  if (notion !== 0) return notion;
  return compareText(left.reason, right.reason);
}

function deferredRecord(
  notion: NotionIdentity,
  gapNature: GapNature | null,
  reason: DeferredReason,
  nextDay: IsoDate,
): DeferredRecord {
  return {
    notionId: notion.notionId,
    moduleId: notion.moduleId,
    modulePosition: notion.modulePosition,
    dueAt: notion.dueAt,
    gapNature,
    reason,
    proposedFor: reason === 'cap' || reason === 'awaiting_variant' ? nextDay : null,
  };
}

function eligible(
  notion: GlobalQuizDueNotion,
  mode: BuildDailySessionInput['mode'],
): { ok: true } | { ok: false; reason: DeferredReason } {
  const contributes =
    notion.moduleStatus === 'validated' || (notion.moduleStatus === 'open' && notion.evaluated);
  if (!contributes) return { ok: false, reason: 'module_not_eligible' };
  if (mode === 'maintenance' && notion.moduleStatus !== 'validated') {
    return { ok: false, reason: 'maintenance_validated_only' };
  }
  return { ok: true };
}

function itemOf(candidate: Candidate): DailySessionItem {
  return {
    notionId: candidate.notionId,
    moduleId: candidate.moduleId,
    modulePosition: candidate.modulePosition,
    format: candidate.format,
    gapNature: candidate.gapNature,
    selectionReason: candidate.gapNature === null ? 'due' : 'gap',
    formatReason: candidate.formatReason,
    variantRequested: candidate.variantRequested,
    estimatedSeconds: candidate.estimatedSeconds,
  };
}

/**
 * ET-1 — builds one formation's daily session. The initial order is stable (gap priority, FSRS
 * due date, module, notion); each block is then interleaved by module and cut at the first item
 * that would exceed the cap. Every unplayed notion is returned in `deferred` with its reason and
 * a proposed civil day; nothing is persisted and no FSRS state is changed.
 */
export function buildDailySession(rawInput: BuildDailySessionInput): DailySession {
  const input = assertValid(BuildDailySessionInputSchema, rawInput);
  const params = input.params;
  const preference = input.preference ?? 'vary';
  const effectiveCap =
    input.mode === 'maintenance'
      ? Math.min(input.capMinutes, params.maintenanceMaxMinutes)
      : input.capMinutes;
  const capSeconds = effectiveCap * 60;
  const nextDay = addDays(input.date, 1);

  const gaps = canonicalGaps(input.gaps);
  const bank = canonicalBank(input.bank, params);
  const lastFormats = canonicalLastFormats(input.lastFormats);
  const notions = canonicalNotions(input.dueNotions);

  const candidates: Candidate[] = [];
  const deferred: DeferredRecord[] = [];
  const exhausted: ExhaustedNotion[] = [];

  for (const notion of notions) {
    const gapNature = gaps.get(notion.notionId) ?? null;
    const availability = eligible(notion, input.mode);
    if (!availability.ok) {
      deferred.push(deferredRecord(notion, gapNature, availability.reason, nextDay));
      continue;
    }

    const available = bank.formats.get(notion.notionId) ?? [];
    if (available.length === 0) {
      exhausted.push({
        notionId: notion.notionId,
        moduleId: notion.moduleId,
        reason: bank.present.has(notion.notionId) ? 'no_valid_format' : 'missing_bank',
        requiredFormats: [],
        availableFormats: [],
      });
      deferred.push(deferredRecord(notion, gapNature, 'awaiting_variant', nextDay));
      continue;
    }

    const decision = chooseFormat(
      available,
      gapNature,
      lastFormats.get(notion.notionId) ?? null,
      preference,
      input.seed,
      notion.notionId,
    );
    if (decision === null) {
      const imposed = gapNature === null ? [] : IMPOSED_GAP_FORMATS[gapNature];
      exhausted.push({
        notionId: notion.notionId,
        moduleId: notion.moduleId,
        reason: 'imposed_format_unavailable',
        requiredFormats: imposed,
        availableFormats: available,
      });
      deferred.push(deferredRecord(notion, gapNature, 'awaiting_variant', nextDay));
      continue;
    }

    candidates.push({
      notionId: notion.notionId,
      moduleId: notion.moduleId,
      modulePosition: notion.modulePosition,
      dueAt: notion.dueAt,
      gapNature,
      format: decision.format,
      formatReason: decision.reason,
      variantRequested: decision.variantRequested,
      estimatedSeconds: params.formatSeconds[decision.format] ?? params.notionCostSec,
    });
  }

  candidates.sort(compareCandidates);
  const ordered = [
    ...interleaveByModule(candidates.filter((candidate) => candidate.gapNature !== null)),
    ...interleaveByModule(candidates.filter((candidate) => candidate.gapNature === null)),
  ];

  const selected: Candidate[] = [];
  let totalSeconds = params.sessionOverheadSec;
  for (const candidate of ordered) {
    if (totalSeconds + candidate.estimatedSeconds > capSeconds) break;
    selected.push(candidate);
    totalSeconds += candidate.estimatedSeconds;
  }

  for (const candidate of ordered.slice(selected.length)) {
    deferred.push(deferredRecord(candidate, candidate.gapNature, 'cap', nextDay));
  }

  deferred.sort(compareDeferred);
  exhausted.sort((left, right) => compareText(left.notionId, right.notionId));

  return {
    formationId: input.formationId,
    date: input.date,
    mode: input.mode,
    seed: input.seed,
    requestedCapMinutes: input.capMinutes,
    capMinutes: effectiveCap,
    items: selected.map(itemOf),
    deferred: deferred.map((entry) => ({
      notionId: entry.notionId,
      moduleId: entry.moduleId,
      dueAt: entry.dueAt,
      reason: entry.reason,
      proposedFor: entry.proposedFor,
    })),
    exhausted,
    estimatedMinutes: selected.length === 0 ? 0 : Math.ceil(totalSeconds / 60),
  };
}

/** Re-export of the strict schema, so services can validate the boundary with the engine. */
export { BuildDailySessionInputSchema };
