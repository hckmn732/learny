'use client';

// Mini calendar of the agenda (SPEC-704 EF-5). One click changes the displayed date without
// changing the view. The subtitle shows the period of the filtered formation, or of the current
// formation when the filter is « Toutes les formations » (ADR-0183 §1).
import type { CSSProperties } from 'react';

import type { AgendaPeriod } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import {
  AGENDA_DAYS_SHORT,
  AGENDA_MONTHS,
  AGENDA_MONTHS_SHORT,
  capitalize,
  civilDayNumber,
  civilDow,
  civilMonthIndex,
  civilYear,
  longDayLabel,
} from '../../lib/agenda/dates';
import { monthCells } from '../../lib/agenda/format';
import { fr } from '../../messages/fr';

const t = fr.agenda;

function periodLabel(period: AgendaPeriod | null): string | null {
  if (period === null) return null;
  const startMonth = AGENDA_MONTHS_SHORT[civilMonthIndex(period.start)] ?? '';
  const endMonth = AGENDA_MONTHS_SHORT[civilMonthIndex(period.end)] ?? '';
  if (startMonth === endMonth) {
    return `${String(civilDayNumber(period.start))} – ${String(civilDayNumber(period.end))} ${endMonth}`;
  }
  return `${String(civilDayNumber(period.start))} ${startMonth} – ${String(civilDayNumber(period.end))} ${endMonth}`;
}

export interface MiniCalendarProps {
  /** Month displayed: the one of `date`. */
  monthOf: string;
  today: string;
  date: string;
  captionPeriod: AgendaPeriod | null;
  /** Civil days with the light indigo background: the displayed period (EF-5). */
  highlightedDays: readonly string[];
  studyDays: readonly number[];
  bounds: AgendaPeriod | null;
  onPick: (date: string) => void;
}

export function MiniCalendar({
  monthOf,
  today,
  date,
  captionPeriod,
  highlightedDays,
  studyDays,
  bounds,
  onPick,
}: MiniCalendarProps) {
  const cells = monthCells(monthOf);
  const period = periodLabel(captionPeriod);
  return (
    <section
      aria-labelledby="t-mois"
      data-testid="agenda-minical"
      className="flex flex-col gap-12 rounded-24 border border-solid border-border bg-surface px-20 py-20"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-12 gap-y-2">
        <h2
          id="t-mois"
          data-testid="agenda-minical-title"
          className="m-0 font-display text-17 font-600 whitespace-nowrap"
        >
          {capitalize(AGENDA_MONTHS[civilMonthIndex(monthOf)] ?? '')} {String(civilYear(monthOf))}
        </h2>
        {period !== null && (
          <span data-testid="agenda-minical-formation" className="text-12 text-ink-muted">
            {t.miniFormation(period)}
          </span>
        )}
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2 text-center text-11 font-600 text-ink-muted"
      >
        {AGENDA_DAYS_SHORT.map((label, index) => (
          <span key={`head-${String(index)}`}>{label.charAt(0)}</span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2">
        {Array.from({ length: cells.lead }, (_, index) => (
          <span
            key={`lead-${String(index)}`}
            aria-hidden="true"
            className="h-34 rounded-10 border-0 bg-transparent"
          />
        ))}
        {cells.days.map((day) => {
          const isToday = day === today;
          const inView = highlightedDays.includes(day);
          const inStudy =
            bounds !== null &&
            day >= bounds.start &&
            day <= bounds.end &&
            studyDays.includes(civilDow(day) + 1);
          const style: CSSProperties = {
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 0,
            borderRadius: 10,
            font: 'inherit',
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
            cursor: 'pointer',
          };
          if (isToday) {
            style.background = colors.ink;
            style.color = colors.white;
            style.fontWeight = 700;
          } else {
            style.background = inView ? colors['indigo-soft'] : 'transparent';
            style.color = inStudy ? colors.ink : colors['ink-muted'];
            style.fontWeight = inStudy ? 600 : 400;
          }
          return (
            <button
              key={day}
              type="button"
              data-testid={`agenda-minical-day-${day}`}
              aria-label={longDayLabel(day)}
              aria-current={day === date ? 'date' : undefined}
              onClick={() => {
                onPick(day);
              }}
              style={style}
            >
              {String(civilDayNumber(day))}
            </button>
          );
        })}
      </div>
    </section>
  );
}
