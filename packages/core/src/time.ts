// Time operations of the product (SPEC-207, ADR-0030): local day, time zone conversion and quiet
// hours. Everything is a pure function of an instant and an explicit IANA time zone; nothing reads
// the system clock (ADR-0047) or the time zone of the process (BR-ACC-07, CL-8). Offsets come from
// `Intl` through @date-fns/tz, never from a fixed number of hours added to UTC (ET-2).
import { tzOffset } from '@date-fns/tz';

import { AppError } from './errors';

/** BR-ACC-07 — zone used when the browser cannot provide a valid one. */
export const DEFAULT_TIME_ZONE = 'Europe/Paris';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export function isValidIanaZone(zone: string): boolean {
  if (zone === 'UTC') return true;
  if (Intl.supportedValuesOf('timeZone').includes(zone)) return true;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone === zone;
  } catch {
    return false;
  }
}

function invalid(path: string, message: string): AppError {
  return new AppError('VALIDATION_FAILED', message, { errors: [{ path, message }] });
}

// `Intl` also accepts fixed offsets such as "+01:00"; they are not IANA names and ignore DST.
const OFFSET_ZONE = /^[+-]/;

// A well-formed tz database name: capitalised words, as in « Asia/Kolkata » or
// « America/Port-au-Prince ». Case variants such as « ASIA/KOLKATA » do not match.
const TZDB_NAME = /^[A-Z][a-z]+(?:\/[A-Z][a-z]*(?:[_-](?:[A-Z][a-z]*|au|of|d|de))*)+$/;

/**
 * Engines canonicalise some names to their legacy alias (« Asia/Kolkata » reads « Asia/Calcutta »,
 * « Europe/Kyiv » reads « Europe/Kiev »), so `isValidIanaZone` rejects them although `Intl` supports
 * them. A well-formed tz database name that `Intl` accepts is a valid zone; fixed offsets and case
 * variants are not.
 */
function isSupportedTimeZone(zone: string): boolean {
  if (OFFSET_ZONE.test(zone)) return false;
  if (isValidIanaZone(zone)) return true;
  if (!TZDB_NAME.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the time zone when it is a valid IANA name, otherwise throws a validation error: an
 * invalid zone is never replaced silently (EF-2, CL-1).
 */
export function parseTimeZone(zone: unknown): string {
  if (typeof zone !== 'string' || zone === '' || !isSupportedTimeZone(zone)) {
    throw invalid('timeZone', 'Fuseau horaire IANA invalide.');
  }
  return zone;
}

/**
 * Time zone to store at sign-up (EF-7): the IANA name given by the browser, otherwise
 * `Europe/Paris`. The browser value is untrusted input, so an unusable one is not an error here.
 */
export function detectUserTimeZone(value?: string | null): string {
  return typeof value === 'string' && isSupportedTimeZone(value) ? value : DEFAULT_TIME_ZONE;
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const CIVIL_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/;

/** A point in time: a `Date` or an ISO 8601 string that carries its own offset (`Z`, `+02:00`). */
export type Instant = Date | string;

/** Copy of the instant as a `Date`; a string without a zone designator would depend on the process. */
export function toInstant(value: Instant): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw invalid('instant', 'Instant invalide.');
    return new Date(value.getTime());
  }
  const ms = typeof value === 'string' && ISO_INSTANT.test(value) ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(ms))
    throw invalid('instant', 'Instant invalide : attendu ISO 8601 avec fuseau.');
  // Date.parse rolls an impossible day (2026-02-30) over to the next month in some engines.
  if (readCivilDay(value.slice(0, 10)) === null) throw invalid('instant', 'Instant invalide.');
  return new Date(ms);
}

interface CivilDay {
  year: number;
  month: number;
  day: number;
}

/** A strict `YYYY-MM-DD` that is a real calendar day, or null (ET-3). */
function readCivilDay(value: unknown): CivilDay | null {
  const match = typeof value === 'string' ? CIVIL_DAY.exec(value) : null;
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  const real =
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day;
  return real ? { year, month, day } : null;
}

