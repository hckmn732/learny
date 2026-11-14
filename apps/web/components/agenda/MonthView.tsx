'use client';

// Month view of the agenda (SPEC-704 EF-8, BR-AGE-01): one cell per day with up to three chips
// and the « + k autres » line; a click opens the day view of that day. The chips follow
// ADR-0183 §5: the title for the validation quizzes and the mock exams, `{sigle} · {HH:MM}` for
// another formation, the kind label otherwise.
import { agendaSlotStyle } from '@learny/config';
import type { AgendaSlot } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { civilDayNumber, civilDow, longDayLabel } from '../../lib/agenda/dates';
import { chipLabel, monthCells } from '../../lib/agenda/format';
import { fr } from '../../messages/fr';

const t = fr.agenda;

export interface MonthViewProps {
  monthOf: string;
  slots: readonly AgendaSlot[];
  today: string;
  /** Id of the formation opened in the menu; the chips of other formations show its sigle. */
  currentFormationId: string | null;
  sigleOfFormation: (formationId: string) => string;
  onPickDay: (date: string) => void;
}

export function MonthView({
  monthOf,
  slots,
  today,
  currentFormationId,
  sigleOfFormation,
  onPickDay,
}: MonthViewProps) {
  const cells = monthCells(monthOf);
  const byDay = new Map<string, AgendaSlot[]>();
  for (const slot of slots) {
    const list = byDay.get(slot.date) ?? [];
    list.push(slot);
    byDay.set(slot.date, list);
  }

  const headers = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  return (
    <div className="px-8">
      <div
        aria-hidden="true"
        className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-6 border-t border-solid border-t-border py-8 text-center text-12 font-600 tracking-0.06em text-ink-muted uppercase"
      >
        {headers.map((header) => (
          <span key={header}>{header}</span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-6">
        {Array.from({ length: cells.lead }, (_, index) => (
          <span
            key={`lead-${String(index)}`}
            aria-hidden="true"
            className="min-h-104 rounded-14 border-0 bg-transparent"
          />
        ))}
        {cells.days.map((day) => {
          const daySlots = byDay.get(day) ?? [];
          const isToday = day === today;
          const weekend = civilDow(day) >= 5;
          const chips = daySlots.slice(0, 3);
          const more = daySlots.length - chips.length;
          return (
            <button
              key={day}
              type="button"
              data-testid={`agenda-month-cell-${day}`}
              aria-label={t.monthCellAria(longDayLabel(day), daySlots.length)}
              onClick={() => {
                onPickDay(day);
              }}
              className="flex min-h-104 min-w-0 cursor-pointer flex-col items-stretch gap-4 rounded-14 p-8 text-left font-[inherit]"
              style={{
                border: isToday ? `2px solid ${colors.ink}` : `1px solid ${colors.divider}`,
                background: weekend ? colors['surface-weekend'] : colors.surface,
              }}
            >
              <span
                className={
                  isToday
                    ? 'inline-flex size-26 items-center justify-center rounded-full bg-ink text-13 font-700 text-white'
                    : `inline-flex h-26 items-center text-13 font-600 ${weekend ? 'text-on-dark-muted' : 'text-ink'}`
                }
              >
                {String(civilDayNumber(day))}
              </span>
              {chips.map((slot) => {
                const style = agendaSlotStyle(slot.kind);
                return (
                  <span
                    key={slot.id}
                    className="block max-w-full overflow-hidden text-ellipsis rounded-6 px-6 py-2 text-11 font-600 whitespace-nowrap"
                    style={{
                      background: style.background,
                      color: style.text,
                      border: style.border ?? '0',
                      opacity: slot.status === 'done' ? 0.7 : undefined,
                    }}
                  >
                    {chipLabel(slot, currentFormationId, sigleOfFormation)}
                  </span>
                );
              })}
              {more > 0 && (
                <span className="text-11 font-600 text-ink-muted">{t.monthMore(more)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
