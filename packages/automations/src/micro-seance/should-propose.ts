// Pure trigger condition of the backup micro-session (SPEC-713 EF-2, ET-2, CL-5, CL-9, CL-10).
//
// The function reads no clock, no database and no process time zone: the caller supplies the civil
// day, the profile study days, today's activity, today's slots and the candidate formations with
// their read-only micro-session size. It returns the retained formation (current one first, then
// the most recently opened one) or `null` when nothing must be proposed.

export interface MicroDailyActivity {
  qualifying: boolean;
}

export interface MicroSlotToday {
  status: string;
}

export interface MicroFormationCandidate {
  formationId: string;
  /** Instant of the last opening, ISO 8601, or `null` when the formation was never reopened. */
  lastOpenedAt: string | null;
  /** Number of items drawn by `buildDailySession({ mode: 'micro' })`; 0 when the draw is empty. */
  microItemCount: number;
}

export interface MicroProposalInput {
  /** Civil day of the learner (`YYYY-MM-DD`), computed in the profile time zone. */
  today: string;
  /** ISO weekdays of the profile rhythm, 1 = Monday … 7 = Sunday. */
  studyDays: readonly number[];
  /** Row of `daily_activity` for `today`, `null` when the learner has no activity yet. */
  dailyActivity: MicroDailyActivity | null;
  /** Slots starting during `today`, in any status. */
  slotsToday: readonly MicroSlotToday[];
  /** `profiles.current_formation_id`, preferred when it has a non-empty micro-session. */
  currentFormationId: string | null;
  /** Active formations (paused and finished ones are filtered out by the caller). */
  candidates: readonly MicroFormationCandidate[];
}

export interface MicroProposalDecision {
  propose: boolean;
  formationId: string | null;
  notionCount: number;
  /** Diagnostic of a skip, useful for the tests and the journal; `null` when proposing. */
  reason: 'study_day' | 'already_active' | 'no_candidate' | null;
}

function isoWeekday(day: string): number {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function mostRecentlyOpened(
  candidates: readonly MicroFormationCandidate[],
): MicroFormationCandidate | null {
  const eligible = candidates.filter((candidate) => candidate.microItemCount > 0);
  if (eligible.length === 0) return null;
  return (
    [...eligible].sort((left, right) => {
      const leftAt = left.lastOpenedAt === null ? 0 : Date.parse(left.lastOpenedAt);
      const rightAt = right.lastOpenedAt === null ? 0 : Date.parse(right.lastOpenedAt);
      if (leftAt !== rightAt) return rightAt - leftAt;
      return left.formationId.localeCompare(right.formationId);
    })[0] ?? null
  );
}

/**
 * EF-2 — (1) the local day is a study day of the rhythm, (2) no qualifying activity and no done
 * slot today, (3) at least one active formation has a non-empty micro-session. The current
 * formation wins when it satisfies (3); otherwise the most recently opened one does.
 */
export function shouldProposeMicroSession(input: MicroProposalInput): MicroProposalDecision {
  if (!input.studyDays.includes(isoWeekday(input.today))) {
    return { propose: false, formationId: null, notionCount: 0, reason: 'study_day' };
  }
  if (input.dailyActivity?.qualifying === true) {
    return { propose: false, formationId: null, notionCount: 0, reason: 'already_active' };
  }
  if (input.slotsToday.some((slot) => slot.status === 'done')) {
    return { propose: false, formationId: null, notionCount: 0, reason: 'already_active' };
  }

  const current =
    input.currentFormationId === null
      ? undefined
      : input.candidates.find(
          (candidate) =>
            candidate.formationId === input.currentFormationId && candidate.microItemCount > 0,
        );
  const retained = current ?? mostRecentlyOpened(input.candidates);
  if (retained === null) {
    return { propose: false, formationId: null, notionCount: 0, reason: 'no_candidate' };
  }
  return {
    propose: true,
    formationId: retained.formationId,
    notionCount: retained.microItemCount,
    reason: null,
  };
}