function parseCivilDay(value: unknown): CivilDay {
  const parsed = readCivilDay(value);
  if (parsed === null) throw invalid('day', 'Date civile invalide : attendu AAAA-MM-JJ.');
  return parsed;
}

function parseTimeOfDay(value: unknown, path: string): number {
  const match = typeof value === 'string' ? TIME_OF_DAY.exec(value) : null;
  if (match === null) throw invalid(path, 'Heure invalide : attendu HH:mm entre 00:00 et 23:59.');
  return Number(match[1]) * 60 + Number(match[2]);
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** UTC milliseconds of a civil day read as if it were UTC: the "wall clock" of that day. */
function wallMsOf({ year, month, day }: CivilDay): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
}

function civilDayOf(wall: Date): string {
  return `${pad(wall.getUTCFullYear(), 4)}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;
}

/** Next (or previous) civil day, independent of any time zone (CL-9, ET-7). */
export function addCivilDays(day: string, days: number): string {
  return civilDayOf(new Date(wallMsOf(parseCivilDay(day)) + days * MS_PER_DAY));
}

function offsetMsAt(timeZone: string, ms: number): number {
  return Math.round(tzOffset(timeZone, new Date(ms)) * MS_PER_MINUTE);
}

/** The local wall clock of an instant, as a Date whose UTC fields are the local fields. */
function wallOf(ms: number, timeZone: string): Date {
  return new Date(ms + offsetMsAt(timeZone, ms));
}

/**
 * Every real instant at which the wall clock of the zone reads `wallMs` (a local reading expressed
 * as if it were UTC): one in general, two when the clock goes back (autumn), none when it jumps
 * forward (spring). A transition in the 24 hours around the reading is assumed to be unique.
 */
function instantsAtWall(wallMs: number, timeZone: string): number[] {
  const before = offsetMsAt(timeZone, wallMs - MS_PER_DAY);
  const after = offsetMsAt(timeZone, wallMs + MS_PER_DAY);
  return [...new Set([wallMs - before, wallMs - after])]
    .filter((candidate) => offsetMsAt(timeZone, candidate) === wallMs - candidate)
    .sort((a, b) => a - b);
}

/** First instant of the zone where the offset equals `offset`, searched between two instants. */
function transitionInstant(timeZone: string, from: number, to: number, offset: number): number {
  let low = from;
  let high = to;
  while (high - low > MS_PER_MINUTE) {
    const mid = low + Math.floor((high - low) / (2 * MS_PER_MINUTE)) * MS_PER_MINUTE;
    if (offsetMsAt(timeZone, mid) === offset) high = mid;
    else low = mid;
  }
  return high;
}

/**
 * Same as `instantsAtWall`, but a reading skipped by the clock resolves to the instant of the
 * jump: the first real instant at or after that reading.
 */
function instantsFromWall(wallMs: number, timeZone: string): [number, ...number[]] {
  const [head, ...rest] = instantsAtWall(wallMs, timeZone);
  if (head !== undefined) return [head, ...rest];
  const after = offsetMsAt(timeZone, wallMs + MS_PER_DAY);
  return [transitionInstant(timeZone, wallMs - MS_PER_DAY, wallMs + MS_PER_DAY, after)];
}

export interface UserZoneTime {
  /** The instant, in UTC (ISO 8601). */
  instant: string;
  timeZone: string;
  /** Local civil day, `YYYY-MM-DD`. */
  date: string;
  /** Local time, `HH:mm`. */
  time: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** UTC offset in minutes (positive east of Greenwich). */
  offsetMinutes: number;
  /** UTC offset, `+01:00`. */
  offset: string;
  /** Long French name of the zone at that instant, e.g. « heure normale d’Europe centrale ». */
  zoneName: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let format = formatters.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat('fr-FR', { ...options, timeZone });
    formatters.set(key, format);
  }
  return format;
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(Math.round(abs % 60))}`;
}

