'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { ExamAttemptDto, ExamQuestionDto, ExamResultDto } from '@learny/contracts';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { ExamQuestion } from './ExamQuestion';
import { ExamResults } from './ExamResults';
import { ExamTimer } from './ExamTimer';
import { QuestionPalette } from './QuestionPalette';
import { SubmitDialog } from './SubmitDialog';

const t = fr.mockExam;

function isAnswered(question: ExamQuestionDto, value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as Record<string, unknown>;
  if (question.type === 'choice_question') {
    return Array.isArray(data.optionIds) && data.optionIds.length > 0;
  }
  if (question.type === 'cloze') {
    const gaps = data.gaps;
    return (
      typeof gaps === 'object' &&
      gaps !== null &&
      Object.values(gaps).some((entry) => String(entry).trim() !== '')
    );
  }
  if (question.type === 'matching') {
    const pairs = data.pairs;
    return (
      typeof pairs === 'object' &&
      pairs !== null &&
      Object.values(pairs).some((entry) => entry !== null && entry !== '')
    );
  }
  return typeof data.text === 'string' && data.text.trim() !== '';
}

export interface ExamScreenProps {
  initialAttempt: ExamAttemptDto;
  programmeHref: string;
}

/** SCR-11 — help-free exam screen and results, without the normal application shell. */
export function ExamScreen({ initialAttempt, programmeHref }: ExamScreenProps) {
  const router = useRouter();
  const attempt = initialAttempt;
  const [result, setResult] = useState<ExamResultDto | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, unknown>>(() =>
    Object.fromEntries(
      attempt.questions
        .filter((question) => question.response !== undefined)
        .map((question) => [question.position, question.response]),
    ),
  );
  const [marked, setMarked] = useState<Set<number>>(
    () =>
      new Set(
        attempt.questions
          .filter((question) => question.marked)
          .map((question) => question.position),
      ),
  );
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const receivedAt = useRef(0);
  const questionStartedAt = useRef(0);
  const submitted = useRef(false);

  useEffect(() => {
    if (attempt.status === 'graded') {
      void api
        .getExamResult({ params: { aid: attempt.id } })
        .then(setResult)
        .catch(() => undefined);
    }
  }, [attempt.id, attempt.status]);

  const remainingMs = Math.max(
    0,
    new Date(attempt.deadlineAt).getTime() - (new Date(attempt.serverTime).getTime() + elapsedMs),
  );

  const submit = async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.submitExamAttempt({ params: { aid: attempt.id } });
      const fetched = await api.getExamResult({ params: { aid: attempt.id } });
      setResult(fetched);
      setConfirming(false);
    } catch (cause) {
      submitted.current = false;
      setError(cause instanceof ApiError ? cause.detail : t.errorTitle);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    receivedAt.current = performance.now();
    questionStartedAt.current = performance.now();
    const interval = setInterval(() => {
      setElapsedMs(performance.now() - receivedAt.current);
    }, 1_000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (attempt.status === 'in_progress' && remainingMs === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void submit();
    }
    // The timer crossing zero is the only trigger of the automatic submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, attempt.status]);

  if (result !== null) {
    return (
      <ExamResults
        onRestart={() => {
          router.push(`/formations/${encodeURIComponent(attempt.formationId)}/examen-blanc`);
        }}
        programmeHref={programmeHref}
        result={result}
      />
    );
  }

  const question = attempt.questions[current];
  const value = question === undefined ? null : (answers[question.position] ?? null);
  const answeredPositions = new Set(
    attempt.questions
      .filter((entry) => isAnswered(entry, answers[entry.position]))
      .map((entry) => entry.position),
  );
  const unanswered = attempt.questions.length - answeredPositions.size;

  const change = (next: unknown) => {
    if (question === undefined) return;
    setAnswers({ ...answers, [question.position]: next });
    const timeMs = Math.min(
      1_800_000,
      Math.max(0, Math.round(performance.now() - questionStartedAt.current)),
    );
    void api
      .saveExamAnswer({
        params: { aid: attempt.id, pos: question.position },
        body: { response: next, timeMs },
      })
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.detail : t.errorTitle);
      });
  };

  const toggleMark = () => {
    if (question === undefined) return;
    const next = new Set(marked);
    const isMarked = !next.has(question.position);
    if (isMarked) next.add(question.position);
    else next.delete(question.position);
    setMarked(next);
    void api
      .markExamQuestion({
        params: { aid: attempt.id, pos: question.position },
        body: { marked: isMarked },
      })
      .catch((cause: unknown) => {
        setError(cause instanceof ApiError ? cause.detail : t.errorTitle);
      });
  };

  const go = (position: number) => {
    setCurrent(position - 1);
    questionStartedAt.current = performance.now();
  };

  if (question === undefined) {
    return (
      <main className="mx-auto w-full max-w-[920px] px-16 py-40">
        <p className="rounded-16 bg-orange-soft p-16 text-14 text-orange-ink" role="alert">
          {t.errorTitle}
        </p>
      </main>
    );
  }

  const isMarked = marked.has(question.position);
  const remainingMinutes = Math.ceil(remainingMs / 60_000);

  return (
    <div className="min-h-screen bg-canvas" data-testid="exam-screen">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-20 gap-y-12 bg-ink px-40 py-12 text-white">
        <span className="flex items-center gap-10 font-display text-17 font-600">
          <span
            aria-hidden="true"
            className="inline-flex size-28 items-center justify-center rounded-8 bg-lime text-ink"
          >
            M
          </span>
          {t.examTitle}
        </span>
        <span className="text-14 text-on-dark-secondary" data-testid="exam-answered">
          {t.answered(answeredPositions.size, attempt.questions.length)}
          {marked.size > 0 ? t.markedSuffix(marked.size) : ''}
        </span>
        <span className="ml-auto flex items-center gap-12">
          <ExamTimer remainingMs={remainingMs} warning={remainingMs > 0 && remainingMs < 300_000} />
          <button
            className="min-h-40 rounded-12 bg-surface px-16 text-14 font-700 text-ink"
            data-testid="exam-submit"
            onClick={() => {
              setConfirming(true);
            }}
            type="button"
          >
            {t.submit}
          </button>
        </span>
      </header>

      <main className="mx-auto w-full max-w-[1160px] px-16 py-24 shell:px-40">
        <div className="flex flex-wrap items-start gap-20" data-testid="exam-paper">
          <section
            aria-labelledby="t-exam-question"
            className="flex min-w-0 flex-999 basis-560 flex-col gap-20 rounded-28 border border-border bg-surface p-32"
          >
            <div className="flex items-center justify-between gap-12">
              <span className="text-13 font-700 tracking-label text-ink-muted uppercase">
                {t.questionCounter(question.position, attempt.questions.length)}
              </span>
              {isMarked ? (
                <span className="rounded-full bg-orange-soft px-10 py-4 text-12 font-700 text-orange-ink">
                  {t.markedBadge}
                </span>
              ) : null}
            </div>
            <h2 className="m-0 font-display text-24 font-600 leading-1.3" id="t-exam-question">
              {question.type === 'choice_question'
                ? (question.payload as { stem: string }).stem
                : question.type === 'cloze'
                  ? (question.payload as { template: string }).template
                  : (question.payload as { instruction: string }).instruction}
            </h2>
            <ExamQuestion onChange={change} question={question} value={value} />
            <div className="flex flex-wrap justify-between gap-10 border-t border-divider pt-8">
              <button
                className="min-h-44 rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink disabled:opacity-40"
                disabled={current === 0}
                onClick={() => {
                  go(current);
                }}
                type="button"
              >
                {t.previous}
              </button>
              <div className="flex flex-wrap gap-10">
                <button
                  aria-pressed={isMarked}
                  className="min-h-44 rounded-12 border border-border-strong bg-surface px-16 text-14 font-600 text-ink"
                  data-testid="exam-mark"
                  onClick={toggleMark}
                  type="button"
                >
                  {isMarked ? t.unmark : t.mark}
                </button>
                <button
                  className="min-h-44 rounded-12 bg-ink px-18 text-14 font-700 text-white"
                  data-testid="exam-next"
                  onClick={() => {
                    if (current === attempt.questions.length - 1) {
                      setConfirming(true);
                    } else {
                      go(current + 2);
                    }
                  }}
                  type="button"
                >
                  {current === attempt.questions.length - 1 ? t.finish : t.next}
                </button>
              </div>
            </div>
          </section>

          <aside className="flex flex-1 basis-260 flex-col gap-16">
            <QuestionPalette
              answered={answeredPositions}
              current={current + 1}
              marked={marked}
              onSelect={go}
              total={attempt.questions.length}
            />
          </aside>
        </div>
      </main>

      {error === null ? null : (
        <p
          className="mx-16 mb-16 rounded-14 bg-orange-soft p-12 text-14 text-orange-ink"
          role="alert"
        >
          {error}
        </p>
      )}

      <SubmitDialog
        busy={busy}
        marked={marked.size}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => {
          void submit();
        }}
        open={confirming}
        remainingMinutes={remainingMinutes}
        unanswered={unanswered}
      />
    </div>
  );
}
