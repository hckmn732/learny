// Count of consecutive planned study days without a qualifying activity (SPEC-712 EF-5/EF-6,
// ADR-0192 §2). Pure function: every day comes from the caller, the zone is explicit, and the
// counting never crosses a global pause (CL-4) or the creation of the account (CL-12).
import { isoWeekday, shiftDay } from './detect-missed';

export interface DailyActivityRow {
  /** Local civil day, `YYYY-MM-DD`. */
  day: string;
  qualifying: boolean;
}

export interface PausePeriod {
  startsOn: string;
  endsOn: string;
}

export interface InactivityInput {
  dailyActivity: readonly DailyActivityRow[];
  /** ISO weekdays of the learner's rhythm (1 = Monday … 7 = Sunday). */
  studyDays: readonly number[];
  pauses: readonly PausePeriod[];
  /** Local day of the account creation (CL-12). */
  accountCreatedOn: string;
  /** Local day being evaluated (exclusive): today, in the learner's zone. */
  today: string;
  /** Safety bound, 366 days by default. */
  maxDays?: number;
}

export interface InactivityCount {
  /** Consecutive planned study days without a qualifying activity. */
  days: number;
  /** Last qualifying day before today, or the creation day when the account never studied. */
  lastActivityOn: string;
}

/**
 * ADR-0192 §2 — study days are the days of the rhythm; weekend days and pause days are neutral and
 * do not break the streak. The count stops at the first qualifying day, at a pause (CL-4 says the
 * episode restarts after the pause) and at the creation day (CL-12).
 */
export function countInactiveStudyDays(input: InactivityInput): InactivityCount {
  const studyDays = new Set(input.studyDays);
  const qualifying = new Set(
    input.dailyActivity.filter((row) => row.qualifying).map((row) => row.day),
  );
  const maxDays = input.maxDays ?? 366;
  let days = 0;
  let day = shiftDay(input.today, -1);
  let lastActivityOn: string | null = null;
  for (let index = 0; index < maxDays; index += 1) {
    if (day < input.accountCreatedOn) break;
    if (qualifying.has(day)) {
      lastActivityOn = day;
      break;
    }
    const pause = input.pauses.find((entry) => day >= entry.startsOn && day <= entry.endsOn);
    if (pause !== undefined) {
      // CL-4 — the episode restarts after the pause, never through it.
      lastActivityOn = pause.endsOn;
      break;
    }
    if (studyDays.has(isoWeekday(day))) days += 1;
    day = shiftDay(day, -1);
  }
  return {
    days,
    lastActivityOn: lastActivityOn ?? input.accountCreatedOn,
  };
}
