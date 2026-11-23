// Dates of the application, always in the time zone of the user (SPEC-3003 EF-1, BR-ACC-07).
//
// The zone comes from `/me` (`timezone`), never from the device: a learner travelling with a
// phone in `America/New_York` still reads the days of their programme in `Europe/Paris`
// (canevas § 2). The fallback is `Europe/Paris`, the zone of the demonstration dataset.
import { zonedParts } from '@learny/core';

/** Zone used before `/me` answers, and when it carries an unusable zone (BR-ACC-07). */
export const FALLBACK_TIME_ZONE = 'Europe/Paris';

/** Anything that may carry the zone of the learner (`MeDto`, a cached profile). */
export interface TimeZoneSource {
  readonly timezone?: string | null;
}

/** True when `Intl` accepts `timeZone` (guards `zonedParts` against a corrupted profile). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Zone of the learner: `/me` when it is valid, `Europe/Paris` otherwise (BR-ACC-07). */
export function userTimeZone(source: TimeZoneSource | null | undefined): string {
  const zone = source?.timezone ?? '';
  return zone !== '' && isValidTimeZone(zone) ? zone : FALLBACK_TIME_ZONE;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** `11/11/2026` in `timeZone` — the format of the French screens. */
export function formatDate(instant: Date | string, timeZone: string = FALLBACK_TIME_ZONE): string {
  const parts = zonedParts(instant, timeZone);
  return `${pad(parts.day)}/${pad(parts.month)}/${String(parts.year)}`;
}

/** `11/11/2026 13:20` in `timeZone`. */
export function formatDateTime(
  instant: Date | string,
  timeZone: string = FALLBACK_TIME_ZONE,
): string {
  const parts = zonedParts(instant, timeZone);
  return `${pad(parts.day)}/${pad(parts.month)}/${String(parts.year)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** `13:20` in `timeZone` (an hour of a session, BR-ACC-07). */
export function formatTime(instant: Date | string, timeZone: string = FALLBACK_TIME_ZONE): string {
  const parts = zonedParts(instant, timeZone);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** `2026-11-11` in `timeZone`, the form the API expects (`from`/`to` of the agenda). */
export function formatIsoDay(
  instant: Date | string,
  timeZone: string = FALLBACK_TIME_ZONE,
): string {
  return zonedParts(instant, timeZone).localDate;
}

/** Day of `instant` as read by the learner, with the zone of `/me` (BR-ACC-07). */
export function formatUserDate(
  instant: Date | string,
  me: TimeZoneSource | null | undefined,
): string {
  return formatDate(instant, userTimeZone(me));
}

/** French short weekday names, indexed from Sunday (0), as the `Date` API returns them. */
const SHORT_WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'] as const;

/** French long weekday names, indexed from Sunday (0). */
const LONG_WEEKDAYS = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
] as const;

/** French month names, indexed from January (1). */
const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

/** French abbreviated month names (`lun. 9 nov.`). */
const SHORT_MONTHS = [
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
] as const;

/** Weekday of a `YYYY-MM-DD` calendar day, 0 = Sunday, without reading the device zone. */
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map((part) => Number(part));
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1)).getUTCDay();
}

/**
 * `Mercredi 11 novembre` — the over-title of the native header (SPEC-3102 § 10), read in the zone
 * of the learner (BR-ACC-07). The first letter is capitalised, as on the mockups.
 */
export function formatLongDay(
  instant: Date | string,
  timeZone: string = FALLBACK_TIME_ZONE,
): string {
  const parts = zonedParts(instant, timeZone);
  const weekday = LONG_WEEKDAYS[weekdayOf(parts.localDate)] ?? '';
  const month = MONTHS[parts.month - 1] ?? '';
  const label = `${weekday} ${String(parts.day)} ${month}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * `lun. 9 nov.` — the short day of a notification of the « Plus tôt » group (BR-NOT-01, ET-5) ;
 * today and yesterday rows show their hour instead.
 */
export function formatShortDay(
  instant: Date | string,
  timeZone: string = FALLBACK_TIME_ZONE,
): string {
  const parts = zonedParts(instant, timeZone);
  const weekday = SHORT_WEEKDAYS[weekdayOf(parts.localDate)] ?? '';
  const month = SHORT_MONTHS[parts.month - 1] ?? '';
  return `${weekday} ${String(parts.day)} ${month}`;
}
