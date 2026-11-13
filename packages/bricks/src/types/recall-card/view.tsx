'use client';

import { useEffect, useId, useState } from 'react';

import { cn } from '@learny/ui';

import type { SelfGrade } from '../../correction-view';
import { resolveLabels } from '../../view/labels';
import type { BrickViewProps } from '../../view-types';

const GRADES: SelfGrade[] = ['again', 'hard', 'good', 'easy'];
const GRADE_KEYS: Record<string, SelfGrade> = {
  '1': 'again',
  '2': 'hard',
  '3': 'good',
  '4': 'easy',
};

/** Recall card: front, flip, back and the four self-assessment buttons (SPEC-503 EF-8). */
export function RecallCardView(props: BrickViewProps<'recall_card'>) {
  const { brick, variant, value, onChange, status, correction, dueLabels, labels, labelledBy } =
    props;
  const t = resolveLabels(labels);
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;
  const payload = brick.publicPayload;
  const [flipped, setFlipped] = useState(false);
  const locked = status === 'locked';
  const corrected = status === 'corrected' || variant === 'review';
  const selected: SelfGrade | undefined =
    value?.selfGrade ?? (correction?.kind === 'recall_card' ? correction.selfGrade : undefined);
  const showBack = flipped || corrected || selected !== undefined;

  function flip() {
    if (!locked) setFlipped(true);
  }

  function grade(next: SelfGrade) {
    if (locked || !onChange) return;
    setFlipped(true);
    onChange({ selfGrade: next });
  }

  useEffect(() => {
    if (locked) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        if (!flipped) {
          event.preventDefault();
          setFlipped(true);
        }
        return;
      }
      const next = GRADE_KEYS[event.key];
      if (next && (flipped || selected !== undefined)) {
        event.preventDefault();
        grade(next);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-18"
      data-testid="brick-recall_card"
    >
      <h2 className="sr-only" id={titleId}>
        {t.type('recall_card')}
      </h2>
      {!showBack ? (
        <div
          className="flex min-h-240 flex-col justify-between gap-24 rounded-22 border border-solid border-border bg-surface-subtle p-32 transition-opacity duration-150 motion-reduce:transition-none"
          data-testid="brick-recall-front"
        >
          <span className="text-12 font-700 tracking-kicker text-ink-muted uppercase">
            {t.recallFront}
          </span>
          <p className="m-0 font-display text-28 font-600 leading-1.25 tracking-heading text-ink">
            {payload.front}
          </p>
          <button
            className="min-h-48 cursor-pointer self-start rounded-14 border-0 bg-ink px-20 font-700 text-15 text-white"
            data-testid="brick-flip"
            onClick={flip}
            type="button"
          >
            {t.recallFlip}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-18">
          <div
            className="flex min-h-240 flex-col gap-18 rounded-22 bg-ink p-32 text-white transition-opacity duration-150 motion-reduce:transition-none"
            data-testid="brick-recall-back"
          >
            <span className="text-12 font-700 tracking-kicker text-lime uppercase">
              {t.recallBack}
            </span>
            <p className="m-0 font-display text-24 font-600 leading-1.3">{payload.back}</p>
            {payload.sourceLabel ? (
              <p className="m-0 text-14 text-on-dark-muted">
                {t.recallSource(payload.sourceLabel)}
              </p>
            ) : null}
            <button
              className="min-h-44 cursor-pointer self-start rounded-12 border border-solid border-dark-500 bg-transparent px-16 font-600 text-14 text-white"
              data-testid="brick-flip"
              onClick={() => {
                setFlipped(false);
              }}
              type="button"
            >
              {t.recallFlip}
            </button>
          </div>
          <div className="flex flex-col gap-10">
            <p className="m-0 text-14 font-600 text-ink" id={`${titleId}-grade`}>
              {t.recallQuestion}
            </p>
            <div
              aria-labelledby={`${titleId}-grade`}
              className="grid grid-cols-2 gap-8 min-[640px]:grid-cols-4"
              role="group"
            >
              {GRADES.map((key) => {
                const pressed = selected === key;
                return (
                  <button
                    aria-pressed={pressed}
                    className={cn(
                      'flex min-h-64 cursor-pointer flex-col items-center justify-center gap-2 rounded-14 px-8 font-sans disabled:cursor-not-allowed',
                      pressed
                        ? 'border-0 bg-ink text-white'
                        : 'border border-solid border-border-strong bg-surface text-ink',
                    )}
                    data-testid={`brick-grade-${key}`}
                    disabled={locked}
                    key={key}
                    onClick={() => {
                      grade(key);
                    }}
                    type="button"
                  >
                    <span className="text-15 font-700">{t.selfGrade[key]}</span>
                    <span className="text-12 opacity-80">
                      {dueLabels?.[key] ?? t.dueLabels[key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
