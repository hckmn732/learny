'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { PublicPayload } from '@learny/bricks';
import type { ReviewItemDto, ReviewOrderingResponse } from '@learny/contracts';
import { Button, cn } from '@learny/ui';

import { fr } from '../../../messages/fr';

import { CORRECT_TILE, GameCorrection, Verdict, WRONG_TILE, gameResultOf } from './GameCorrection';

const t = fr.globalQuiz.games;

export interface OrderingGameProps {
  item: ReviewItemDto;
  result: unknown;
  pending?: boolean;
  onSubmit: (response: ReviewOrderingResponse) => void;
}

type Direction = 'up' | 'down';

function Chevron(props: { direction: Direction }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d={props.direction === 'up' ? 'm18 15-6-6-6 6' : 'm6 9 6 6 6-6'} />
    </svg>
  );
}

/**
 * SCR-10 §10.5, EF-2 — remise en ordre. The displayed order is the deterministic shuffle frozen in
 * the public payload; the arrows swap adjacent items and move the focus with the moved element.
 */
export function OrderingGame(props: OrderingGameProps): ReactNode {
  const { item, result, pending = false, onSubmit } = props;
  const payload = item.payload as PublicPayload<'ordering'>;
  const state = gameResultOf(item, result);
  const locked = state.locked || pending;
  const correction = state.correction?.kind === 'ordering' ? state.correction : null;
  const initialOrder = useMemo(() => payload.items.map((entry) => entry.id), [payload.items]);
  const [draft, setDraft] = useState<string[]>(initialOrder);
  const pendingFocus = useRef<{ index: number; direction: Direction } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const rowById = useMemo(
    () => new Map(correction?.rows.map((row) => [row.stepId, row]) ?? []),
    [correction],
  );
  const order = useMemo(() => {
    if (correction === null) return draft;
    return [...payload.items]
      .sort((left, right) => {
        const leftRow = rowById.get(left.id);
        const rightRow = rowById.get(right.id);
        return (leftRow?.position ?? 0) - (rightRow?.position ?? 0);
      })
      .map((entry) => entry.id);
  }, [correction, draft, payload.items, rowById]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const primary = buttons.current.get(`${target.direction}-${String(target.index)}`);
    const fallbackKey = target.direction === 'up' ? 'down' : 'up';
    const fallback = buttons.current.get(`${fallbackKey}-${String(target.index)}`);
    const focusable =
      primary !== null && primary !== undefined && !primary.disabled ? primary : fallback;
    focusable?.focus();
  }, [order]);

  function move(index: number, delta: number): void {
    if (locked) return;
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    const current = next[index] as string;
    next[index] = next[target] as string;
    next[target] = current;
    setDraft(next);
    pendingFocus.current = { index: target, direction: delta < 0 ? 'up' : 'down' };
  }

  function verify(): void {
    if (locked) return;
    onSubmit({ order: [...order] });
  }

  return (
    <div className="flex flex-col gap-16" data-testid="game-ordering">
      <p className="m-0 text-15 text-ink-muted">{payload.instruction}</p>
      <ol className="m-0 flex list-none flex-col gap-10 p-0">
        {order.map((stepId, index) => {
          const step = payload.items.find((entry) => entry.id === stepId);
          const row = rowById.get(stepId);
          const checked = correction !== null;
          return (
            <li
              className={cn(
                'flex items-center gap-12 rounded-18 px-12 py-10',
                checked
                  ? row?.ok === true
                    ? CORRECT_TILE
                    : WRONG_TILE
                  : 'border border-solid border-border bg-surface-subtle',
              )}
              data-testid={`ordering-item-${String(index + 1)}`}
              key={stepId}
              style={{ overflowWrap: 'anywhere' }}
            >
              <span className="flex h-36 w-36 shrink-0 items-center justify-center rounded-10 bg-ink font-display font-600 text-white">
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-2 text-16 font-600">
                <span>{step?.text ?? ''}</span>
                {checked && row?.ok !== true ? (
                  <span className="text-13 font-600">
                    {t.ordering.expectedPosition(row?.expectedPosition ?? 0)}
                  </span>
                ) : null}
              </span>
              {checked ? <Verdict ok={row?.ok === true} /> : null}
              <Button
                aria-label={t.ordering.up}
                className="h-44 w-44 shrink-0 p-0"
                data-testid={`ordering-up-${String(index + 1)}`}
                disabled={locked || index === 0}
                onClick={() => {
                  move(index, -1);
                }}
                ref={(element) => {
                  buttons.current.set(`up-${String(index)}`, element);
                }}
                size="sm"
                variant="outline"
              >
                <Chevron direction="up" />
              </Button>
              <Button
                aria-label={t.ordering.down}
                className="h-44 w-44 shrink-0 p-0"
                data-testid={`ordering-down-${String(index + 1)}`}
                disabled={locked || index === order.length - 1}
                onClick={() => {
                  move(index, 1);
                }}
                ref={(element) => {
                  buttons.current.set(`down-${String(index)}`, element);
                }}
                size="sm"
                variant="outline"
              >
                <Chevron direction="down" />
              </Button>
            </li>
          );
        })}
      </ol>
      <Button
        className="self-start"
        data-testid="ordering-verify"
        disabled={locked}
        onClick={verify}
        variant="dark"
      >
        {t.ordering.verify}
      </Button>
      <div aria-live="polite">
        <GameCorrection explanation={state.explanation} />
      </div>
    </div>
  );
}
