import { describe, expect, it } from 'vitest';

import { contrastRatio, meetsContrast, relativeLuminance } from './contrast';

describe('[SPEC-309] contraste WCAG', () => {
  it('calcule la luminance et le rapport des extrêmes', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('meetsContrast applique le seuil AA par défaut ou un seuil donné', () => {
    expect(meetsContrast('#000000', '#ffffff')).toBe(true);
    expect(meetsContrast('#777777', '#ffffff')).toBe(false);
    expect(meetsContrast('#777777', '#ffffff', 3)).toBe(true);
  });

  it('refuse une couleur hors #RRGGBB', () => {
    expect(() => relativeLuminance('rgb(0,0,0)')).toThrow(/contraste WCAG/);
  });
});
