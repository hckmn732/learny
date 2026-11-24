// Periods, weeks and months of the agenda (SPEC-3203 ET-1, EF-2, EF-4, EF-5, BR-AGE-01, CL-2).
//
// A day is always the civil `YYYY-MM-DD` the learner reads in their own zone: the zone comes from
// `/me` (the agenda DTO repeats it) and never from the device. Everything here is pure arithmetic
// on civil days — no `new Date()`, no `Date.now()` — so Vitest proves the boundaries of the
// mockup (9–15 November 2026, a Monday-first week) in whatever zone the runner lives in.
import { zonedParts } from '@learny/core';

/** The three views of the agenda (BR-AGE-01, EF-2). */
export type AgendaView = 'jour' | 'semaine' | 'mois';

/** The views in the order of the segmented control. */
export const AGENDA_VIEWS: readonly AgendaView[] = ['jour', 'semaine', 'mois'];

/** Number of cells of the month grid: six Monday-first weeks, as the mockup draws them. */
export const MONTH_CELL_COUNT = 42;

const DAY_MS = 86_400_000;

/** Civil window of the agenda, sent as `GET /agenda?from=&to=`. */
export interface CivilPeriod {
  readonly from: string;
  readonly to: string;
}

/** One cell of the month grid; `inMonth` is false on the greyed days of the neighbouring months. */
export interface MonthCell {
  readonly day: string;
  readonly number: number;
  readonly inMonth: boolean;
}

/** True when `value` is one of the three views of the agenda (ET-2: URL parameter). */
export function isAgendaView(value: string | undefined): value is AgendaView {
  return value === 'jour' || value === 'semaine' || value === 'mois';
}

/** Parts of a `YYYY-MM-DD` day; a malformed value reads as 1970-01-01 instead of `NaN`. */
export function parseCivilDay(day: string): { year: number; month: number; day: number } {
  const [year = 1970, month = 1, date = 1] = day.split('-').map((part) => Number(part));
  return { year, month, day: date };
}

/** `YYYY-MM-DD` of a year, a month (1–12) and a day. */
export function civilDayOf(year: number, month: number, day: number): string {
  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  return `${String(year)}-${paddedMonth}-${paddedDay}`;
}

