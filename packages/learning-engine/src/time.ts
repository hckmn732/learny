// Time adapter of the learning engine (SPEC-401 ET-3, ADR-0140). This is the only module that
// converts between the serializable string types and `Date`/`Date.parse`; every public function
// still reads its instant from an input, never from the system clock (ADR-0047).
import { localTimeToShiftedInstant, startOfUserDay, toUserZone, userLocalDay } from '@learny/core';

import { EngineError } from './errors';
import type { InstantIso, IsoDate, IsoWeekday, LocalTime, TimeZone } from './types';

const INSTANT_ISO =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = 86_400_000;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const SUPPORTED_TIME_ZONES = new Set(['UTC', ...Intl.supportedValuesOf('timeZone')]);

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

interface CivilDate {
  year: number;
  month: number;
  day: number;
}

function readCivilDate(value: unknown): CivilDate | null {
  const match = typeof value === 'string' ? ISO_DATE.exec(value) : null;
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const length = month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > length) return null;
  return { year, month, day };
}

function civilMs({ year, month, day }: CivilDate): number {
  return Date.UTC(year, month - 1, day);
}

/** A strict `YYYY-MM-DD` civil day that exists in the proleptic Gregorian calendar. */
export function isIsoDate(value: unknown): value is IsoDate {
  return readCivilDate(value) !== null;
}

/** A strict `HH:mm` local time between 00:00 and 23:59. */
export function isLocalTime(value: unknown): value is LocalTime {
  return typeof value === 'string' && LOCAL_TIME.test(value);
}

/** An IANA time zone name supported by the runtime, plus the literal `UTC`. */
export function isTimeZone(value: unknown): value is TimeZone {
  return typeof value === 'string' && SUPPORTED_TIME_ZONES.has(value);
}

/**
 * A canonical UTC instant `YYYY-MM-DDTHH:mm:ss.sssZ` whose civil fields exist. `Date.parse` alone
 * would roll 2026-02-30 over to March; the round-trip rejects it (SPEC-401 CL-1, CL-2).
 */
export function isInstantIso(value: unknown): value is InstantIso {
  if (typeof value !== 'string' || !INSTANT_ISO.test(value)) return false;
  if (readCivilDate(value.slice(0, 10)) === null) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function invalidInput(path: string, message: string): EngineError {
  return new EngineError('INVALID_INPUT', message, { path });
}

/** Epoch milliseconds of a canonical instant; `INVALID_INSTANT` otherwise (CL-1). */
export function parseInstant(iso: InstantIso): number {
  if (!isInstantIso(iso)) {
    throw new EngineError('INVALID_INSTANT', `Instant ISO 8601 UTC invalide : ${String(iso)}`);
  }
  return Date.parse(iso);
}

/** Canonical instant of epoch milliseconds; `INVALID_INSTANT` for a non-finite input. */
export function formatInstant(ms: number): InstantIso {
  if (!Number.isFinite(ms)) {
    throw new EngineError('INVALID_INSTANT', `Millisecondes invalides : ${String(ms)}`);
  }
  return new Date(ms).toISOString();
}

/** Civil arithmetic on a UTC calendar: no time zone and no daylight-saving rule is involved. */
export function addDays(date: IsoDate, n: number): IsoDate {
  const parsed = readCivilDate(date);
  if (parsed === null) throw invalidInput('date', `Date civile invalide : ${date}`);
  if (!Number.isInteger(n) || !Number.isFinite(n)) {
    throw invalidInput('n', `Nombre de jours invalide : ${String(n)}`);
  }
  return new Date(civilMs(parsed) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Signed number of civil days from `a` to `b` (`b - a`). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const from = readCivilDate(a);
  const to = readCivilDate(b);
  if (from === null) throw invalidInput('a', `Date civile invalide : ${a}`);
  if (to === null) throw invalidInput('b', `Date civile invalide : ${b}`);
  return (civilMs(to) - civilMs(from)) / MS_PER_DAY;
}

/** ISO weekday of a civil day: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): IsoWeekday {
  const parsed = readCivilDate(date);
  if (parsed === null) throw invalidInput('date', `Date civile invalide : ${date}`);
  const weekday = new Date(civilMs(parsed)).getUTCDay();
  return (weekday === 0 ? 7 : weekday) as IsoWeekday;
}

/** Lexicographic comparison of two valid civil days. */
export function compareDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  if (readCivilDate(a) === null) throw invalidInput('a', `Date civile invalide : ${a}`);
  if (readCivilDate(b) === null) throw invalidInput('b', `Date civile invalide : ${b}`);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Local civil day of an instant in the given IANA zone (delegates to @learny/core). */
export function localDateOf(instant: InstantIso, tz: TimeZone): IsoDate {
  parseInstant(instant);
  if (!isTimeZone(tz)) throw invalidInput('tz', `Fuseau horaire inconnu : ${String(tz)}`);
  return userLocalDay(instant, tz);
}

/** Minutes since local midnight (0..1439) of an instant in the given zone. */
export function localMinutesOf(instant: InstantIso, tz: TimeZone): number {
  parseInstant(instant);
  if (!isTimeZone(tz)) throw invalidInput('tz', `Fuseau horaire inconnu : ${String(tz)}`);
  const local = toUserZone(instant, tz);
  return local.hour * 60 + local.minute;
}

/**
 * UTC instant of a local date and time in the zone (delegates to @learny/core). A skipped reading
 * is shifted by the jump (CL-3); an ambiguous reading takes the first occurrence.
 */
export function instantAt(date: IsoDate, time: LocalTime, tz: TimeZone): InstantIso {
  if (!isIsoDate(date)) throw invalidInput('date', `Date civile invalide : ${String(date)}`);
  if (!isLocalTime(time)) throw invalidInput('time', `Heure locale invalide : ${String(time)}`);
  if (!isTimeZone(tz)) throw invalidInput('tz', `Fuseau horaire inconnu : ${String(tz)}`);
  return localTimeToShiftedInstant(date, time, tz).toISOString();
}

/** First instant of the local civil day in the zone (delegates to @learny/core). */
export function startOfLocalDay(date: IsoDate, tz: TimeZone): InstantIso {
  if (!isIsoDate(date)) throw invalidInput('date', `Date civile invalide : ${String(date)}`);
  if (!isTimeZone(tz)) throw invalidInput('tz', `Fuseau horaire inconnu : ${String(tz)}`);
  return startOfUserDay(date, tz).toISOString();
}

/** Minutes since midnight of a `HH:mm` local time. */
export function parseLocalTime(t: LocalTime): number {
  if (!isLocalTime(t)) throw invalidInput('time', `Heure locale invalide : ${String(t)}`);
  const [hours, minutes] = t.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** `HH:mm` local time of a number of minutes since midnight. */
export function formatLocalTime(minutes: number): LocalTime {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
    throw invalidInput('minutes', `Minutes hors de 0..1439 : ${String(minutes)}`);
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}
