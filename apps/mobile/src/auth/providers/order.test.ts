// Vitest [SPEC-3402] — ordre et visibilité des fournisseurs (EF-1, CA-1; ADR-3006 § 3).
import { describe, expect, it } from 'vitest';

import { providerOrder, visibleProviders } from './order';

describe('[SPEC-3402] ordre des fournisseurs', () => {
  it('affiche Apple d’abord sur iOS (EF-1)', () => {
    expect(providerOrder('ios')).toEqual(['apple', 'google']);
  });

  it('affiche Google d’abord sur Android (EF-1)', () => {
    expect(providerOrder('android')).toEqual(['google', 'apple']);
  });

  it('ne montre jamais Google sans Apple (CA-1, ADR-3006 § 3)', () => {
    expect(visibleProviders('ios', false)).toEqual([]);
    expect(visibleProviders('android', false)).toEqual([]);
    expect(visibleProviders('android', true)).toEqual(['google', 'apple']);
    expect(visibleProviders('ios', true)).toEqual(['apple', 'google']);
  });
});
