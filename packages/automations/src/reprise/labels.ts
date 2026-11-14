// French labels of the `reprise` explanations (SPEC-712 EF-8, §10). Pure functions: the zone and the
// reference instant are explicit, so tests pin the words without depending on the process clock or
// on the machine time zone (ADR-0047, ADR-0030).
import { toInstant } from '@learny/core';

import { isoWeekday as isoWeekdayOf, localDayOf, shiftDay } from './detect-missed';

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

function partsOf(day: string): { year: number; month: number; date: number; weekday: number } {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return { year, month, date, weekday: new Date(Date.UTC(year, month - 1, date)).getUTCDay() };
}

function capitalized(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * EF-8, §10 — a day of the current week keeps its weekday alone (« jeudi »); another week shows
 * the short date (« lundi 16 nov. »), as the mockup does for the third alternative of Wednesday
 * 11 November. The reference instant is the action creation, never the process clock.
 */
export function formatDayLabel(day: string, reference: Date | string, timeZone: string): string {
  const today = localDayOf(reference, timeZone);
  const weekdayOfToday = isoWeekdayOf(today);
  const monday = shiftDay(today, -(weekdayOfToday - 1));
  const within = day >= monday && day <= shiftDay(monday, 6);
  const parts = partsOf(day);
  const weekday = WEEKDAYS[parts.weekday] ?? '';
  if (within) return weekday;
  const month = MONTHS[parts.month - 1] ?? '';
  return `${weekday} ${String(parts.date)} ${month}`;
}

/** « Jeudi 15:00 » within six days, « Lundi 16 nov., 9:00 » afterwards (ET-2). */
export function formatSlotLabel(
  instant: Date | string,
  reference: Date | string,
  timeZone: string,
): string {
  const day = localDayOf(instant, timeZone);
  const hour = localHour(instant, timeZone);
  const label = formatDayLabel(day, reference, timeZone);
  const clock = `${String(hour.hour)}:${String(hour.minute).padStart(2, '0')}`;
  return label.includes(' ') ? `${capitalized(label)}, ${clock}` : `${capitalized(label)} ${clock}`;
}

/** Local hour and minute of an instant, computed with `Intl` and the explicit zone. */
export function localHour(
  instant: Date | string,
  timeZone: string,
): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(toInstant(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { hour: value('hour'), minute: value('minute') };
}

/** `H:mm`, the hour format of EF-8 (no leading zero on the hour). */
export function formatHour(instant: Date | string, timeZone: string): string {
  const { hour, minute } = localHour(instant, timeZone);
  return `${String(hour)}:${String(minute).padStart(2, '0')}`;
}

/** Lowercase local day for the middle of a sentence: « mardi », « lundi 16 nov. ». */
export function formatDayInSentence(
  day: string,
  reference: Date | string,
  timeZone: string,
): string {
  return formatDayLabel(day, reference, timeZone);
}

/** Civil day of an instant in the learner's zone (re-exported for the definitions). */
export function dayOf(instant: Date | string, timeZone: string): string {
  return localDayOf(instant, timeZone);
}
