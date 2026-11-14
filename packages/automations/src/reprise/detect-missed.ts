// Detection of a missed session (SPEC-712 EF-2, ADR-0192 §1). Pure function: it reads the slots and
// the instant given by the caller, never the process clock (ADR-0047). The exclusion list is the
// normative one of ADR-0192 §1: a warm-up, a micro-session, the daily global quiz, the weekly review
// and a margin are never replanned.
import { toInstant } from '@learny/core';

const NEVER_RESCHEDULED = new Set([
  'global_quiz',
  'warmup',
  'micro_session',
  'weekly_review',
  'buffer',
]);

/** The five kinds ADR-0192 §1 allows a replacement for. */
export const REPLACEABLE_KINDS = new Set([
  'contributions',
  'course',
  'exercise',
  'validation_quiz',
  'revision',
  'sprint',
  'mock_exam',
]);

export interface RepriseSlot {
  id: string;
  formationId: string;
  moduleId: string | null;
  activityId: string | null;
  kind: string;
  title: string;
  startsAt: string | Date;
  endsAt: string | Date;
  status: string;
}

export interface MissedSlot extends RepriseSlot {
  /** Local civil day of the slot start, `YYYY-MM-DD` in the learner's zone. */
  missedDate: string;
  durationMinutes: number;
}

/** ADR-0192 §1 — a slot is missed when it is still `planned` after its end. */
export function isNeverRescheduled(kind: string): boolean {
  return NEVER_RESCHEDULED.has(kind) || !REPLACEABLE_KINDS.has(kind);
}

/**
 * Returns the slots to miss at the 22 h tick: `planned`, of a replaceable kind, ended before the
 * given instant, of an active formation. The caller persists the `missed` status (EF-2).
 */
export function detectMissedSlots(
  slots: readonly RepriseSlot[],
  now: Date | string,
  timeZone: string,
  options: { formationStatus?: (formationId: string) => string | undefined } = {},
): MissedSlot[] {
  const at = toInstant(now);
  const missed: MissedSlot[] = [];
  for (const slot of slots) {
    if (slot.status !== 'planned') continue;
    if (isNeverRescheduled(slot.kind)) continue;
    const start = toInstant(slot.startsAt);
    const end = toInstant(slot.endsAt);
    if (end.getTime() > at.getTime()) continue;
    const formationStatus = options.formationStatus?.(slot.formationId);
    if (formationStatus !== undefined && formationStatus !== 'active') continue;
    missed.push({
      ...slot,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      missedDate: localDayOf(start, timeZone),
      durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000)),
    });
  }
  return missed.sort(
    (left, right) =>
      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime() ||
      left.id.localeCompare(right.id),
  );
}

/** Local civil day of an instant, computed without touching the process time zone. */
export function localDayOf(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(toInstant(instant));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Shifts a civil day by a number of days (calendar arithmetic, no process zone). */
export function shiftDay(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a civil day. */
export function isoWeekday(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}
