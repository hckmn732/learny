'use client';

// Screen of the agenda (SPEC-704 EF-1 to EF-13, ET-8, ET-9; ADR-0183, ADR-0063). One read-only
// call per displayed period; every interaction rewrites the URL without adding a history entry.
// The selection defaults to the next slot of the period (EF-9); the arrows of the grid move it
// chronologically (ET-9). The kind colours come from the tokens, never a literal.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { AgendaDto, AgendaSlot } from '@learny/contracts';
import { clock } from '@learny/core';
import { EmptyState, ErrorState, SkeletonCard, SkeletonGroup } from '@learny/ui';

import { longDayLabel } from '../../lib/agenda/dates';
import { calendarAriaLabel, navTargets, rangeCaption, visibleRange } from '../../lib/agenda/range';
import { agendaUrl, type AgendaUrlState } from '../../lib/agenda/state';
import { agendaFetchWindow } from '../../lib/agenda/window';
import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { AgendaLegend } from './AgendaLegend';
import { AgendaToolbar } from './AgendaToolbar';
import { AgendaTotals } from './AgendaTotals';
import { DayView } from './DayView';
import { MiniCalendar } from './MiniCalendar';
import { MonthView } from './MonthView';
import { SlotDetail } from './SlotDetail';
import { WeekView } from './WeekView';

const t = fr.agenda;

/** Selection by default: the first slot whose end is after now, else the first one (EF-9). */
export function defaultSelection(slots: readonly AgendaSlot[]): AgendaSlot | null {
  const now = clock.now().getTime();
  return slots.find((slot) => new Date(slot.endsAt).getTime() > now) ?? slots[0] ?? null;
}

function byIdIn(slots: readonly AgendaSlot[], id: string | null): AgendaSlot | undefined {
  return id === null ? undefined : slots.find((slot) => slot.id === id);
}

/** Derived values of the displayed period; a missing DTO keeps the loading state. */
interface DerivedAgenda {
  dto: AgendaDto;
  range: string[];
  displayed: AgendaSlot[];
  targets: { prev: string | null; next: string | null };
  today: string;
  bounds: { start: string; end: string } | null;
  kinds: AgendaSlot['kind'][];
  sigleOf: (formationId: string) => string;
}

function deriveAgenda(
  dto: AgendaDto | undefined,
  view: AgendaUrlState['view'],
  date: string,
): DerivedAgenda | null {
  if (dto === undefined) return null;
  const slotDates = [...new Set(dto.slots.map((slot) => slot.date))];
  const range = visibleRange(view, date, dto.studyDays, slotDates);
  const rangeSet = new Set(range);
  const displayed = dto.slots
    .filter((slot) => rangeSet.has(slot.date))
    .sort((left, right) =>
      left.date === right.date
        ? left.startMinutes - right.startMinutes
        : left.date.localeCompare(right.date),
    );
  return {
    dto,
    range,
    displayed,
    targets: navTargets(view, date, dto.bounds, dto.studyDays, slotDates),
    today: dto.today,
    bounds: dto.bounds,
    kinds: [...new Set(displayed.map((slot) => slot.kind))],
    sigleOf: (formationId: string): string =>
      dto.formations.find((formation) => formation.id === formationId)?.sigle ?? '',
  };
}

export interface AgendaScreenProps {
  initialState: AgendaUrlState;
  initialData: AgendaDto | null;
  initialError: boolean;
  requestId?: string;
}

