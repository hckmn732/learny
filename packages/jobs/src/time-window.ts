// Local-time windows of the hourly tick (SPEC-203 ET-5, ADR-0123).
import { localTimeToInstant, zonedParts } from '@learny/core';

export interface LocalWindow {
  /** Inclusive start, ISO 8601 UTC. */
  windowStart: string;
  /** Exclusive end, ISO 8601 UTC. */
  windowEnd: string;
  /** IANA zone of the user. */
  timezone: string;
}

/**
 * UTC instant at which the local time `hhmm` happens inside the window, or `null`.
 * Handles half-hour zones and daylight-saving changes: a non-existent local time is moved to the
 * first valid minute after the gap, an ambiguous one is its first occurrence only, so two
 * consecutive windows never both return it (ADR-0123). Consumers call `step.sleepUntil(instant)`.
 */
export function dueInWindow(hhmm: `${number}:${number}`, window: LocalWindow): Date | null {
  const start = Date.parse(window.windowStart);
  const end = Date.parse(window.windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new RangeError('Fenêtre invalide.');
  if (end <= start) return null;

  // The window lasts an hour: it touches at most two local dates (its first and its last instant).
  const dates = new Set([
    zonedParts(new Date(start), window.timezone).localDate,
    zonedParts(new Date(end - 1), window.timezone).localDate,
  ]);
  const instants = [...dates]
    .map((date) => localTimeToInstant(date, hhmm, window.timezone).getTime())
    .filter((instant) => start <= instant && instant < end)
    .sort((a, b) => a - b);
  const first = instants[0];
  return first === undefined ? null : new Date(first);
}
