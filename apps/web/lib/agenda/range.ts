// Visible range and bounded navigation of the agenda (SPEC-704 EF-4, EF-6, EF-8, BR-AGE-01,
// ADR-0183). The week shows Monday–Friday, plus Saturday and Sunday when they are study days or
// carry a slot; the day navigation skips the days without study or slot; the month navigation
// targets the neighbouring month when it intersects the bounds.
import {
  AGENDA_MONTHS,
  AGENDA_MONTHS_SHORT,
  AGENDA_DAYS_SHORT,
  capitalize,
  civilAdd,
  civilDayNumber,
  civilDow,
  civilIsWeekend,
  civilMonthIndex,
  civilYear,
  longDayLabel,
  longDayLabelWithYear,
  monthDayCount,
  monthFirstDay,
  weekMonday,
} from './dates';
import type { AgendaBounds, AgendaView } from './state';

/**
 * Civil days displayed by the view: one day, the 5-to-7 week columns, or every day of the month.
 * `slotDates` are the civil days that carry at least one slot (CL-7).
 */
export function visibleRange(
  view: AgendaView,
  date: string,
  studyDays: readonly number[],
  slotDates: readonly string[] = [],
): string[] {
  if (view === 'jour') return [date];
  if (view === 'mois') {
    const count = monthDayCount(date);
    const first = monthFirstDay(date);
    return Array.from({ length: count }, (_, index) => civilAdd(first, index));
  }
  const monday = weekMonday(date);
  const days = [0, 1, 2, 3, 4].map((offset) => civilAdd(monday, offset));
  for (const weekend of [5, 6]) {
    const day = civilAdd(monday, weekend);
    if (studyDays.includes(weekend + 1) || slotDates.includes(day)) days.push(day);
  }
  return days;
}

export interface AgendaNavTargets {
  prev: string | null;
  next: string | null;
}

function weekIntersectsBounds(monday: string, bounds: AgendaBounds): boolean {
  const sunday = civilAdd(monday, 6);
  return monday <= bounds.end && sunday >= bounds.start;
}

function monthIntersectsBounds(firstOfMonth: string, bounds: AgendaBounds): boolean {
  const lastOfMonth = civilAdd(firstOfMonth, monthDayCount(firstOfMonth) - 1);
  return firstOfMonth <= bounds.end && lastOfMonth >= bounds.start;
}

/**
 * EF-4 — previous and next targets, `null` when the target leaves the bounds of the formations on
 * display. In the day view the target skips the days without study nor slot; the steps stay inside
 * the bounds, so a week-end of two closed days still finds the next studied one.
 */
export function navTargets(
  view: AgendaView,
  date: string,
  bounds: AgendaBounds | null,
  studyDays: readonly number[],
  slotDates: readonly string[] = [],
): AgendaNavTargets {
  if (bounds === null) return { prev: null, next: null };
  if (view === 'jour') {
    const isCandidate = (day: string): boolean =>
      studyDays.includes(civilDow(day) + 1) || slotDates.includes(day);
    let prev = civilAdd(date, -1);
    while (prev >= bounds.start && !isCandidate(prev)) prev = civilAdd(prev, -1);
    let next = civilAdd(date, 1);
    while (next <= bounds.end && !isCandidate(next)) next = civilAdd(next, 1);
    return {
      prev: prev >= bounds.start && prev < date ? prev : null,
      next: next <= bounds.end && next > date ? next : null,
    };
  }
  if (view === 'mois') {
    const firstOfMonth = monthFirstDay(date);
    const prevFirst = monthFirstDay(civilAdd(firstOfMonth, -1));
    const nextFirst = monthFirstDay(civilAdd(firstOfMonth, monthDayCount(date)));
    return {
      prev: monthIntersectsBounds(prevFirst, bounds) ? prevFirst : null,
      next: monthIntersectsBounds(nextFirst, bounds) ? nextFirst : null,
    };
  }
  const monday = weekMonday(date);
  const prevMonday = civilAdd(monday, -7);
  const nextMonday = civilAdd(monday, 7);
  return {
    prev: weekIntersectsBounds(prevMonday, bounds) ? prevMonday : null,
    next: weekIntersectsBounds(nextMonday, bounds) ? nextMonday : null,
  };
}

/** `9 – 13 nov. 2026`, `30 nov. – 4 déc. 2026`, `Mercredi 11 nov. 2026`, `Novembre 2026`. */
export function rangeLabel(view: AgendaView, range: readonly string[]): string {
  if (view === 'jour') {
    const day = range[0] ?? '';
    return longDayLabelWithYear(day);
  }
  if (view === 'mois') {
    const day = range[0] ?? '';
    return `${capitalize(AGENDA_MONTHS[civilMonthIndex(day)] ?? '')} ${String(civilYear(day))}`;
  }
  const first = range[0];
  const last = range[range.length - 1];
  if (first === undefined || last === undefined) return '';
  const sameMonth = civilMonthIndex(first) === civilMonthIndex(last);
  const lastMonth = AGENDA_MONTHS_SHORT[civilMonthIndex(last)] ?? '';
  const firstMonth = AGENDA_MONTHS_SHORT[civilMonthIndex(first)] ?? '';
  return sameMonth
    ? `${String(civilDayNumber(first))} – ${String(civilDayNumber(last))} ${lastMonth} ${String(civilYear(last))}`
    : `${String(civilDayNumber(first))} ${firstMonth} – ${String(civilDayNumber(last))} ${lastMonth} ${String(civilYear(last))}`;
}

/** Complement of the page over-title (EF-2): `semaine du 9 – 13 nov.`, `Mercredi 11 nov.`, … */
export function rangeCaption(view: AgendaView, range: readonly string[]): string {
  if (view === 'jour') return longDayLabel(range[0] ?? '');
  if (view === 'mois') {
    const day = range[0] ?? '';
    return `${AGENDA_MONTHS[civilMonthIndex(day)] ?? ''} ${String(civilYear(day))}`;
  }
  const label = rangeLabel('semaine', range);
  return `semaine du ${label.replace(` ${String(civilYear(range[range.length - 1] ?? ''))}`, '')}`;
}

/** `aria-label` of the calendar region: `Semaine · 9 – 13 nov. 2026`. */
export function calendarAriaLabel(view: AgendaView, range: readonly string[]): string {
  const unit = view === 'jour' ? 'Jour' : view === 'mois' ? 'Mois' : 'Semaine';
  return `${unit} · ${rangeLabel(view, range)}`;
}

/** Navigation labels: `Semaine précédente`, `Jour suivant`, `Mois précédent`… (EF-3). */
export function navLabel(view: AgendaView, direction: 'prev' | 'next'): string {
  const unit = view === 'jour' ? 'Jour' : view === 'mois' ? 'Mois' : 'Semaine';
  const word = direction === 'prev' ? 'précédente' : 'suivante';
  return unit === 'Jour' || unit === 'Mois'
    ? `${unit} ${direction === 'prev' ? 'précédent' : 'suivant'}`
    : `${unit} ${word}`;
}

/** Short column header of a day: `Lun`, `Mar`… (EF-6). */
export function shortDayLabel(day: string): string {
  return AGENDA_DAYS_SHORT[civilDow(day)] ?? 'Lun';
}

/** `Afficher le Lundi 9 nov.` (aria-label of a week column header, EF-6). */
export function dayHeaderAriaLabel(day: string): string {
  return `Afficher le ${longDayLabel(day)}`;
}

export { civilIsWeekend };
