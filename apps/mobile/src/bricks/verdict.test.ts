// Vitest [SPEC-3301] — the verdict a view shows agrees with `gradeBrick` (CA-2, BR-MEM-10).
import { describe, expect, it } from 'vitest';

import type { AutoGradedType, BrickPayload } from '@learny/bricks';
import { AUTO_GRADED_TYPES, brickExamples, gradeBrick } from '@learny/bricks';

import { correctResponseFor } from './showcase';
import { correctionIsCorrect } from './verdict';

const SEED = '00000000-0000-4000-8000-000000003301';

describe('[SPEC-3301] verdict affiché par un rendu', () => {
  it('[SPEC-3301] une bonne réponse donne « Exact. » pour les six types corrigés (CA-2)', () => {
    for (const type of AUTO_GRADED_TYPES) {
      const payload = brickExamples[type].valid;
      const outcome = gradeBrick(
        type,
        payload as BrickPayload<AutoGradedType>,
        correctResponseFor(type, payload, SEED),
        SEED,
      );
      expect(outcome.ok, type).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.value.isCorrect, type).toBe(true);
      expect(correctionIsCorrect(outcome.value.correction), type).toBe(true);
    }
  });

  it('[SPEC-3301] le verdict de la correction suit `GradeOutcome.isCorrect` (CA-2)', () => {
    for (const type of AUTO_GRADED_TYPES) {
      const payload = brickExamples[type].valid;
      const wrong = wrongResponseFor(type, payload);
      const outcome = gradeBrick(type, payload as BrickPayload<AutoGradedType>, wrong, SEED);
      expect(outcome.ok, type).toBe(true);
      if (!outcome.ok) continue;
      expect(correctionIsCorrect(outcome.value.correction), type).toBe(outcome.value.isCorrect);
    }
  });

  it('[SPEC-3301] une correction vide ou sans question reste neutre', () => {
    expect(correctionIsCorrect({ kind: 'none' })).toBe(true);
  });
});

/** A deliberately wrong response for each auto-graded type. */
function wrongResponseFor(type: AutoGradedType, payload: unknown): unknown {
  switch (type) {
    case 'choice_question': {
      const charge = payload as BrickPayload<'choice_question'>;
      const wrong = charge.options.find((option) => !option.correct)?.id ?? 'absent';
      return { optionIds: [wrong] };
    }
    case 'cloze': {
      const charge = payload as BrickPayload<'cloze'>;
      const gaps: Record<string, string> = {};
      for (const gap of charge.gaps) gaps[String(gap.id)] = 'réponse fausse';
      return { gaps };
    }
    case 'matching': {
      const charge = payload as BrickPayload<'matching'>;
      const pairs: Record<string, string | null> = {};
      for (const pair of charge.pairs) pairs[pair.id] = null;
      return { pairs };
    }
    case 'ordering': {
      const charge = payload as BrickPayload<'ordering'>;
      return { order: [...charge.items.map((item) => item.id)].reverse() };
    }
    case 'categorization': {
      const charge = payload as BrickPayload<'categorization'>;
      const assignments: Record<string, string | null> = {};
      for (const item of charge.items) assignments[item.id] = null;
      return { assignments };
    }
    case 'recall_card':
      return { selfGrade: 'again' };
  }
}
