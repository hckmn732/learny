// Personal response-time median of the FSRS engine (SPEC-402 EF-3, ET-3). The engine never reads
// the clock or the configuration: the caller supplies the answer history, the format and the
// business bounds, and the function returns one deterministic number. Invalid durations (zero,
// negative, non-finite, missing) are ignored; only the `window` most recent valid answers of the
// same format are kept before sorting a copy and averaging the two middle values.
import { EngineError } from '../errors';
import { parseInstant } from '../time';
import type { BrickFormat, Id, InstantIso } from '../types';

/** One learner answer as the median needs it; extra fields (such as an `AnswerRecord`) are accepted. */
export interface TimedResponse {
  answeredAt: InstantIso;
  format: BrickFormat;
  timeMs: number | null;
  /** Tie-break of two answers recorded at the same instant (order-independent median). */
  answerId?: Id | null;
}

/** Business bounds of the personal median, supplied by the caller (never read from config here). */
export interface MedianSettings {
  /** Maximum number of valid answers kept, newest first. */
  medianWindow: number;
  /** Below this number of valid answers the default duration applies. */
  medianMinSamples: number;
  /** Duration used when there are not enough valid answers. */
  defaultMedianMs: number;
}

function invalidParam(path: string, message: string): EngineError {
  return new EngineError('INVALID_PARAM', message, { path });
}

function invalidInput(path: string, message: string): EngineError {
  return new EngineError('INVALID_INPUT', message, { path });
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 1;
}

/** Validates the median bounds; shared with the grading settings of `review.ts`. */
export function assertMedianSettings(settings: MedianSettings): MedianSettings {
  if (!isPositiveInteger(settings.medianWindow)) {
    throw invalidParam('medianWindow', 'La fenêtre de médiane doit être un entier positif.');
  }
  if (!isPositiveInteger(settings.medianMinSamples)) {
    throw invalidParam(
      'medianMinSamples',
      'Le minimum d’échantillons doit être un entier positif.',
    );
  }
  if (settings.medianMinSamples > settings.medianWindow) {
    throw invalidParam(
      'medianMinSamples',
      'Le minimum d’échantillons dépasse la fenêtre de médiane.',
    );
  }
  if (!Number.isFinite(settings.defaultMedianMs) || settings.defaultMedianMs <= 0) {
    throw invalidParam('defaultMedianMs', 'La durée par défaut doit être strictement positive.');
  }
  return settings;
}

function isValidDuration(timeMs: number | null | undefined): timeMs is number {
  return typeof timeMs === 'number' && Number.isFinite(timeMs) && timeMs > 0;
}

interface Candidate {
  timeMs: number;
  answeredAtMs: number;
  answerId: string;
}

function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.answeredAtMs !== right.answeredAtMs) return right.answeredAtMs - left.answeredAtMs;
  if (left.answerId !== right.answerId) return left.answerId < right.answerId ? -1 : 1;
  return left.timeMs - right.timeMs;
}

/**
 * Strictly positive, finite durations of `format`, newest first, limited to `window` entries. The
 * input array is never mutated and the selection does not depend on the order of its elements.
 */
export function recentValidTimes(
  history: readonly TimedResponse[],
  format: BrickFormat,
  settings: MedianSettings,
): number[] {
  assertMedianSettings(settings);
  if (!Array.isArray(history)) {
    throw invalidInput('history', 'Un historique de réponses est attendu.');
  }

  const candidates: Candidate[] = [];
  const entries: readonly TimedResponse[] = history;
  for (const [index, entry] of entries.entries()) {
    if (entry.format !== format) continue;
    if (!isValidDuration(entry.timeMs)) continue;
    let answeredAtMs: number;
    try {
      answeredAtMs = parseInstant(entry.answeredAt);
    } catch {
      throw invalidInput(`history.${String(index)}.answeredAt`, 'Instant de réponse invalide.');
    }
    candidates.push({
      timeMs: entry.timeMs,
      answeredAtMs,
      answerId: entry.answerId ?? '',
    });
  }

  candidates.sort(compareCandidates);
  return candidates.slice(0, settings.medianWindow).map((candidate) => candidate.timeMs);
}

/**
 * Personal median of the learner for one format (BR-MEM-02, EF-3). Below `minSamples` valid
 * answers the configured default is returned; an even number of samples averages the two middle
 * values. Sorting operates on a copy, so the caller's history keeps its order.
 */
export function personalMedianMs(
  history: readonly TimedResponse[],
  format: BrickFormat,
  settings: MedianSettings,
): number {
  const recent = recentValidTimes(history, format, settings);
  if (recent.length < settings.medianMinSamples) return settings.defaultMedianMs;

  const sorted = [...recent].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? settings.defaultMedianMs;
  const lower = sorted[middle - 1] ?? settings.defaultMedianMs;
  const upper = sorted[middle] ?? settings.defaultMedianMs;
  return (lower + upper) / 2;
}
