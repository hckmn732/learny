'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { AttemptResultDto } from '@learny/contracts';
import { ErrorState } from '@learny/ui';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.quiz;

export function QuizResultScreen({
  attemptId,
  moduleHref,
  initial,
}: {
  attemptId: string;
  moduleHref: string;
  initial: AttemptResultDto;
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
        <h1 className="m-0 font-display text-30 font-600 tracking-title">{t.resultTitle}</h1>
        {result.status === 'submitted' ? (
          <section
            className="flex flex-col gap-12 rounded-28 border border-border bg-surface p-32"
            data-testid="quiz-result-pending"
            role="status"
          >
            <h2 className="m-0 font-display text-22 font-600">{t.resultPending}</h2>
            <p className="m-0 text-15 text-ink-muted">{t.resultPendingText}</p>
            <p className="m-0 text-14 text-ink-muted">
              {`${t.resultProvisional} : ${t.resultScore(result.provisionalScore ?? 0)}`}
            </p>
            {result.tutorPending ? (
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
          <section
            className="flex flex-col gap-12 rounded-28 border border-border bg-surface p-32"
            data-testid="quiz-result-graded"
          >
            <span
              className={`w-fit rounded-full px-12 py-6 text-13 font-700 ${result.passed === true ? 'bg-lime text-ink' : 'bg-orange-soft text-orange-ink'}`}
              data-testid="quiz-result-status"
            >
              {result.passed === true ? t.resultPassed : t.resultFailed}
            </span>
            <p className="m-0 font-display text-30 font-600" data-testid="quiz-result-score">
              {t.resultScore(result.score ?? 0)}
            </p>
            <p className="m-0 text-15 text-ink-muted">
              {`${t.threshold(result.threshold)} · ${t.resultDetailed}`}
            </p>
          </section>
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
            title={t.errorTitle}
          />
        )}
        <a
          className="inline-flex min-h-44 w-fit items-center rounded-12 bg-ink px-18 text-14 font-700 text-white"
          data-testid="quiz-result-back"
          href={moduleHref}
        >
          {t.resultBack}
        </a>
      </div>
    </main>
  );
}
