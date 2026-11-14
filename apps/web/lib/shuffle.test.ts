// Deterministic display shuffle of the association game (SPEC-702 ET-7).
import { describe, expect, it } from 'vitest';

import { hashSeed, mulberry32, seededShuffle } from './shuffle';

describe('[SPEC-702] seededShuffle', () => {
  it('renvoie la même permutation pour la même graine', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(seededShuffle(items, 'version-1')).toEqual(seededShuffle(items, 'version-1'));
    expect(seededShuffle(items, 'version-1')).not.toEqual(seededShuffle(items, 'version-2'));
  });

  it('est une permutation complète et ne mute pas l’entrée', () => {
    const items = Array.from({ length: 12 }, (_, index) => index);
    const frozen = [...items];
    const shuffled = seededShuffle(items, 'graine');
    expect(items).toEqual(frozen);
    expect([...shuffled].sort((left, right) => left - right)).toEqual(items);
  });

  it('hache la graine en FNV-1a et génère des nombres dans [0, 1)', () => {
    expect(hashSeed('')).toBe(0x811c9dc5);
    expect(hashSeed('a')).toBe(0xe40c292c);
    const random = mulberry32(hashSeed('graine'));
    for (let index = 0; index < 20; index += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
