import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { normalizeText } from './normalize';

describe('[SPEC-501] normalisation ADR-0151', () => {
  it.each([
    ['  Bonjour  ', 'bonjour'],
    ['L’entreprise', "l'entreprise"],
    ['« Gestion »', '" gestion "'],
    ['Café', 'cafe'],
    ['ÉLÈVE', 'eleve'],
    ['a\u00A0b', 'a b'],
    ['a\u2009b', 'a b'],
    ['ﬁn', 'fin'],
    ['Fin.', 'fin'],
    ['Fin?!', 'fin'],
    ['Fin…', 'fin'],
    ['débit–crédit', 'debit-credit'],
    ['débit—crédit', 'debit-credit'],
    ['débit‑crédit', 'debit-credit'],
    ['“double”', '"double"'],
    ['naïve', 'naive'],
    ['ÇA', 'ca'],
    ['l’élève.', "l'eleve"],
    ['  déjà   vu  ', 'deja vu'],
    ['DÉBIT : CRÉDIT;', 'debit : credit'],
  ])('normalise %j en %j', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it('est idempotente (fast-check)', () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const once = normalizeText(value);
        return normalizeText(once) === once;
      }),
      { numRuns: 300 },
    );
  });
});
