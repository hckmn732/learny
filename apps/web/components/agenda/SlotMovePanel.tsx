'use client';

// « Déplacer » panel of the agenda (SPEC-705 EF-1, ET-3, ET-5; BR-AGE-05; ADR-0326). The service
// supplies the three compatible windows and their local hours; this panel only selects one, asks
// for an explicit confirmation and replays the request with the version it received.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import NextLink from 'next/link';
import { useState } from 'react';

import type { AgendaSlot } from '@learny/contracts';
import { SkeletonText } from '@learny/ui';

import { longDayLabel, minutesToClock } from '../../lib/agenda/dates';
import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.agenda.moveDialog;

function momentLabel(moment: 'matin' | 'apres_midi' | 'soir'): string {
  if (moment === 'matin') return t.momentMatin;
  if (moment === 'apres_midi') return t.momentApresMidi;
  return t.momentSoir;
}

export function SlotMovePanel({
  slot,
  onClose,
  onMoved,
}: Readonly<{
  slot: AgendaSlot;
  onClose: () => void;
  onMoved: (explanation: string) => void;
}>) {
  const queryClient = useQueryClient();
  const [chosen, setChosen] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alternatives = useQuery({
    queryKey: ['slot-alternatives', slot.id],
    queryFn: () => api.slotAlternativesGet({ params: { sid: slot.id } }),
    staleTime: 0,
    retry: false,
  });

  async function confirm(): Promise<void> {
    const data = alternatives.data;
    const candidate = chosen === null ? undefined : data?.alternatives[chosen];
    if (data === undefined || candidate === undefined) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.slotMove({
        params: { sid: slot.id },
        body: {
          expectedVersion: data.version,
          startsAt: candidate.startsAt,
          endsAt: candidate.endsAt,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['agenda'] });
      await queryClient.invalidateQueries({ queryKey: ['slot-alternatives', slot.id] });
      onMoved(result.explanation);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError(t.conflict);
        setChosen(null);
        await alternatives.refetch();
      } else {
        setError(t.errorTitle);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="t-move"
      data-testid="slot-move-panel"
      className="flex flex-col gap-12 rounded-24 border border-solid border-border bg-surface px-20 py-20"
    >
      <div className="flex items-start justify-between gap-12">
        <h2 id="t-move" className="m-0 text-12 font-700 tracking-0.1em text-ink-muted uppercase">
          {t.title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          data-testid="slot-move-close"
          className="cursor-pointer border-0 bg-transparent p-0 text-12 font-600 text-ink-muted underline"
        >
          {t.close}
        </button>
      </div>
      <p className="m-0 font-display text-18 font-600">{slot.title}</p>

      {alternatives.isLoading && (
        <div className="flex flex-col gap-8" aria-live="polite">
          <span className="sr-only">{t.loading}</span>
          <SkeletonText lines={3} />
        </div>
      )}

      {alternatives.isError && (
        <div className="flex flex-col gap-8" role="alert" data-testid="slot-move-error">
          <p className="m-0 text-14 font-600 text-danger">{t.errorTitle}</p>
          <button
            type="button"
            onClick={() => void alternatives.refetch()}
            className="min-h-44 cursor-pointer self-start rounded-12 border border-solid border-border bg-surface px-16 text-14 font-600"
          >
            {fr.agenda.retry}
          </button>
        </div>
      )}

      {alternatives.data !== undefined && alternatives.data.alternatives.length === 0 && (
        <div className="flex flex-col gap-8" data-testid="slot-alternatives-empty">
          <p className="m-0 text-14 font-700">{t.emptyTitle}</p>
          <p className="m-0 text-14 text-ink-muted">{t.emptyText}</p>
          <NextLink
            href="/parametres#rythme"
            data-testid="slot-move-adjust"
            className="inline-flex min-h-44 items-center self-start rounded-12 bg-lime px-16 text-14 font-700 text-ink no-underline"
          >
            {t.adjust}
          </NextLink>
        </div>
      )}

      {alternatives.data !== undefined && alternatives.data.alternatives.length > 0 && (
        <>
          <ol
            aria-label={t.listLabel}
            data-testid="slot-alternatives"
            className="m-0 flex list-none flex-col gap-8 p-0"
          >
            {alternatives.data.alternatives.map((alternative, index) => {
              const selected = chosen === index;
              return (
                <li key={`${alternative.startsAt}-${String(index)}`}>
                  <button
                    type="button"
                    data-testid={`slot-alternative-${String(index)}`}
                    aria-pressed={selected}
                    aria-label={t.alternativeAria(
                      index + 1,
                      longDayLabel(alternative.date),
                      `${minutesToClock(alternative.startMinutes)} – ${minutesToClock(alternative.endMinutes)}`,
                    )}
                    onClick={() => {
                      setChosen(selected ? null : index);
                      setError(null);
                    }}
                    className="flex w-full cursor-pointer flex-col gap-2 rounded-14 border border-solid border-border bg-surface px-14 py-10 text-left"
                  >
                    <span className="flex items-baseline justify-between gap-8">
                      <span className="text-14 font-700">{longDayLabel(alternative.date)}</span>
                      <span className="text-14 font-600 tabular-nums">
                        {minutesToClock(alternative.startMinutes)} –{' '}
                        {minutesToClock(alternative.endMinutes)}
                      </span>
                    </span>
                    <span className="text-12 text-ink-muted">
                      {momentLabel(alternative.moment)}
                    </span>
                    {selected && (
                      <span className="mt-4 flex flex-col gap-2">
                        <span className="text-12 font-600 text-ink-muted">{t.reasonsLabel}</span>
                        <span className="text-12 text-ink-muted">
                          {alternative.reasons.join(' · ')}
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {error !== null && (
            <p role="alert" data-testid="slot-move-conflict" className="m-0 text-14 text-danger">
              {error}
            </p>
          )}

          {chosen !== null && alternatives.data.alternatives[chosen] !== undefined && (
            <div
              data-testid="slot-move-confirm"
              className="flex flex-col gap-8 rounded-14 bg-ink px-14 py-12 text-white"
            >
              <p className="m-0 text-14 font-700">
                {t.confirmTitle(
                  longDayLabel(alternatives.data.alternatives[chosen].date),
                  `${minutesToClock(alternatives.data.alternatives[chosen].startMinutes)} – ${minutesToClock(
                    alternatives.data.alternatives[chosen].endMinutes,
                  )}`,
                )}
              </p>
              <p className="m-0 text-12 text-on-dark-muted">{t.confirmText}</p>
              <div className="mt-4 flex flex-wrap gap-8">
                <button
                  type="button"
                  data-testid="slot-move-confirm-button"
                  disabled={pending}
                  onClick={() => void confirm()}
                  className="inline-flex min-h-44 cursor-pointer items-center rounded-12 border-0 bg-lime px-16 text-14 font-700 text-ink disabled:cursor-wait disabled:opacity-55"
                >
                  {t.confirm}
                </button>
                <button
                  type="button"
                  data-testid="slot-move-cancel"
                  disabled={pending}
                  onClick={() => {
                    setChosen(null);
                  }}
                  className="inline-flex min-h-44 cursor-pointer items-center rounded-12 border border-solid border-dark-500 bg-transparent px-16 text-14 font-600 text-white"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
