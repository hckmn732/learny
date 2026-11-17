'use client';

// Day view of the agenda (SPEC-704 EF-7, BR-AGE-07): one full-width column on the same hour grid
// as the week view (ET-6, 60 px per hour): each slot is positioned at its start and sized by its
// duration (`layoutDay`, ET-7 for overlaps), its content laid out in line (title, time, meta);
// the empty-day message and the now line on the current day.
import type { AgendaSlot } from '@learny/contracts';
import type { Clock } from '@learny/core';
import { colors } from '@learny/ui/tokens';

import { gridHours, layoutDay, type GridHours } from '../../lib/agenda/grid';
import { fr } from '../../messages/fr/agenda';

import { NowLine } from './NowLine';
import { SlotBlock } from './SlotBlock';

const t = fr.agenda;

/** Horizontal inset of the day slots inside the column, in px (maquette: left/right 8 px). */
const DAY_SLOT_INSET_PX = 8;

export interface DayViewProps {
  date: string;
  slots: readonly AgendaSlot[];
  today: string;
  timezone: string;
  selectedId: string | null;
  onSelect: (slotId: string) => void;
  onArrow?: ((direction: -1 | 1) => void) | undefined;
  /** Application clock of the now line (anchored on the server instant). */
  clock?: Clock | undefined;
}

export function DayView({
  date,
  slots,
  today,
  timezone,
  selectedId,
  onSelect,
  onArrow,
  clock,
}: DayViewProps) {
  const grid: GridHours = gridHours(slots);
  const gridHeight = (grid.endHour - grid.startHour) * 60;
  const layouts = layoutDay(slots, grid.startHour);
  const isToday = date === today;
  const gridBackground = `repeating-linear-gradient(to bottom, ${colors.divider} 0, ${colors.divider} 1px, transparent 1px, transparent 60px)`;
  const usable = `(100% - ${String(DAY_SLOT_INSET_PX * 2)}px)`;
  return (
    <div
      data-testid="agenda-day"
      className="grid border-t border-solid border-t-border pt-8"
      style={{ gridTemplateColumns: '64px minmax(0, 1fr)' }}
    >
      <div className="relative mt-8" style={{ height: gridHeight }}>
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
      <div
        data-testid={isToday ? 'agenda-today-column' : undefined}
        className="relative ml-8 border-l border-solid border-l-divider"
        style={{
          height: gridHeight,
          marginTop: 8,
          backgroundImage: gridBackground,
          ...(isToday ? { backgroundColor: colors['surface-today'] } : {}),
        }}
      >
        {slots.map((slot, index) => {
          const layout = layouts[index];
          if (layout === undefined) return null;
          return (
            <SlotBlock
              key={slot.id}
              slot={slot}
              mode="jour"
              selected={slot.id === selectedId}
              top={layout.top}
              height={layout.height}
              left={`calc(${String(DAY_SLOT_INSET_PX)}px + ${usable} * ${String(layout.column / layout.columns)})`}
              width={`calc(${usable} / ${String(layout.columns)})`}
              onSelect={onSelect}
              onArrow={onArrow}
            />
          );
        })}
        {slots.length === 0 && (
          <p className="absolute top-220 right-16 left-16 m-0 text-center text-14 text-ink-muted">
            {t.dayEmpty}
          </p>
        )}
        <NowLine
          timezone={timezone}
          gridStartHour={grid.startHour}
          gridEndHour={grid.endHour}
          visible={isToday}
          clock={clock}
        />
      </div>
    </div>
  );
}