/** Local date and time, offset and zone name of an instant in a given time zone (EF-2). */
export function toUserZone(instant: Instant, timeZone: string): UserZoneTime {
  const zone = parseTimeZone(timeZone);
  const at = toInstant(instant);
  const offsetMs = offsetMsAt(zone, at.getTime());
  const wall = new Date(at.getTime() + offsetMs);
  const zoneName =
    formatter(zone, { timeZoneName: 'long' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value ?? zone;
  const offsetMinutes = offsetMs / MS_PER_MINUTE;
  const weekday = wall.getUTCDay();
  return {
    instant: at.toISOString(),
    timeZone: zone,
    date: civilDayOf(wall),
    time: `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`,
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    second: wall.getUTCSeconds(),
    weekday: weekday === 0 ? 7 : weekday,
    offsetMinutes,
    offset: formatOffset(offsetMinutes),
    zoneName,
  };
}

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' };

/**
 * French rendering of an instant in the user's zone (EF-2), e.g. « mercredi 11 novembre 2026 à
 * 13:20 ». The zone always comes from the caller, never from the process.
 */
export function formatUserDate(
  instant: Instant,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_FORMAT,
): string {
  const zone = parseTimeZone(timeZone);
  return formatter(zone, options).format(toInstant(instant));
}

/** Local civil day (`YYYY-MM-DD`) of an instant. */
export function userLocalDay(instant: Instant, timeZone: string): string {
  const zone = parseTimeZone(timeZone);
  return civilDayOf(wallOf(toInstant(instant).getTime(), zone));
}

/** Local hour of an instant, 0 to 23 (EF-4). */
export function userLocalHour(instant: Instant, timeZone: string): number {
  const zone = parseTimeZone(timeZone);
  return wallOf(toInstant(instant).getTime(), zone).getUTCHours();
}

/** Local ISO weekday of an instant, 1 = Monday … 7 = Sunday (EF-4). */
export function userWeekday(instant: Instant, timeZone: string): number {
  const zone = parseTimeZone(timeZone);
  const weekday = wallOf(toInstant(instant).getTime(), zone).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/**
 * UTC instant at which the civil day `day` (`YYYY-MM-DD`) starts in the zone (EF-3). When the clock
 * skips midnight, the day starts at the instant of the jump; when it reads midnight twice, at the
 * first reading.
 */
export function startOfUserDay(day: string, timeZone: string): Date {
  const zone = parseTimeZone(timeZone);
  return new Date(instantsFromWall(wallMsOf(parseCivilDay(day)), zone)[0]);
}

/**
 * Exclusive upper bound of the civil day `day` in the zone: the start of the next day (EF-3,
 * ET-4). The day lasts `endOfUserDay - startOfUserDay`: 23, 24 or 25 hours at a clock change.
 */
export function endOfUserDay(day: string, timeZone: string): Date {
  return startOfUserDay(addCivilDays(day, 1), timeZone);
}

/** Half-open interval `[start, end)` of a civil day in the zone, for range queries (ET-4). */
export function userDayBounds(day: string, timeZone: string): { start: Date; end: Date } {
  return { start: startOfUserDay(day, timeZone), end: endOfUserDay(day, timeZone) };
}

/**
 * Real instants at which the zone's clock reads `time` (`HH:mm`) on the civil day `day`: one in
 * general, two when the clock goes back (both 02:30 of an autumn night stay distinct), none when
 * the reading does not exist (the 02:30 skipped in spring is not made up, CL-2, CL-3).
 */
export function instantsAtLocalTime(day: string, time: string, timeZone: string): Date[] {
  const zone = parseTimeZone(timeZone);
  const wall = wallMsOf(parseCivilDay(day)) + parseTimeOfDay(time, 'time') * MS_PER_MINUTE;
  return instantsAtWall(wall, zone).map((ms) => new Date(ms));
}

/**
 * UTC instant at which the zone's clock reads `time` (`HH:mm`) on the civil day `day`, with the
 * engine rule of SPEC-401 CL-3: a reading skipped by a spring-forward jump is shifted by the
 * duration of the jump (02:30 → 03:30 in Paris), and an ambiguous reading takes the first
 * occurrence. `instantsAtLocalTime` keeps the historical SPEC-207 rule (no occurrence at all), so
 * both callers keep their own contract (ADR-0277).
 */
export function localTimeToShiftedInstant(day: string, time: string, timeZone: string): Date {
  const zone = parseTimeZone(timeZone);
  const wall = wallMsOf(parseCivilDay(day)) + parseTimeOfDay(time, 'time') * MS_PER_MINUTE;
  const direct = instantsAtWall(wall, zone);
  if (direct[0] !== undefined) return new Date(direct[0]);

  const before = offsetMsAt(zone, wall - MS_PER_DAY);
  const after = offsetMsAt(zone, wall + MS_PER_DAY);
  const gap = after - before;
  if (gap > 0) {
    const shifted = instantsAtWall(wall + gap, zone);
    if (shifted[0] !== undefined) return new Date(shifted[0]);
  }
  return new Date(instantsFromWall(wall, zone)[0]);
}

/** BR-NOT-04 — default quiet hours, 21:00 to 08:00 (the range crosses midnight). */
export const DEFAULT_QUIET_HOURS = { start: '21:00', end: '08:00' } as const;

export interface QuietHoursWindow {
  /** `HH:mm`, included. Defaults to 21:00. */
  start?: string;
  /** `HH:mm`, excluded. Defaults to 08:00. */
  end?: string;
  timeZone: string;
}

interface ParsedQuietHours {
  start: number;
  end: number;
  timeZone: string;
}

function parseQuietHours(quiet: QuietHoursWindow): ParsedQuietHours {
  return {
    start: parseTimeOfDay(quiet.start ?? DEFAULT_QUIET_HOURS.start, 'start'),
    end: parseTimeOfDay(quiet.end ?? DEFAULT_QUIET_HOURS.end, 'end'),
    timeZone: parseTimeZone(quiet.timeZone),
  };
}

/** The quiet range is `[start, end)` on the local clock, across midnight when `start > end`. */
function isQuietAt(ms: number, { start, end, timeZone }: ParsedQuietHours): boolean {
  if (start === end) return false;
  const wall = wallOf(ms, timeZone);
  const minutes = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/**
 * Whether the instant falls in the user's quiet hours (EF-5, BR-NOT-06). The start is included
 * (21:00 is quiet), the end excluded (08:00 may send); `start = end` means no quiet hours.
 */
export function isQuietHours(instant: Instant, quiet: QuietHoursWindow): boolean {
  const parsed = parseQuietHours(quiet);
  return isQuietAt(toInstant(instant).getTime(), parsed);
}

/**
 * The instant itself when sending is allowed, otherwise the first end of the quiet range that
 * follows it (EF-6). A boundary skipped by the clock in spring is replaced by the jump instant; an
 * autumn boundary read twice gives the first reading after `instant`. The result is always a real
 * instant outside quiet hours, and the search never loops.
 */
export function nextOutsideQuietHours(instant: Instant, quiet: QuietHoursWindow): Date {
  const parsed = parseQuietHours(quiet);
  const at = toInstant(instant).getTime();
  if (!isQuietAt(at, parsed)) return new Date(at);

  const today = civilDayOf(wallOf(at, parsed.timeZone));
  const candidates: number[] = [];
  for (let offset = 0; offset <= 2; offset += 1) {
    const wall = wallMsOf(parseCivilDay(addCivilDays(today, offset))) + parsed.end * MS_PER_MINUTE;
    candidates.push(...instantsFromWall(wall, parsed.timeZone));
  }
  const next = candidates.sort((a, b) => a - b).find((ms) => ms > at && !isQuietAt(ms, parsed));
  if (next === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Fin des heures calmes introuvable.');
  }
  return new Date(next);
}
