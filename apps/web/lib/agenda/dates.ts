// Civil date helpers of the agenda (SPEC-704 ET-4). Everything is a pure function of
// `YYYY-MM-DD` civil days; the arithmetic uses UTC-only `Date` objects, never the process clock
// (ADR-0047) and never a time-zone offset (ADR-0030) — the display zone has already been applied
// server-side, the agenda only formats civil days.

export const AGENDA_MONTHS = [
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

export const AGENDA_MONTHS_SHORT = [
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

export const AGENDA_DAYS = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
] as const;

export const AGENDA_DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

const CIVIL_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a strict `YYYY-MM-DD`; returns null for anything else (EF-1: une valeur invalide est remplacée). */
export function parseCivilDay(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string') return null;
  const match = CIVIL_DAY.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  return check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
    ? { year, month, day }
    : null;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function civilAdd(day: string, days: number): string {
  const parsed = parseCivilDay(day);
  if (parsed === null) return day;
  const shifted = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Weekday of a civil day, 0 = Monday … 6 = Sunday (the maquette's `dow`). */
export function civilDow(day: string): number {
  const parsed = parseCivilDay(day);
  if (parsed === null) return 0;
  return (new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay() + 6) % 7;
}

export function civilDayNumber(day: string): number {
  return parseCivilDay(day)?.day ?? 1;
}

export function civilMonthIndex(day: string): number {
  return (parseCivilDay(day)?.month ?? 1) - 1;
}

export function civilYear(day: string): number {
  return parseCivilDay(day)?.year ?? 2026;
}

export function civilIsWeekend(day: string): boolean {
  return civilDow(day) >= 5;
}

/** `Mercredi 11 nov.` */
export function longDayLabel(day: string): string {
  const name = AGENDA_DAYS[civilDow(day)] ?? '';
  const month = AGENDA_MONTHS_SHORT[civilMonthIndex(day)] ?? '';
  return `${name} ${String(civilDayNumber(day))} ${month}`;
}

/** `Mercredi 11 nov. 2026` (plage de navigation, aria-live). */
export function longDayLabelWithYear(day: string): string {
  return `${longDayLabel(day)} ${String(civilYear(day))}`;
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `09:00` from local minutes since 00:00. */
export function minutesToClock(minutes: number): string {
  const normalized = Math.min(Math.max(minutes, 0), 1439);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${pad(hour)}:${pad(minute)}`;
}

/** First day of the civil month of `day`. */
export function monthFirstDay(day: string): string {
  return `${pad(civilYear(day), 4)}-${pad(civilMonthIndex(day) + 1)}-01`;
}

/** Last day of the civil month of `day`. */
export function monthLastDay(day: string): string {
  const parsed = parseCivilDay(day);
  if (parsed === null) return day;
  const last = new Date(Date.UTC(parsed.year, parsed.month, 0));
  return `${pad(last.getUTCFullYear(), 4)}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`;
}

/** Number of days of the civil month of `day`. */
export function monthDayCount(day: string): number {
  const parsed = parseCivilDay(day);
  if (parsed === null) return 30;
  return new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
}

/** Monday of the week of `day`. */
export function weekMonday(day: string): string {
  return civilAdd(day, -civilDow(day));
}
