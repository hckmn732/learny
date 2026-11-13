import { describe, expect, it } from 'vitest';

import { passageTextOf, selectionFrom, selectionPreview } from './use-text-selection';

describe('[SPEC-610] sélection de texte', () => {
  it('CA-1 — 11 caractères ne suffisent pas, 12 ouvrent la barre', () => {
    expect(selectionFrom('onze caract')).toBeNull();
    expect(selectionFrom('douze caractères')).toMatchObject({ text: 'douze caractères' });
    expect(selectionFrom('   ')).toBeNull();
  });

  it('normalise et tronque l’aperçu et le passage', () => {
    expect(selectionFrom('  un   passage\n  normalisé  ')?.text).toBe('un passage normalisé');
    expect(selectionPreview('x'.repeat(120))).toHaveLength(90);
    expect(passageTextOf('y'.repeat(1_200))).toHaveLength(1_000);
  });
});
