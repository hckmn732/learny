// Internal time grid of the planner (SPEC-407 ET-1, ET-5). All arithmetic is done on local
// minutes of the learner's zone; instants are produced only at the boundary with `instantAt`,
// which carries the DST rule of SPEC-401 (ADR-0277). No system clock is read.
import { EngineError } from '../errors';
import {
  addDays,
  compareDates,
  daysBetween,
  formatLocalTime,
  instantAt,
  isIsoDate,
  isLocalTime,
  isTimeZone,
  localDateOf,
  localMinutesOf,
  parseInstant,
} from '../time';
import type { IsoDate, IsoWeekday, LocalTime, StudySlot, TimeZone } from '../types';

import type { PlannerMoment, PlannerParams, PlannerPreferences } from './types';

export const MINUTES_PER_DAY = 1440;

/** Canonical order of the study moments (ADR-0029). */
export const MOMENT_ORDER: readonly StudySlot[] = ['matin', 'apres_midi', 'soir'];

export interface MinuteRange {
  readonly start: number;
  readonly end: number;
}

export function invalidInput(path: string, message: string): EngineError {
  return new EngineError('INVALID_INPUT', message, { path });
}

export function invalidParam(path: string, message: string): EngineError {
  return new EngineError('INVALID_PARAM', message, { path });
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function roundToGranularity(minutes: number, granularity: number): number {
  const rounded = Math.round(minutes / granularity) * granularity;
  return Math.max(granularity, rounded);
}

/** Largest contiguous block the planner creates: the longest preferred moment (ADR-0280). */
export function maxChunkMinutes(
  params: PlannerParams,
  preferredSlots: readonly StudySlot[],
): number {
  return preferredSlots.reduce((longest, slot) => {
    const moment = params.moments[slot];
    const length = parseMoment(moment).end - parseMoment(moment).start;
    return Math.max(longest, length);
  }, params.granularityMinutes);
}

export function parseMoment(moment: PlannerMoment): MinuteRange {
  if (!isLocalTime(moment.start) || !isLocalTime(moment.end)) {
    throw invalidParam('params.moments', 'Moments d’étude invalides.');
  }
  const start = minuteOf(moment.start);
  const end = minuteOf(moment.end);
  if (end <= start) {
    throw invalidParam('params.moments', 'La fin d’un moment doit suivre son début.');
  }
  return { start, end };
}

function minuteOf(time: LocalTime): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Validates the planner parameters at the engine boundary (ET-5). */
export function assertPlannerParams(params: PlannerParams): void {
  const positive = [
    ['revisionTailMinutes', params.revisionTailMinutes],
    ['globalQuizMinutes', params.globalQuizMinutes],
    ['sprintMinutes', params.sprintMinutes],
    ['validationQuizMinutes', params.validationQuizMinutes],
    ['bufferMinutes', params.bufferMinutes],
    ['granularityMinutes', params.granularityMinutes],
    ['maxHoursPerDay', params.maxHoursPerDay],
  ] as const;
  for (const [key, value] of positive) {
    if (!isPositiveInteger(value)) {
      throw invalidParam(`params.${key}`, `${key} doit être un entier positif.`);
    }
  }
  if (params.contributionShare < 0 || params.contributionShare > 1) {
    throw invalidParam('params.contributionShare', 'contributionShare doit être dans 0..1.');
  }
  if (params.sprintDaysBeforeDefault < 1) {
    throw invalidParam('params.sprintDaysBeforeDefault', 'sprintDaysBeforeDefault doit être ≥ 1.');
  }
  if (!params.allowedSprintDaysBefore.includes(params.sprintDaysBeforeDefault)) {
    throw invalidParam(
      'params.sprintDaysBeforeDefault',
      'sprintDaysBeforeDefault doit figurer dans allowedSprintDaysBefore.',
    );
  }
  if (params.mockExam.questions < 1 || params.mockExam.minutesPerQuestion < 1) {
    throw invalidParam('params.mockExam', 'Questions et minutes par question doivent être ≥ 1.');
  }
  for (const slot of MOMENT_ORDER) parseMoment(params.moments[slot]);
}

/** Validates the preferences at the engine boundary; an empty study-day list keeps CL-1. */
export function assertPreferences(preferences: PlannerPreferences): void {
  if (!isTimeZone(preferences.tz)) {
    throw invalidInput('preferences.tz', `Fuseau horaire inconnu : ${String(preferences.tz)}`);
  }
  if (preferences.holidays !== undefined) {
    for (const holiday of preferences.holidays) {
      if (!isIsoDate(holiday)) {
        throw invalidInput('preferences.holidays', `Jour férié invalide : ${String(holiday)}`);
      }
    }
  }
}

export function isStudyDay(
  date: IsoDate,
  preferences: PlannerPreferences,
  isoWeekday: (day: IsoDate) => IsoWeekday,
): boolean {
  if (!preferences.availability.studyDays.includes(isoWeekday(date))) return false;
  return !(preferences.holidays ?? []).includes(date);
}

export function windowsOfDay(
  date: IsoDate,
  preferences: PlannerPreferences,
  params: PlannerParams,
  nowDate: IsoDate,
  nowMinutes: number,
): readonly { moment: StudySlot; start: number; end: number }[] {
  return preferences.availability.preferredSlots.map((moment) => {
    const window = parseMoment(params.moments[moment]);
    const start =
      compareDates(date, nowDate) === 0 ? Math.max(window.start, nowMinutes) : window.start;
    return { moment, start, end: window.end };
  });
}

/** Last preferred moment: the daily global quiz is reserved at its end (BR-AGE-03). */
export function globalQuizReserve(
  preferences: PlannerPreferences,
  params: PlannerParams,
): MinuteRange {
  const last = preferences.availability.preferredSlots.at(-1);
  if (last === undefined) {
    throw new EngineError('INVALID_AVAILABILITY', 'Aucun moment d’étude préféré.', {
      path: 'preferences.availability.preferredSlots',
    });
  }
  const window = parseMoment(params.moments[last]);
  const start = Math.max(window.start, window.end - params.globalQuizMinutes);
  return { start, end: window.end };
}

export function subtractRanges(range: MinuteRange, blocks: readonly MinuteRange[]): MinuteRange[] {
  let remaining: MinuteRange[] = [{ start: range.start, end: range.end }];
  for (const block of blocks) {
    const next: MinuteRange[] = [];
    for (const part of remaining) {
      if (block.end <= part.start || block.start >= part.end) {
        next.push(part);
        continue;
      }
      if (block.start > part.start) next.push({ start: part.start, end: block.start });
      if (block.end < part.end) next.push({ start: block.end, end: part.end });
    }
    remaining = next;
  }
  return remaining;
}

export function overlaps(one: MinuteRange, other: MinuteRange): boolean {
  return one.start < other.end && other.start < one.end;
}

export function minutesOfRange(range: MinuteRange): number {
  return Math.max(0, range.end - range.start);
}

/** Splits a stored slot into local-minute intervals per civil day (a slot may cross midnight). */
export function slotLocalIntervals(
  startsAt: string,
  endsAt: string,
  tz: TimeZone,
): { date: IsoDate; range: MinuteRange }[] {
  const startMs = parseInstant(startsAt);
  const endMs = parseInstant(endsAt);
  if (endMs <= startMs) {
    throw invalidInput('slots.endsAt', 'La fin d’un créneau doit suivre son début.');
  }
  const startDate = localDateOf(startsAt, tz);
  const endDate = localDateOf(endsAt, tz);
  const startMinute = localMinutesOf(startsAt, tz);
  const endMinute = localMinutesOf(endsAt, tz);
  if (startDate === endDate) {
    return [{ date: startDate, range: { start: startMinute, end: endMinute } }];
  }
  const parts: { date: IsoDate; range: MinuteRange }[] = [];
  const firstEnd = MINUTES_PER_DAY;
  if (firstEnd > startMinute) {
    parts.push({ date: startDate, range: { start: startMinute, end: firstEnd } });
  }
  const days = daysBetween(startDate, endDate);
  for (let offset = 1; offset < days; offset += 1) {
    parts.push({ date: addDays(startDate, offset), range: { start: 0, end: MINUTES_PER_DAY } });
  }
  if (endMinute > 0) parts.push({ date: endDate, range: { start: 0, end: endMinute } });
  return parts;
}

/**
 * True when the local window is made only of real readings: a spring-forward gap would make the
 * real duration shorter than the local one, so the window is refused (CL-2). A fall-back window is
 * accepted and simply lasts longer in real time.
 */
export function isRealWindow(date: IsoDate, range: MinuteRange, tz: TimeZone): boolean {
  if (range.end > MINUTES_PER_DAY || range.start < 0) return false;
  const startTime = formatLocalTime(range.start);
  const endTime = range.end === MINUTES_PER_DAY ? '23:59' : formatLocalTime(range.end);
  const startInstant = instantAt(date, startTime, tz);
  const endInstant =
    range.end === MINUTES_PER_DAY
      ? instantAt(addDays(date, 1), '00:00', tz)
      : instantAt(date, endTime, tz);
  if (localMinutesOf(startInstant, tz) !== range.start) return false;
  const endLocal = range.end === MINUTES_PER_DAY ? 0 : range.end;
  if (localMinutesOf(endInstant, tz) !== endLocal) return false;
  const realMinutes = (parseInstant(endInstant) - parseInstant(startInstant)) / 60_000;
  return realMinutes >= range.end - range.start;
}

export function instantsOfRange(
  date: IsoDate,
  range: MinuteRange,
  tz: TimeZone,
): { startsAt: string; endsAt: string } {
  const startsAt = instantAt(date, formatLocalTime(range.start), tz);
  const endsAt =
    range.end === MINUTES_PER_DAY
      ? instantAt(addDays(date, 1), '00:00', tz)
      : instantAt(date, formatLocalTime(range.end), tz);
  return { startsAt, endsAt };
}
