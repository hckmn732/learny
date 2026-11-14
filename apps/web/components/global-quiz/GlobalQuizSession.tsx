'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { SelfGrade } from '@learny/bricks/view';
import {
  ReviewSummaryDtoSchema,
  type GlobalQuizSessionDto,
  type ReviewAnswerInput,
  type ReviewSummaryDto,
} from '@learny/contracts';
import { EmptyState, ErrorState } from '@learny/ui';

import { api, ApiError } from '../../lib/api-client';
import { fr } from '../../messages/fr';

import { GamePanel } from './GamePanel';
import { GameRail } from './GameRail';
import { GlobalQuizHeader } from './GlobalQuizHeader';
import { SessionEnd } from './SessionEnd';
import { SessionFooter } from './SessionFooter';
import { SessionModeSwitch } from './SessionModeSwitch';
import { SessionProgress } from './SessionProgress';
import { TutorRationale } from './TutorRationale';

const t = fr.globalQuiz;

export interface GlobalQuizSessionProps {
  formationId: string;
  initial: GlobalQuizSessionDto;
  timeZone: string;
  /** Due labels computed server-side with the injected clock (ET-7), by item position. */
  dueLabelsByPosition: Record<string, Partial<Record<SelfGrade, string>>>;
}

interface AnswerVariables {
  input: ReviewAnswerInput;
  advance: boolean;
}

function serverSummary(session: GlobalQuizSessionDto): ReviewSummaryDto | null {
  const parsed = ReviewSummaryDtoSchema.safeParse(session.summary);
  return parsed.success ? parsed.data : null;
}

/**
 * Client orchestration of SCR-10 (SPEC-701 ET-9). The server preloads the DTO; this component owns
 * the current game, the time spent on it, the idempotent answer mutations (one `clientAnswerId`
 * per game kept until the 200), the skip and the closure. The session is never recomputed here.
 */
