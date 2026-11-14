'use client';

// Week view of the agenda (SPEC-704 EF-6, BR-AGE-07, ET-9; CL-7, CL-8, CL-12). Five columns,
// plus the weekend days when they are studied or carry a slot; 60 px per hour on the mockup
// scale; the current day column has the light background and carries the orange now line.
import type { AgendaSlot } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { AGENDA_DAYS, civilDayNumber, civilDow } from '../../lib/agenda/dates';
import { gridHours, layoutDay, type GridHours } from '../../lib/agenda/grid';
import { dayHeaderAriaLabel } from '../../lib/agenda/range';

import { NowLine } from './NowLine';
import { SlotBlock } from './SlotBlock';

export interface WeekViewProps {
  days: readonly { date: string; slots: AgendaSlot[] }[];
  today: string;
  timezone: string;
  allSlots: readonly AgendaSlot[];
  selectedId: string | null;
  onSelect: (slotId: string) => void;
  onPickDay: (date: string) => void;
  onArrow?: ((direction: -1 | 1) => void) | undefined;
}

export function WeekView({
  days,
  today,
  timezone,
  allSlots,
  selectedId,
  onSelect,
  onPickDay,
  onArrow,
}: WeekViewProps) {
  const grid: GridHours = gridHours(allSlots);
  const gridHeight = (grid.endHour - grid.startHour) * 60;
  const gridBackground = `repeating-linear-gradient(to bottom, ${colors.divider} 0, ${colors.divider} 1px, transparent 1px, transparent 60px)`;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-720">
        <div
          className="grid border-b border-solid border-b-border"
          style={{ gridTemplateColumns: `64px repeat(${String(days.length)}, minmax(0, 1fr))` }}
        >
          <div />
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              data-testid={`agenda-day-header-${day.date}`}
              aria-label={dayHeaderAriaLabel(day.date)}
              onClick={() => {
                onPickDay(day.date);
              }}
              className="flex cursor-pointer flex-col items-center gap-4 border-0 bg-transparent px-8 pt-10 pb-12 text-center font-[inherit]"
            >
              <span
                aria-hidden="true"
                className="text-12 font-600 tracking-0.06em text-ink-muted uppercase"
              >
                {AGENDA_DAYS[civilDow(day.date)]}
              </span>{' '}
              <span
                className={
                  day.date === today
                    ? 'inline-flex size-36 items-center justify-center rounded-full bg-ink font-display text-17 font-600 text-white'
                    : 'inline-flex size-36 items-center justify-center font-display text-17 font-600 text-ink'
                }
              >
                {String(civilDayNumber(day.date))}
              </span>
            </button>
          ))}
        </div>
        <div
          className="grid pt-8"
          style={{ gridTemplateColumns: `64px repeat(${String(days.length)}, minmax(0, 1fr))` }}
        >
          <div className="relative" style={{ height: gridHeight }}>
            {grid.labels.map((label, index) => (
              <span
                key={label}
                className="absolute right-12 text-12 tabular-nums text-ink-muted"
                style={{ top: Math.max(index * 60 - 7, 0) }}
              >
                {label}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const layouts = layoutDay(day.slots, grid.startHour);
            const isToday = day.date === today;
            return (
              <div
                key={day.date}
                data-testid={isToday ? 'agenda-today-column' : undefined}
                className="relative border-l border-solid border-l-divider"
                style={{
                  height: gridHeight,
                  backgroundImage: gridBackground,
                  ...(isToday ? { backgroundColor: colors['surface-today'] } : {}),
                }}
              >
                {day.slots.map((slot, index) => {
                  const layout = layouts[index];
                  if (layout === undefined) return null;
                  return (
                    <SlotBlock
                      key={slot.id}
                      slot={slot}
                      mode="semaine"
                      selected={slot.id === selectedId}
                      top={layout.top}
                      height={layout.height}
                      left={`${String((layout.column / layout.columns) * 100)}%`}
                      width={`${String((1 / layout.columns) * 100)}%`}
                      onSelect={onSelect}
                      onArrow={onArrow}
                    />
                  );
                })}
                <NowLine
                  timezone={timezone}
                  gridStartHour={grid.startHour}
                  gridEndHour={grid.endHour}
                  visible={isToday}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
