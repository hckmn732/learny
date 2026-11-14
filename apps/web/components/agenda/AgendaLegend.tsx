'use client';

// Legend of the agenda (SPEC-704 EF-10, BR-AGE-02): the six base entries of the mockup, plus the
// complementary kinds present in the displayed period. The pills reuse the type tokens.
import { agendaSlotStyle } from '@learny/config';
import type { AgendaSlotKind } from '@learny/contracts';

import { legendEntriesOf } from '../../lib/agenda/format';
import { fr } from '../../messages/fr';

const t = fr.agenda;

export function AgendaLegend({
  kindsInPeriod,
}: Readonly<{ kindsInPeriod: readonly AgendaSlotKind[] }>) {
  const entries = legendEntriesOf(kindsInPeriod);
  return (
    <section
      aria-labelledby="t-legende"
      data-testid="agenda-legend"
      className="flex flex-col gap-10 rounded-24 border border-solid border-border bg-surface px-20 py-20"
    >
      <h2 id="t-legende" className="m-0 text-14 font-600">
        {t.legendTitle}
      </h2>
      <ul className="m-0 flex list-none flex-wrap gap-6 p-0 text-12 font-600">
        {entries.map((entry) => {
          const style = agendaSlotStyle(entry.kind);
          return (
            <li
              key={entry.kind}
              className="rounded-full px-10 py-4"
              style={{
                background: style.background,
                color: style.text,
                ...(style.border === undefined ? {} : { border: style.border }),
              }}
            >
              {entry.label}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 mb-0 text-13 leading-1.5 text-ink-muted">{t.legendNote}</p>
    </section>
  );
}
