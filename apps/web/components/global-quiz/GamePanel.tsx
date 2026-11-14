'use client';

import type { RefObject, ReactNode } from 'react';

import type { SelfGrade } from '@learny/bricks/view';
import { BrickRenderer } from '@learny/bricks/view';
import type { ReviewItemDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { CategorizationGame } from './games/CategorizationGame';
import { ClozeGame } from './games/ClozeGame';
import { MatchingGame } from './games/MatchingGame';
import { OrderingGame } from './games/OrderingGame';
import { RecallCardGame } from './RecallCardGame';

const t = fr.globalQuiz;

export interface GamePanelProps {
  item: ReviewItemDto;
  dueLabels?: Partial<Record<SelfGrade, string>> | undefined;
  pending: boolean;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onGrade: (selfRating: SelfGrade) => void;
  /** Answer of one of the four games of SPEC-702, sent to `POST review-sessions/:sid/answers`. */
  onAnswer?: (response: unknown) => void;
  /** Footer of the game card (« Passer » / « Suivant »), rendered inside the same card. */
  footer?: ReactNode;
}

function resultText(item: ReviewItemDto): string {
  if (item.state === 'skipped') return t.game.skipped;
  if (item.state === 'answered') return t.game.correct;
  if (item.state === 'withdrawn') return '';
  return '';
}

/**
 * SCR-10 §10.5 — game card of the session (SPEC-701 EF-8, EF-9; SPEC-702 EF-1 to EF-5). The
 * recall card and the four other games are fully playable; a withdrawn item shows the unavailable
 * message and lets « Suivant » advance (CL-7).
 */
export function GamePanel(props: GamePanelProps) {
  const { item, dueLabels, pending, onGrade, onAnswer, footer, titleRef } = props;
  return (
    <section
      aria-labelledby="gq-game-title"
      className="flex min-w-0 flex-[999_1_560px] flex-col gap-22 rounded-24 border border-solid border-border bg-surface p-28"
      data-testid="gq-game"
    >
      <div className="flex flex-wrap items-center justify-between gap-12">
        <div className="flex flex-col gap-6">
          <h2
            className="m-0 font-display text-24 font-600 tracking-heading text-ink outline-none"
            data-testid="gq-game-title"
            id="gq-game-title"
            ref={titleRef}
            tabIndex={-1}
          >
            {item.name}
          </h2>
          <p className="m-0 text-14 text-ink-muted">
            {item.displayLabel} · {item.scopeLabel}
          </p>
        </div>
        <span
          aria-label={t.game.techLabel(item.tech)}
          className="rounded-full bg-violet-soft px-12 py-6 text-12 font-700 text-violet-ink"
          data-testid="gq-game-tech"
        >
          {item.tech}
        </span>
      </div>

      {item.state === 'withdrawn' ? (
        <p
          className="m-0 rounded-16 border border-solid border-orange bg-orange-soft px-16 py-12 text-14 text-orange-ink"
          data-testid="gq-game-unavailable"
          role="status"
        >
          {t.games.unavailable}
        </p>
      ) : item.type === 'recall_card' ? (
        <RecallCardGame dueLabels={dueLabels} item={item} onGrade={onGrade} pending={pending} />
      ) : item.type === 'matching' ? (
        <MatchingGame
          item={item}
          key={item.brickVersionId}
          onSubmit={(response) => {
            onAnswer?.(response);
          }}
          pending={pending}
          result={item.result}
        />
      ) : item.type === 'ordering' ? (
        <OrderingGame
          item={item}
          key={item.brickVersionId}
          onSubmit={(response) => {
            onAnswer?.(response);
          }}
          pending={pending}
          result={item.result}
        />
      ) : item.type === 'categorization' ? (
        <CategorizationGame
          item={item}
          key={item.brickVersionId}
          onSubmit={(response) => {
            onAnswer?.(response);
          }}
          pending={pending}
          result={item.result}
        />
      ) : item.type === 'cloze' ? (
        <ClozeGame
          item={item}
          key={item.brickVersionId}
          onSubmit={(response) => {
            onAnswer?.(response);
          }}
          pending={pending}
          result={item.result}
        />
      ) : (
        <div className="flex flex-col gap-12">
          <BrickRenderer
            brick={{
              versionId: item.brickVersionId,
              type: item.type,
              notionLabels: [],
              publicPayload: item.payload as never,
            }}
            status="locked"
            value={null}
            variant="review"
          />
          <p className="m-0 text-13 text-ink-muted">{t.game.readOnly}</p>
        </div>
      )}

      <p aria-live="polite" className="sr-only" data-testid="gq-answer-status">
        {resultText(item)}
      </p>
      {footer}
    </section>
  );
}
