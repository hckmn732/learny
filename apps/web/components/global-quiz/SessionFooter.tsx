'use client';

import { fr } from '../../messages/fr';

const t = fr.globalQuiz;

export interface SessionFooterProps {
  isLast: boolean;
  skipDisabled: boolean;
  nextDisabled: boolean;
  pending: boolean;
  onSkip: () => void;
  onNext: () => void;
}

/**
 * SCR-10 §10.5 — footer of the game area (SPEC-701 EF-10): « Passer » and the lime primary
 * button, « Terminer la session » on the last game. Both are disabled until the game is played.
 */
export function SessionFooter(props: SessionFooterProps) {
  return (
    <div
      className="flex flex-wrap justify-between gap-12 border-t border-solid border-divider pt-18"
      data-testid="gq-footer"
    >
      <button
        className="min-h-44 cursor-pointer rounded-12 border-0 bg-transparent px-16 font-sans text-14 font-600 text-ink-muted disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="gq-skip"
        disabled={props.skipDisabled || props.pending}
        onClick={props.onSkip}
        type="button"
      >
        {t.game.skip}
      </button>
      <button
        className="min-h-48 cursor-pointer rounded-14 border-0 bg-lime px-22 font-sans text-15 font-700 text-ink disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="gq-next"
        disabled={props.nextDisabled || props.pending}
        onClick={props.onNext}
        type="button"
      >
        {props.isLast ? t.game.finish : t.game.next}
      </button>
    </div>
  );
}
