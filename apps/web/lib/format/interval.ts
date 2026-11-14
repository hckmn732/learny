import { userLocalDay } from '@learny/core';

// Relative due-date label of the recall-card self-assessment (SPEC-701 ET-7, CA-10). Days are
// civil dates in the learner's zone, so a DST change never shifts a label by one day.

const DAY_MS = 86_400_000;

function civilDayIndex(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1);
}

function civilDayDiff(from: string, to: string): number {
  return Math.round((civilDayIndex(to) - civilDayIndex(from)) / DAY_MS);
}

/**
 * ET-7 — « Aujourd’hui », « Demain », « Dans {n} jours », « Dans {n} semaines », « Dans {n} mois ».
 * The due instant and the clock instant are both projected on the user's civil day first.
 */
export function formatDueInterval(dueAt: string | Date, now: Date, timeZone: string): string {
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 'Aujourd’hui';
  const days = civilDayDiff(userLocalDay(now, timeZone), userLocalDay(due, timeZone));
  if (days <= 0) return 'Aujourd’hui';
  if (days === 1) return 'Demain';
  if (days <= 13) return `Dans ${String(days)} jours`;
  if (days <= 59) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'Dans 1 semaine' : `Dans ${String(weeks)} semaines`;
  }
  const months = Math.round(days / 30);
  return months === 1 ? 'Dans 1 mois' : `Dans ${String(months)} mois`;
}
