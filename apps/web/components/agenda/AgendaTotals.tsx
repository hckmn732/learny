'use client';

// Totals of the displayed period (SPEC-704 EF-11, BR-AGE-06) and the day title of the day view.
import type { AgendaSlot } from '@learny/contracts';

import { formatDuration, totalsOf } from '../../lib/agenda/format';
import { fr } from '../../messages/fr';

const t = fr.agenda;

export function AgendaTotals({ slots }: Readonly<{ slots: readonly AgendaSlot[] }>) {
  const totals = totalsOf(slots);
  return (
    <div className="flex flex-wrap items-baseline gap-x-20 gap-y-8 text-13 text-ink-muted">
      <span data-testid="agenda-totals-planned">
        <strong className="text-ink">{formatDuration(totals.plannedMinutes)}</strong>{' '}
        {t.plannedWord}
      </span>
      <span data-testid="agenda-totals-done">
        <strong className="text-ink">{formatDuration(totals.doneMinutes)}</strong> {t.doneWord}
      </span>
      <span data-testid="agenda-totals-margins">{t.marginsLabel(totals.marginsRemaining)}</span>
    </div>
  );
}
