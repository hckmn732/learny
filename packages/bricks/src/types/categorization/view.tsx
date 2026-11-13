'use client';

import { useId } from 'react';

import { Button, SegmentedControl, cn } from '@learny/ui';

import type { CorrectionView } from '../../correction-view';
import { resolveLabels } from '../../view/labels';
import { QuestionHeader } from '../../view/question-header';
import type { BrickViewProps } from '../../view-types';

function correctionByItem(
  correction: CorrectionView<'categorization'> | undefined,
): Map<string, boolean> | null {
  if (!correction) return null;
  return new Map(correction.items.map((item) => [item.id, item.correct]));
}

/** Classification with dashed buckets and segmented categories (SPEC-503 EF-7). */
export function CategorizationView(props: BrickViewProps<'categorization'>) {
  const { brick, variant, value, onChange, status, correction, onCheck, labelledBy, labels } =
    props;
  const t = resolveLabels(labels);
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;
  const payload = brick.publicPayload;
  const assignments = value?.assignments ?? {};
  const locked = status === 'locked' || status === 'corrected' || variant === 'review';
  const corrected = status === 'corrected' || variant === 'review';
  const correctionMap = corrected ? correctionByItem(correction) : null;
  const checking = status === 'checking';

  function assign(itemId: string, categoryId: string) {
    if (locked || !onChange) return;
    onChange({ assignments: { ...assignments, [itemId]: categoryId } });
  }

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-16"
      data-testid="brick-categorization"
    >
      <QuestionHeader
        labels={labels}
        labelledBy={titleId}
        notionLabels={brick.notionLabels}
        stem={payload.instruction}
        typeLabel={t.type('categorization')}
        variant={variant}
      />
      <div className="grid grid-cols-1 gap-12 min-[640px]:grid-cols-2">
        {payload.categories.map((category) => {
          const items = payload.items.filter((item) => assignments[item.id] === category.id);
          return (
            <div
              className="flex min-h-96 flex-col gap-10 rounded-18 border-[1.5px] border-dashed border-border-dashed p-14"
              data-testid={`brick-bucket-${category.id}`}
              key={category.id}
            >
              <span className="text-13 font-700 tracking-label text-ink uppercase">
                {category.label}
              </span>
              <div className="flex flex-wrap gap-6">
                {items.length === 0 ? (
                  <span className="text-13 text-ink-muted">{t.empty}</span>
                ) : (
                  items.map((item) => (
                    <span
                      className={cn(
                        'rounded-full bg-ink px-10 py-6 text-13 font-600 text-white',
                        correctionMap?.get(item.id) === false && 'bg-orange text-ink',
                      )}
                      key={item.id}
                    >
                      {item.text}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      <ul className="m-0 flex list-none flex-col gap-8 p-0">
        {payload.items.map((item) => {
          const state = correctionMap?.get(item.id);
          return (
            <li
              className={cn(
                'flex flex-wrap items-center gap-10 rounded-16 py-8 pr-8 pl-16',
                state === true
                  ? 'border-[1.5px] border-teal bg-green-soft'
                  : state === false
                    ? 'border-[1.5px] border-orange bg-orange-soft'
                    : 'border border-solid border-border bg-surface',
              )}
              key={item.id}
            >
              <span className="min-w-0 flex-1 basis-200 text-15 font-600 text-ink">
                {item.text}
              </span>
              {state !== undefined ? (
                <span className="sr-only">
                  {state ? ' — classé correctement' : ' — mal classé'}
                </span>
              ) : null}
              <SegmentedControl
                aria-label={item.text}
                data-testid={`brick-categorize-${item.id}`}
                disabled={locked}
                onValueChange={(categoryId) => {
                  assign(item.id, categoryId);
                }}
                options={payload.categories.map((category) => ({
                  value: category.id,
                  label: category.label,
                }))}
                value={assignments[item.id] ?? ''}
              />
            </li>
          );
        })}
      </ul>
      <Button
        aria-disabled={checking}
        className="self-start"
        data-testid="brick-check"
        disabled={checking}
        onClick={onCheck}
        size="md"
        variant="dark"
      >
        {checking ? t.checking : t.verifyCategorization}
      </Button>
    </section>
  );
}
