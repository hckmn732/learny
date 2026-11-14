'use client';

// Slot button of the calendar grids (SPEC-704 EF-6, EF-7, BR-AGE-02, BR-AGE-04; ET-9). The kind
// colours come from the configuration tokens, never a literal (definition of done §14). The
// accessible name carries the type and the status: no information relies on colour alone.
import { agendaSlotStyle } from '@learny/config';
import type { AgendaSlot } from '@learny/contracts';
import { cn } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { longDayLabel } from '../../lib/agenda/dates';
import { fr } from '../../messages/fr';

const t = fr.agenda;

const STATUS_LABELS = {
  planned: t.statusPlanned,
  done: t.statusDone,
  missed: t.statusMissed,
} as const;

function clockOf(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export interface SlotBlockProps {
  slot: AgendaSlot;
  selected: boolean;
  /** `semaine` positions absolutely on the grid; `jour` renders an inline row (maquette). */
  mode: 'semaine' | 'jour';
  /** Precomputed layout of the grid (`layoutDay`); required in `semaine` mode. */
  top?: number | undefined;
  height?: number | undefined;
  left?: string | undefined;
  width?: string | undefined;
  onSelect: (slotId: string) => void;
  /** ET-9 — the arrows move the selection to the previous/next slot in chronological order. */
  onArrow?: ((direction: -1 | 1) => void) | undefined;
}

export function SlotBlock({
  slot,
  selected,
  mode,
  top,
  height,
  left,
  width,
  onSelect,
  onArrow,
}: SlotBlockProps) {
  const style = agendaSlotStyle(slot.kind);
  const timeLabel = `${clockOf(slot.startMinutes)} – ${clockOf(slot.endMinutes)}`;
  const long = slot.endMinutes - slot.startMinutes >= 60;
  const missed = slot.status === 'missed';
  const showTime = long || mode === 'jour';
  // ET-9 — the accessible name starts with the visible text (title, time, meta), then adds the
  // type, the day and the status: axe `label-content-name-mismatch` (WCAG 2.5.3) requires the
  // visible label to be part of the name, and no information relies on colour alone.
  const metaText =
    slot.meta === null ? null : missed ? `${slot.meta} · ${t.missedMention}` : slot.meta;
  const mentionOnly = mode === 'jour' && slot.meta === null && missed ? t.missedMention : null;
  const ariaLabel = [
    slot.title,
    ...(showTime ? [timeLabel] : []),
    ...(metaText === null ? [] : [metaText]),
    ...(mentionOnly === null ? [] : [mentionOnly]),
    slot.typeLabel,
    longDayLabel(slot.date),
    STATUS_LABELS[slot.status],
  ].join(', ');
  const position =
    mode === 'semaine' && top !== undefined && height !== undefined
      ? { top, height, left, width }
      : undefined;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      data-testid={`agenda-slot-${slot.id}`}
      data-slot-kind={slot.kind}
      onClick={() => {
        onSelect(slot.id);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onArrow?.(-1);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onArrow?.(1);
        }
      }}
      className={cn(
        'absolute box-border flex flex-col overflow-hidden rounded-12 border-0 text-left font-[inherit] cursor-pointer',
        mode === 'jour' && 'relative flex-row flex-wrap items-baseline gap-x-12 gap-y-2 py-6',
        selected && 'z-3',
      )}
      style={{
        ...position,
        ...(mode === 'semaine' ? { padding: '7px 10px' } : {}),
        background: style.background,
        color: style.text,
        border: missed ? `1px dashed ${colors.orange}` : (style.border ?? '0'),
        opacity: slot.status === 'done' ? 0.72 : undefined,
        boxShadow: selected ? `0 0 0 2px ${colors.ink}` : undefined,
      }}
    >
      <span className="text-12 leading-1.3 font-700">{slot.title}</span>{' '}
      {showTime && <span className="text-11.5 leading-1.3 tabular-nums">{timeLabel}</span>}{' '}
      {showTime && metaText !== null && <span className="text-11.5 leading-1.3">{metaText}</span>}{' '}
      {mentionOnly !== null && <span className="text-11.5 leading-1.3">{mentionOnly}</span>}
    </button>
  );
}
