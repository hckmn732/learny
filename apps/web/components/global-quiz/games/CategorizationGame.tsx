'use client';

import { useMemo, useState, type ReactNode } from 'react';

import type { PublicPayload } from '@learny/bricks';
import type { ReviewCategorizationResponse, ReviewItemDto } from '@learny/contracts';
import { Button, cn } from '@learny/ui';

import { fr } from '../../../messages/fr';

import { CORRECT_TILE, GameCorrection, Verdict, WRONG_TILE, gameResultOf } from './GameCorrection';

const t = fr.globalQuiz.games;

export interface CategorizationGameProps {
  item: ReviewItemDto;
  result: unknown;
  pending?: boolean;
  onSubmit: (response: ReviewCategorizationResponse) => void;
}

type Assignments = Record<string, string>;

/** SCR-10 §10.5, EF-3 — classement: buckets on top, one segmented choice per element. */
export function CategorizationGame(props: CategorizationGameProps): ReactNode {
  const { item, result, pending = false, onSubmit } = props;
  const payload = item.payload as PublicPayload<'categorization'>;
  const state = gameResultOf(item, result);
  const locked = state.locked || pending;
  const correction = state.correction?.kind === 'categorization' ? state.correction : null;
  const [draft, setDraft] = useState<Assignments>({});
  const assignments = useMemo<Assignments>(() => {
    if (correction === null) return draft;
    const fromCorrection: Assignments = {};
    for (const row of correction.rows) {
      if (row.categoryId !== null) fromCorrection[row.itemId] = row.categoryId;
    }
    return fromCorrection;
  }, [correction, draft]);
  const rowByItem = useMemo(
    () => new Map(correction?.rows.map((row) => [row.itemId, row]) ?? []),
    [correction],
  );
  const complete = payload.items.every((entry) => assignments[entry.id] !== undefined);

  function assign(itemId: string, categoryId: string): void {
    if (locked) return;
    setDraft({ ...draft, [itemId]: categoryId });
  }

  function verify(): void {
    if (locked || !complete) return;
    onSubmit({
      assignments: payload.items.map((entry) => ({
        itemId: entry.id,
        categoryId: assignments[entry.id] as string,
      })),
    });
  }

  return (
    <div className="flex flex-col gap-16" data-testid="game-categorization">
      <p className="m-0 text-15 text-ink-muted">{payload.instruction}</p>
      <div className="grid grid-cols-1 gap-12 min-[600px]:grid-cols-2">
        {payload.categories.map((category, categoryIndex) => {
          const filled = payload.items.filter((entry) => assignments[entry.id] === category.id);
          return (
            <div
              className="flex min-h-96 flex-col gap-10 rounded-18 border-[1.5px] border-dashed border-border-dashed p-14"
              data-testid={`categorization-bucket-${String(categoryIndex + 1)}`}
              key={category.id}
            >
              <span className="text-13 font-700 tracking-label text-ink uppercase">
                {category.label}
              </span>
              <div className="flex flex-wrap gap-6">
                {filled.map((entry) => (
                  <span
                    className="rounded-full bg-ink px-10 py-6 text-13 font-600 text-white"
                    key={entry.id}
                  >
                    {entry.text}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <ul className="m-0 flex list-none flex-col gap-8 p-0">
        {payload.items.map((entry, itemIndex) => {
          const row = rowByItem.get(entry.id);
          const checked = correction !== null;
          const expected = payload.categories.find(
            (category) => category.id === row?.expectedCategoryId,
          );
          return (
            <li
              className={cn(
                'flex flex-wrap items-center gap-10 rounded-16 py-8 pr-8 pl-16',
                checked
                  ? row?.ok === true
                    ? CORRECT_TILE
                    : WRONG_TILE
                  : 'border border-solid border-border bg-surface',
              )}
              data-testid={`categorization-row-${String(itemIndex + 1)}`}
              key={entry.id}
              style={{ overflowWrap: 'anywhere' }}
            >
              <span className="flex min-w-0 flex-1 basis-200 flex-col gap-2 text-15 font-600">
                <span>{entry.text}</span>
                {checked && row?.ok !== true ? (
                  <span className="text-13 font-600">
                    {t.categorization.expected(expected?.label ?? row?.expectedCategoryLabel ?? '')}
                  </span>
                ) : null}
              </span>
              {checked ? <Verdict ok={row?.ok === true} /> : null}
              <div
                aria-label={entry.text}
                className="inline-flex gap-4 rounded-12 bg-canvas p-4"
                role="group"
              >
                {payload.categories.map((category, categoryIndex) => {
                  const pressed = assignments[entry.id] === category.id;
                  return (
                    <button
                      aria-pressed={pressed}
                      className={cn(
                        'min-h-36 cursor-pointer rounded-9 border-0 px-12 text-13',
                        pressed
                          ? 'bg-ink font-700 text-white'
                          : 'bg-transparent font-500 text-ink-muted',
                      )}
                      data-testid={`categorization-choice-${String(itemIndex + 1)}-${String(
                        categoryIndex + 1,
                      )}`}
                      disabled={locked}
                      key={category.id}
                      onClick={() => {
                        assign(entry.id, category.id);
                      }}
                      type="button"
                    >
                      {category.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      <Button
        className="self-start"
        data-testid="categorization-verify"
        disabled={locked || !complete}
        onClick={verify}
        variant="dark"
      >
        {t.categorization.verify}
      </Button>
      <div aria-live="polite">
        <GameCorrection explanation={state.explanation} />
      </div>
    </div>
  );
}
