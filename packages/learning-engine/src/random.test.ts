import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createSeededRandom, fnv1a32, stableShuffle } from './random';

const FAST_CHECK = { seed: 20261111, numRuns: 200 } as const;

describe('[SPEC-401] aléa à graine', () => {
  it('reproduit les valeurs de contrôle FNV-1a 32 bits (ET-5)', () => {
    expect(fnv1a32('')).toBe(2_166_136_261);
    expect(fnv1a32('a')).toBe(3_826_002_220);
  });

  it('produit une suite reproductible dans [0, 1) (CL-8)', () => {
    const first = createSeededRandom('');
    const second = createSeededRandom('');
    const values = Array.from({ length: 100 }, () => first());
    expect(Array.from({ length: 100 }, () => second())).toEqual(values);
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('donne des suites différentes pour deux graines différentes (CL-8)', () => {
    let compared = 0;
    for (let index = 0; index < 1000; index += 1) {
      const left = createSeededRandom(`graine-${String(index)}`);
      const right = createSeededRandom(`autre-graine-${String(index)}`);
      const leftValues = Array.from({ length: 10 }, () => left());
      const rightValues = Array.from({ length: 10 }, () => right());
      if (leftValues.every((value, at) => value !== rightValues[at])) compared += 1;
    }
    expect(compared).toBe(1000);
  });

  it('mélange sans muter l’entrée et sans perdre d’élément', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 40 }),
        fc.string(),
        (items, seed) => {
          const before = [...items];
          const shuffled = stableShuffle(items, seed, (item) => item);
          expect(items).toEqual(before);
          expect([...shuffled].sort()).toEqual([...items].sort());
          expect(shuffled).toHaveLength(items.length);
          expect(stableShuffle(items, seed, (item) => item)).toEqual(shuffled);
        },
      ),
      FAST_CHECK,
    );
  });

  it('départage les empreintes égales par la clé, sans muter l’entrée', () => {
    const items = [
      { id: 'b', rank: 1 },
      { id: 'a', rank: 2 },
      { id: 'c', rank: 3 },
    ];
    const shuffled = stableShuffle(items, 'seed', (item) => item.id);
    expect(items.map((item) => item.id)).toEqual(['b', 'a', 'c']);
    expect(shuffled).toHaveLength(3);
    expect(stableShuffle(items, '', (item) => item.id)).toHaveLength(3);

    const duplicates = [
      { id: 'same', rank: 1 },
      { id: 'same', rank: 2 },
      { id: 'same', rank: 3 },
    ];
    expect(stableShuffle(duplicates, 'seed', (item) => item.id)).toEqual(duplicates);
  });
});
