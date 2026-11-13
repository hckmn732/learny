'use client';

import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.quiz;

export function QuizProgress({
  current,
  total,
  checkedPositions,
}: {
  current: number;
  total: number;
  checkedPositions: readonly number[];
}) {
  return (
    <div className="flex flex-col gap-18">
      <div aria-hidden="true" className="flex gap-4" data-testid="quiz-progress">
        {Array.from({ length: total }, (_, index) => {
          const position = index + 1;
          const state =
            position < current || checkedPositions.includes(position)
              ? 'past'
              : position === current
                ? 'current'
                : 'future';
          return (
            <span
              className={cn(
                'h-8 flex-1 rounded-4',
                state === 'past' && 'bg-ink',
                state === 'current' && 'bg-lime',
                state === 'future' && 'bg-border',
              )}
              data-state={state}
              data-testid="quiz-progress-seg"
              key={position}
            />
          );
        })}
      </div>
      <span className="text-14 font-600 tabular-nums" data-testid="quiz-question-counter">
        {t.progress(current, total)}
      </span>
    </div>
  );
}
