'use client';

import { useMemo, useState, type ReactNode } from 'react';

import type { PublicPayload } from '@learny/bricks';
import type { ReviewItemDto, ReviewMatchingResponse } from '@learny/contracts';
import { Button, cn } from '@learny/ui';

import { seededShuffle } from '../../../lib/shuffle';
import { fr } from '../../../messages/fr';

import { CORRECT_TILE, GameCorrection, Verdict, WRONG_TILE, gameResultOf } from './GameCorrection';

const t = fr.globalQuiz.games;

export interface MatchingGameProps {
  item: ReviewItemDto;
  result: unknown;
  pending?: boolean;
  onSubmit: (response: ReviewMatchingResponse) => void;
}

type Pairs = Record<string, string>;

function pairsFromCorrection(correction: ReturnType<typeof gameResultOf>['correction']): Pairs {
  if (correction === null || correction.kind !== 'matching') return {};
  const pairs: Pairs = {};
  for (const pair of correction.pairs) {
    if (pair.rightId !== null) pairs[pair.leftId] = pair.rightId;
  }
  return pairs;
}

/**
 * SCR-10 §10.5, EF-1 — association: numbered terms on the left, definitions on the right. A pair
 * is created by selecting a term then a definition; picking an already paired definition moves
 * it; selecting another term replaces its pair. The grading itself is server-side (BR-MEM-05).
 */
export function MatchingGame(props: MatchingGameProps): ReactNode {
  const { item, result, pending = false, onSubmit } = props;
  const payload = item.payload as PublicPayload<'matching'>;
  const state = gameResultOf(item, result);
  const locked = state.locked || pending;
  const correction = state.correction?.kind === 'matching' ? state.correction : null;
  const [draft, setDraft] = useState<Pairs>({});
  const [selected, setSelected] = useState<string | null>(null);
  const pairs = correction === null ? draft : pairsFromCorrection(correction);
  const rights = useMemo(
    () => seededShuffle(payload.rights, `${item.brickVersionId}:matching-rights`),
    [item.brickVersionId, payload.rights],
  );
  const complete = payload.lefts.every((left) => pairs[left.id] !== undefined);
  const okByLeft = useMemo(() => {
    if (correction === null) return new Map<string, boolean>();
    return new Map(correction.pairs.map((pair) => [pair.leftId, pair.ok]));
  }, [correction]);
  const expectedTermByRight = useMemo(() => {
    if (correction === null) return new Map<string, string>();
    return new Map(correction.pairs.map((pair) => [pair.expectedRightId, pair.expectedLeftLabel]));
  }, [correction]);

  function selectTerm(leftId: string): void {
    if (locked) return;
    setSelected(leftId);
  }

  function assignRight(rightId: string): void {
    if (locked || selected === null) return;
    const next: Pairs = {};
    for (const [leftId, value] of Object.entries(draft)) {
      if (value !== rightId) next[leftId] = value;
    }
    next[selected] = rightId;
    setDraft(next);
    setSelected(null);
  }

  function reset(): void {
    if (locked) return;
    setDraft({});
    setSelected(null);
  }

  function verify(): void {
    if (locked || !complete) return;
    onSubmit({
      pairs: payload.lefts.map((left) => ({
        leftId: left.id,
        rightId: pairs[left.id] as string,
      })),
    });
  }

  return (
    <div className="flex flex-col gap-16" data-testid="game-matching">
      <p className="m-0 text-15 text-ink-muted">{t.matching.instruction}</p>
      <div className="grid grid-cols-1 gap-12 min-[600px]:grid-cols-2 min-[600px]:gap-x-20">
        <div className="flex flex-col gap-10" role="group" aria-label={t.matching.instruction}>
          {payload.lefts.map((left, index) => {
            const rightId = pairs[left.id];
            const ok = okByLeft.get(left.id) === true;
            const checked = correction !== null;
            const pressed = selected === left.id;
            return (
              <button
                aria-pressed={pressed}
                className={cn(
                  'flex min-h-64 w-full cursor-pointer items-center gap-12 rounded-16 px-14 py-12 text-left text-15 font-600 leading-1.35',
                  checked
                    ? rightId !== undefined && ok
                      ? CORRECT_TILE
                      : WRONG_TILE
                    : pressed
                      ? 'border-2 border-solid border-ink bg-canvas text-ink'
                      : 'border border-solid border-border-strong bg-surface text-ink',
                )}
                data-testid={`matching-left-${String(index + 1)}`}
                disabled={locked}
                key={left.id}
                onClick={() => {
                  selectTerm(left.id);
                }}
                style={{ overflowWrap: 'anywhere' }}
                type="button"
              >
                <span className="flex h-28 w-28 shrink-0 items-center justify-center rounded-8 bg-ink text-13 font-700 text-white">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">{left.text}</span>
                {checked ? <Verdict ok={rightId !== undefined && ok} /> : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-10">
          {rights.map((right, index) => {
            const leftId = Object.keys(pairs).find((key) => pairs[key] === right.id);
            const leftIndex = payload.lefts.findIndex((left) => left.id === leftId);
            const ok = leftId !== undefined && okByLeft.get(leftId) === true;
            const checked = correction !== null;
            const associated = leftId !== undefined;
            return (
              <button
                aria-label={
                  leftIndex >= 0
                    ? t.matching.associated(right.text, leftIndex + 1)
                    : t.matching.notAssociated(right.text)
                }
                className={cn(
                  'flex min-h-64 w-full cursor-pointer items-center gap-12 rounded-16 px-14 py-12 text-left text-15 font-600 leading-1.35',
                  checked
                    ? associated && ok
                      ? CORRECT_TILE
                      : WRONG_TILE
                    : associated
                      ? 'border border-solid border-ink bg-canvas text-ink'
                      : 'border border-dashed border-border-dashed bg-surface text-ink',
                )}
                data-testid={`matching-right-${String(index + 1)}`}
                disabled={locked}
                key={right.id}
                onClick={() => {
                  assignRight(right.id);
                }}
                style={{ overflowWrap: 'anywhere' }}
                type="button"
              >
                <span
                  className={cn(
                    'flex h-28 w-28 shrink-0 items-center justify-center rounded-8 text-13 font-700',
                    associated
                      ? 'bg-ink text-white'
                      : 'border border-dashed border-border-dashed text-ink-muted',
                  )}
                >
                  {leftIndex >= 0 ? leftIndex + 1 : ''}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span>{right.text}</span>
                  {checked && !ok ? (
                    <span className="text-13 font-600">
                      {t.matching.expected(expectedTermByRight.get(right.id) ?? '')}
                    </span>
                  ) : null}
                </span>
                {checked ? <Verdict ok={ok} /> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-8">
        <Button
          data-testid="matching-verify"
          disabled={locked || !complete}
          onClick={verify}
          variant="dark"
        >
          {t.matching.verify}
        </Button>
        <Button data-testid="matching-reset" disabled={locked} onClick={reset} variant="outline">
          {t.matching.reset}
        </Button>
      </div>
      <div aria-live="polite">
        <GameCorrection explanation={state.explanation} />
      </div>
    </div>
  );
}
