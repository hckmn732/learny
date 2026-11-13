import { describe, expect, it } from 'vitest';

import { formatFirstNames } from './formatFirstNames';

describe('[SPEC-602] prénoms d’une invitation', () => {
  it('formate un, deux et trois prénoms', () => {
    expect(formatFirstNames(['A'])).toBe('A');
    expect(formatFirstNames(['A', 'B'])).toBe('A et B');
    expect(formatFirstNames(['A', 'B', 'C'])).toBe('A, B et C');
  });

  it('ignore les prénoms vides', () => {
    expect(formatFirstNames(['A', ' ', 'B'])).toBe('A et B');
    expect(formatFirstNames([])).toBe('');
  });
});