export function GlobalQuizSession(props: GlobalQuizSessionProps) {
  const { formationId, initial, timeZone } = props;
  // ET-6 — the selected mode drives the query key; the URL is replaced by SessionModeSwitch.
  const [mode, setMode] = useState<'full' | 'micro'>(initial.mode);
  const query = useQuery({
    queryKey: ['global-quiz', formationId, mode],
    queryFn: () => api.globalQuizToday({ params: { fid: formationId }, query: { mode } }),
    ...(mode === initial.mode ? { initialData: initial, staleTime: 0 } : {}),
  });
  const session = query.data;
  // ET-6 — while the other mode loads, the previous DTO keeps the header and the switch; only the
  // game area is replaced by a skeleton. The server DTO of the first render is the fallback.
  const display = session ?? initial;
  const modeLoading = mode !== display.mode;
  const items = session?.items ?? [];
  const firstItem = items.find((item) => item.position === session?.currentPosition) ?? items[0];
  const [current, setCurrent] = useState<number>(firstItem?.position ?? 0);
  const [summary, setSummary] = useState<ReviewSummaryDto | null>(() => serverSummary(initial));
  const [attempt, setAttempt] = useState<AnswerVariables | null>(null);
  const [answerError, setAnswerError] = useState(false);
  const [completeError, setCompleteError] = useState(false);
  const answerIds = useRef(new Map<string, string>());
  const shownAt = useRef(0);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const firstRender = useRef(true);

  function changeMode(next: 'full' | 'micro'): void {
    if (next === mode) return;
    answerIds.current.clear();
    setAttempt(null);
    setAnswerError(false);
    setCompleteError(false);
    setSummary(null);
    setCurrent(0);
    setMode(next);
  }

  const index = Math.max(
    0,
    items.findIndex((item) => item.position === current),
  );
  const item = items[index];
  const last = index === items.length - 1;
  const effectiveSummary = summary ?? (session === undefined ? null : serverSummary(session));
  const ended = effectiveSummary !== null;
  const note =
    mode === 'micro' && display.mode !== 'micro'
      ? fr.globalQuiz.micro.note(display.modeOptions.microMinutes)
      : display.note;

  useEffect(() => {
    shownAt.current = performance.now();
  }, [current]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    titleRef.current?.focus();
  }, [current]);

  const answer = useMutation({
    mutationFn: (variables: AnswerVariables) =>
      api.reviewAnswer({
        params: { sid: session?.sessionId ?? '' },
        body: variables.input,
      }),
    onSuccess: async (_result, variables) => {
      answerIds.current.delete(String(variables.input.position));
      setAttempt(null);
      setAnswerError(false);
      await query.refetch();
      if (variables.advance) advanceFrom(variables.input.position);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        // CL-6 — another tab answered this game: reload the recorded correction.
        setAttempt(null);
        setAnswerError(false);
        void query.refetch();
        return;
      }
      setAnswerError(true);
    },
  });

  const complete = useMutation({
    mutationFn: () => api.reviewComplete({ params: { sid: session?.sessionId ?? '' } }),
    onSuccess: async (value) => {
      const parsed = ReviewSummaryDtoSchema.safeParse(value);
      if (parsed.success) setSummary(parsed.data);
      setCompleteError(false);
      await query.refetch();
    },
    onError: () => {
      setCompleteError(true);
    },
  });

  function advanceFrom(position: number): void {
    const from = items.findIndex((entry) => entry.position === position);
    const next = items[from + 1];
    if (next !== undefined) setCurrent(next.position);
  }

  function answerIdFor(position: number): string {
    const key = String(position);
    const existing = answerIds.current.get(key);
    if (existing !== undefined) return existing;
    const created = crypto.randomUUID();
    answerIds.current.set(key, created);
    return created;
  }

  function send(input: ReviewAnswerInput, advance: boolean): void {
    setAttempt({ input, advance });
    setAnswerError(false);
    answer.mutate({ input, advance });
  }

  function grade(selfRating: SelfGrade): void {
    if (item === undefined || answer.isPending) return;
    send(
      {
        position: item.position,
        clientAnswerId: answerIdFor(item.position),
        timeMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - shownAt.current))),
        response: { selfRating },
      },
      false,
    );
  }

  function skip(): void {
    if (item === undefined || answer.isPending) return;
    send(
      {
        position: item.position,
        clientAnswerId: answerIdFor(item.position),
        timeMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - shownAt.current))),
        skipped: true,
      },
      true,
    );
  }

  /** EF-1 to EF-5 — response of one of the four games, graded by the server (BR-MEM-05). */
  function answerGame(response: unknown): void {
    if (item === undefined || answer.isPending) return;
    send(
      {
        position: item.position,
        clientAnswerId: answerIdFor(item.position),
        timeMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - shownAt.current))),
        response,
      },
      false,
    );
  }

  function next(): void {
    if (item === undefined) return;
    if (last) {
      if (session !== undefined && session.sessionId !== null) complete.mutate();
      return;
    }
    advanceFrom(item.position);
  }

  function retry(): void {
    if (attempt === null) return;
    setAnswerError(false);
    answer.mutate(attempt);
  }

  if (
    session?.status === 'empty' ||
    (session !== undefined && items.length === 0 && session.status !== 'paused')
  ) {
    return (
      <EmptyState
        action={
          <a
            className="inline-flex min-h-44 items-center rounded-12 bg-ink px-18 text-14 font-700 text-white no-underline"
            href="/accueil"
          >
            {t.empty.action}
          </a>
        }
        data-testid="gq-empty"
        description={t.empty.description}
        title={t.empty.title}
      />
    );
  }

  if (session?.status === 'paused') {
    return (
      <EmptyState
        data-testid="gq-paused"
        description={t.paused.description}
        title={t.paused.title}
      />
    );
  }

  if (query.isError && effectiveSummary === null) {
    return (
      <ErrorState
        data-testid="gq-error"
        onRetry={() => {
          void query.refetch();
        }}
        title={t.errorTitle}
      />
    );
  }

  return (
    <div className="flex flex-col gap-24">
      <GlobalQuizHeader
        estimatedMinutes={display.header.estimatedMinutes}
        modulesLabel={display.header.modulesLabel}
        notionCount={display.header.notionCount}
        subtitle={display.header.subtitle}
      />
      <SessionModeSwitch
        fullMinutes={display.modeOptions.fullMinutes}
        microMinutes={display.modeOptions.microMinutes}
        mode={mode}
        note={note}
        onModeChange={changeMode}
      />
      {modeLoading ? (
        <div
          aria-busy="true"
          className="flex min-h-320 animate-pulse flex-col gap-16 rounded-24 border border-solid border-border bg-surface p-28"
          data-testid="gq-mode-loading"
        >
          <span className="sr-only">{t.micro.loading}</span>
          <div className="h-24 w-1/2 rounded-8 bg-surface-muted" />
          <div className="h-96 w-full rounded-16 bg-surface-muted" />
          <div className="h-44 w-2/3 rounded-12 bg-surface-muted" />
        </div>
      ) : (
        <>
          <SessionProgress
            currentIndex={ended ? items.length : index}
            finished={ended}
            total={items.length}
          />
          <div className="flex flex-wrap items-start gap-20">
            <div className="flex flex-[1_1_260px] flex-col gap-16">
              <GameRail
                currentPosition={ended ? -1 : (item?.position ?? -1)}
                items={items}
                onSelect={(position) => {
                  setCurrent(position);
                }}
              />
              <TutorRationale rationale={display.rationale} />
            </div>

            {effectiveSummary !== null ? (
              <section
                aria-labelledby="gq-game-title"
                className="flex min-w-0 flex-[999_1_560px] flex-col gap-22 rounded-24 border border-solid border-border bg-surface p-28"
                data-testid="gq-game"
              >
                <h2 className="sr-only" id="gq-game-title">
                  {t.end.badge}
                </h2>
                <SessionEnd
                  forDate={display.forDate}
                  summary={effectiveSummary}
                  timeZone={timeZone}
                />
              </section>
            ) : item === undefined ? null : (
              <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-12">
                {answerError ? (
                  <div
                    className="flex flex-wrap items-center justify-between gap-12 rounded-16 border border-solid border-orange bg-orange-soft px-16 py-12 text-14 text-orange-ink"
                    data-testid="gq-answer-error"
                    role="alert"
                  >
                    <span>{t.answerError}</span>
                    <button
                      className="min-h-36 cursor-pointer rounded-10 border-0 bg-ink px-14 font-600 text-white"
                      onClick={retry}
                      type="button"
                    >
                      {t.retry}
                    </button>
                  </div>
                ) : null}
                {completeError ? (
                  <div
                    className="rounded-16 border border-solid border-orange bg-orange-soft px-16 py-12 text-14 text-orange-ink"
                    data-testid="gq-complete-error"
                    role="alert"
                  >
                    {t.completeError}{' '}
                    <button
                      className="cursor-pointer border-0 bg-transparent font-600 text-orange-ink underline"
                      onClick={() => {
                        complete.mutate();
                      }}
                      type="button"
                    >
                      {t.retry}
                    </button>
                  </div>
                ) : null}
                <GamePanel
                  dueLabels={props.dueLabelsByPosition[String(item.position)]}
                  footer={
                    <SessionFooter
                      isLast={last}
                      nextDisabled={item.state === 'todo'}
                      onNext={next}
                      onSkip={skip}
                      pending={answer.isPending || complete.isPending}
                      skipDisabled={item.state !== 'todo'}
                    />
                  }
                  item={item}
                  onAnswer={answerGame}
                  onGrade={grade}
                  pending={answer.isPending}
                  titleRef={titleRef}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
