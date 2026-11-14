'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import type { WarmupAnswer, WarmupDto, WarmupItem } from '@learny/contracts';
import { sessionKindLabel, warmupDurationMin } from '@learny/services/warmup/derive';
import { Button, ErrorState, SkeletonCard, cn } from '@learny/ui';

import { api } from '../../lib/api-client';
import { fr } from '../../messages/fr';

const t = fr.home.warmup;

export interface WarmupCardProps {
  warmup: WarmupDto;
  /** Records the first-pass answer; a replayed pass never calls it. */
  onAnswer?: (input: { position: number; knew: boolean }) => Promise<WarmupDto>;
}

function tagClass(item: WarmupItem): string {
  return item.tag === 'prerequisite'
    ? 'bg-indigo-soft text-indigo-ink-strong'
    : 'bg-green-soft text-green-ink';
}

function tagLabel(item: WarmupItem): string {
  return item.tag === 'prerequisite' && item.moduleNumber !== null
    ? t.tagPrerequisite(item.moduleNumber)
    : t.tagYesterday;
}

function timeOf(startsAt: string): string {
  return startsAt.slice(11, 16);
}

function firstUnanswered(items: readonly WarmupItem[], answers: readonly WarmupAnswer[]): number {
  const answered = new Set(answers.map((answer) => answer.position));
  const next = items.findIndex((item) => !answered.has(item.position));
  return next < 0 ? items.length : next;
}

/**
 * EF-7 — the interactive warm-up card of the home screen (SCR-03). The first pass records every
 * answer through the API; « Recommencer » replays the questions locally without any call (CA-4).
 */
