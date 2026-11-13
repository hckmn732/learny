import { describe, expect, it } from 'vitest';

import { passwordStrength } from './password-strength';

describe('[SPEC-601] passwordStrength', () => {
  it.each([
    ['', 0],
    ['abcdefgh', 1],
    ['abcdefgh1', 2],
    ['abcdefghijkl', 2],
    ['abcdefghijk1', 3],
    ['abcdefghij1!', 4],
    ['a1!', 2],
  ])('calcule la solidité de %j → %i (EF-5)', (password, expected) => {
    expect(passwordStrength(password)).toBe(expected);
  });

  it('plafonne à 4 barres', () => {
    expect(passwordStrength('Une phrase très longue avec 3 symboles !?')).toBe(4);
  });
});
