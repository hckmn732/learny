import { describe, expect, it } from 'vitest';

import { BRICK_A, BRICK_B } from '../example-ids';
import type { InstructionPayload } from '../instruction/schema';

import { computeActivityScore, computeExerciseScore, ScoringItemUnknownError } from './compute';
import type { ScoringPayload } from './schema';

function equalScoring(): ScoringPayload {
  return {
    total: 100,
    threshold: 80,
    mode: 'equal',
    weights: [],
    display: 'percent',
    sources: [],
  };
}

function weightedScoring(): ScoringPayload {
  return {
    total: 20,
    threshold: 12,
    mode: 'weighted',
    weights: [
      { brickId: BRICK_A, points: 5 },
      { brickId: BRICK_B, points: 15 },
    ],
    display: 'points',
    sources: [],
  };
}

const twelve = Array.from({ length: 12 }, (_, index) => ({
  brickId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  score: index < 9 ? 1 : 0,
}));

function instruction(): InstructionPayload {
  return {
    title: 'Saisir une pièce équilibrée',
    taskMd: 'Complétez le tableau de la pièce comptable avec les montants demandés.',
    data: ['Montant : 120 €'],
    deliverable: 'Une pièce équilibrée.',
    production: {
      kind: 'table',
      fields: [],
      columns: [{ key: 'montant', label: 'Montant', type: 'number' }],
      minRows: 1,
      maxRows: 5,
      initialRows: 2,
      checks: [],
    },
    explanationPrompt: null,
    hints: ['Commencez par le débit.', 'Vérifiez le total.'],
    criteria: [
      { key: 'c1', label: 'Critère 1', points: 2, description: 'Premier critère.' },
      { key: 'c2', label: 'Critère 2', points: 2, description: 'Deuxième critère.' },
      { key: 'c3', label: 'Critère 3', points: 2, description: 'Troisième critère.' },
      { key: 'c4', label: 'Critère 4', points: 2, description: 'Quatrième critère.' },
      { key: 'c5', label: 'Critère 5', points: 2, description: 'Cinquième critère.' },
    ],
    estimatedMinutes: 20,
    passPoints: 8,
    sources: [],
  };
}

describe('[SPEC-502] barème d’activité', () => {
  it('donne 75 % pour 9 justes sur 12 à parts égales (CA-5)', () => {
    const score = computeActivityScore(twelve, equalScoring());
    expect(score.points).toBe(75);
    expect(score.percent).toBe(75);
    expect(score.passed).toBe(false);
    expect(score.perItem).toHaveLength(12);
    expect(score.perItem[0]?.max).toBe(8.33);
    expect(score.perItem[0]?.points).toBe(8.33);
    expect(score.perItem[9]?.points).toBe(0);
  });

  it('compte une question ouverte au prorata de sa part', () => {
    const score = computeActivityScore(
      [
        { brickId: BRICK_A, score: 1 },
        { brickId: BRICK_B, score: 0.5 },
      ],
      equalScoring(),
    );
    expect(score.points).toBe(75);
    expect(score.percent).toBe(75);
    expect(score.perItem[1]).toEqual({ brickId: BRICK_B, points: 25, max: 50 });
  });

  it('applique les poids du mode weighted', () => {
    const score = computeActivityScore(
      [
        { brickId: BRICK_A, score: 1 },
        { brickId: BRICK_B, score: 0.5 },
      ],
      weightedScoring(),
    );
    expect(score.points).toBe(12.5);
    expect(score.percent).toBe(63);
    expect(score.passed).toBe(true);
  });

  it('refuse un élément absent des poids (SCORING_ITEM_UNKNOWN)', () => {
    expect(() =>
      computeActivityScore(
        [{ brickId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', score: 1 }],
        weightedScoring(),
      ),
    ).toThrow(ScoringItemUnknownError);
    try {
      computeActivityScore(
        [{ brickId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', score: 1 }],
        weightedScoring(),
      );
    } catch (error) {
      expect((error as ScoringItemUnknownError).code).toBe('SCORING_ITEM_UNKNOWN');
    }
  });

  it('borne les scores hors [0, 1] et arrondit les points', () => {
    const score = computeActivityScore(
      [
        { brickId: BRICK_A, score: 2 },
        { brickId: BRICK_B, score: -1 },
      ],
      equalScoring(),
    );
    expect(score.points).toBe(50);
    expect(score.percent).toBe(50);
  });

  it('gère une activité vide sans division par zéro', () => {
    const score = computeActivityScore([], equalScoring());
    expect(score).toEqual({ points: 0, percent: 0, passed: false, perItem: [] });
  });
});

describe('[SPEC-502] note d’exercice', () => {
  it('donne 8/10 pour 5 critères réussis et 2 indices (CA-5)', () => {
    const score = computeExerciseScore(
      [
        { key: 'c1', ok: true },
        { key: 'c2', ok: true },
        { key: 'c3', ok: true },
        { key: 'c4', ok: true },
        { key: 'c5', ok: true },
      ],
      2,
      instruction(),
    );
    expect(score).toEqual({ points: 8, max: 10, passed: true, verdict: 'Réussi' });
  });

  it('borne les indices déclarés à 0..2 (CL-9)', () => {
    const criteria = [
      { key: 'c1', ok: true },
      { key: 'c2', ok: true },
      { key: 'c3', ok: true },
      { key: 'c4', ok: true },
      { key: 'c5', ok: true },
    ];
    expect(computeExerciseScore(criteria, 3, instruction()).points).toBe(8);
    expect(computeExerciseScore(criteria, -4, instruction()).points).toBe(10);
  });

  it('ne rend jamais une note négative', () => {
    const score = computeExerciseScore([], 2, instruction());
    expect(score.points).toBe(0);
  });

  it('respecte le seuil et le verdict', () => {
    const brick = { ...instruction(), passPoints: 9 };
    const score = computeExerciseScore(
      [
        { key: 'c1', ok: true },
        { key: 'c2', ok: true },
        { key: 'c3', ok: true },
        { key: 'c4', ok: true },
      ],
      0,
      brick,
    );
    expect(score).toMatchObject({ points: 8, passed: false, verdict: 'À retravailler' });
  });

  it('ignore un critère inconnu', () => {
    const score = computeExerciseScore(
      [
        { key: 'inconnu', ok: true },
        { key: 'c1', ok: true },
      ],
      0,
      instruction(),
    );
    expect(score.points).toBe(2);
  });
});
