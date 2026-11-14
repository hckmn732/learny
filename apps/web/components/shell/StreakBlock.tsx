'use client';

import type { SidebarDto } from '@learny/contracts';
import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.shell.sidebar;

type StreakStatus = SidebarDto['streak']['regularity'][number]['status'];

/** « 10 novembre » in UTC: the date is already a civil day, never an instant (ET-3). */
export function dayLabel(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** BR-GAM-02 — the three labels of the regularity legend, never colour alone. */
export function streakStatusLabel(status: StreakStatus): string {
  if (status === 'done') return t.streakDone;
  if (status === 'neutral') return t.streakNeutral;
  return t.streakNone;
}

/**
 * Bloc Série du menu (SPEC-723 EF-1, BR-GAM-02). The count and the 14 boxes reuse the sidebar
 * DTO read server-side; the boxes keep a chronological order and each one carries an accessible
 * name of the day and status. The `streak-*` test ids are the SPEC-723 interface contract while
 * the historical `sidebar-streak-*` ids keep the SPEC-304 regression test stable.
 */
export function StreakBlock({ streak }: Readonly<{ streak: SidebarDto['streak'] }>) {
  return (
    <div
      data-testid="sidebar-streak"
      className="mt-auto flex flex-col gap-6 rounded-14 bg-dark-800 px-14 py-12"
    >
      <div className="flex items-baseline justify-between gap-8">
        <span className="text-11 font-600 uppercase tracking-eyebrow text-on-dark-muted">
          {t.series}
        </span>
        <span
          data-testid="sidebar-streak-count"
          className="font-display text-20 font-600 text-white"
        >
          <span data-testid="streak-count">{t.streakDays(streak.days)}</span>
        </span>
      </div>
      <ol aria-label={t.regularity} className="m-0 grid list-none grid-cols-7 gap-4 p-0">
        {streak.regularity.map((day) => (
          <li
            key={day.date}
            data-testid="sidebar-streak-day"
            data-date={day.date}
            data-status={day.status}
            className={cn(
              'h-10 rounded-3',
              day.status === 'done'
                ? 'bg-lime'
                : day.status === 'neutral'
                  ? 'bg-dark-500'
                  : 'bg-dark-600',
            )}
          >
            <span data-testid="streak-day" className="sr-only">
              {dayLabel(day.date)}&nbsp;: {streakStatusLabel(day.status)}
            </span>
          </li>
        ))}
      </ol>
      <p className="m-0 text-11 text-on-dark-muted">{t.regularity}</p>
    </div>
  );
}
