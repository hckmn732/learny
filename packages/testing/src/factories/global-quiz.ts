// Factory of the demonstration data of the micro-session (SPEC-703 §8.5, SPEC-115 EF-6).
//
// The seed of SPEC-115 gives the recall card « Variante d’exercice » and the cloze « Fiori et
// devises »; when a test needs a question covering several priority notions, these builders
// produce schema-valid payloads, and `createMicroSessionBricks` inserts them through the brick
// factory. Every created row stays in the caller's transaction.

import type { DbTx } from '@learny/db';

import { createBrick, type BrickFactoryOverrides, type FactoryBrick } from './brick';

export interface MicroQuestionPayload {
  stem: string;
  mode: 'single';
  options: { id: string; text: string; correct: boolean; notionId: string; rationale: string }[];
  explanation: string;
  objective: string;
  sources: never[];
}

/** One choice question covering up to four priority notions (ET-3 fallback format). */
export function microChoiceQuestionPayload(
  notionIds: readonly string[],
  label = 'notion prioritaire',
): MicroQuestionPayload {
  const options = notionIds.slice(0, 4).map((notionId, index) => ({
    id: `o${String(index + 1)}`,
    text: index === 0 ? `La ${label} numéro 1` : `La ${label} numéro ${String(index + 1)}`,
    correct: index === 0,
    notionId,
    rationale: 'Une seule réponse couvre la notion prioritaire.',
  }));
  return {
    stem: `Quelle ${label} répond à la question de la micro-séance ?`,
    mode: 'single',
    options,
    explanation: 'La première réponse est la seule correcte pour cette notion prioritaire.',
    objective: 'Reconnaître la notion prioritaire de la micro-séance',
    sources: [],
  };
}

/** Recall card of the most urgent notion (`front` and `back` are the demonstration texts). */
export function microRecallCardPayload(front: string, back: string): unknown {
  return {
    front,
    back,
    sourceLabel: 'votre cours du module 1, chapitre 1',
    sources: [],
  };
}

export interface MicroSessionBrickOverrides {
  ownerId: string;
  formationId: string;
  /** Card notion first, then the notions covered by the question. */
  cardNotionId: string;
  questionNotionIds: readonly string[];
}

export interface MicroSessionBricks {
  card: FactoryBrick;
  question: FactoryBrick;
}

/**
 * Creates the two bricks of a micro-session fixture: one recall card on the most urgent notion and
 * one choice question covering the other priority notions (the fallback of ET-3 while
 * `GAMES_ENABLED` is false).
 */
export async function createMicroSessionBricks(
  tx: DbTx,
  overrides: MicroSessionBrickOverrides,
): Promise<MicroSessionBricks> {
  const base: Pick<BrickFactoryOverrides, 'ownerId' | 'formationId' | 'purpose'> = {
    ownerId: overrides.ownerId,
    formationId: overrides.formationId,
    purpose: 'review',
  };
  const card = await createBrick(tx, {
    ...base,
    type: 'recall_card',
    notionIds: [overrides.cardNotionId],
    payload: microRecallCardPayload(
      'Que définit une variante d’exercice comptable ?',
      'Le nombre de périodes comptables d’un exercice, et leurs dates de début et de fin.',
    ),
  });
  const question = await createBrick(tx, {
    ...base,
    type: 'choice_question',
    notionIds: overrides.questionNotionIds,
    payload: microChoiceQuestionPayload(overrides.questionNotionIds),
  });
  return { card, question };
}
