'use client';

import { useId, type KeyboardEvent } from 'react';

import { Button, cn } from '@learny/ui';

import type { CorrectionView } from '../../correction-view';
import { resolveLabels } from '../../view/labels';
import { QuestionHeader } from '../../view/question-header';
import type { BrickViewProps } from '../../view-types';

function correctionByItem(
  correction: CorrectionView<'ordering'> | undefined,
): Map<string, boolean> | null {
  if (!correction) return null;
  return new Map(correction.positions.map((position) => [position.id, position.correct]));
}

/** Numbered ordered list moved with buttons or Alt+↑/Alt+↓ (SPEC-503 EF-6). */
export function OrderingView(props: BrickViewProps<'ordering'>) {
  const { brick, variant, value, onChange, status, correction, onCheck, labelledBy, labels } =
    props;
  const t = resolveLabels(labels);
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;
  const payload = brick.publicPayload;
  const game = variant === 'game';
  const locked = status === 'locked' || status === 'corrected' || variant === 'review';
  const corrected = status === 'corrected' || variant === 'review';
  const correctionMap = corrected ? correctionByItem(correction) : null;
  const checking = status === 'checking';
  const ids = payload.items.map((item) => item.id);
  const order = value?.order && value.order.length === ids.length ? value.order : ids;
  const items = order
    .map((id) => payload.items.find((item) => item.id === id))
    .filter((item): item is (typeof payload.items)[number] => item !== undefined);

  function move(id: string, delta: number) {
    if (locked || !onChange) return;
    const index = order.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(index, 1);
    if (moved !== undefined) next.splice(target, 0, moved);
    onChange({ order: next });
  }

  function onKeyDown(event: KeyboardEvent<HTMLOListElement>) {
    if (!event.altKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-order-id]');
    const id = row?.dataset.orderId;
    if (!id) return;
    event.preventDefault();
    move(id, event.key === 'ArrowUp' ? -1 : 1);
  }

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-16"
      data-testid="brick-ordering"
    >
      <QuestionHeader
        labels={labels}
        labelledBy={titleId}
        notionLabels={brick.notionLabels}
        stem={payload.instruction}
        typeLabel={t.type('ordering')}
        variant={variant}
      />
      {/* Alt+↑/↓ acts on the row that contains the focused control (EF-6). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <ol className="m-0 flex list-none flex-col gap-10 p-0" onKeyDown={onKeyDown}>
        {items.map((item, index) => {
          const state = correctionMap?.get(item.id);
          const first = index === 0;
          const last = index === items.length - 1;
          return (
            <li
              className={cn(
                'flex flex-wrap items-center gap-12 rounded-18 px-12 py-10',
                state === true
                  ? 'border-[1.5px] border-teal bg-green-soft'
                  : state === false
                    ? 'border-[1.5px] border-orange bg-orange-soft'
                    : 'border border-solid border-border bg-surface-subtle',
              )}
              data-order-id={item.id}
              key={item.id}
            >
              <span
                aria-hidden="true"
                className="inline-flex size-36 shrink-0 items-center justify-center rounded-10 bg-ink font-display font-600 text-white"
              >
                {String(index + 1)}
              </span>
              <span className="min-w-0 flex-1 basis-200 text-16 font-600 text-ink">
                {item.text}
              </span>
              {state !== undefined ? (
                <span className="sr-only">
                  {state ? ' — position correcte' : ' — position incorrecte'}
                </span>
              ) : null}
              <Button
                aria-label={`${t.moveUp} : ${item.text}`}
                className="size-44 px-0"
                data-testid={`brick-move-up-${item.id}`}
                disabled={locked || first}
                onClick={() => {
                  move(item.id, -1);
                }}
                size="md"
                variant="outline"
              >
                <span aria-hidden="true" className="text-16 font-700">
                  ↑
                </span>
              </Button>
              <Button
                aria-label={`${t.moveDown} : ${item.text}`}
                className="size-44 px-0"
                data-testid={`brick-move-down-${item.id}`}
                disabled={locked || last}
                onClick={() => {
                  move(item.id, 1);
                }}
                size="md"
                variant="outline"
              >
                <span aria-hidden="true" className="text-16 font-700">
                  ↓
                </span>
              </Button>
            </li>
          );
        })}
      </ol>
      {game ? (
        <Button
          className="self-start"
          data-testid="brick-check"
          disabled={checking}
          onClick={onCheck}
          size="md"
          variant="dark"
        >
          {checking ? t.checking : t.verifyOrder}
        </Button>
      ) : null}
    </section>
  );
}
