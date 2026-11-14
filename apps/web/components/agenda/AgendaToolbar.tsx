'use client';

// Toolbar of the agenda (SPEC-704 EF-3): formation filter, view group, bounded navigation and
// « Aujourd'hui ». Every interaction updates the URL through the screen (EF-1).
import { ChevronLeft, ChevronRight } from 'lucide-react';

import type { AgendaFormation } from '@learny/contracts';
import { Button, IconButton, SegmentedControl, Select } from '@learny/ui';

import { navLabel, rangeLabel } from '../../lib/agenda/range';
import type { AgendaView } from '../../lib/agenda/state';
import { fr } from '../../messages/fr';

const t = fr.agenda;

export interface AgendaToolbarProps {
  formations: readonly AgendaFormation[];
  formation: string;
  view: AgendaView;
  /** Civil days displayed, for the `aria-live` range label. */
  range: readonly string[];
  prevTarget: string | null;
  nextTarget: string | null;
  onFormationChange: (formation: string) => void;
  onViewChange: (view: AgendaView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPrefetch: (target: string | null, direction: 'prev' | 'next') => void;
}

export function AgendaToolbar({
  formations,
  formation,
  view,
  range,
  prevTarget,
  nextTarget,
  onFormationChange,
  onViewChange,
  onPrev,
  onNext,
  onToday,
  onPrefetch,
}: AgendaToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-8" data-testid="agenda-toolbar">
      <Select
        className="min-w-180"
        label={t.filterLabel}
        hideLabel
        data-testid="agenda-filter"
        value={formation}
        onChange={(event) => {
          onFormationChange(event.target.value);
        }}
        options={[
          { value: 'all', label: t.filterAll },
          ...formations.map((item) => ({ value: item.id, label: item.title })),
        ]}
      />
      <SegmentedControl<AgendaView>
        variant="solid"
        aria-label={t.viewsGroupLabel}
        value={view}
        optionTestId={(value) => `agenda-view-${value}`}
        onValueChange={(value) => {
          onViewChange(value);
        }}
        options={[
          { value: 'jour', label: t.viewJour },
          { value: 'semaine', label: t.viewSemaine },
          { value: 'mois', label: t.viewMois },
        ]}
      />
      <div className="inline-flex items-center gap-4 rounded-12 border border-solid border-border bg-surface p-4">
        <IconButton
          size="sm"
          tone="light"
          label={navLabel(view, 'prev')}
          icon={ChevronLeft}
          data-testid="agenda-prev"
          disabled={prevTarget === null}
          onClick={() => {
            onPrev();
          }}
          onMouseEnter={() => {
            onPrefetch(prevTarget, 'prev');
          }}
        />
        <span
          aria-live="polite"
          data-testid="agenda-range"
          className="min-w-170 px-6 text-center text-14 font-600 tabular-nums"
        >
          {rangeLabel(view, range)}
        </span>
        <IconButton
          size="sm"
          tone="light"
          label={navLabel(view, 'next')}
          icon={ChevronRight}
          data-testid="agenda-next"
          disabled={nextTarget === null}
          onClick={() => {
            onNext();
          }}
          onMouseEnter={() => {
            onPrefetch(nextTarget, 'next');
          }}
        />
      </div>
      <Button
        variant="outline"
        data-testid="agenda-today"
        onClick={() => {
          onToday();
        }}
      >
        {t.today}
      </Button>
    </div>
  );
}
