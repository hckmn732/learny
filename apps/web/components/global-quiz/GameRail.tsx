'use client';

import { useEffect, useRef } from 'react';

import type { ReviewItemDto } from '@learny/contracts';
import { fr } from '@learny/i18n/fr/globalQuiz';

const t = fr.globalQuiz;

type RailStatus = 'done' | 'current' | 'upcoming';

const STATUS_STYLE: Record<RailStatus, string> = {
  done: 'bg-green-soft text-green-ink',
  current: 'bg-ink text-white',
  upcoming: 'bg-surface-muted text-ink-muted',
};

const NUMBER_STYLE: Record<RailStatus, string> = {
  done: 'bg-ink text-lime',
  current: 'bg-lime text-ink',
  upcoming: 'bg-surface-muted text-ink-muted',
};

export interface GameRailProps {
  items: ReviewItemDto[];
  currentPosition: number;
  onSelect: (position: number) => void;
}

function statusOf(item: ReviewItemDto, currentPosition: number): RailStatus {
  if (item.state !== 'todo') return 'done';
  return item.position === currentPosition ? 'current' : 'upcoming';
}

/**
 * SCR-10 §10.4 — rail of the games (SPEC-701 EF-6). A click displays the game, an answered game
 * stays readable with its correction; the current item carries `aria-current="step"`.
 */
export function GameRail(props: GameRailProps) {
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const node = currentRef.current;
    if (node !== null && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }, [props.currentPosition]);

  return (
    <nav
      aria-label={t.rail.label}
      className="flex flex-row gap-4 overflow-x-auto rounded-24 border border-solid border-border bg-surface p-10 sm:flex-col sm:overflow-visible"
      data-testid="gq-rail"
    >
      {props.items.map((item, index) => {
        const status = statusOf(item, props.currentPosition);
        const current = item.position === props.currentPosition;
        return (
          <button
            aria-current={current ? 'step' : undefined}
            className={`flex min-h-56 w-full min-w-[240px] cursor-pointer items-center gap-12 rounded-16 border-0 px-10 py-8 text-left font-sans text-ink [scroll-snap-align:center] sm:min-w-0 ${
              current ? 'bg-surface-muted' : 'bg-transparent'
            }`}
            data-testid={`gq-rail-item-${String(index + 1)}`}
            ref={current ? currentRef : undefined}
            key={item.position}
            onClick={() => {
              props.onSelect(item.position);
            }}
            type="button"
          >
            <span
              aria-hidden="true"
              className={`flex h-34 w-34 flex-none items-center justify-center rounded-10 font-display font-600 ${NUMBER_STYLE[status]}`}
            >
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="text-14 font-600 text-ink">{item.name}</span>
              <span className="text-12 text-ink-muted">{item.displayLabel}</span>
              {item.reason === null ? null : (
                <span
                  className="text-11 font-700 text-orange-ink"
                  data-testid="global-quiz-rail-reason"
                >
                  {item.reason.label}
                </span>
              )}
            </span>
            <span
              className={`flex-none rounded-full px-8 py-3 text-11 font-700 ${STATUS_STYLE[status]}`}
            >
              {t.rail.status[status]}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
