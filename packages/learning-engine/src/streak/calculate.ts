// Streak calculation of the pure learning engine (SPEC-409 ET-1, BR-GAM-01, ADR-0033, ADR-0281).
// Every input is explicit: the local reference day comes from the injected instant and time zone,
// the business bounds come from `params` (never from @learny/config here, SPEC-409 §14).
import { z } from 'zod';

import { assertValid } from '../errors';
import { addDays, isoWeekday, localDateOf } from '../time';
import {
  DateRangeSchema,
  InstantIsoSchema,
  IsoDateSchema,
  IsoWeekdaySchema,
  TimeZoneSchema,
} from '../types';
import type { DateRange, InstantIso, IsoDate, IsoWeekday, TimeZone } from '../types';

/** Activities that count for a study day (SPEC-409 EF-1, BR-GAM-01). */
export const STREAK_ACTIVITY_KINDS = [
  'global_quiz',
  'micro_session',
  'quiz',
  'exercise',
  'exam',
  'reading',
  'contribution',
] as const;

export type StreakActivityKind = (typeof STREAK_ACTIVITY_KINDS)[number];

export const StreakActivityKindSchema = z.enum(
  STREAK_ACTIVITY_KINDS,
) as z.ZodType<StreakActivityKind>;

/**
 * One completed activity. `at` is an instant; its local day is derived with the injected time zone
 * (ET-3). Only a `reading` entry uses `durationSeconds`, and 5 minutes or more qualifies (CL-4).
 */
export interface DailyActivityEntry {
  at: InstantIso;
  kind: StreakActivityKind;
  durationSeconds?: number;
}

const nonNegativeInteger = () =>
  z.number().refine((value) => Number.isInteger(value) && value >= 0, {
    message: 'Entier positif ou nul requis.',
  });
const positiveInteger = () =>
  z.number().refine((value) => Number.isInteger(value) && value >= 1, {
    message: 'Entier positif requis.',
  });

export const DailyActivityEntrySchema = z
  .object({
    at: InstantIsoSchema,
    kind: StreakActivityKindSchema,
    durationSeconds: nonNegativeInteger().optional(),
  })
  .strict() as z.ZodType<DailyActivityEntry>;

/** Business bounds supplied by the caller (`ENGINE.streak` in the application). */
export interface StreakParams {
  readingMinSeconds: number;
  regularityDays: number;
  maxLookbackDays: number;
}

export const StreakParamsSchema = z
  .object({
    readingMinSeconds: positiveInteger(),
    regularityDays: positiveInteger(),
    maxLookbackDays: positiveInteger(),
  })
  .strict() as z.ZodType<StreakParams>;

export interface CalculateStreakInput {
  dailyActivity: readonly DailyActivityEntry[];
  studyDays: readonly IsoWeekday[];
  pauses: readonly DateRange[];
  at: InstantIso;
  timeZone: TimeZone;
  params: StreakParams;
}

export const CalculateStreakInputSchema = z
  .object({
    dailyActivity: z.array(DailyActivityEntrySchema),
    studyDays: z.array(IsoWeekdaySchema).min(1),
    pauses: z.array(DateRangeSchema),
    at: InstantIsoSchema,
    timeZone: TimeZoneSchema,
    params: StreakParamsSchema,
  })
  .strict() as z.ZodType<CalculateStreakInput>;

/** One box of the regularity strip; `studied` wins over every neutrality rule. */
export type StreakDayStatus = 'studied' | 'neutral' | 'missed';

export const StreakDayStatusSchema = z.enum([
  'studied',
  'neutral',
  'missed',
]) as z.ZodType<StreakDayStatus>;

export interface StreakCalendarDay {
  date: IsoDate;
  status: StreakDayStatus;
}

export const StreakCalendarDaySchema = z
  .object({
    date: IsoDateSchema,
    status: StreakDayStatusSchema,
  })
  .strict() as z.ZodType<StreakCalendarDay>;

export interface StreakResult {
  days: number;
  /** Oldest first, most recent (reference local day) last. */
  calendar: StreakCalendarDay[];
  lastQualifyingDay: IsoDate | null;
}

export const StreakResultSchema = z
  .object({
    days: nonNegativeInteger(),
    calendar: z.array(StreakCalendarDaySchema),
    lastQualifyingDay: IsoDateSchema.nullable(),
  })
  .strict() as z.ZodType<StreakResult>;

function normalisePauses(pauses: readonly DateRange[]): DateRange[] {
  const sorted = pauses
    .map((pause) => ({ startsOn: pause.startsOn, endsOn: pause.endsOn }))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const merged: DateRange[] = [];
  for (const pause of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && pause.startsOn <= last.endsOn) {
      if (pause.endsOn > last.endsOn) last.endsOn = pause.endsOn;
    } else {
      merged.push(pause);
    }
  }
  return merged;
}

function isPaused(date: IsoDate, pauses: readonly DateRange[]): boolean {
  return pauses.some((pause) => date >= pause.startsOn && date <= pause.endsOn);
}

/**
 * Current streak, 14-day regularity strip and last qualifying day (ET-1). The walk starts at the
 * reference local day: a planned day without activity is still in progress (CL-1), so it never
 * breaks the streak before the day ends. A pause or a day outside the rhythm is neutral, while a
 * past planned day without activity breaks the streak (ADR-0033).
 */
export function calculateStreak(input: CalculateStreakInput): StreakResult {
  const parsed = assertValid(CalculateStreakInputSchema, input);
  const today = localDateOf(parsed.at, parsed.timeZone);
  const readingMinSeconds = parsed.params.readingMinSeconds;
  const plannedDays = new Set<IsoWeekday>(parsed.studyDays);
  const pauses = normalisePauses(parsed.pauses);

  const studiedDays = new Set<IsoDate>();
  for (const activity of parsed.dailyActivity) {
    const day = localDateOf(activity.at, parsed.timeZone);
    // A future activity cannot belong to the reference day or to a past streak (clock skew).
    if (day > today) continue;
    const qualifies =
      activity.kind !== 'reading' || (activity.durationSeconds ?? 0) >= readingMinSeconds;
    if (qualifies) studiedDays.add(day);
  }

  let days = 0;
  let cursor = today;
  for (let walked = 0; walked < parsed.params.maxLookbackDays; walked += 1) {
    if (studiedDays.has(cursor)) {
      days += 1;
    } else if (cursor === today) {
      // CL-1: the reference day is not over; keep the streak of the previous days.
    } else if (isPaused(cursor, pauses) || !plannedDays.has(isoWeekday(cursor))) {
      // CL-2, CL-3: unplanned and pause days are neutral and never break the streak.
    } else {
      break;
    }
    cursor = addDays(cursor, -1);
  }

  const calendar: StreakCalendarDay[] = [];
  for (let offset = parsed.params.regularityDays - 1; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    let status: StreakDayStatus;
    if (studiedDays.has(date)) {
      status = 'studied';
    } else if (date === today) {
      // The day is still running: showing it as missed would be premature (CL-1).
      status = 'neutral';
    } else if (isPaused(date, pauses) || !plannedDays.has(isoWeekday(date))) {
      status = 'neutral';
    } else {
      status = 'missed';
    }
    calendar.push({ date, status });
  }

  const qualifyingDates = [...studiedDays].sort();
  const lastQualifyingDay = qualifyingDates[qualifyingDates.length - 1] ?? null;

  return { days, calendar, lastQualifyingDay };
}
