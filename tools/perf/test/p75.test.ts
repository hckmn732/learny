import { describe, expect, it } from 'vitest';

import { percentileNearestRank } from '../p75';

describe('[SPEC-804] percentileNearestRank', () => {
  it('retient le 4ᵉ passage sur 5 au 75ᵉ centile', () => {
    expect(percentileNearestRank([1, 2, 3, 4, 5], 0.75)).toBe(4);
  });

  it('gère une valeur unique et des valeurs non triées', () => {
    expect(percentileNearestRank([10], 0.75)).toBe(10);
    expect(percentileNearestRank([5, 1, 4, 2, 3], 0.75)).toBe(4);
  });

  it('refuse un tableau vide et une fraction hors bornes', () => {
    expect(() => percentileNearestRank([], 0.75)).toThrow();
    expect(() => percentileNearestRank([1], 1.5)).toThrow();
  });
});
