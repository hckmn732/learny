import { describe, expect, it } from 'vitest';

import { ContextSelection, RetrievalSearchResult } from './retrieval';

const chunk = {
  chunkId: '11111111-1111-4111-8111-111111111111',
  resourceId: '22222222-2222-4222-8222-222222222222',
  source: 'Cours',
  position: 0,
  score: 0.9,
  text: 'Un passage.',
  location: { charStart: 0, charEnd: 11 },
  tokenCount: 3,
};

function paths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
}

describe('[SPEC-511] cohérence des résultats de recherche', () => {
  it('une recherche vide porte no_matches, une recherche pleine aucune raison', () => {
    expect(paths(RetrievalSearchResult.safeParse({ reason: null, chunks: [] }))).toEqual([
      'reason',
    ]);
    expect(
      paths(RetrievalSearchResult.safeParse({ reason: 'no_matches', chunks: [chunk] })),
    ).toEqual(['reason']);
    expect(RetrievalSearchResult.safeParse({ reason: 'no_matches', chunks: [] }).success).toBe(
      true,
    );
    expect(RetrievalSearchResult.safeParse({ reason: null, chunks: [chunk] }).success).toBe(true);
  });

  it('un contexte sélectionné respecte budget, raison et documents', () => {
    const base = {
      task: 'tutor',
      tokenBudget: 100,
      estimatedTokens: 10,
      reason: null,
      chunks: [chunk],
      documents: ['<document>…</document>'],
      text: '<document>…</document>',
      duplicates: 0,
      omitted: 0,
    };
    expect(ContextSelection.safeParse(base).success).toBe(true);
    expect(paths(ContextSelection.safeParse({ ...base, estimatedTokens: 101 }))).toEqual([
      'estimatedTokens',
    ]);
    expect(paths(ContextSelection.safeParse({ ...base, chunks: [], documents: [] }))).toEqual([
      'reason',
    ]);
    expect(paths(ContextSelection.safeParse({ ...base, reason: 'budget_exhausted' }))).toEqual([
      'reason',
    ]);
    expect(paths(ContextSelection.safeParse({ ...base, documents: [] }))).toEqual(['documents']);
  });
});
