// Placement of a missed session (SPEC-712 EF-3, ADR-0192 §4). Pure function: it receives the
// margins and the compatible free slots already computed by the planner (SPEC-407), picks the first
// margin starting at least one hour after the detection and within seven days, then the three
// alternatives. No database access and no clock read.
import { toInstant } from '@learny/core';

import { localDayOf } from './detect-missed';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MAX_ALTERNATIVES = 3;

export interface PlacementWindow {
  id?: string;
  startsAt: string;
  endsAt: string;
}

export interface ReprisePlacement {
  proposed: {
    startsAt: string;
    endsAt: string;
    bufferSlotId: string | null;
    inBuffer: boolean;
  };
  alternatives: { startsAt: string; endsAt: string }[];
}

export interface PickReplacementInput {
  /** Planned margins of the formation, sorted or not. */
  buffers: readonly PlacementWindow[];
  /** Compatible free slots returned by the planner, ordered by start instant. */
  freeSlots: readonly PlacementWindow[];
  /** Duration of the missed session, in minutes. */
  durationMin: number;
  now: Date | string;
  /** Zone used to spread the alternatives over at least two different days. */
  timeZone: string;
}

function pickMargins(
  input: PickReplacementInput,
  nowMs: number,
  durationMs: number,
): ReprisePlacement | null {
  const limit = nowMs + 7 * DAY_MS;
  const usable = input.buffers
    .filter((buffer) => {
      const start = toInstant(buffer.startsAt).getTime();
      return start >= nowMs + HOUR_MS && start <= limit;
    })
    .sort(
      (left, right) =>
        toInstant(left.startsAt).getTime() - toInstant(right.startsAt).getTime() ||
        (left.id ?? '').localeCompare(right.id ?? ''),
    );
  const buffer = usable[0];
  if (buffer === undefined) return null;
  const start = toInstant(buffer.startsAt);
  const end = toInstant(buffer.endsAt);
  const bufferDuration = end.getTime() - start.getTime();
  if (bufferDuration < 60_000) return null;
  const placementEnd = new Date(Math.min(end.getTime(), start.getTime() + durationMs));
  if (placementEnd.getTime() <= start.getTime()) return null;
  return {
    proposed: {
      startsAt: start.toISOString(),
      endsAt: placementEnd.toISOString(),
      bufferSlotId: buffer.id ?? null,
      inBuffer: true,
    },
    alternatives: alternativesOf(input.freeSlots, start.toISOString(), durationMs, input.timeZone),
  };
}

/**
 * EF-3 — the first compatible free slot becomes the proposal when no margin is usable; the text
 * then says « dans un créneau libre de votre agenda » (ADR-0192).
 */
function pickFreeSlot(input: PickReplacementInput, durationMs: number): ReprisePlacement | null {
  const free = input.freeSlots
    .filter((slot) => toInstant(slot.endsAt).getTime() - toInstant(slot.startsAt).getTime() > 0)
    .sort(
      (left, right) =>
        toInstant(left.startsAt).getTime() - toInstant(right.startsAt).getTime() ||
        left.startsAt.localeCompare(right.startsAt),
    );
  const first = free[0];
  if (first === undefined) return null;
  const start = toInstant(first.startsAt);
  const end = new Date(Math.min(toInstant(first.endsAt).getTime(), start.getTime() + durationMs));
  if (end.getTime() <= start.getTime()) return null;
  return {
    proposed: {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      bufferSlotId: null,
      inBuffer: false,
    },
    alternatives: alternativesOf(free.slice(1), first.startsAt, durationMs, input.timeZone),
  };
}

/**
 * Keeps at most three alternatives, distinct from the proposal, one per civil day first so the
 * list spreads over two days when possible (ADR-0192 §4).
 */
function alternativesOf(
  slots: readonly PlacementWindow[],
  proposedStart: string,
  durationMs: number,
  timeZone: string,
): { startsAt: string; endsAt: string }[] {
  const proposedMs = toInstant(proposedStart).getTime();
  const seen = new Set<number>();
  const candidates = slots
    .filter((slot) => {
      const start = toInstant(slot.startsAt).getTime();
      if (start === proposedMs || seen.has(start)) return false;
      seen.add(start);
      return true;
    })
    .sort(
      (left, right) => toInstant(left.startsAt).getTime() - toInstant(right.startsAt).getTime(),
    );
  const byDay = new Map<string, PlacementWindow>();
  const rest: PlacementWindow[] = [];
  for (const slot of candidates) {
    const day = localDayOf(toInstant(slot.startsAt), timeZone);
    if (!byDay.has(day)) byDay.set(day, slot);
    else rest.push(slot);
  }
  const ordered = [...byDay.values(), ...rest]
    .sort((left, right) => toInstant(left.startsAt).getTime() - toInstant(right.startsAt).getTime())
    .filter((slot) => toInstant(slot.startsAt).getTime() > proposedMs)
    .slice(0, MAX_ALTERNATIVES);
  return ordered.map((slot) => {
    const start = toInstant(slot.startsAt);
    const available = toInstant(slot.endsAt).getTime() - start.getTime();
    return {
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + Math.min(durationMs, available)).toISOString(),
    };
  });
}

/** ADR-0192 §4 — a margin first, the planner's first free slot otherwise. */
export function pickReplacement(input: PickReplacementInput): ReprisePlacement | null {
  const nowMs = toInstant(input.now).getTime();
  const durationMs = Math.max(1, Math.round(input.durationMin)) * 60_000;
  return pickMargins(input, nowMs, durationMs) ?? pickFreeSlot(input, durationMs);
}
