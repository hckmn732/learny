// Unit tests of the micro-session composition (SPEC-703 EF-2, ET-2, ET-3; ADR-0182 §1-2).
//
// Pure function: no database, no clock. The tests pin the number of cards for D = 3/5/10 (CA-2),
// the question format preference, the choice-only fallback while SPEC-702 is not delivered, and
// the degenerate compositions CL-1 to CL-3.
import { describe, expect, it } from 'vitest';

import {
  MICRO_QUESTION_FORMATS,
  composeMicroSession,
  microCardCount,
  type MicroBrick,
} from './micro-composition';

function brick(
  id: string,
  type: string,
  notionIds: readonly string[],
  options: { fingerprint?: string | null } = {},
): MicroBrick {
  return {
    brickId: id,
    brickVersionId: `${id}-v1`,
    type,
    notionIds: [...notionIds],
    displayLabel: notionIds.length === 1 ? `Notion ${notionIds[0] ?? ''}` : `Jeu ${id}`,
    moduleIds: ['module-1'],
    reasonKey: null,
    fingerprint: options.fingerprint ?? null,
  };
}

const NOTIONS = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'];

function input(overrides: Partial<Parameters<typeof composeMicroSession>[0]> = {}) {
  return {
    durationMin: 5,
    gamesEnabled: true,
    priorityNotionIds: NOTIONS,
    bricks: [] as MicroBrick[],
    seenFingerprints: new Set<string>(),
    ...overrides,
  };
}

describe('[SPEC-703] composition de la micro-séance', () => {
  it('CA-2 — D = 3 et D = 5 retiennent une carte puis une question', () => {
    const bricks = [
      brick('card-1', 'recall_card', ['n1']),
      brick('card-2', 'recall_card', ['n2']),
      brick('cloze-1', 'cloze', ['n2', 'n3', 'n4', 'n5']),
    ];
    for (const durationMin of [3, 5]) {
      const result = composeMicroSession(input({ durationMin, bricks }));
      expect(result.cardCount).toBe(1);
      expect(result.items.map((item) => item.type)).toEqual(['recall_card', 'cloze']);
      expect(result.items[0]?.notionIds).toEqual(['n1']);
      expect(result.hasQuestion).toBe(true);
      expect(result.missingFormats).toEqual([]);
    }
    expect(microCardCount(3)).toBe(1);
    expect(microCardCount(5)).toBe(1);
  });

  it('CA-2 — D = 10 retient deux cartes puis une question', () => {
    const bricks = [
      brick('card-1', 'recall_card', ['n1']),
      brick('card-2', 'recall_card', ['n2']),
      brick('cloze-1', 'cloze', ['n3', 'n4', 'n5', 'n6']),
    ];
    const result = composeMicroSession(input({ durationMin: 10, bricks }));
    expect(microCardCount(10)).toBe(2);
    expect(result.cardCount).toBe(2);
    expect(result.items.map((item) => item.type)).toEqual(['recall_card', 'recall_card', 'cloze']);
    expect(result.items.flatMap((item) => item.notionIds)).toEqual(NOTIONS);
  });

  it('ET-3 — l’ordre de préférence est texte à trous, association, classement, question', () => {
    expect(MICRO_QUESTION_FORMATS).toEqual([
      'cloze',
      'matching',
      'categorization',
      'choice_question',
    ]);
    const bricks = [
      brick('card-1', 'recall_card', ['n1']),
      brick('choice-1', 'choice_question', ['n2']),
      brick('categorization-1', 'categorization', ['n3']),
      brick('matching-1', 'matching', ['n4', 'n5']),
      brick('cloze-1', 'cloze', ['n2', 'n3', 'n4']),
    ];
    const result = composeMicroSession(input({ bricks }));
    expect(result.items[1]?.type).toBe('cloze');
    expect(result.items[1]?.notionIds).toEqual(['n2', 'n3', 'n4']);

    const withoutCloze = composeMicroSession(
      input({ bricks: bricks.filter((entry) => entry.type !== 'cloze') }),
    );
    expect(withoutCloze.items[1]?.type).toBe('matching');
  });

  it('ET-3 — GAMES_ENABLED=false restreint la question à choice_question', () => {
    const bricks = [
      brick('card-1', 'recall_card', ['n1']),
      brick('cloze-1', 'cloze', ['n2', 'n3', 'n4']),
      brick('choice-1', 'choice_question', ['n5']),
    ];
    const result = composeMicroSession(input({ bricks, gamesEnabled: false }));
    expect(result.items.map((item) => item.type)).toEqual(['recall_card', 'choice_question']);
    expect(result.items[1]?.notionIds).toEqual(['n5']);
  });

  it('EF-2 — une variante déjà vue n’est jamais resservie', () => {
    const bricks = [
      brick('card-1', 'recall_card', ['n1'], { fingerprint: 'seen-card' }),
      brick('card-2', 'recall_card', ['n2']),
      brick('cloze-1', 'cloze', ['n3', 'n4'], { fingerprint: 'seen-cloze' }),
      brick('choice-1', 'choice_question', ['n5']),
    ];
    const result = composeMicroSession(
      input({ bricks, seenFingerprints: new Set(['seen-card', 'seen-cloze']) }),
    );
    expect(result.items[0]?.brickId).toBe('card-2');
    expect(result.items[1]?.brickId).toBe('choice-1');
  });

  it('CL-1 — une seule notion due : une carte, aucun jeu suivant', () => {
    const result = composeMicroSession(
      input({
        priorityNotionIds: ['n1'],
        bricks: [brick('card-1', 'recall_card', ['n1'])],
        gamesEnabled: false,
      }),
    );
    expect(result.items.map((item) => item.type)).toEqual(['recall_card']);
    expect(result.cardCount).toBe(1);
    expect(result.hasQuestion).toBe(false);
    expect(result.missingFormats).toEqual(['choice_question']);
  });

  it('CL-2 — aucune variante de question : les cartes seules et le format manquant', () => {
    const result = composeMicroSession(
      input({
        durationMin: 10,
        bricks: [brick('card-1', 'recall_card', ['n1']), brick('card-2', 'recall_card', ['n2'])],
      }),
    );
    expect(result.items.map((item) => item.type)).toEqual(['recall_card', 'recall_card']);
    expect(result.hasQuestion).toBe(false);
    expect(result.missingFormats).toEqual(['cloze']);
  });

  it('CL-3 — aucune carte pour la notion prioritaire : la suivante est essayée', () => {
    const result = composeMicroSession(
      input({
        bricks: [
          brick('card-2', 'recall_card', ['n2']),
          brick('choice-1', 'choice_question', ['n3']),
        ],
        gamesEnabled: false,
      }),
    );
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.notionIds).toEqual(['n2']);
    expect(result.items[1]?.type).toBe('choice_question');
  });

  it('CL-3 — aucune carte du tout : la micro-séance ne contient que la question', () => {
    const result = composeMicroSession(
      input({
        bricks: [brick('choice-1', 'choice_question', ['n1'])],
        gamesEnabled: false,
      }),
    );
    expect(result.cardCount).toBe(0);
    expect(result.items.map((item) => item.type)).toEqual(['choice_question']);
    expect(result.hasQuestion).toBe(true);
    expect(result.missingFormats).toEqual([]);
  });

  it('EF-2 — une question ne dépasse jamais quatre notions', () => {
    const result = composeMicroSession(
      input({
        bricks: [brick('cloze-1', 'cloze', ['n1', 'n2', 'n3', 'n4', 'n5'])],
      }),
    );
    expect(result.items).toEqual([]);
    expect(result.missingFormats).toEqual(['cloze']);
  });
});
