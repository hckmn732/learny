import { describe, expect, it } from 'vitest';

import { ExerciseInstructionSchema, type ExerciseInstruction } from '@learny/contracts';

import { gradeExercise, normalizeTutorCorrection, type ExerciseTutor } from './grade-exercise';

const NEXT_STEP = { label: 'Prochaine étape : consolider la notion.', href: '/programme' };

function instruction(): ExerciseInstruction {
  return ExerciseInstructionSchema.parse({
    title: 'Saisir une pièce équilibrée',
    taskMd: 'Saisissez la pièce comptable correspondante et expliquez la partie double.',
    data: [],
    deliverable: 'Un tableau équilibré.',
    production: {
      kind: 'table',
      fields: [],
      columns: [
        {
          key: 'cle',
          label: 'Clé',
          type: 'select',
          options: [
            { value: '40', label: '40 · débit' },
            { value: '50', label: '50 · crédit' },
          ],
        },
        { key: 'montant', label: 'Montant', type: 'number' },
      ],
      minRows: 2,
      maxRows: 2,
      initialRows: 2,
      checks: [
        {
          type: 'sum_equal',
          numberColumn: 'montant',
          groupColumn: 'cle',
          left: ['40'],
          right: ['50'],
        },
      ],
    },
    explanationPrompt: 'Pourquoi une pièce doit-elle être équilibrée ?',
    hints: ['Premier indice', 'Deuxième indice'],
    criteria: [
      { key: 'a', label: 'Poste de charge', points: 2, description: 'Poste juste.' },
      { key: 'b', label: 'Poste de banque', points: 2, description: 'Banque juste.' },
      { key: 'c', label: 'Pièce équilibrée', points: 2, description: 'Totaux égaux.' },
      {
        key: 'd',
        label: 'Type de pièce',
        points: 2,
        description: 'Type SA.',
      },
      {
        key: 'explication',
        label: 'Explication',
        points: 2,
        description: 'Partie double expliquée.',
      },
    ],
    estimatedMinutes: 15,
    passPoints: 8,
    sources: [],
  });
}

const SUBMISSION = {
  kind: 'table',
  fields: {},
  rows: [
    { cle: '40', montant: '120' },
    { cle: '50', montant: '120' },
  ],
  explanation: 'Tout montant débité est crédité ailleurs : le débit égale le crédit.',
};

describe('[SPEC-613] correction de l’exercice', () => {
  it('applique un barème total de 10 et un sous-score par critère', () => {
    const result = gradeExercise(instruction(), SUBMISSION, {
      hintsUsed: 0,
      nextStep: NEXT_STEP,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.maxScore).toBe(10);
    expect(result.value.score).toBe(10);
    expect(result.value.criteria).toHaveLength(5);
    expect(result.value.criteria.map((criterion) => criterion.points)).toEqual([2, 2, 2, 2, 2]);
    expect(result.value.verdict).toBe('passed');
  });

  it('retire un point de score maximal par indice utilisé', () => {
    const one = gradeExercise(instruction(), SUBMISSION, {
      hintsUsed: 1,
      nextStep: NEXT_STEP,
    });
    const two = gradeExercise(instruction(), SUBMISSION, {
      hintsUsed: 2,
      nextStep: NEXT_STEP,
    });
    expect(one.ok && one.value.maxScore).toBe(9);
    expect(two.ok && two.value.maxScore).toBe(8);
    expect(one.ok && one.value.score).toBe(9);
    expect(two.ok && two.value.score).toBe(8);
  });

  it('refuse une correction du modèle qui dépasse le barème puis la borne (CL-5)', () => {
    const tutor: ExerciseTutor = {
      correct() {
        return {
          scores: [
            { key: 'a', earned: 9, comment: 'Trop haut.' },
            { key: 'b', earned: -1, comment: 'Négatif.' },
            { key: 'c', earned: Number.NaN, comment: 'Non fini.' },
            { key: 'd', earned: 2, comment: 'Juste.' },
            { key: 'explication', earned: 2, comment: 'Juste.' },
          ],
          summary: 'Correction brute hors bornes.',
        };
      },
    };
    const normalized = normalizeTutorCorrection(instruction(), {
      scores: [
        { key: 'a', earned: 9, comment: 'Trop haut.' },
        { key: 'b', earned: -1, comment: 'Négatif.' },
        { key: 'c', earned: Number.NaN, comment: 'Non fini.' },
        { key: 'd', earned: 2, comment: 'Juste.' },
        { key: 'explication', earned: 2, comment: 'Juste.' },
      ],
      summary: 'Correction brute hors bornes.',
    });
    expect(normalized.rejectedKeys).toEqual(['a', 'b', 'c']);
    expect(normalized.criteria.map((criterion) => criterion.earned)).toEqual([2, 0, 0, 2, 2]);

    const result = gradeExercise(instruction(), SUBMISSION, {
      hintsUsed: 0,
      nextStep: NEXT_STEP,
      tutor,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.score).toBe(6);
    expect(result.value.verdict).toBe('retry');
  });

  it('ne dépasse jamais le score maximal réduit par les indices', () => {
    const result = gradeExercise(instruction(), SUBMISSION, {
      hintsUsed: 2,
      nextStep: NEXT_STEP,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.value.score).toBeLessThanOrEqual(result.value.maxScore);
  });

  it('refuse une production invalide sans appeler le tuteur', () => {
    let called = false;
    const tutor: ExerciseTutor = {
      correct() {
        called = true;
        return { scores: [], summary: 'jamais' };
      },
    };
    const result = gradeExercise(
      instruction(),
      {
        ...SUBMISSION,
        rows: [
          { cle: '40', montant: '12' },
          { cle: '50', montant: '120' },
        ],
      },
      { hintsUsed: 0, nextStep: NEXT_STEP, tutor },
    );
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it('exige une somme de critères égale à 10 dans le contrat', () => {
    expect(() =>
      ExerciseInstructionSchema.parse({
        ...instruction(),
        criteria: [{ key: 'a', label: 'Unique', points: 9, description: 'Barème incomplet.' }],
      }),
    ).toThrow(/somme des points/u);
  });
});
