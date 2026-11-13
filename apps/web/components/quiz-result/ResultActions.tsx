'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { QuizResultDto } from '@learny/contracts';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.quiz;

export function availableLabel(iso: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Paris',
  }).formatToParts(date);
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Paris',
  }).format(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    day.find((entry) => entry.type === type)?.value ?? '';
  return t.availableDateFormat(part('weekday'), part('day'), part('month'), time);
}

export function ResultActions({
  result,
  formationId,
  moduleId,
  courseHref,
  remediationHref,
  homeHref,
}: {
  result: QuizResultDto;
  formationId: string;
  moduleId: string;
  courseHref: string;
  remediationHref: string;
  homeHref: string;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passed = result.passed === true;
  const quizHref = `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(
    moduleId,
  )}/quiz`;
  const remediationStatus = result.remediation.status;
  const remediationLabel =
    remediationStatus === 'completed'
      ? t.resultRemediationDone
      : remediationStatus === 'in_progress' || remediationStatus === 'preparing'
        ? t.resultRemediationResume
        : t.resultRemediation;
  const retryHint =
    result.retry.reason === 'remediation_required'
      ? t.resultRetryAfterRemediation
      : result.retry.availableAt === null
        ? t.resultRetryAfterRemediation
        : t.resultRetryAvailable(availableLabel(result.retry.availableAt));

  const retry = async () => {
    setStarting(true);
    setError(null);
    try {
      const created = await api.startQuizAttempt({ params: { mid: moduleId } });
      if ('attemptId' in created) router.push(quizHref);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.submitError);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-8">
      {error === null ? null : (
        <p className="m-0 rounded-12 bg-orange-soft p-10 text-13 text-orange-ink" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-10">
        {passed ? (
          <>
            <a
              className="inline-flex min-h-48 items-center px-16 text-15 font-600"
              data-testid="result-home"
              href={homeHref}
            >
              {t.resultHome}
            </a>
            {result.isLastModule ? (
              <a
                className="inline-flex min-h-48 items-center rounded-14 bg-lime px-22 text-15 font-700 text-ink"
                data-testid="result-final-report"
                href={`/formations/${encodeURIComponent(formationId)}/bilan`}
              >
                {t.resultFinalReport}
              </a>
            ) : (
              <a
                className="inline-flex min-h-48 items-center rounded-14 bg-lime px-22 text-15 font-700 text-ink"
                data-testid="result-next-module"
                href={`/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(
                  result.nextModule?.id ?? '',
                )}`}
              >
                {t.resultNextModule(result.nextModule?.position ?? 0)}
              </a>
            )}
          </>
        ) : (
          <>
            <a
              className="inline-flex min-h-48 items-center px-16 text-15 font-600"
              data-testid="result-reread"
              href={courseHref}
            >
              {t.resultReread}
            </a>
            <div className="flex flex-col items-end gap-2">
              <button
                aria-describedby={result.retry.allowed ? undefined : 'result-retry-hint'}
                className="inline-flex min-h-48 cursor-pointer items-center rounded-14 border border-border-strong bg-surface px-20 text-15 font-600 text-ink disabled:cursor-not-allowed disabled:opacity-55"
                data-testid="result-retry"
                disabled={!result.retry.allowed || starting}
                onClick={() => {
                  void retry();
                }}
                type="button"
              >
                {t.resultRetry}
              </button>
              {result.retry.allowed ? null : (
                <span className="text-12 text-ink-muted" id="result-retry-hint">
                  {retryHint}
                </span>
              )}
            </div>
            {remediationStatus === 'completed' ? (
              <button
                className="inline-flex min-h-48 cursor-not-allowed items-center rounded-14 bg-ink px-22 text-15 font-700 text-white opacity-55"
                data-testid="result-remediation"
                disabled
                type="button"
              >
                {remediationLabel}
              </button>
            ) : (
              <a
                className="inline-flex min-h-48 items-center rounded-14 bg-ink px-22 text-15 font-700 text-white"
                data-testid="result-remediation"
                href={remediationHref}
              >
                {remediationLabel}
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
