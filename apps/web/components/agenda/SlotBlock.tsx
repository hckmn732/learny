'use client';

// Slot button of the calendar grids (SPEC-704 EF-6, EF-7, BR-AGE-02, BR-AGE-04; ET-9). The kind
// colours come from the configuration tokens, never a literal (definition of done §14). The
// accessible name carries the type and the status: no information relies on colour alone.
import { agendaSlotStyle } from '@learny/config';
import type { AgendaSlot } from '@learny/contracts';
import { cn } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { longDayLabel } from '../../lib/agenda/dates';
import { fr } from '../../messages/fr/agenda';

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
  /**
   * Both modes position the slot on the hour grid; `semaine` stacks title, time and meta,
   * `jour` lays them out in line (maquette).
   */
  mode: 'semaine' | 'jour';
  /** Precomputed layout of the grid (`layoutDay`). */
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
  const isSprint = slot.kind === 'sprint';
  const timeLabel = `${clockOf(slot.startMinutes)} – ${clockOf(slot.endMinutes)}`;
  const duration = slot.endMinutes - slot.startMinutes;
  const long = duration >= 60;
  // Week slots under 1 h 30 have room for one line per text (title, time, meta): each one ends
  // with an ellipsis instead of being cut in the middle of a line (full text in the name).
  const compact = mode === 'semaine' && duration < 90;
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
    top !== undefined && height !== undefined ? { top, height, left, width } : undefined;
  const line = compact ? 'truncate' : undefined;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      data-testid={isSprint ? 'sprint-slot' : `agenda-slot-${slot.id}`}
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
        mode === 'jour' &&
          'flex-row flex-wrap content-start items-baseline gap-x-12 gap-y-2 px-12 py-6',
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
      <span className={cn('text-12 leading-1.3 font-700', line)}>{slot.title}</span>{' '}
      {isSprint && <span className="sr-only">{t.sprintLabel}</span>}
      {showTime && (
        <span className={cn('text-11.5 leading-1.3 tabular-nums', line)}>{timeLabel}</span>
      )}{' '}
      {showTime && metaText !== null && (
        <span
          className={cn('text-11.5 leading-1.3', line)}
          {...(isSprint ? { 'data-testid': 'sprint-reason' } : {})}
        >
          {metaText}
        </span>
      )}{' '}
      {mentionOnly !== null && <span className="text-11.5 leading-1.3">{mentionOnly}</span>}
    </button>
  );
}
