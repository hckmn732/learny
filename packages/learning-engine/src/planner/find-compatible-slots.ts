// Next compatible slots of an activity (SPEC-407 ET-2, BR-AGE-05). Pure function: it reads the
// existing agenda, the planner parameters and the preferences given by the caller, and returns at
// most `count` non-overlapping windows that respect study days, preferred moments, holidays and the
// cumulative daily capacity (including the daily global quiz).
import { addDays, isoWeekday, localDateOf, localMinutesOf, parseInstant } from '../time';
import type { IsoDate } from '../types';

import {
  assertPlannerParams,
  assertPreferences,
  globalQuizReserve,
  instantsOfRange,
  invalidInput,
  isRealWindow,
  isStudyDay,
  minutesOfRange,
  slotLocalIntervals,
  subtractRanges,
  windowsOfDay,
  type MinuteRange,
} from './grid';
import type {
  CompatibleSlot,
  CompatibleSlotActivity,
  PlannerCalendar,
  PlannerPreferences,
} from './types';

const MAX_HORIZON_DAYS = 366;

export function findCompatibleSlots(
  activity: CompatibleSlotActivity,
  calendar: PlannerCalendar,
  preferences: PlannerPreferences,
  count = 3,
): CompatibleSlot[] {
  assertPlannerParams(calendar.params);
  assertPreferences(preferences);
  parseInstant(calendar.now);
  if (!Number.isInteger(activity.durationMinutes) || activity.durationMinutes <= 0) {
    throw invalidInput(
      'activity.durationMinutes',
      'La durée de l’activité doit être un entier positif.',
    );
  }
  if (!Number.isInteger(count) || count < 1) {
    throw invalidInput('count', 'Le nombre de créneaux demandés doit être un entier ≥ 1.');
  }
  const tz = preferences.tz;
  const nowDate = localDateOf(calendar.now, tz);
  const nowMinutes = localMinutesOf(calendar.now, tz);
  const capacity = preferences.availability.hoursPerDay * 60;
  const reserve = globalQuizReserve(preferences, calendar.params);
  const busy = new Map<IsoDate, MinuteRange[]>();
  const used = new Map<IsoDate, number>();
  const quizDates = new Set<IsoDate>();
  for (const slot of calendar.slots) {
    if (slot.status === 'cancelled' || slot.status === 'moved') continue;
    for (const { date, range } of slotLocalIntervals(slot.startsAt, slot.endsAt, tz)) {
      const ranges = busy.get(date) ?? [];
      ranges.push(range);
      busy.set(date, ranges);
      used.set(date, (used.get(date) ?? 0) + minutesOfRange(range));
    }
    if (slot.kind === 'global_quiz') quizDates.add(localDateOf(slot.startsAt, tz));
  }
  const results: CompatibleSlot[] = [];
  for (let offset = 0; offset <= MAX_HORIZON_DAYS && results.length < count; offset += 1) {
    const date = addDays(nowDate, offset);
    if (!isStudyDay(date, preferences, isoWeekday)) continue;
    const hasQuiz = quizDates.has(date);
    const reserved = hasQuiz ? 0 : calendar.params.globalQuizMinutes;
    for (const window of windowsOfDay(date, preferences, calendar.params, nowDate, nowMinutes)) {
      if (window.end <= window.start) continue;
      const blocks: MinuteRange[] = [...(busy.get(date) ?? [])];
      if (!hasQuiz) blocks.push(reserve);
      const free = subtractRanges({ start: window.start, end: window.end }, blocks);
      let usedToday = used.get(date) ?? 0;
      for (const gap of free) {
        let cursor = gap.start;
        while (
          cursor + activity.durationMinutes <= gap.end &&
          usedToday + activity.durationMinutes + reserved <= capacity &&
          results.length < count
        ) {
          const candidate: MinuteRange = {
            start: cursor,
            end: cursor + activity.durationMinutes,
          };
          if (isRealWindow(date, candidate, tz)) {
            const instants = instantsOfRange(date, candidate, tz);
            results.push({
              date,
              moment: window.moment,
              startsAt: instants.startsAt,
              endsAt: instants.endsAt,
            });
            const ranges = busy.get(date) ?? [];
            ranges.push(candidate);
            busy.set(date, ranges);
            usedToday += activity.durationMinutes;
            used.set(date, usedToday);
            quizDates.add(date);
            cursor = candidate.end;
          } else {
            cursor += 1;
          }
        }
        if (results.length >= count) break;
      }
      if (results.length >= count) break;
    }
  }
  return results;
}
