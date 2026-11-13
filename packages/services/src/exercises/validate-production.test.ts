import { describe, expect, it } from 'vitest';

import { ExerciseInstructionSchema, type ExerciseInstruction } from '@learny/contracts';

import { validateProduction } from './validate-production';

function tableInstruction(): ExerciseInstruction {
  return ExerciseInstructionSchema.parse({
    title: 'Saisir une pièce équilibrée',
    taskMd: 'Saisissez la pièce comptable correspondante et expliquez la partie double.',
    data: ['Société FR01', 'Devise : EUR'],
    deliverable: 'Un tableau équilibré et une explication.',
    production: {
      kind: 'table',
      fields: [
        {
          key: 'type',
          label: 'Type de pièce',
          type: 'select',
          options: [{ value: 'SA', label: 'SA · écriture générale' }],
        },
      ],
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
      maxRows: 4,
      initialRows: 2,
      checks: [
        {
          type: 'sum_equal',
          numberColumn: 'montant',
          groupColumn: 'cle',
          left: ['40'],
          right: ['50'],
          leftLabel: 'Débit',
          rightLabel: 'Crédit',
          sideColumnLabel: 'Sens',
        },
      ],
    },
    explanationPrompt: 'Pourquoi une pièce doit-elle être équilibrée ?',
    hints: ['Premier indice', 'Deuxième indice'],
    criteria: [
      { key: 'a', label: 'Poste de charge', points: 4, description: 'Le poste est juste.' },
      { key: 'b', label: 'Équilibre', points: 4, description: 'Les totaux sont égaux.' },
      { key: 'c', label: 'Explication', points: 2, description: 'La règle est expliquée.' },
    ],
    estimatedMinutes: 15,
    passPoints: 8,
    sources: [],
  });
}

function tableSubmission(montantRight = '120'): unknown {
  return {
    kind: 'table',
    fields: { type: 'SA' },
    rows: [
      { cle: '40', montant: montantRight },
      { cle: '50', montant: '120' },
    ],
    explanation: 'En partie double, tout montant débité est crédité ailleurs.',
  };
}

describe('[SPEC-613] validation des productions', () => {
  const instruction = tableInstruction();

  it('accepte un tableau typé et équilibré', () => {
    const result = validateProduction(instruction, tableSubmission());
    expect(result.ok).toBe(true);
  });

  it('refuse un débit et un crédit déséquilibrés avant tout appel au tuteur', () => {
    const result = validateProduction(instruction, tableSubmission('100'));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('validation attendue en échec');
    expect(result.error).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'rows', message: 'Écart : 20 €' })]),
    );
  });

  it('signale la cellule dont le type ne respecte pas la colonne', () => {
    const result = validateProduction(instruction, {
      ...(tableSubmission() as Record<string, unknown>),
      rows: [
        { cle: '40', montant: 'douze' },
        { cle: '50', montant: '120' },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('validation attendue en échec');
    expect(result.error).toContainEqual({
      path: 'rows.0.montant',
      message: 'Montant doit être un nombre.',
    });
  });

  it('refuse une valeur absente de la liste typée', () => {
    const result = validateProduction(instruction, {
      ...(tableSubmission() as Record<string, unknown>),
      rows: [
        { cle: '99', montant: '120' },
        { cle: '50', montant: '120' },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('validation attendue en échec');
    expect(result.error).toContainEqual({
      path: 'rows.0.cle',
      message: 'Clé doit être choisi dans la liste proposée.',
    });
  });

  it('exige l’explication écrite', () => {
    const result = validateProduction(instruction, {
      ...(tableSubmission() as Record<string, unknown>),
      explanation: 'court',
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('validation attendue en échec');
    expect(result.error).toContainEqual({
      path: 'explanation',
      message: 'Expliquez votre démarche en une ou deux phrases.',
    });
  });

  it('accepte les productions texte, fichier et lien de leur propre type', () => {
    const text = ExerciseInstructionSchema.parse({
      ...instruction,
      production: { kind: 'text', minChars: 3, maxChars: 200 },
    });
    expect(
      validateProduction(text, {
        kind: 'text',
        text: 'Une réponse',
        explanation: 'Une explication suffisamment longue pour être acceptée.',
      }).ok,
    ).toBe(true);

    const file = ExerciseInstructionSchema.parse({
      ...instruction,
      production: { kind: 'file', accept: ['application/pdf'], maxSizeMb: 5 },
    });
    expect(
      validateProduction(file, {
        kind: 'file',
        resourceId: '6f0e8f9a-0c45-4de2-a7dd-4f5c5a5f9fc0',
        explanation: 'Une explication suffisamment longue pour être acceptée.',
      }).ok,
    ).toBe(true);

    const link = ExerciseInstructionSchema.parse({
      ...instruction,
      production: { kind: 'link' },
    });
    expect(
      validateProduction(link, {
        kind: 'link',
        url: 'https://example.test/rendu',
        explanation: 'Une explication suffisamment longue pour être acceptée.',
      }).ok,
    ).toBe(true);
  });
});
