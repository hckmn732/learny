// Civil-date helpers of the programme screen (SPEC-605 §10). Dates are `YYYY-MM-DD` strings in the
// proposal; every calculation uses UTC so the calendar never shifts with the browser timezone
// (BR-FOR-09, SPEC-606 CL-5).

const DAY = 86_400_000;

export function parseCivilDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return isoDate(new Date(parseCivilDate(value).getTime() + days * DAY));
}

export function dayDiff(from: string, to: string): number {
  return Math.round((parseCivilDate(to).getTime() - parseCivilDate(from).getTime()) / DAY);
}

export function mondayOf(value: string): string {
  const date = parseCivilDate(value);
  const weekday = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  return addDays(value, 1 - weekday);
}

export function formatDay(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parseCivilDate(value));
}

export function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseCivilDate(value));
}

export function formatRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  return `${formatDay(from)} – ${formatDay(to)}`;
}

export interface ProgrammeWeek {
  label: string;
  from: string;
  to: string;
  dates: string;
}

export function programmeWeeks(from: string, to: string): ProgrammeWeek[] {
  const start = mondayOf(from);
  const end = dayDiff(start, to);
  const count = Math.max(1, Math.ceil((end + 1) / 7));
  return Array.from({ length: count }, (_value, index) => {
    const weekStart = addDays(start, index * 7);
    const weekEnd = addDays(weekStart, 6);
    return {
      label: `Semaine ${String(index + 1)}`,
      from: weekStart,
      to: weekEnd,
      dates: formatRange(weekStart, weekEnd),
    };
  });
}

export function weeksBetween(from: string, to: string): number {
  return Math.max(1, Math.ceil((dayDiff(mondayOf(from), to) + 1) / 7));
}

export function barGeometry(
  from: string,
  to: string,
  start: string,
  end: string,
): { left: number; width: number } {
  const total = Math.max(1, dayDiff(from, to) + 1);
  const offset = Math.max(0, dayDiff(from, start));
  const days = Math.max(1, dayDiff(start, end) + 1);
  return {
    left: (offset / total) * 100,
    width: Math.min(100 - (offset / total) * 100, (days / total) * 100),
  };
}
