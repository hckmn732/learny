'use client';

import { useId, useState, type KeyboardEvent } from 'react';

import { Button, Select, cn } from '@learny/ui';

import type { CorrectionView } from '../../correction-view';
import { resolveLabels } from '../../view/labels';
import { QuestionHeader } from '../../view/question-header';
import type { BrickViewProps } from '../../view-types';

function correctionByPair(
  correction: CorrectionView<'matching'> | undefined,
): Map<string, boolean> | null {
  if (!correction) return null;
  return new Map(correction.pairs.map((pair) => [pair.pairId, pair.correct]));
}

/** Matching: selects in quiz, numbered tiles in game (SPEC-503 EF-5). */
export function MatchingView(props: BrickViewProps<'matching'>) {
  const {
    brick,
    variant,
    value,
    onChange,
    status,
    correction,
    onCheck,
    onReset,
    labelledBy,
    labels,
  } = props;
  const t = resolveLabels(labels);
  const generatedId = useId();
  const titleId = labelledBy ?? generatedId;
  const payload = brick.publicPayload;
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const pairs = value?.pairs ?? {};
  const game = variant === 'game';
  const locked = status === 'locked' || status === 'corrected' || variant === 'review';
  const corrected = status === 'corrected' || variant === 'review';
  const correctionMap = corrected ? correctionByPair(correction) : null;
  const checking = status === 'checking';

  function assign(pairId: string, rightId: string | null) {
    if (locked || !onChange) return;
    const next = { ...pairs };
    if (rightId !== null) {
      for (const key of Object.keys(next)) {
        if (next[key] === rightId) next[key] = null;
      }
      next[pairId] = rightId;
    } else {
      next[pairId] = null;
    }
    onChange({ pairs: next });
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setSelectedLeft(null);
    }
  }

  if (!game) {
    return (
      <section
        aria-labelledby={titleId}
        className="flex flex-col gap-18"
        data-testid="brick-matching"
      >
        <QuestionHeader
          labels={labels}
          labelledBy={titleId}
          notionLabels={brick.notionLabels}
          stem={payload.instruction}
          typeLabel={t.type('matching')}
          variant={variant}
        />
        <div className="flex flex-col gap-10">
          {payload.lefts.map((left) => {
            const state = correctionMap?.get(left.id);
            return (
              <div
                className={cn(
                  'flex flex-wrap items-center gap-12 rounded-18 px-14 py-12',
                  state === true
                    ? 'border-2 border-teal bg-green-soft'
                    : state === false
                      ? 'border-2 border-orange bg-orange-soft'
                      : 'border border-solid border-border bg-surface-subtle',
                )}
                key={left.id}
                data-testid={`brick-match-row-${left.id}`}
              >
                <span className="flex-1 basis-170 font-display text-18 font-600 text-ink">
                  {left.text}
                </span>
                <Select
                  className="min-w-260 flex-1"
                  data-testid={`brick-match-${left.id}`}
                  disabled={locked}
                  hideLabel
                  label={left.text}
                  onChange={(event) => {
                    const rightId = event.currentTarget.value;
                    assign(left.id, rightId === '' ? null : rightId);
                  }}
                  options={[
                    { value: '', label: t.choose },
                    ...payload.rights.map((right) => ({ value: right.id, label: right.text })),
                  ]}
                  value={pairs[left.id] ?? ''}
                />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const connected = Object.entries(pairs).filter(([, rightId]) => rightId !== null);
  const complete = connected.length === payload.lefts.length;

  return (
    // The Escape shortcut is scoped to the whole association game (CL-5), not to one tile.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-16"
      data-testid="brick-matching"
      onKeyDown={onKeyDown}
    >
      <QuestionHeader
        labels={labels}
        labelledBy={titleId}
        notionLabels={brick.notionLabels}
        stem={payload.instruction}
        typeLabel={t.type('matching')}
        variant={variant}
      />
      <p className="m-0 text-15 text-ink-muted">{t.matchingHelp}</p>
      <div className="grid grid-cols-1 gap-12 min-[640px]:grid-cols-2 min-[640px]:gap-x-20">
        <div className="flex flex-col gap-10">
          {payload.lefts.map((left, index) => {
            const state = correctionMap?.get(left.id);
            return (
              <button
                aria-pressed={selectedLeft === left.id}
                className={cn(
                  'flex min-h-64 w-full cursor-pointer items-center gap-12 rounded-16 border border-solid px-14 py-12 text-left text-15 font-600 text-ink disabled:cursor-not-allowed',
                  state === true
                    ? 'border-teal bg-green-soft text-green-ink'
                    : state === false
                      ? 'border-orange bg-orange-soft text-orange-ink'
                      : selectedLeft === left.id
                        ? 'border-2 border-ink bg-canvas'
                        : 'border-border-strong bg-surface',
                )}
                data-testid={`brick-match-left-${left.id}`}
                disabled={locked}
                key={left.id}
                onClick={() => {
                  setSelectedLeft(selectedLeft === left.id ? null : left.id);
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-28 shrink-0 items-center justify-center rounded-8 bg-ink text-13 font-700 text-white"
                >
                  {String(index + 1)}
                </span>
                <span className="break-words">{left.text}</span>
                {state !== undefined ? (
                  <span className="sr-only">
                    {state ? ' — relié correctement' : ' — relié incorrectement'}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-10">
          {payload.rights.map((right) => {
            const owner = payload.lefts.find((left) => pairs[left.id] === right.id);
            const ownerIndex = owner ? payload.lefts.indexOf(owner) + 1 : null;
            const ownerState = owner ? correctionMap?.get(owner.id) : undefined;
            return (
              <button
                className={cn(
                  'flex min-h-64 w-full cursor-pointer items-center gap-12 rounded-16 border border-solid px-14 py-12 text-left text-15 font-600 text-ink disabled:cursor-not-allowed',
                  ownerState === true
                    ? 'border-teal bg-green-soft text-green-ink'
                    : ownerState === false
                      ? 'border-orange bg-orange-soft text-orange-ink'
                      : owner
                        ? 'border-ink bg-canvas'
                        : 'border-dashed border-border-dashed bg-surface',
                )}
                data-testid={`brick-match-right-${right.id}`}
                disabled={locked || selectedLeft === null}
                key={right.id}
                onClick={() => {
                  if (selectedLeft !== null) {
                    assign(selectedLeft, right.id);
                    setSelectedLeft(null);
                  }
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-28 shrink-0 items-center justify-center rounded-8 text-13 font-700',
                    owner
                      ? 'bg-ink text-white'
                      : 'border border-dashed border-border-dashed text-ink-muted',
                  )}
                >
                  {ownerIndex ?? ''}
                </span>
                <span className="break-words">{right.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-8">
        <Button
          data-testid="brick-check"
          disabled={checking || !complete}
          onClick={onCheck}
          size="md"
          variant="dark"
        >
          {checking ? t.checking : t.verifyMatching}
        </Button>
        <Button
          data-testid="brick-reset"
          disabled={checking}
          onClick={() => {
            setSelectedLeft(null);
            onReset?.();
            if (!onReset && onChange) onChange({ pairs: {} });
          }}
          size="md"
          variant="outline"
        >
          {t.reset}
        </Button>
      </div>
    </section>
  );
}
