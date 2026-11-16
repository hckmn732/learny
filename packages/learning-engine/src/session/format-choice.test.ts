import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { BrickFormat } from '../types';

import { chooseGapFormat, weightedFormatPick } from './format-choice';

const ALL: BrickFormat[] = [
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
];
const FIVE: BrickFormat[] = [
  'choice_question',
  'cloze',
  'matching',
  'categorization',
  'recall_card',
];

describe('[SPEC-716] jeu selon la lacune · choix du format', () => {
  it('EF-3 — tableau des natures', () => {
    expect(chooseGapFormat({ nature: 'forgetting', available: ALL })).toEqual({
      format: 'recall_card',
      pendingGeneration: false,
    });
    expect(chooseGapFormat({ nature: 'application', available: ALL })).toEqual({
      format: null,
      pendingGeneration: false,
    });
    expect(chooseGapFormat({ nature: 'misunderstanding', available: ALL })).toEqual({
      format: null,
      pendingGeneration: false,
    });
    expect(
      chooseGapFormat({
        nature: 'confusion',
        lastPairFormat: null,
        available: ['matching', 'categorization'],
      }).format,
    ).toBe('categorization');
  });

  it('CA-2 — deux confrontations successives de la même paire alternent', () => {
    const first = chooseGapFormat({
      nature: 'confusion',
      lastPairFormat: 'matching',
      available: ALL,
    });
    expect(first.format).toBe('categorization');
    const second = chooseGapFormat({
      nature: 'confusion',
      lastPairFormat: first.format,
      available: ALL,
    });
    expect(second.format).toBe('matching');
  });

  it('CL-9 — sans brique de confrontation, repli sur une question à distracteur', () => {
    expect(
      chooseGapFormat({ nature: 'confusion', available: ['choice_question', 'recall_card'] }),
    ).toEqual({ format: 'choice_question', pendingGeneration: true });
    expect(chooseGapFormat({ nature: 'confusion', available: ['recall_card'] })).toEqual({
      format: null,
      pendingGeneration: true,
    });
  });

  it('EF-3 — un oubli sans carte de rappel n’impose aucun format', () => {
    expect(chooseGapFormat({ nature: 'forgetting', available: ['choice_question'] })).toEqual({
      format: null,
      pendingGeneration: false,
    });
  });

  it('CA-4 — préférence cards : part de cartes entre 40 % et 60 % sur 1 000 tirages', () => {
    let cards = 0;
    for (let index = 0; index < 1_000; index += 1) {
      const format = weightedFormatPick({
        preference: 'cards',
        available: FIVE,
        lastFormat: null,
        seed: `card-${String(index)}-draw`,
      });
      if (format === 'recall_card') cards += 1;
    }
    expect(cards / 1_000).toBeGreaterThanOrEqual(0.4);
    expect(cards / 1_000).toBeLessThanOrEqual(0.6);
  });

  it('CA-4 — préférence matching : 3/7 pour association et classement', () => {
    let pair = 0;
    for (let index = 0; index < 1_000; index += 1) {
      const format = weightedFormatPick({
        preference: 'matching',
        available: FIVE,
        lastFormat: null,
        seed: `matching:${String(index)}`,
      });
      if (format === 'matching' || format === 'categorization') pair += 1;
    }
    expect(pair / 1_000).toBeGreaterThanOrEqual(0.6);
    expect(pair / 1_000).toBeLessThanOrEqual(0.75);
  });

  it('CA-4 — préférence vary : aucun format au-delà de 30 %', () => {
    const counts = new Map<BrickFormat, number>();
    for (let index = 0; index < 1_000; index += 1) {
      const format = weightedFormatPick({
        preference: 'vary',
        available: FIVE,
        lastFormat: null,
        seed: `vary:${String(index)}`,
      });
      if (format !== null) counts.set(format, (counts.get(format) ?? 0) + 1);
    }
    for (const count of counts.values()) expect(count / 1_000).toBeLessThanOrEqual(0.3);
  });

  it('propriété — jamais le dernier format quand un autre existe', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<BrickFormat>(...ALL),
        fc.uniqueArray(fc.constantFrom<BrickFormat>(...ALL), { minLength: 2, maxLength: 5 }),
        fc.string({ maxLength: 24 }),
        (lastFormat, pool, seed) => {
          const available = pool.includes(lastFormat) ? pool : [...pool, lastFormat];
          const picked = weightedFormatPick({
            preference: 'vary',
            available,
            lastFormat,
            seed,
          });
          expect(picked).not.toBe(lastFormat);
        },
      ),
      { numRuns: 80, seed: 20261111 },
    );
  });

  it('déterminisme — même graine, même format', () => {
    const input = {
      preference: 'cards' as const,
      available: ALL,
      lastFormat: 'cloze' as const,
      seed: 'global-quiz:user:2026-11-11',
    };
    expect(weightedFormatPick(input)).toBe(weightedFormatPick(input));
  });
});
