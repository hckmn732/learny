'use client';

import { Fragment, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

import type { PublicPayload } from '@learny/bricks';
import type { ReviewClozeResponse, ReviewItemDto } from '@learny/contracts';
import { Button, cn } from '@learny/ui';
import { colors } from '@learny/ui/tokens';

import { fr } from '../../../messages/fr';

import { GameCorrection, gameResultOf } from './GameCorrection';

const t = fr.globalQuiz.games;
const TOKEN = /^\{\{(\d+)\}\}$/u;

export interface ClozeGameProps {
  item: ReviewItemDto;
  result: unknown;
  pending?: boolean;
  onSubmit: (response: ReviewClozeResponse) => void;
}

function gapLabel(index: number): string {
  return t.cloze.labels[index] ?? t.cloze.numbered(index + 1);
}

/** « tuile et interne », « a, b et c » — French separators of the expected answers. */
function ExpectedAnswers(props: { answers: readonly string[] }): ReactNode {
  const { answers } = props;
  if (answers.length === 0) return null;
  return (
    <p className="m-0 rounded-12 bg-canvas px-14 py-12 text-14" data-testid="cloze-expected">
      {answers.length === 1 ? t.cloze.expectedSingle : t.cloze.expectedMultiple}{' '}
      {answers.map((answer, index) => (
        <Fragment key={`${answer}-${String(index)}`}>
          <strong className="font-700 text-ink">{answer}</strong>
          {index < answers.length - 1 ? (index === answers.length - 2 ? t.cloze.and : ', ') : '.'}
        </Fragment>
      ))}
    </p>
  );
}

/**
 * SCR-10 §10.5, EF-4 — texte à trous without any choice list. The template of the brick is cut
 * around its `{{n}}` tokens; the expected answers only appear after verification (BR-MEM-05).
 */
export function ClozeGame(props: ClozeGameProps): ReactNode {
  const { item, result, pending = false, onSubmit } = props;
  const payload = item.payload as PublicPayload<'cloze'>;
  const state = gameResultOf(item, result);
  const locked = state.locked || pending;
  const correction = state.correction?.kind === 'cloze' ? state.correction : null;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const values = useMemo<Record<string, string>>(() => {
    if (correction === null) return draft;
    return Object.fromEntries(correction.gaps.map((gap) => [gap.gapId, gap.given ?? '']));
  }, [correction, draft]);
  const gapByNumber = useMemo(
    () => new Map(correction?.gaps.map((gap) => [gap.gapId, gap]) ?? []),
    [correction],
  );
  const gapIds = payload.gaps.map((gap) => gap.id);
  const complete = payload.gaps.every((gap) => (values[String(gap.id)] ?? '').trim() !== '');
  const parts = payload.template.split(/(\{\{\d+\}\})/u);

  function setValue(gapId: number, value: string): void {
    if (locked) return;
    setDraft({ ...draft, [String(gapId)]: value });
  }

  function verify(): void {
    if (locked || !complete) return;
    onSubmit({
      gaps: payload.gaps.map((gap) => ({
        gapId: String(gap.id),
        value: values[String(gap.id)] ?? '',
      })),
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number): void {
    if (event.key !== 'Enter') return;
    if (index !== gapIds.length - 1) return;
    if (locked || !complete) return;
    event.preventDefault();
    verify();
  }

  return (
    <div className="flex flex-col gap-16" data-testid="game-cloze">
      <p className="m-0 text-15 text-ink-muted">{t.cloze.instruction}</p>
      <p
        className="m-0 font-display text-24 leading-[2] font-500 text-ink"
        data-testid="cloze-text"
      >
        {parts.map((part, partIndex) => {
          const match = TOKEN.exec(part);
          if (match === null) {
            return <Fragment key={`text-${String(partIndex)}`}>{part}</Fragment>;
          }
          const gapId = Number(match[1]);
          const gapIndex = gapIds.indexOf(gapId);
          const gapCorrection = gapByNumber.get(String(gapId));
          const checked = correction !== null;
          const ok = gapCorrection?.ok === true;
          return (
            <input
              aria-label={gapLabel(gapIndex < 0 ? gapId - 1 : gapIndex)}
              className={cn(
                'mx-4 inline-block min-h-44 w-150 rounded-10 border-0 px-12 text-center font-sans text-20 font-600 text-ink',
                checked ? (ok ? 'bg-green-soft' : 'bg-orange-soft') : 'bg-canvas',
              )}
              data-testid={`cloze-gap-${String(gapId)}`}
              disabled={locked}
              key={`gap-${String(gapId)}`}
              maxLength={120}
              onChange={(event) => {
                setValue(gapId, event.currentTarget.value);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, gapIndex);
              }}
              style={{
                boxShadow: checked
                  ? `inset 0 -2px 0 ${ok ? colors.teal : colors.orange}`
                  : `inset 0 -2px 0 ${colors.ink}`,
              }}
              type="text"
              value={values[String(gapId)] ?? ''}
            />
          );
        })}
      </p>
      <div aria-live="polite" className="flex flex-col gap-12">
        {correction === null ? null : (
          <ExpectedAnswers answers={correction.gaps.map((gap) => gap.expected)} />
        )}
        <GameCorrection explanation={state.explanation} />
      </div>
      <Button
        className="self-start"
        data-testid="cloze-verify"
        disabled={locked || !complete}
        onClick={verify}
        variant="dark"
      >
        {t.cloze.verify}
      </Button>
    </div>
  );
}