export function WarmupCard({ warmup, onAnswer }: Readonly<WarmupCardProps>) {
  const [server, setServer] = useState(warmup);
  const [answers, setAnswers] = useState<WarmupAnswer[]>(warmup.answers);
  const [index, setIndex] = useState<number>(() =>
    warmup.status === 'done' ? warmup.items.length : firstUnanswered(warmup.items, warmup.answers),
  );
  const [revealed, setRevealed] = useState(false);
  const [replay, setReplay] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const knewRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (revealed) knewRef.current?.focus();
  }, [revealed]);

  const items = server.items;
  const total = items.length;
  const done = index >= total;
  const active: WarmupItem | undefined = items[index];
  const knewCount = answers.filter((answer) => answer.knew).length;

  const answer = async (knew: boolean): Promise<void> => {
    if (active === undefined || pending) return;
    const position = active.position;
    if (replay || onAnswer === undefined) {
      setAnswers((previous) => [...previous, { position, knew }]);
      setRevealed(false);
      setIndex(index + 1);
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const updated = await onAnswer({ position, knew });
      setServer(updated);
      setAnswers((previous) => [...previous, { position, knew }]);
      setRevealed(false);
      setIndex(index + 1);
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      if (code === 'CONFLICT') {
        // CL-11 — the second request keeps the state already recorded and moves on.
        setAnswers((previous) =>
          previous.some((entry) => entry.position === position)
            ? previous
            : [...previous, { position, knew }],
        );
        setMessage(t.conflict);
        setRevealed(false);
        setIndex(index + 1);
      } else {
        setMessage(t.saveError);
      }
    } finally {
      setPending(false);
    }
  };

  const restart = (): void => {
    setReplay(true);
    setAnswers([]);
    setIndex(0);
    setRevealed(false);
    setMessage(null);
  };

  const reviewQuestions = items
    .filter((item) => answers.some((entry) => entry.position === item.position && !entry.knew))
    .map((item) => item.question.trim().replace(/ \?$/, ''));

  const card = (
    <section
      id="echauffement"
      data-testid="warmup-card"
      aria-labelledby="t-echauffement"
      className="flex flex-[3_1_460px] flex-col gap-14 rounded-24 border border-solid border-border bg-surface px-24 py-22"
    >
      <div data-testid="warmup-visual" className="flex flex-col gap-14">
        <div className="flex flex-wrap items-center justify-between gap-10">
          <div className="flex flex-col gap-2">
            <h2 id="t-echauffement" data-testid="warmup-title" className="m-0 text-18 font-600">
              {t.title(
                sessionKindLabel(server.nextSession.kind),
                timeOf(server.nextSession.startsAt),
              )}
            </h2>
            <p className="m-0 text-13 text-ink-muted">
              {t.subtitle(total, warmupDurationMin(total), server.scope)}
            </p>
          </div>
          <span data-testid="warmup-progress" className="text-13 font-700 tabular-nums">
            {t.progress(index, total)}
          </span>
        </div>
        <span className="sr-only" aria-live="polite">
          {t.progressLabel(index, total, done ? 'terminé' : 'en cours')}
        </span>
        <div data-testid="warmup-segments" aria-hidden="true" className="flex gap-6">
          {items.map((item, position) => {
            const recorded = answers.find((entry) => entry.position === item.position);
            const background =
              recorded !== undefined
                ? recorded.knew
                  ? 'bg-success'
                  : 'bg-orange'
                : position === index
                  ? 'bg-ink'
                  : 'bg-border';
            return (
              <span
                key={item.position}
                data-segment={
                  recorded === undefined
                    ? position === index
                      ? 'current'
                      : 'upcoming'
                    : recorded.knew
                      ? 'knew'
                      : 'review'
                }
                className={cn('h-6 flex-1 rounded-3', background)}
              />
            );
          })}
        </div>
        {!done && active !== undefined ? (
          <div className="flex flex-col gap-12 rounded-18 bg-surface-subtle p-18">
            <span
              data-testid="warmup-tag"
              className={cn(
                'self-start rounded-full px-10 py-3 text-12 font-700',
                tagClass(active),
              )}
            >
              {tagLabel(active)}
            </span>
            <p
              data-testid="warmup-question"
              className="m-0 font-display text-20 leading-1.3 font-600"
            >
              {active.question}
            </p>
            {revealed ? (
              <>
                <p
                  data-testid="warmup-answer"
                  className="m-0 rounded-12 bg-surface px-14 py-12 text-15 leading-1.5"
                >
                  {active.answer}
                </p>
                <div className="flex flex-wrap gap-8">
                  <Button
                    ref={knewRef}
                    data-testid="warmup-knew"
                    disabled={pending}
                    onClick={() => void answer(true)}
                    size="md"
                    variant="lime"
                  >
                    {t.knew}
                  </Button>
                  <Button
                    data-testid="warmup-review"
                    disabled={pending}
                    onClick={() => void answer(false)}
                    size="md"
                    variant="outline"
                  >
                    {t.review}
                  </Button>
                </div>
              </>
            ) : (
              <Button
                data-testid="warmup-reveal"
                className="self-start"
                onClick={() => {
                  setRevealed(true);
                }}
                size="md"
                variant="dark"
              >
                {t.reveal}
              </Button>
            )}
          </div>
        ) : null}
        {message === null ? null : (
          <p role="status" className="m-0 text-13 text-orange-ink-alt">
            {message}
          </p>
        )}
      </div>
      {done ? (
        <div
          data-testid="warmup-done"
          role="status"
          className="flex flex-col gap-10 rounded-18 bg-ink p-18 text-white"
        >
          <p data-testid="warmup-score" className="m-0 font-display text-20 font-600">
            {t.score(knewCount, total)}
          </p>
          <p data-testid="warmup-follow" className="m-0 text-14 leading-1.5 text-on-dark-secondary">
            {t.follow(reviewQuestions, server.nextSession.kind, !(server.reviewRemaining ?? false))}
          </p>
          <div className="flex flex-wrap gap-8">
            <Button asChild size="md" variant="lime">
              <a data-testid="warmup-next" href={server.nextSession.href}>
                {t.next(server.nextSession.kind)}
              </a>
            </Button>
            <Button
              data-testid="warmup-restart"
              onClick={restart}
              size="md"
              variant="outline-on-dark"
            >
              {t.restart}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );

  return card;
}

/** Loading skeleton and error state of the card (EF-7, §10). */
export function WarmupPanel() {
  const query = useQuery({
    queryKey: ['warmups', 'today'],
    queryFn: () => api.warmupTodayGet({}),
    retry: false,
  });

  if (query.isError) {
    return (
      <section className="flex flex-[3_1_460px] flex-col gap-14 rounded-24 border border-solid border-border bg-surface px-24 py-22">
        <ErrorState
          data-testid="warmup-error"
          title={t.error}
          onRetry={() => void query.refetch()}
        />
      </section>
    );
  }
  if (query.data === undefined) {
    return (
      <div data-testid="warmup-loading" className="flex flex-[3_1_460px] flex-col gap-14">
        <SkeletonCard />
      </div>
    );
  }
  const warmup = query.data.items[0];
  if (warmup === undefined) return null;
  return (
    <WarmupCard
      warmup={warmup}
      onAnswer={async ({ position, knew }) =>
        api.warmupAnswer({
          params: { activityId: warmup.activityId },
          body: { position, knew },
        })
      }
    />
  );
}
