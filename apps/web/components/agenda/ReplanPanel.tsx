'use client';

// Blocked-module panel of the agenda (SPEC-705 EF-2, EF-3, ET-4; BR-FOR-14, BR-AUT-11;
// ADR-0326). The three previews come from `POST /replan-options`; selecting one only opens an
// explicit confirmation, and nothing is written before the learner confirms it.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { BlockedModule, ReplanChoice, ReplanOption } from '@learny/contracts';
import { SkeletonText } from '@learny/ui';

import { longDayLabel } from '../../lib/agenda/dates';
import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.agenda.replan;

function optionLabel(kind: ReplanChoice): string {
  if (kind === 'shift_end') return t.optionShiftEnd;
  if (kind === 'increase_volume') return t.optionIncreaseVolume;
  return t.optionLighten;
}

function previewOf(option: ReplanOption): string {
  if (option.kind === 'shift_end') {
    return t.previewShiftEnd(
      option.extraDays ?? 0,
      longDayLabel(option.projectedEndDate ?? option.currentEndDate),
    );
  }
  if (option.kind === 'increase_volume') {
    return t.previewIncreaseVolume(option.newHoursPerDay ?? option.currentHoursPerDay);
  }
  return t.previewLighten(option.removedMinutes ?? 0);
}

export function ReplanPanel({
  formationId,
  blocked,
}: Readonly<{ formationId: string; blocked: BlockedModule }>) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReplanChoice | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = useQuery({
    queryKey: ['replan-options', formationId],
    queryFn: () => api.formationReplanOptions({ params: { fid: formationId } }),
    staleTime: 60_000,
    retry: false,
  });

  async function confirm(): Promise<void> {
    const data = options.data;
    if (data === undefined || selected === null) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.formationReplan({
        params: { fid: formationId },
        body: { choice: selected, expectedPlanVersion: data.planVersion },
      });
      setSelected(null);
      setMessage(result.outcome === 'consent_required' ? t.consent : result.explanation);
      await queryClient.invalidateQueries({ queryKey: ['agenda'] });
      await queryClient.invalidateQueries({ queryKey: ['replan-options', formationId] });
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 409 ? cause.detail : t.errorTitle);
      await options.refetch();
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="t-replan"
      data-testid="replan-panel"
      className="flex flex-col gap-12 rounded-24 border border-solid border-orange-border bg-orange-soft px-20 py-20"
    >
      <h2 id="t-replan" className="m-0 text-12 font-700 tracking-0.1em text-ink uppercase">
        {t.title}
      </h2>
      <p data-testid="replan-blocked" className="m-0 text-14 font-700">
        {t.blocked(blocked.moduleNumber, blocked.title)}
      </p>
      <p className="m-0 text-14 text-ink-muted">
        {blocked.reason === 'quiz_failed' ? t.reasonQuizFailed : t.reasonDelayed}
      </p>

      {options.isLoading && (
        <div className="flex flex-col gap-8" aria-live="polite">
          <span className="sr-only">{t.loading}</span>
          <SkeletonText lines={3} />
        </div>
      )}

      {options.isError && (
        <div role="alert" data-testid="replan-error" className="flex flex-col gap-8">
          <p className="m-0 text-14 font-600 text-danger">{t.errorTitle}</p>
          <button
            type="button"
            onClick={() => void options.refetch()}
            className="min-h-44 cursor-pointer self-start rounded-12 border border-solid border-border bg-surface px-16 text-14 font-600"
          >
            {fr.agenda.retry}
          </button>
        </div>
      )}

      {options.data !== undefined && options.data.options.length === 0 && (
        <p className="m-0 text-14 text-ink-muted" data-testid="replan-empty">
          {t.empty}
        </p>
      )}

      {options.data !== undefined && options.data.options.length > 0 && (
        <ul
          aria-label={t.optionsLabel}
          data-testid="replan-options"
          className="m-0 flex list-none flex-col gap-8 p-0"
        >
          {options.data.options.map((option) => {
            const active = selected === option.kind;
            return (
              <li key={option.kind}>
                <button
                  type="button"
                  data-testid={`replan-option-${option.kind}`}
                  aria-pressed={active}
                  disabled={!option.feasible}
                  onClick={() => {
                    setSelected(active ? null : option.kind);
                    setMessage(null);
                    setError(null);
                  }}
                  className="flex w-full cursor-pointer flex-col gap-2 rounded-14 border border-solid border-border bg-surface px-14 py-10 text-left disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className="text-14 font-700">{optionLabel(option.kind)}</span>
                  <span className="text-12 text-ink-muted">
                    {option.feasible ? previewOf(option) : (option.reason ?? t.infeasible)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {message !== null && (
        <p role="status" data-testid="replan-message" className="m-0 text-14 font-600">
          {message}
        </p>
      )}

      {error !== null && (
        <p role="alert" data-testid="replan-conflict" className="m-0 text-14 text-danger">
          {error}
        </p>
      )}

      {selected !== null && options.data !== undefined && (
        <div
          data-testid="replan-confirm"
          className="flex flex-col gap-8 rounded-14 bg-ink px-14 py-12 text-white"
        >
          <p className="m-0 text-14 font-700">{t.confirmTitle}</p>
          <p className="m-0 text-12 text-on-dark-muted">{t.confirmText(optionLabel(selected))}</p>
          <div className="mt-4 flex flex-wrap gap-8">
            <button
              type="button"
              data-testid="replan-confirm-button"
              disabled={pending}
              onClick={() => void confirm()}
              className="inline-flex min-h-44 cursor-pointer items-center rounded-12 border-0 bg-lime px-16 text-14 font-700 text-ink disabled:cursor-wait disabled:opacity-55"
            >
              {t.confirm}
            </button>
            <button
              type="button"
              data-testid="replan-cancel"
              disabled={pending}
              onClick={() => {
                setSelected(null);
              }}
              className="inline-flex min-h-44 cursor-pointer items-center rounded-12 border border-solid border-dark-500 bg-transparent px-16 text-14 font-600 text-white"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
