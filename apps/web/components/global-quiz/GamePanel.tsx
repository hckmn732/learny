'use client';

import type { RefObject, ReactNode } from 'react';

import type { SelfGrade } from '@learny/bricks/view';
import { BrickRenderer } from '@learny/bricks/view';
import type { ReviewItemDto } from '@learny/contracts';

import { fr } from '../../messages/fr';

import { RecallCardGame } from './RecallCardGame';

const t = fr.globalQuiz;

export interface GamePanelProps {
  item: ReviewItemDto;
  dueLabels?: Partial<Record<SelfGrade, string>> | undefined;
  pending: boolean;
  titleRef: RefObject<HTMLHeadingElement | null>;
  onGrade: (selfRating: SelfGrade) => void;
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
 * SCR-10 §10.5 — game card of the session (SPEC-701 EF-8, EF-9). The recall card is fully
 * playable; the other four games are rendered read-only until SPEC-702, so their solution is
 * never sent nor checked here.
 */
export function GamePanel(props: GamePanelProps) {
  const { item, dueLabels, pending, onGrade, footer, titleRef } = props;
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

      {item.type === 'recall_card' ? (
        <RecallCardGame dueLabels={dueLabels} item={item} onGrade={onGrade} pending={pending} />
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
