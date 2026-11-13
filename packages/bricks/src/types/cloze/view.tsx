'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@learny/ui';

import { resolveLabels } from '../../view/labels';
import { QuestionHeader } from '../../view/question-header';
import type { BrickViewProps } from '../../view-types';

const GAP_TOKEN = /\{\{(\d+)\}\}/g;

/** Inline gap text, quiz and game variants (SPEC-503 EF-4). */
export function ClozeView(props: BrickViewProps<'cloze'>) {
  const { brick, variant, value, onChange, status, correction, labelledBy, labels } = props;
  const t = resolveLabels(labels);
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;
  const payload = brick.publicPayload;
  const game = variant === 'game';
  const locked = status === 'locked' || status === 'corrected' || variant === 'review';
  const corrected = status === 'corrected' || variant === 'review';
  const corrections = correction ? new Map(correction.gaps.map((gap) => [gap.id, gap])) : null;
  const total = payload.gaps.length;
  const values = value?.gaps ?? {};

  function setGap(id: number, text: string) {
    if (locked || !onChange) return;
    onChange({ gaps: { ...values, [String(id)]: text } });
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const template = payload.template;
  for (const match of template.matchAll(GAP_TOKEN)) {
    const index = match.index;
    if (index > lastIndex) parts.push(template.slice(lastIndex, index));
    const gapId = Number(match[1]);
    const gapIndex = payload.gaps.findIndex((gap) => gap.id === gapId);
    const gap = payload.gaps[gapIndex];
    if (gap === undefined) continue;
    const state = corrections?.get(gapId);
    const stateCorrect = state?.correct === true;
    const stateWrong = state !== undefined && !state.correct;
    const describedBy = `gap-expected-${titleId}-${String(gapId)}`;
    parts.push(
      <span className="inline-flex flex-col align-middle" key={`gap-${String(gapId)}`}>
        <input
          aria-describedby={state ? describedBy : undefined}
          aria-label={t.gapLabel(gapIndex + 1, total)}
          className={cn(
            'w-150 rounded-10 border-0 px-12 text-center text-18 font-600 text-ink shadow-[inset_0_-2px_0_var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-80',
            game ? 'min-h-44' : 'min-h-44',
            stateCorrect
              ? 'bg-green-soft shadow-[inset_0_-2px_0_var(--color-teal)]'
              : stateWrong
                ? 'bg-orange-soft shadow-[inset_0_-2px_0_var(--color-orange)]'
                : 'bg-canvas',
          )}
          data-testid={`brick-gap-${String(gapId)}`}
          disabled={locked}
          onChange={(event) => {
            setGap(gapId, event.currentTarget.value);
          }}
          value={values[String(gapId)] ?? ''}
        />
        {gap.hint && !corrected ? (
          <span className="mt-2 text-center text-11 text-ink-muted">{gap.hint}</span>
        ) : null}
        {state ? (
          <span className="sr-only" id={describedBy}>
            {`${state.correct ? 'Juste' : 'Faux'}. ${t.answerExpected(state.expected)}`}
          </span>
        ) : null}
      </span>,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < template.length) parts.push(template.slice(lastIndex));

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-18" data-testid="brick-cloze">
      <QuestionHeader
        labels={labels}
        labelledBy={titleId}
        notionLabels={brick.notionLabels}
        stem={t.clozeStem}
        typeLabel={t.type('cloze')}
        variant={variant}
      />
      {game ? (
        <p className="m-0 font-display text-24 leading-2 text-ink">{parts}</p>
      ) : (
        <p className="m-0 text-20 leading-2.2 text-ink">{parts}</p>
      )}
      {corrected && corrections ? (
        <p className="m-0 rounded-12 bg-canvas px-14 py-12 text-14 text-ink-secondary">
          {t.expectedAnswers(
            correction?.kind === 'cloze'
              ? correction.gaps.map((gap) => gap.expected).join(' · ')
              : '',
          )}
        </p>
      ) : null}
    </section>
  );
}
