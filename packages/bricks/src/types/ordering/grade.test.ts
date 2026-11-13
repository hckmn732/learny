import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { gradeOrdering } from './grade';
import type { OrderingPayload } from './schema';

const payload: OrderingPayload = {
  instruction: 'Remettez les étapes dans l’ordre.',
  items: [
    { id: 'a', text: 'Enregistrer' },
    { id: 'b', text: 'Justifier' },
    { id: 'c', text: 'Arrêter' },
  ],
  explanation: 'La clôture suit l’enregistrement, la justification puis l’arrêté.',
  sources: [],
};

function scoreOf(order: string[]) {
  const graded = gradeOrdering(payload, { order });
  if (!graded.ok) throw new Error(graded.error.issues.map((issue) => issue.message).join(' '));
  return graded.value;
}

describe('[SPEC-502] correction d’une remise en ordre', () => {
  const cases: Array<{
    name: string;
    order: string[];
    correctPositions: number;
    isCorrect: boolean;
  }> = [
    { name: 'ordre exact', order: ['a', 'b', 'c'], correctPositions: 3, isCorrect: true },
    { name: 'ordre inversé', order: ['c', 'b', 'a'], correctPositions: 1, isCorrect: false },
    {
      name: 'deux éléments échangés',
      order: ['b', 'a', 'c'],
      correctPositions: 1,
      isCorrect: false,
    },
    { name: 'rotation', order: ['b', 'c', 'a'], correctPositions: 0, isCorrect: false },
    {
      name: 'seul le premier est juste',
      order: ['a', 'c', 'b'],
      correctPositions: 1,
      isCorrect: false,
    },
  ];

  it.each(cases)('$name', ({ order, correctPositions, isCorrect }) => {
    const graded = scoreOf(order);
    expect(graded.isCorrect).toBe(isCorrect);
    expect(graded.score).toBe(Math.round((correctPositions / 3) * 10_000) / 10_000);
    expect(graded.correction.positions.filter((position) => position.correct)).toHaveLength(
      correctPositions,
    );
    expect(graded.feedbackTitle).toBe(isCorrect ? 'Exact.' : 'Pas tout à fait.');
  });

  it('expose les écarts attendus et donnés (EF-1)', () => {
    const graded = scoreOf(['c', 'b', 'a']);
    expect(graded.correction).toEqual({
      kind: 'ordering',
      explanation: 'La clôture suit l’enregistrement, la justification puis l’arrêté.',
      positions: [
        { id: 'a', text: 'Enregistrer', expectedIndex: 0, givenIndex: 2, correct: false },
        { id: 'b', text: 'Justifier', expectedIndex: 1, givenIndex: 1, correct: true },
        { id: 'c', text: 'Arrêter', expectedIndex: 2, givenIndex: 0, correct: false },
      ],
    });
  });

  it('refuse un identifiant inconnu, manquant ou dupliqué (CL-6)', () => {
    for (const order of [
      ['a', 'b', 'z'],
      ['a', 'b'],
      ['a', 'a', 'b'],
      ['a', 'b', 'c', 'd'],
    ]) {
      const graded = gradeOrdering(payload, { order });
      expect(graded.ok).toBe(false);
      if (!graded.ok) expect(graded.error.code).toBe('RESPONSE_INVALID');
    }
  });

  it('refuse une réponse sans tableau d’ordre', () => {
    const graded = gradeOrdering(payload, { order: 'abc' });
    expect(graded.ok).toBe(false);
  });

  it('propriété : l’ordre exact donne toujours 1 (fast-check)', () => {
    const itemId = fc.stringMatching(/^[a-z0-9]{1,8}$/u);
    const items = fc.uniqueArray(itemId, { minLength: 3, maxLength: 6 });
    fc.assert(
      fc.property(items, (ids) => {
        const generated: OrderingPayload = {
          ...payload,
          items: ids.map((id) => ({ id, text: `Étape ${id}` })),
        };
        const graded = gradeOrdering(generated, { order: ids });
        return graded.ok && graded.value.isCorrect && graded.value.score === 1;
      }),
    );
  });
});
