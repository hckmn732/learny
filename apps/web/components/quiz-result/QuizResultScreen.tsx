'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { QuizResultDto } from '@learny/contracts';
import { ErrorState } from '@learny/ui';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { GapCards } from './GapCards';
import { MasteredNotions } from './MasteredNotions';
import { ResultActions } from './ResultActions';
import { ScoreCard } from './ScoreCard';

const t = fr.quiz;

export function QuizResultScreen({
  attemptId,
  formationId,
  moduleId,
  modulePosition,
  moduleTitle,
  initial,
}: {
  attemptId: string;
  formationId: string;
  moduleId: string;
  modulePosition: number;
  moduleTitle: string;
  initial: QuizResultDto;
}) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['attempt-result', attemptId],
    queryFn: () => api.getQuizResult({ params: { aid: attemptId } }),
    initialData: initial,
    refetchInterval: (current) => (current.state.data?.status === 'submitted' ? 3_000 : false),
  });
  const result = query.data;
  const moduleHref = `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(
    moduleId,
  )}`;

  const relaunch = async () => {
    setRetrying(true);
    setError(null);
    try {
      await api.submitQuizAttempt({ params: { aid: attemptId } });
      await query.refetch();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.submitError);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <main className="mx-auto w-full px-16 pb-40 shell:px-40">
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-20" data-testid="quiz-result">
        <div className="flex flex-wrap items-center justify-between gap-12">
          <div className="flex flex-col gap-4">
            <nav aria-label="Fil d’Ariane" className="text-14 text-ink-muted">
              <a
                className="underline"
                href={`/formations/${encodeURIComponent(formationId)}/programme`}
              >
                Programme
              </a>{' '}
              /{' '}
              <a className="underline" href={moduleHref}>
                Module {modulePosition} · {moduleTitle}
              </a>{' '}
              / {t.breadcrumb}
            </nav>
            <h1 className="m-0 font-display text-30 font-600 tracking-title">{t.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-8">
            <span
              className="rounded-full bg-ink px-12 py-8 text-13 font-600 text-white"
              data-testid="quiz-attempt-badge"
            >
              {t.attempt(result.attemptNo)}
            </span>
            <span
              className="rounded-full border border-border bg-surface px-12 py-8 text-13 font-600"
              data-testid="quiz-threshold-badge"
            >
              {t.threshold(result.threshold)}
            </span>
            <a
              aria-label={t.quit}
              className="inline-flex size-44 items-center justify-center rounded-12 border border-border bg-surface text-ink"
              data-testid="quiz-quit"
              href={moduleHref}
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="16"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2.2"
                viewBox="0 0 24 24"
                width="16"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </a>
          </div>
        </div>

        {result.status === 'submitted' ? (
          <section
            className="flex flex-col gap-12 rounded-28 border border-border bg-surface p-32"
            data-testid="quiz-result-pending"
            role="status"
          >
            <h2 className="m-0 font-display text-22 font-600">{t.resultPending}</h2>
            <p className="m-0 text-15 text-ink-muted">{t.resultPendingText}</p>
            <p className="m-0 text-14 text-ink-muted">
              {`${t.resultProvisional} : ${t.resultScore(Math.round(result.provisionalScore ?? 0))}`}
            </p>
            {result.pendingOpenCount > 0 ? (
              <div className="flex flex-col gap-8 rounded-18 bg-orange-soft p-16 text-orange-ink">
                <p className="m-0 text-15 font-700">{t.resultWaiting}</p>
                <p className="m-0 text-14">{t.resultWaitingText}</p>
                <button
                  className="inline-flex min-h-44 w-fit items-center rounded-12 bg-ink px-18 text-14 font-700 text-white disabled:opacity-60"
                  data-testid="quiz-result-retry"
                  disabled={retrying}
                  onClick={() => {
                    void relaunch();
                  }}
                  type="button"
                >
                  {t.retry}
                </button>
              </div>
            ) : null}
          </section>
        ) : (
          <div className="flex flex-col gap-20" data-testid="quiz-result-graded">
            <ScoreCard currentModulePosition={modulePosition} result={result} />
            <GapCards gaps={result.gaps} passed={result.passed === true} />
            <MasteredNotions result={result} />
            <ResultActions
              courseHref={`${moduleHref}/cours`}
              formationId={formationId}
              homeHref="/accueil"
              moduleId={moduleId}
              remediationHref={`${moduleHref}/remediation`}
              result={result}
            />
          </div>
        )}
        {error === null ? null : (
          <p className="m-0 rounded-14 bg-orange-soft p-12 text-14 text-orange-ink" role="alert">
            {error}
          </p>
        )}
        {query.error === null ? null : (
          <ErrorState
            description={query.error.message}
            onRetry={() => {
              void query.refetch();
            }}
            title={t.resultError}
          />
        )}
      </div>
    </main>
  );
}
