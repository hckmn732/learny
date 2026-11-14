'use client';

// Detail panel of the selected activity (SPEC-704 EF-9, BR-AGE-05). « Déplacer » is rendered
// without action here: its behaviour is delivered by SPEC-705; it stays disabled for a done,
// missed or past slot (ET-2 `movable`).
import NextLink from 'next/link';

import { agendaSlotStyle } from '@learny/config';
import type { AgendaSlot } from '@learny/contracts';
import { colors } from '@learny/ui/tokens';

import { longDayLabel } from '../../lib/agenda/dates';
import { fr } from '../../messages/fr';

const t = fr.agenda;

function clockOf(minutes: number): string {
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function SlotDetail({
  slot,
  onMoveClick,
}: Readonly<{
  slot: AgendaSlot | null;
  onMoveClick?: (slotId: string) => void;
}>) {
  if (slot === null) {
    return (
      <section
        aria-labelledby="t-detail"
        data-testid="agenda-detail"
        className="flex flex-col gap-12 rounded-24 bg-ink px-20 py-20 text-white"
      >
        <h2 id="t-detail" className="m-0 text-12 font-700 tracking-0.1em text-lime uppercase">
          {t.detailTitle}
        </h2>
        <p className="m-0 text-14 text-on-dark-muted">{t.detailEmpty}</p>
      </section>
    );
  }
  const style = agendaSlotStyle(slot.kind);
  const pillStyle =
    slot.kind === 'buffer'
      ? { background: colors['dark-700'], color: colors['on-dark-secondary'] }
      : { background: style.background, color: style.text };
  return (
    <section
      aria-labelledby="t-detail"
      data-testid="agenda-detail"
      className="flex flex-col gap-12 rounded-24 bg-ink px-20 py-20 text-white"
    >
      <h2 id="t-detail" className="m-0 text-12 font-700 tracking-0.1em text-lime uppercase">
        {t.detailTitle}
      </h2>
      <span
        data-testid="agenda-detail-type"
        className="self-start rounded-full px-10 py-4 text-12 font-700"
        style={pillStyle}
      >
        {slot.typeLabel}
      </span>
      <p
        data-testid="agenda-detail-title"
        className="m-0 font-display text-22 leading-1.2 font-600"
      >
        {slot.title}
      </p>
      <p data-testid="agenda-detail-when" className="m-0 text-14 text-on-dark-secondary">
        {longDayLabel(slot.date)} · {clockOf(slot.startMinutes)} – {clockOf(slot.endMinutes)}
      </p>
      {slot.meta !== null && (
        <p data-testid="agenda-detail-meta" className="m-0 text-14 text-on-dark-muted">
          {slot.meta}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-8">
        <NextLink
          href={slot.href}
          data-testid="agenda-detail-open"
          className="inline-flex min-h-44 items-center rounded-12 bg-lime px-16 text-14 font-700 text-ink no-underline"
        >
          {t.open}
        </NextLink>
        <button
          type="button"
          data-testid="slot-move"
          disabled={!slot.movable}
          onClick={() => onMoveClick?.(slot.id)}
          className="inline-flex min-h-44 cursor-pointer items-center rounded-12 border border-solid border-dark-500 bg-transparent px-16 text-14 font-600 text-white font-[inherit] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {t.move}
        </button>
      </div>
    </section>
  );
}
