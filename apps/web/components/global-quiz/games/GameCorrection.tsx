'use client';

import type { ReactNode } from 'react';

import {
  ReviewAnswerResultDtoSchema,
  ReviewGameCorrectionSchema,
  type ReviewGameCorrection,
  type ReviewItemDto,
} from '@learny/contracts';

import { fr } from '../../../messages/fr';

const t = fr.globalQuiz.games;

/** Correction of one game, parsed from the `result` of the session DTO (ET-2, EF-7). */
export interface GameResult {
  correction: ReviewGameCorrection | null;
  explanation: string | null;
  isCorrect: boolean | null;
  /** True as soon as an answer is recorded, even a skip (read-only, controls disabled). */
  locked: boolean;
}

export function gameResultOf(item: ReviewItemDto, result: unknown): GameResult {
  const parsed = ReviewAnswerResultDtoSchema.safeParse(result);
  const correction = parsed.success
    ? ReviewGameCorrectionSchema.safeParse(parsed.data.correction)
    : null;
  return {
    correction: correction?.success === true ? correction.data : null,
    explanation: parsed.success ? parsed.data.explanation : null,
    isCorrect: parsed.success ? parsed.data.isCorrect : null,
    locked: item.state !== 'todo',
  };
}

export const CORRECT_TILE = 'border-[1.5px] border-solid border-teal bg-green-soft text-green-ink';
export const WRONG_TILE =
  'border-[1.5px] border-solid border-orange bg-orange-soft text-orange-ink';

/**
 * BR-MEM-10 — explanation of the brick after verification, in the live region of the game.
 * Rendered only when the payload carries one, under the expected-answer lines of the game.
 */
export function GameCorrection(props: { explanation: string | null }): ReactNode {
  if (props.explanation === null || props.explanation.trim() === '') return null;
  return (
    <p
      className="m-0 rounded-12 bg-canvas px-14 py-12 text-14 leading-1.6 text-ink-secondary"
      data-testid="game-explanation"
    >
      <strong className="font-700 text-ink">{t.explanation}</strong> {props.explanation}
    </p>
  );
}

/** Visually hidden verdict: colour is never the only signal (ET-8, WCAG 1.4.1). */
export function Verdict(props: { ok: boolean }): ReactNode {
  return <span className="sr-only">{props.ok ? t.correct : t.wrong}</span>;
}
