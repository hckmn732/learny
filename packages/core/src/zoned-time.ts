// Local-time primitives of the jobs (SPEC-203 ET-5, ADR-0030, ADR-0123): the wall-clock fields of
// an instant in an IANA zone, and the inverse conversion with the daylight-saving rules.
// Pure functions: the zone is always explicit and no global time is read (ADR-0047).
import { tzOffset } from '@date-fns/tz';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface ZonedParts {
  year: number;
  /** 1..12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  weekday: number;
  /** `YYYY-MM-DD` civil date in the zone. */
  localDate: string;
  /** Offset to UTC at this instant, in minutes (Europe/Paris in summer: 120). */
  offsetMinutes: number;
}

function toMs(instant: Date | string): number {
  const ms = typeof instant === 'string' ? Date.parse(instant) : instant.getTime();
  if (!Number.isFinite(ms)) throw new RangeError('Instant invalide.');
  return ms;
}

/** Offset in minutes of `timeZone` at the epoch millisecond `ms`. */
function offsetAt(ms: number, timeZone: string): number {
  const offset = tzOffset(timeZone, new Date(ms));
  if (Number.isNaN(offset)) throw new RangeError(`Fuseau horaire inconnu : ${timeZone}`);
  return offset;
}

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** Wall-clock fields of `instant` in `timeZone` (an IANA zone). Throws `RangeError` otherwise. */
export function zonedParts(instant: Date | string, timeZone: string): ZonedParts {
  const ms = toMs(instant);
  const offsetMinutes = offsetAt(ms, timeZone);
  // The wall clock read as if it were UTC: the UTC getters then return the local fields.
  const wall = new Date(ms + offsetMinutes * MINUTE_MS);
  const dayOfWeek = wall.getUTCDay();
  const year = wall.getUTCFullYear();
  const month = wall.getUTCMonth() + 1;
  const day = wall.getUTCDate();
  return {
    year,
    month,
    day,
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    second: wall.getUTCSeconds(),
    weekday: dayOfWeek === 0 ? 7 : dayOfWeek,
    localDate: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
    offsetMinutes,
  };
}

/**
 * Instant at which the wall clock of `timeZone` reads `date` + `hhmm`.
 * - ordinary time: the single matching instant;
 * - non-existent time (spring forward): the first valid minute after the gap (ADR-0123);
 * - ambiguous time (fall back): the first occurrence (the earlier instant).
 */
export function localTimeToInstant(date: string, hhmm: string, timeZone: string): Date {
  const dateMatch = CIVIL_DATE.exec(date);
  const timeMatch = HHMM.exec(hhmm);
  if (dateMatch === null || timeMatch === null) {
    throw new RangeError('Date civile ou heure locale invalide.');
  }
  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])];
  const [hour, minute] = [Number(timeMatch[1]), Number(timeMatch[2])];
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(wallAsUtc).getUTCDate() !== day) throw new RangeError('Date civile inexistante.');

  // The zone has at most two distinct offsets around the date: try both and keep the instants whose
  // wall clock really reads the requested time.
  const before = offsetAt(wallAsUtc - DAY_MS, timeZone);
  const after = offsetAt(wallAsUtc + DAY_MS, timeZone);
  const reads = (ms: number): boolean => {
    const parts = zonedParts(new Date(ms), timeZone);
    return (
      parts.year === year &&
      parts.month === month &&
      parts.day === day &&
      parts.hour === hour &&
      parts.minute === minute
    );
  };
  const candidates = [...new Set([before, after])]
    .map((offset) => wallAsUtc - offset * MINUTE_MS)
    .filter(reads);
  const earliest = candidates.length === 0 ? undefined : Math.min(...candidates);
  if (earliest !== undefined) return new Date(earliest);

  // Gap: the requested wall time never happens. The result is the transition instant, i.e. the
  // first minute whose offset is the post-transition one (binary search on whole minutes).
  let low = Math.floor((wallAsUtc - DAY_MS) / MINUTE_MS);
  let high = Math.floor((wallAsUtc + DAY_MS) / MINUTE_MS);
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsetAt(middle * MINUTE_MS, timeZone) === after) high = middle;
    else low = middle + 1;
  }
  return new Date(low * MINUTE_MS);
}