export function AgendaScreen({
  initialState,
  initialData,
  initialError,
  requestId,
}: AgendaScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AgendaUrlState>(initialState);
  const [selection, setSelection] = useState<string | null>(initialState.creneau);

  const window = agendaFetchWindow(state.view, state.date);
  // The server preload only seeds the initial query key: handing it to another key (formation,
  // date or view change) would serve the previous period for the whole staleTime (EF-1, EF-3).
  const isInitialQuery =
    state.view === initialState.view &&
    state.date === initialState.date &&
    state.formation === initialState.formation;
  const query = useQuery({
    queryKey: ['agenda', window.from, window.to, state.formation],
    queryFn: () =>
      api.agendaGet({ query: { from: window.from, to: window.to, formation: state.formation } }),
    ...(initialData === null || !isInitialQuery ? {} : { initialData }),
    staleTime: 30_000,
    retry: false,
  });

  /** EF-1 — every interaction rewrites the URL, never the history. */
  const update = (patch: Partial<AgendaUrlState>): void => {
    const next = { ...state, ...patch };
    setState(next);
    router.replace(agendaUrl(next), { scroll: false });
  };

  const select = (slotId: string | null): void => {
    setSelection(slotId);
    router.replace(agendaUrl({ ...state, creneau: slotId }), { scroll: false });
  };

  /** ET-9 — the arrows move the selection one slot ahead or back, in chronological order. */
  const moveSelection = (direction: -1 | 1): void => {
    if (derived === null || derived.displayed.length === 0) return;
    const index = derived.displayed.findIndex((slot) => slot.id === selectedSlot?.id);
    const nextIndex =
      index === -1
        ? direction > 0
          ? 0
          : derived.displayed.length - 1
        : Math.min(Math.max(index + direction, 0), derived.displayed.length - 1);
    const next = derived.displayed[nextIndex];
    if (next !== undefined) select(next.id);
  };

  const dto = query.data;

  const derived = deriveAgenda(dto, state.view, state.date);

  const selectedSlot: AgendaSlot | null =
    derived === null
      ? null
      : (byIdIn(derived.displayed, selection) ??
        byIdIn(derived.displayed, state.creneau) ??
        defaultSelection(derived.displayed));

  if (query.isError && dto === undefined) {
    return (
      <main className="mx-auto w-full max-w-content px-16 pb-56">
        <ErrorState
          className="mt-24 rounded-24 border border-solid border-border bg-surface"
          title={t.errorTitle}
          {...(requestId === undefined ? {} : { requestId })}
          onRetry={() => void query.refetch()}
        />
      </main>
    );
  }

  if (dto === undefined || derived === null) {
    if (initialError) {
      return (
        <main className="mx-auto w-full max-w-content px-16 pb-56">
          <ErrorState
            className="mt-24 rounded-24 border border-solid border-border bg-surface"
            title={t.errorTitle}
            {...(requestId === undefined ? {} : { requestId })}
            onRetry={() => void query.refetch()}
          />
        </main>
      );
    }
    return (
      <main className="mx-auto w-full max-w-content px-16 pb-56">
        <SkeletonGroup className="mt-24 flex flex-col gap-20" label={t.loading}>
          <SkeletonCard />
          <SkeletonCard />
        </SkeletonGroup>
      </main>
    );
  }

  if (dto.formations.length === 0 || dto.bounds === null) {
    return (
      <main className="mx-auto w-full max-w-content px-16 pb-56">
        <header className="mt-24 flex flex-col gap-4">
          <h1 className="m-0 font-display text-34 font-600 tracking-[-0.02em]">{t.title}</h1>
        </header>
        <EmptyState
          className="mt-24 rounded-24 border border-solid border-border bg-surface"
          title={t.emptyTitle}
          description={t.emptyText}
          action={
            <NextLink
              href="/formations/nouvelle"
              className="inline-flex min-h-44 items-center rounded-12 bg-lime px-16 text-14 font-700 text-ink no-underline"
            >
              {t.emptyLink}
            </NextLink>
          }
        />
      </main>
    );
  }

  const { range, displayed, targets, today, bounds } = derived;
  const subtitleWho =
    state.formation === 'all'
      ? t.subtitleAll
      : (dto.formations.find((formation) => formation.id === state.formation)?.title ??
        t.subtitleAll);
  const dayModuleNumber =
    state.view === 'jour'
      ? (displayed.find((slot) => slot.formationId === dto.currentFormationId)?.moduleNumber ??
        null)
      : null;

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-24 px-16 pt-24 pb-56">
      <div className="flex flex-wrap items-end justify-between gap-16">
        <div className="flex flex-col gap-4">
          <p data-testid="agenda-header" className="m-0 text-14 text-ink-muted">
            {subtitleWho} · {rangeCaption(state.view, range)}
          </p>
          <h1 className="m-0 font-display text-34 font-600 tracking-[-0.02em]">{t.title}</h1>
        </div>
        <AgendaToolbar
          formations={dto.formations}
          formation={state.formation}
          view={state.view}
          range={range}
          prevTarget={targets.prev}
          nextTarget={targets.next}
          onFormationChange={(formation) => {
            update({ formation });
          }}
          onViewChange={(view) => {
            update({ view });
          }}
          onPrev={() => {
            if (targets.prev !== null) update({ date: targets.prev });
          }}
          onNext={() => {
            if (targets.next !== null) update({ date: targets.next });
          }}
          onToday={() => {
            update({ date: today });
          }}
          onPrefetch={(target) => {
            if (target === null) return;
            const next = agendaFetchWindow(state.view, target);
            queryClient
              .query({
                queryKey: ['agenda', next.from, next.to, state.formation],
                queryFn: () =>
                  api.agendaGet({
                    query: { from: next.from, to: next.to, formation: state.formation },
                  }),
              })
              .catch(() => undefined);
          }}
        />
      </div>
      <div className="flex flex-wrap items-start gap-20 max-shell:flex-col">
        <div className="flex min-w-0 flex-col gap-16" style={{ flex: '1 1 280px' }}>
          <MiniCalendar
            monthOf={state.date}
            today={today}
            date={state.date}
            captionPeriod={dto.captionPeriod}
            highlightedDays={state.view === 'mois' ? [] : range}
            studyDays={dto.studyDays}
            bounds={bounds}
            onPick={(date) => {
              update({ date });
            }}
          />
          <SlotDetail slot={selectedSlot} />
          <AgendaLegend kindsInPeriod={derived.kinds} />
        </div>
        <section
          aria-label={calendarAriaLabel(state.view, range)}
          data-testid="agenda-calendar"
          className="min-w-0 rounded-24 border border-solid border-border bg-surface px-8 pb-16"
          style={{ flex: '999 1 600px' }}
        >
          <div className="flex flex-wrap items-baseline gap-x-20 gap-y-8 px-16 pt-12 pb-8 text-13 text-ink-muted">
            {state.view === 'jour' && (
              <span
                data-testid="agenda-day-title"
                className="font-display text-18 font-600 text-ink"
              >
                {t.dayTitle(longDayLabel(state.date), dayModuleNumber)}
              </span>
            )}
            <AgendaTotals slots={displayed} />
          </div>
          {state.view === 'semaine' && (
            <WeekView
              days={range.map((date) => ({
                date,
                slots: displayed.filter((slot) => slot.date === date),
              }))}
              today={today}
              timezone={dto.timezone}
              allSlots={displayed}
              selectedId={selectedSlot?.id ?? null}
              onArrow={(direction) => {
                moveSelection(direction);
              }}
              onSelect={(slotId) => {
                select(slotId);
              }}
              onPickDay={(date) => {
                update({ view: 'jour', date });
              }}
            />
          )}
          {state.view === 'jour' && (
            <DayView
              date={state.date}
              slots={displayed}
              today={today}
              timezone={dto.timezone}
              selectedId={selectedSlot?.id ?? null}
              onArrow={(direction) => {
                moveSelection(direction);
              }}
              onSelect={(slotId) => {
                select(slotId);
              }}
            />
          )}
          {state.view === 'mois' && (
            <MonthView
              monthOf={state.date}
              slots={displayed}
              today={today}
              currentFormationId={dto.currentFormationId}
              sigleOfFormation={derived.sigleOf}
              onPickDay={(date) => {
                update({ view: 'jour', date });
              }}
            />
          )}
        </section>
      </div>
    </main>
  );
}
