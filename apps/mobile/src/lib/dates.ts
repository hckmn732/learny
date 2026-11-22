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
export function formatIsoDay(instant: Date | string, timeZone: string = FALLBACK_TIME_ZONE): string {
  return zonedParts(instant, timeZone).localDate;
}

/** Day of `instant` as read by the learner, with the zone of `/me` (BR-ACC-07). */
export function formatUserDate(instant: Date | string, me: TimeZoneSource | null | undefined): string {
  return formatDate(instant, userTimeZone(me));
}
