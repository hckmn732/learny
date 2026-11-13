'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { QuizQuestionDto, RemediationDto } from '@learny/contracts';
import { ErrorState } from '@learny/ui';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';
import { QuestionCard } from '../quiz/QuestionCard';
import { availableLabel } from '../quiz-result/ResultActions';

const t = fr.remediation;

function emptyResponse(question: QuizQuestionDto): unknown {
  if (question.type === 'choice_question') return { optionIds: [] };
  if (question.type === 'cloze') return { gaps: {} };
  if (question.type === 'matching') return { pairs: {} };
  return { text: '' };
}

function allQuestions(data: RemediationDto): QuizQuestionDto[] {
  return data.gaps.flatMap((gap) => gap.questions);
}

function RemediationQuestion({
  question,
  attemptId,
  onChecked,
}: {
  question: QuizQuestionDto;
  attemptId: string;
  onChecked: (key: string) => void;
}) {
  const [state, setState] = useState(question);
  const [value, setValue] = useState<unknown>(question.response ?? emptyResponse(question));
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${attemptId}:${String(question.position)}`;

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      const output = await api.checkQuizAnswer({
        params: { aid: attemptId, pos: question.position },
        body: { response: value, timeMs: 0 },
      });
      setState({ ...state, state: 'checked', feedback: output.feedback });
      onChecked(key);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.error);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <QuestionCard
        checking={checking}
        headingId={`t-remediation-${String(question.position)}`}
        isLast
        onCheck={() => {
          void check();
        }}
        onNext={() => undefined}
        onValueChange={setValue}
        question={state}
        showNext={false}
        testId="remediation-question"
        value={value}
      />
      {error === null ? null : (
        <p className="m-0 rounded-12 bg-orange-soft p-10 text-13 text-orange-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function RemediationScreen({
  formationId,
  moduleId,
  modulePosition,
  moduleTitle,
  initial,
}: {
  formationId: string;
  moduleId: string;
  modulePosition: number;
  moduleTitle: string;
  initial: RemediationDto;
}) {
  const [checked, setChecked] = useState<Set<string>>(
    new Set(
      initial.gaps
        .flatMap((gap) => gap.questions)
        .filter((question) => question.state === 'checked')
        .map((question) => `${initial.attemptId ?? ''}:${String(question.position)}`),
    ),
  );
  const [preparing, setPreparing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['remediation', moduleId],
    queryFn: () => api.getRemediation({ params: { mid: moduleId } }),
    initialData: initial,
    refetchInterval: (current) => (current.state.data?.status === 'preparing' ? 3_000 : false),
  });
  const data = query.data;
  const questions = allQuestions(data);
  const checkedCount = questions.filter((question) =>
    checked.has(`${data.attemptId ?? ''}:${String(question.position)}`),
  ).length;
  const allChecked = questions.length === 0 || checkedCount === questions.length;
  const moduleHref = `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(moduleId)}`;
  const quizHref = `${moduleHref}/quiz`;

  const prepare = async () => {
    setPreparing(true);
    setError(null);
    try {
      await api.prepareRemediation({ params: { mid: moduleId } });
      await query.refetch();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.error);
    } finally {
      setPreparing(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      await api.completeRemediation({ params: { mid: moduleId } });
      await query.refetch();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.detail : t.unfinished);
    } finally {
      setFinishing(false);
    }
  };

  return (
    <main className="mx-auto w-full px-16 pb-40 shell:px-40">
      <div
        className="mx-auto flex w-full max-w-[920px] flex-col gap-20"
        data-testid="remediation-page"
      >
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
          <div className="flex flex-wrap items-center justify-between gap-12">
            <h1 className="m-0 font-display text-30 font-600 tracking-title">{t.title}</h1>
            <div className="flex flex-wrap gap-8">
              <span className="rounded-full bg-canvas px-12 py-8 text-13 font-600">
                {t.duration}
              </span>
              <span className="rounded-full border border-border bg-surface px-12 py-8 text-13 font-600">
                {t.notions(data.gaps.length)}
              </span>
            </div>
          </div>
        </div>

        {data.status === 'preparing' ? (
          <section
            className="flex flex-col gap-10 rounded-28 border border-border bg-surface p-28"
            data-testid="remediation-preparing"
            role="status"
          >
            <h2 className="m-0 font-display text-22 font-600">{t.preparing}</h2>
            <p className="m-0 text-15 text-ink-muted">{t.preparingText}</p>
          </section>
        ) : data.status === 'none' ? (
          <section
            className="flex flex-col gap-12 rounded-28 border border-border bg-surface p-28"
            data-testid="remediation-none"
          >
            <h2 className="m-0 font-display text-22 font-600">{t.noneTitle}</h2>
            <p className="m-0 text-15 text-ink-muted">{t.noneText}</p>
            <button
              className="inline-flex min-h-44 w-fit items-center rounded-12 bg-ink px-18 text-14 font-700 text-white disabled:opacity-60"
              data-testid="remediation-prepare"
              disabled={preparing}
              onClick={() => {
                void prepare();
              }}
              type="button"
            >
              {t.prepare}
            </button>
          </section>
        ) : (
          <div className="flex flex-col gap-16">
            {data.gaps.map((gap) => (
              <article
                className="flex flex-col gap-12 rounded-[22px] border border-border bg-surface p-22"
                data-testid="remediation-gap"
                key={gap.notionId}
              >
                <div className="flex flex-col gap-6">
                  <span className="self-start rounded-full bg-orange-soft px-10 py-4 text-12 font-700 text-orange-ink">
                    {gap.natureLabel}
                  </span>
                  <h2 className="m-0 font-display text-22 font-600">{gap.label}</h2>
                </div>
                {gap.textMd
                  .split(/\n+/)
                  .filter((line) => line.trim() !== '')
                  .map((line, index) => (
                    <p
                      className="m-0 text-15 leading-1.6"
                      key={`${gap.notionId}-text-${String(index)}`}
                    >
                      {line}
                    </p>
                  ))}
                {gap.excerpts.length === 0 ? null : (
                  <ul className="m-0 flex list-none flex-wrap gap-8 p-0">
                    {gap.excerpts.map((excerpt) => (
                      <li key={`${gap.notionId}-${excerpt.label}`}>
                        <a
                          className="inline-flex min-h-36 items-center rounded-10 bg-canvas px-12 text-13 font-600 text-ink"
                          href={excerpt.href}
                        >
                          {`${t.excerptPrefix} · ${excerpt.label}`}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {gap.questions.length === 0 ? (
                  <p className="m-0 text-14 text-ink-muted">{t.empty}</p>
                ) : (
                  <div className="flex flex-col gap-16">
                    {gap.questions.map((question) => (
                      <RemediationQuestion
                        attemptId={data.attemptId ?? ''}
                        key={`${gap.notionId}-${String(question.position)}`}
                        onChecked={(key) => {
                          setChecked((current) => new Set([...current, key]));
                        }}
                        question={question}
                      />
                    ))}
                  </div>
                )}
              </article>
            ))}

            {data.status === 'completed' ? (
              <section
                className="flex flex-col gap-10 rounded-28 border border-border bg-surface p-24"
                data-testid="remediation-done"
              >
                <h2 className="m-0 font-display text-22 font-600">{t.doneTitle}</h2>
                <p className="m-0 text-15 text-ink-muted">
                  {data.retryAvailableAt === null
                    ? t.doneNow
                    : t.doneAt(availableLabel(data.retryAvailableAt))}
                </p>
                <div className="flex flex-wrap gap-10">
                  <a
                    className="inline-flex min-h-44 items-center rounded-12 bg-ink px-18 text-14 font-700 text-white"
                    data-testid="remediation-retry"
                    href={quizHref}
                  >
                    {t.retry}
                  </a>
                  <a
                    className="inline-flex min-h-44 items-center rounded-12 border border-border-strong bg-surface px-18 text-14 font-600 text-ink"
                    data-testid="remediation-back"
                    href={moduleHref}
                  >
                    {t.backToModule}
                  </a>
                </div>
              </section>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-12">
                <span className="text-13 text-ink-muted" data-testid="remediation-progress">
                  {t.progress(checkedCount, questions.length)}
                </span>
                <button
                  className="inline-flex min-h-48 items-center rounded-14 bg-ink px-22 text-15 font-700 text-white disabled:cursor-not-allowed disabled:opacity-55"
                  data-testid="remediation-finish"
                  disabled={!allChecked || finishing}
                  onClick={() => {
                    void finish();
                  }}
                  type="button"
                >
                  {finishing ? t.finishing : t.finish}
                </button>
              </div>
            )}
          </div>
        )}
        {error === null ? null : (
          <p className="m-0 rounded-12 bg-orange-soft p-10 text-13 text-orange-ink" role="alert">
            {error}
          </p>
        )}
        {query.error === null ? null : (
          <ErrorState
            description={query.error.message}
            onRetry={() => {
              void query.refetch();
            }}
            title={t.error}
          />
        )}
      </div>
    </main>
  );
}
