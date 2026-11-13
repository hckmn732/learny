import { describe, expect, it } from 'vitest';

import { toPublicBrick } from '../../public-brick';
import { NOTION_A, NOTION_B, NOTION_C } from '../example-ids';

import { gradeMatching } from './grade';
import { opaqueMapping, type MatchingPublic } from './public';
import type { MatchingPayload } from './schema';

const SEED = '99999999-9999-4999-8999-999999999999';

function payload(): MatchingPayload {
  return {
    instruction: 'Associez chaque document à son cycle.',
    pairs: [
      { id: 'a', left: 'Facture', right: 'Cycle des ventes', notionId: NOTION_A },
      { id: 'b', left: 'Relevé', right: 'Cycle de trésorerie', notionId: NOTION_B },
      { id: 'c', left: 'Bulletin', right: 'Cycle des salaires', notionId: NOTION_C },
    ],
    extraRights: ['Cycle des immobilisations'],
    explanation: 'Chaque pièce se rattache à un cycle précis.',
    sources: [],
  };
}

function rightOf(source: MatchingPayload, pairId: string, seed = SEED): string {
  const right = opaqueMapping(source, seed).find((entry) => entry.pairId === pairId);
  if (right === undefined) throw new Error(`Aucune droite pour ${pairId}`);
  return right.id;
}

function correctResponse(
  source = payload(),
  seed = SEED,
): { pairs: Record<string, string | null> } {
  return {
    pairs: Object.fromEntries(
      source.pairs.map((pair) => [pair.id, rightOf(source, pair.id, seed)]),
    ),
  };
}

describe('[SPEC-502] correction d’une association', () => {
  it('accepte toutes les paires justes', () => {
    const graded = gradeMatching(payload(), correctResponse(), SEED);
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.isCorrect).toBe(true);
    expect(graded.value.score).toBe(1);
    expect(graded.value.confusions).toEqual([]);
    expect(graded.value.feedbackTitle).toBe('Exact.');
    expect(graded.value.correction.pairs).toHaveLength(3);
  });

  it('donne un score partiel et aucune confusion pour les paires laissées vides (CL-5)', () => {
    const given = correctResponse();
    given.pairs.a = null;
    const graded = gradeMatching(payload(), given, SEED);
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.isCorrect).toBe(false);
    expect(graded.value.score).toBe(0.6667);
    expect(graded.value.confusions).toEqual([]);
  });

  it('signale une confusion entre deux notions différentes (CA-2)', () => {
    const given = correctResponse();
    given.pairs.a = rightOf(payload(), 'b');
    const graded = gradeMatching(payload(), given, SEED);
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.confusions).toEqual([
      { notionId: NOTION_A, confusedWithNotionId: NOTION_B },
    ]);
    expect(graded.value.score).toBe(0.6667);
  });

  it('ne signale aucune confusion entre deux paires d’une même notion (CA-2)', () => {
    const source = payload();
    const second = source.pairs[1];
    if (second !== undefined) source.pairs[1] = { ...second, notionId: NOTION_A };
    const given = correctResponse(source);
    given.pairs.a = rightOf(source, 'b');
    const graded = gradeMatching(source, given, SEED);
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.confusions).toEqual([]);
  });

  it('ne signale aucune confusion pour une droite supplémentaire', () => {
    const extra = opaqueMapping(payload(), SEED).find((right) => right.pairId === null);
    if (extra === undefined) throw new Error('Droite supplémentaire absente');
    const given = correctResponse();
    given.pairs.a = extra.id;
    const graded = gradeMatching(payload(), given, SEED);
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.confusions).toEqual([]);
    expect(graded.value.isCorrect).toBe(false);
  });

  it('dédoublonne les confusions identiques', () => {
    const source = payload();
    const second = source.pairs[1];
    if (second !== undefined) source.pairs[1] = { ...second, notionId: NOTION_A };
    source.pairs.push({
      id: 'd',
      left: 'Avoir',
      right: 'Cycle des achats',
      notionId: NOTION_A,
    });
    const given = correctResponse(source);
    given.pairs.a = rightOf(source, 'c');
    given.pairs.d = rightOf(source, 'c');
    const graded = gradeMatching(source, given, SEED);
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.confusions).toEqual([
      { notionId: NOTION_A, confusedWithNotionId: NOTION_C },
    ]);
  });

  it('arrondit le score au dix-millième', () => {
    const given = correctResponse();
    given.pairs.b = null;
    given.pairs.c = null;
    const graded = gradeMatching(payload(), given, SEED);
    expect(graded.ok).toBe(true);
    if (graded.ok) expect(graded.value.score).toBe(0.3333);
  });

  it('expose la droite attendue et la droite donnée dans la correction', () => {
    const given = correctResponse();
    given.pairs.a = rightOf(payload(), 'b');
    const graded = gradeMatching(payload(), given, SEED);
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.correction.pairs[0]).toEqual({
      pairId: 'a',
      left: 'Facture',
      expectedRight: 'Cycle des ventes',
      givenRight: 'Cycle de trésorerie',
      correct: false,
    });
  });

  it('reconstruit les mêmes ids opaques que la charge publique (graine = version)', () => {
    const source = payload();
    const publicBrick = toPublicBrick({
      brickId: '88888888-8888-4888-8888-888888888888',
      versionId: SEED,
      type: 'matching',
      notionIds: [NOTION_A],
      payload: source,
    });
    const rights = (publicBrick.publicPayload as MatchingPublic).rights;
    const given = {
      pairs: Object.fromEntries(
        source.pairs.map((pair) => [
          pair.id,
          rights.find((right) => right.text === pair.right)?.id ?? '',
        ]),
      ),
    };
    const graded = gradeMatching(source, given, SEED);
    expect(graded.ok).toBe(true);
    if (graded.ok) expect(graded.value.isCorrect).toBe(true);
  });

  it('refuse une droite inconnue, une paire manquante ou une paire inconnue', () => {
    const invalids: unknown[] = [
      { pairs: { a: 'r99', b: null, c: null } },
      { pairs: { a: null, b: null } },
      { pairs: { a: null, b: null, c: null, z: null } },
    ];
    for (const given of invalids) {
      const graded = gradeMatching(payload(), given, SEED);
      expect(graded.ok).toBe(false);
      if (!graded.ok) expect(graded.error.code).toBe('RESPONSE_INVALID');
    }
  });
});
