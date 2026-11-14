'use client';

// Day view of the agenda (SPEC-704 EF-7, BR-AGE-07): one full-width column, the slots laid out in
// line, the empty-day message and the now line on the current day.
import type { AgendaSlot } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { gridHours, type GridHours } from '../../lib/agenda/grid';
import { fr } from '../../messages/fr';

import { NowLine } from './NowLine';
import { SlotBlock } from './SlotBlock';

const t = fr.agenda;

export interface DayViewProps {
  date: string;
  slots: readonly AgendaSlot[];
  today: string;
  timezone: string;
  selectedId: string | null;
  onSelect: (slotId: string) => void;
  onArrow?: ((direction: -1 | 1) => void) | undefined;
}

export function DayView({
  date,
  slots,
  today,
  timezone,
  selectedId,
  onSelect,
  onArrow,
}: DayViewProps) {
  const grid: GridHours = gridHours(slots);
  const gridHeight = (grid.endHour - grid.startHour) * 60;
  const isToday = date === today;
  const gridBackground = `repeating-linear-gradient(to bottom, ${colors.divider} 0, ${colors.divider} 1px, transparent 1px, transparent 60px)`;
  return (
    <div
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
        className="relative ml-8 border-l border-solid border-l-divider"
        style={{
          height: gridHeight,
          marginTop: 8,
          backgroundImage: gridBackground,
          ...(isToday ? { backgroundColor: colors['surface-today'] } : {}),
        }}
      >
        {slots.map((slot) => (
          <SlotBlock
            key={slot.id}
            slot={slot}
            mode="jour"
            selected={slot.id === selectedId}
            onSelect={onSelect}
            onArrow={onArrow}
          />
        ))}
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
        />
      </div>
    </div>
  );
}