function utcOf(day: string): number {
  const parts = parseCivilDay(day);
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function dayOfUtc(milliseconds: number): string {
  const date = new Date(milliseconds);
  return civilDayOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** `day` moved by `count` days (negative moves to the past). */
export function addDays(day: string, count: number): string {
  return dayOfUtc(utcOf(day) + count * DAY_MS);
}

/** Number of days from `from` to `to` (`to - from`). */
export function dayDistance(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
}

/** Weekday of a civil day, 0 = Monday … 6 = Sunday (the week of the mockups starts on Monday). */
export function weekdayOf(day: string): number {
  return (new Date(utcOf(day)).getUTCDay() + 6) % 7;
}

/** Monday of the week that contains `day`. */
export function startOfWeek(day: string): string {
  return addDays(day, -weekdayOf(day));
}

/** Sunday of the week that contains `day`. */
export function endOfWeek(day: string): string {
  return addDays(startOfWeek(day), 6);
}

/** The seven days of the week that contains `day`, from Monday to Sunday (EF-2). */
export function daysOfWeek(day: string): readonly string[] {
  const monday = startOfWeek(day);
  return Array.from({ length: 7 }, (_unused, index) => addDays(monday, index));
}

/** Number of days of the month of `day`. */
export function daysInMonth(day: string): number {
  const parts = parseCivilDay(day);
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

/** First day of the month of `day`. */
export function startOfMonth(day: string): string {
  const parts = parseCivilDay(day);
  return civilDayOf(parts.year, parts.month, 1);
}

/** Last day of the month of `day`. */
export function endOfMonth(day: string): string {
  const parts = parseCivilDay(day);
  return civilDayOf(parts.year, parts.month, daysInMonth(day));
}

/** `day` moved by `count` months; the day of the month is clamped to the target month. */
export function addMonths(day: string, count: number): string {
  const parts = parseCivilDay(day);
  const zeroBased = parts.month - 1 + count;
  const year = parts.year + Math.floor(zeroBased / 12);
  const month = (((zeroBased % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return civilDayOf(year, month, Math.min(parts.day, last));
}

/**
 * The 42 cells of the month grid that contains `day`, from the Monday on or before the first day
 * of the month (the mockup greyes out the last days of the previous month and the first of the
 * next one).
 */
export function monthCells(day: string): readonly MonthCell[] {
  const first = startOfMonth(day);
  const gridStart = startOfWeek(first);
  const parts = parseCivilDay(day);
  return Array.from({ length: MONTH_CELL_COUNT }, (_unused, index) => {
    const cellDay = addDays(gridStart, index);
    const cell = parseCivilDay(cellDay);
    return {
      day: cellDay,
      number: cell.day,
      inMonth: cell.month === parts.month && cell.year === parts.year,
    };
  });
}

/** Window of a view for `day`: the day, its Monday-to-Sunday week or its whole month (ET-1). */
export function periodOf(view: AgendaView, day: string): CivilPeriod {
  if (view === 'jour') return { from: day, to: day };
  if (view === 'semaine') return { from: startOfWeek(day), to: endOfWeek(day) };
  return { from: startOfMonth(day), to: endOfMonth(day) };
}

/** Anchor of the previous (`-1`) or next (`1`) period of a view (EF-9, BR-AGE-01). */
export function shiftPeriod(view: AgendaView, day: string, direction: 1 | -1): string {
  if (view === 'jour') return addDays(day, direction);
  if (view === 'semaine') return addDays(day, 7 * direction);
  return addMonths(day, direction);
}

/** True when `day` belongs to `period` (inclusive bounds). */
export function isInPeriod(day: string, period: CivilPeriod): boolean {
  return day >= period.from && day <= period.to;
}

/** `day` brought inside the navigation bounds of the formations (CL-2, BR-AGE-01). */
export function clampDay(day: string, bounds: CivilPeriod | null): string {
  if (bounds === null) return day;
  if (day < bounds.from) return bounds.from;
  if (day > bounds.to) return bounds.to;
  return day;
}

/**
 * True when the neighbouring period of `view` still overlaps the bounds of the formations: the
 * previous/next controls are inactive outside them (CL-2, CA-2).
 */
export function canShift(
  view: AgendaView,
  day: string,
  direction: 1 | -1,
  bounds: CivilPeriod | null,
): boolean {
  if (bounds === null) return true;
  const target = shiftPeriod(view, day, direction);
  const window = periodOf(view, target);
  return window.from <= bounds.to && window.to >= bounds.from;
}

/** The civil day of `instant` in `timeZone` — the « today » of the learner (BR-ACC-07). */
export function todayOf(instant: Date, timeZone: string): string {
  return zonedParts(instant, timeZone).localDate;
}

/** Local minutes since midnight of `instant` in `timeZone` (the position of the hour line). */
export function minutesOfDay(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  return parts.hour * 60 + parts.minute;
}

/** `09:00` — a local minute of the day, as the slots carry it (contract `startMinutes`). */
export function formatMinuteOfDay(minutes: number): string {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  const hours = Math.floor(safe / 60);
  return `${String(hours).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** `13 h 20`, `2 h` or `40 min` — a duration of the totals of the period (BR-AGE-06). */
export function formatMinutes(total: number): string {
  const safe = Math.max(0, Math.round(total));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours === 0) return `${String(minutes)} min`;
  if (minutes === 0) return `${String(hours)} h`;
  return `${String(hours)} h ${String(minutes).padStart(2, '0')}`;
}

/** The two directions of the horizontal swipe (EF-9). */
export type PeriodDirection = 1 | -1;
