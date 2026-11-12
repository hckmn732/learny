import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import {
  FSRS_RATINGS,
  applyReview,
  createNotionCard,
  gradeReview,
  previewGrades,
} from '@learny/learning-engine';
import type { TimedResponse } from '@learny/learning-engine';
import { REFERENCE_NOW } from '@learny/learning-engine/fixtures';
import { buildAnswer, buildCard, atDaysBefore } from '@learny/learning-engine/fixtures/builders';

const RETENTIONS = [0.85, 0.9, 0.95] as const;

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function history(size = 6): TimedResponse[] {
  return Array.from({ length: size }, (_value, index) =>
    buildAnswer({
      answerId: `answer-${String(index)}`,
      timeMs: 20_000,
      answeredAt: atDaysBefore(REFERENCE_NOW, size - index),
    }),
  );
}

describe('[SPEC-402] composition', () => {
  it('enchaîne l’historique, la note, l’application et la prévisualisation', () => {
    const answers = deploymentAnswers();
    const decision = gradeReview({
      correct: true,
      timeMs: 9_000,
      format: 'choice_question',
      history: answers,
      settings: ENGINE.fsrs,
    });
    expect(decision.medianMs).toBe(20_000);
    expect(decision.rating).toBe('easy');

    const card = deepFreeze(createNotionCard(REFERENCE_NOW, ENGINE.fsrs.requestRetention));
    const preview = previewGrades(card, REFERENCE_NOW, ENGINE.fsrs.requestRetention);
    expect(Object.keys(preview)).toEqual(['again', 'hard', 'good', 'easy']);

    const rating = decision.rating ?? 'good';
    const applied = applyReview(card, rating, REFERENCE_NOW, ENGINE.fsrs.requestRetention);
    expect(applied.dueAt).toBe(preview[rating]);
    expect(applied.card.due).toBe(preview[rating]);
    expect(card).toEqual(buildCard({ due: REFERENCE_NOW }));
  });

  it('applique la note d’une carte de rappel choisie par l’apprenant (CL-4)', () => {
    const answer = buildAnswer({
      format: 'recall_card',
      correct: null,
      timeMs: 0,
      selfRating: 'hard',
    });
    const decided = gradeReview({
      correct: answer.correct,
      timeMs: answer.timeMs,
      format: answer.format,
      history: history(),
      selfRating: answer.selfRating,
      settings: ENGINE.fsrs,
    });
    expect(decided.rating).toBe('hard');

    const incomplete = gradeReview({
      correct: null,
      timeMs: 0,
      format: 'recall_card',
      history: history(),
      settings: ENGINE.fsrs,
    });
    expect(incomplete.rating).toBeNull();
    expect(incomplete.reason).toBe('incomplete');
  });

  it('garde les mêmes échéances pour chaque rétention et chaque note (CA-3, CA-4)', () => {
    const card = createNotionCard(REFERENCE_NOW, ENGINE.fsrs.requestRetention);
    const before = structuredClone(card);
    for (const retention of RETENTIONS) {
      const preview = previewGrades(card, REFERENCE_NOW, retention);
      for (const rating of FSRS_RATINGS) {
        expect(applyReview(card, rating, REFERENCE_NOW, retention).dueAt).toBe(preview[rating]);
      }
      expect(previewGrades(card, REFERENCE_NOW, retention)).toEqual(preview);
    }
    expect(card).toEqual(before);
  });

  it('reste invariant à la répétition et accepte les cartes des fabriques', () => {
    const card = deepFreeze(buildCard());
    const first = {
      preview: previewGrades(card, REFERENCE_NOW, 0.9),
      applied: applyReview(card, 'good', REFERENCE_NOW, 0.9),
    };
    for (let index = 0; index < 5; index += 1) {
      expect(previewGrades(card, REFERENCE_NOW, 0.9)).toEqual(first.preview);
      expect(applyReview(card, 'good', REFERENCE_NOW, 0.9)).toEqual(first.applied);
    }
    expect(card).toEqual(buildCard());
  });

  it('ignore les réponses invalides et les autres formats de l’historique (CA-2)', () => {
    const answers = [
      ...history(5),
      buildAnswer({ answerId: 'zero', timeMs: 0, answeredAt: atDaysBefore(REFERENCE_NOW, 7) }),
      buildAnswer({
        answerId: 'negative',
        timeMs: -1_000,
        answeredAt: atDaysBefore(REFERENCE_NOW, 8),
      }),
      buildAnswer({
        answerId: 'cloze',
        format: 'cloze',
        timeMs: 90_000,
        answeredAt: atDaysBefore(REFERENCE_NOW, 9),
      }),
    ];
    const decision = gradeReview({
      correct: true,
      timeMs: 20_000,
      format: 'choice_question',
      history: answers,
      settings: ENGINE.fsrs,
    });
    expect(decision.medianMs).toBe(20_000);
    expect(decision.rating).toBe('good');
  });
});

/** Answers of the reference learner, oldest first, built with the shared fixtures. */
function deploymentAnswers(): TimedResponse[] {
  return [
    buildAnswer({
      answerId: 'a-1',
      timeMs: 18_000,
      answeredAt: atDaysBefore(REFERENCE_NOW, 5),
    }),
    buildAnswer({
      answerId: 'a-2',
      timeMs: 20_000,
      answeredAt: atDaysBefore(REFERENCE_NOW, 4),
    }),
    buildAnswer({
      answerId: 'a-3',
      timeMs: 22_000,
      answeredAt: atDaysBefore(REFERENCE_NOW, 3),
    }),
    buildAnswer({
      answerId: 'a-4',
      timeMs: 20_000,
      answeredAt: atDaysBefore(REFERENCE_NOW, 2),
    }),
    buildAnswer({
      answerId: 'a-5',
      timeMs: 20_000,
      answeredAt: atDaysBefore(REFERENCE_NOW, 1),
    }),
  ];
}
