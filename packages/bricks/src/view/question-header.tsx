import { useId } from 'react';

import { Badge, cn } from '@learny/ui';

import type { BrickVariant } from '../view-types';

import { resolveLabels, type BrickViewLabelsOverride } from './labels';

export interface QuestionHeaderProps {
  typeLabel: string;
  notionLabels: string[];
  stem: string;
  variant: BrickVariant;
  labelledBy?: string | undefined;
  labels?: BrickViewLabelsOverride | undefined;
}

/** Type and notion pills plus the stem (SPEC-503 EF-2). */
export function QuestionHeader({
  typeLabel,
  notionLabels,
  stem,
  variant,
  labelledBy,
  labels,
}: QuestionHeaderProps) {
  const t = resolveLabels(labels);
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;

  return (
    <header className="flex flex-col gap-14">
      <div className="flex flex-wrap gap-8">
        <Badge data-testid="brick-type-badge" tone="neutral">
          {typeLabel}
        </Badge>
        {notionLabels.map((label) => (
          <Badge key={label} tone="indigo">
            {`${t.notionPrefix}${label}`}
          </Badge>
        ))}
      </div>
      <h2
        className={cn(
          'm-0 font-display font-600 leading-1.3 tracking-heading text-ink',
          variant === 'exam' ? 'text-24' : 'text-26',
        )}
        id={titleId}
      >
        {stem}
      </h2>
    </header>
  );
}
