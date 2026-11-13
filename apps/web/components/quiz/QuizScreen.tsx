'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { QuizQuestionDto } from '@learny/contracts';
import { ErrorState } from '@learny/ui';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { QuestionCard } from './QuestionCard';
import { QuizHeader } from './QuizHeader';
import { QuizPreparing } from './QuizPreparing';
import { QuizProgress } from './QuizProgress';
import { useQuizAttempt } from './use-quiz-attempt';

const t = fr.quiz;

export interface QuizScreenProps {
  formationId: string;
  moduleId: string;
  modulePosition: number;
  moduleTitle: string;
  threshold: number;
  programmeHref: string;
  moduleHref: string;
}

function emptyResponse(question: QuizQuestionDto): unknown {
  if (question.type === 'choice_question') return { optionIds: [] };
  if (question.type === 'cloze') return { gaps: {} };
  if (question.type === 'matching') return { pairs: {} };
  return { text: '' };
}

function firstUnchecked(questions: readonly QuizQuestionDto[]): number {
  const index = questions.findIndex((question) => question.state !== 'checked');
  return index === -1 ? Math.max(0, questions.length - 1) : index;
}

export function QuizScreen(props: QuizScreenProps) {
  const router = useRouter();
  const { attempt, attemptId, preparing, timedOut, error, retryPreparation, refetch } =
    useQuizAttempt(props.moduleId);
  const [current, setCurrent] = useState(0);
  const [value, setValue] = useState<unknown>(null);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const startedAt = useRef(performance.now());
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedAttempt = useRef<string | null>(null);

  useEffect(() => {
    if (attempt === null || initializedAttempt.current === attempt.id) return;
    initializedAttempt.current = attempt.id;
    setCurrent(firstUnchecked(attempt.questions));
  }, [attempt]);

  const question = attempt?.questions[current];
  useEffect(() => {
    if (question === undefined) return;
    setValue(question.response ?? emptyResponse(question));
    startedAt.current = performance.now();
  }, [question]);

  useEffect(
    () => () => {
      if (draftTimer.current !== null) clearTimeout(draftTimer.current);
    },
    [],
  );

  const timeMs = () =>
    Math.min(1_800_000, Math.max(0, Math.round(performance.now() - startedAt.current)));

  const saveDraft = (next: unknown) => {
    if (attemptId === null || question === undefined || question.state === 'checked') return;
    if (draftTimer.current !== null) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      void api
        .saveQuizAnswer({
          params: { aid: attemptId, pos: question.position },
          body: { response: next, timeMs: timeMs() },
        })
        .catch(() => {
          // A draft writes on the next keystroke; it never blocks the answer.
        });
    }, 400);
  };

  const check = async () => {
    if (attemptId === null || question === undefined) return;
    setChecking(true);
    setActionError(null);
    try {
      await api.checkQuizAnswer({
        params: { aid: attemptId, pos: question.position },
        body: { response: value, timeMs: timeMs() },
      });
      await refetch();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.detail : t.errorTitle);
    } finally {
      setChecking(false);
    }
  };

  const next = async () => {
    if (attempt === null || attemptId === null) return;
    if (current < attempt.questions.length - 1) {
      setCurrent(current + 1);
      return;
    }
    setActionError(null);
    try {
      await api.submitQuizAttempt({ params: { aid: attemptId } });
      router.push(
        `/formations/${encodeURIComponent(props.formationId)}/modules/${encodeURIComponent(props.moduleId)}/quiz/${encodeURIComponent(attemptId)}/resultat`,
      );
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.detail : t.submitError);
      await refetch();
    }
  };

  return (
    <main className="mx-auto w-full px-16 pb-40 shell:px-40">
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-22" data-testid="quiz-page">
        <QuizHeader
          attemptNo={attempt?.attemptNo ?? 1}
          formationId={props.formationId}
          moduleId={props.moduleId}
          modulePosition={props.modulePosition}
          moduleTitle={props.moduleTitle}
          threshold={attempt?.threshold ?? props.threshold}
        />
        {preparing ? <QuizPreparing onRetry={retryPreparation} timedOut={timedOut} /> : null}
        {error !== null && !preparing ? (
          <ErrorState
            data-testid="quiz-error"
            description={error}
            onRetry={() => {
              retryPreparation();
            }}
            title={t.errorTitle}
          />
        ) : null}
        {attempt === null && !preparing && error === null ? (
          <section
            aria-busy="true"
            className="flex flex-col gap-12 rounded-28 border border-border bg-surface p-32"
            data-testid="quiz-loading"
          >
            <span className="h-22 w-140 animate-pulse rounded-8 bg-canvas" />
            <span className="h-32 w-4/5 animate-pulse rounded-8 bg-canvas" />
            <p className="m-0 text-15 text-ink-muted" role="status">
              {t.loading}
            </p>
          </section>
        ) : null}
        {attempt !== null && question !== undefined ? (
          <div className="flex flex-col gap-18">
            <QuizProgress
              checkedPositions={attempt.questions
                .filter((entry) => entry.state === 'checked')
                .map((entry) => entry.position)}
              current={question.position}
              total={attempt.total}
            />
            <QuestionCard
              checking={checking}
              isLast={current === attempt.questions.length - 1}
              onCheck={() => {
                void check();
              }}
              onNext={() => {
                void next();
              }}
              onValueChange={(nextValue) => {
                setValue(nextValue);
                if (question.type === 'open_question') saveDraft(nextValue);
              }}
              question={question}
              value={value}
            />
            {actionError === null ? null : (
              <p
                className="m-0 rounded-14 bg-orange-soft p-12 text-14 text-orange-ink"
                role="alert"
              >
                {actionError}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </main>
  );
}
