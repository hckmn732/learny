'use client';

import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.mockExam;

export interface QuestionPaletteProps {
  total: number;
  current: number;
  answered: ReadonlySet<number>;
  marked: ReadonlySet<number>;
  onSelect: (position: number) => void;
}

/** BR-PRA-03 — free navigation, answered/marked/empty states never rely on colour alone. */
export function QuestionPalette({
  total,
  current,
  answered,
  marked,
  onSelect,
}: QuestionPaletteProps) {
  return (
    <nav
      aria-label={t.paletteLabel}
      className="flex flex-col gap-12 rounded-24 border border-border bg-surface p-18"
      data-testid="exam-palette"
    >
      <div className="grid grid-cols-5 gap-8">
        {Array.from({ length: total }, (_, index) => index + 1).map((position) => {
          const isAnswered = answered.has(position);
          const isMarked = marked.has(position);
          return (
            <button
              aria-current={position === current ? 'step' : undefined}
              aria-label={t.paletteQuestion(position, isAnswered, isMarked)}
              className={cn(
                'h-40 rounded-10 text-14 font-700',
                isMarked
                  ? 'border-2 border-orange'
                  : isAnswered
                    ? 'border-0 bg-ink text-white'
                    : 'border border-border-strong bg-surface text-ink',
                position === current && 'ring-3 ring-lime',
              )}
              data-testid={`exam-palette-${String(position)}`}
              key={position}
              onClick={() => {
                onSelect(position);
              }}
              type="button"
            >
              {position}
            </button>
          );
        })}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-14 gap-y-6 p-0 text-12 text-ink-muted">
        <li className="flex items-center gap-6">
          <span aria-hidden="true" className="size-12 rounded-4 bg-ink" />
          {t.legendAnswered}
        </li>
        <li className="flex items-center gap-6">
          <span
            aria-hidden="true"
            className="size-12 rounded-4 border-2 border-orange box-border"
          />
          {t.legendMarked}
        </li>
        <li className="flex items-center gap-6">
          <span
            aria-hidden="true"
            className="size-12 rounded-4 border border-border-strong box-border"
          />
          {t.legendEmpty}
        </li>
      </ul>
    </nav>
  );
}
