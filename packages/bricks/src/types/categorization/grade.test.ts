import { describe, expect, it } from 'vitest';

import { NOTION_A, NOTION_B } from '../example-ids';

import { gradeCategorization } from './grade';
import type { CategorizationPayload } from './schema';

function payload(): CategorizationPayload {
  return {
    instruction: 'Classez chaque compte.',
    categories: [
      { id: 'actif', label: 'Actif', notionId: NOTION_A },
      { id: 'passif', label: 'Passif', notionId: NOTION_B },
    ],
    items: [
      { id: 'a', text: 'Banque', categoryId: 'actif' },
      { id: 'b', text: 'Stock', categoryId: 'actif' },
      { id: 'c', text: 'Capital', categoryId: 'passif' },
      { id: 'd', text: 'Emprunt', categoryId: 'passif' },
    ],
    explanation: 'L’actif regroupe les emplois, le passif les ressources.',
    sources: [],
  };
}

const ALL_CORRECT = { assignments: { a: 'actif', b: 'actif', c: 'passif', d: 'passif' } };

function scoreOf(assignments: Record<string, string | null>, source = payload()) {
  const graded = gradeCategorization(source, { assignments });
  if (!graded.ok) throw new Error(graded.error.issues.map((issue) => issue.message).join(' '));
  return graded.value;
}

describe('[SPEC-502] correction d’un classement', () => {
  it('accepte un classement exact', () => {
    const graded = scoreOf(ALL_CORRECT.assignments);
    expect(graded.isCorrect).toBe(true);
    expect(graded.score).toBe(1);
    expect(graded.confusions).toEqual([]);
    expect(graded.feedbackTitle).toBe('Exact.');
  });

  it('donne un score partiel', () => {
    const graded = scoreOf({ ...ALL_CORRECT.assignments, d: 'actif' });
    expect(graded.isCorrect).toBe(false);
    expect(graded.score).toBe(0.75);
  });

  it('signale une confusion entre deux notions différentes (CA-2)', () => {
    const graded = scoreOf({ ...ALL_CORRECT.assignments, d: 'actif' });
    expect(graded.confusions).toEqual([{ notionId: NOTION_B, confusedWithNotionId: NOTION_A }]);
  });

  it('ne signale aucune confusion entre deux catégories d’une même notion (CA-2)', () => {
    const source = payload();
    const passif = source.categories[1];
    if (passif !== undefined) source.categories[1] = { ...passif, notionId: NOTION_A };
    const graded = scoreOf({ ...ALL_CORRECT.assignments, d: 'actif' }, source);
    expect(graded.confusions).toEqual([]);
    expect(graded.score).toBe(0.75);
  });

  it('ne signale aucune confusion quand la catégorie choisie n’a pas de notion', () => {
    const source = payload();
    const passif = source.categories[1];
    if (passif !== undefined) source.categories[1] = { ...passif, notionId: null };
    const graded = scoreOf({ ...ALL_CORRECT.assignments, d: 'actif' }, source);
    expect(graded.confusions).toEqual([]);
  });

  it('ne signale aucune confusion pour un élément non classé', () => {
    const graded = scoreOf({ ...ALL_CORRECT.assignments, d: null });
    expect(graded.confusions).toEqual([]);
    expect(graded.isCorrect).toBe(false);
  });

  it('dédoublonne une confusion répétée', () => {
    const graded = scoreOf({ a: 'passif', b: 'passif', c: 'passif', d: 'passif' });
    expect(graded.confusions).toEqual([{ notionId: NOTION_A, confusedWithNotionId: NOTION_B }]);
  });

  it('expose les catégories attendues et données dans la correction', () => {
    const graded = scoreOf({ ...ALL_CORRECT.assignments, d: 'actif' });
    expect(graded.correction.items[3]).toEqual({
      id: 'd',
      text: 'Emprunt',
      expectedCategoryId: 'passif',
      expectedCategoryLabel: 'Passif',
      givenCategoryId: 'actif',
      givenCategoryLabel: 'Actif',
      correct: false,
    });
  });

  it('normalise la réponse dans l’ordre des éléments', () => {
    const graded = scoreOf({ ...ALL_CORRECT.assignments, d: null });
    expect(graded.normalizedResponse).toBe('a=actif|b=actif|c=passif|d=');
  });

  it('refuse un élément manquant, un élément inconnu et une catégorie inconnue', () => {
    const invalids: unknown[] = [
      { assignments: { a: 'actif', b: 'actif', c: 'passif' } },
      { assignments: { ...ALL_CORRECT.assignments, z: 'actif' } },
      { assignments: { ...ALL_CORRECT.assignments, d: 'charges' } },
    ];
    for (const given of invalids) {
      const graded = gradeCategorization(payload(), given);
      expect(graded.ok).toBe(false);
      if (!graded.ok) expect(graded.error.code).toBe('RESPONSE_INVALID');
    }
  });
});
