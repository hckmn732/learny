import { describe, expect, it } from 'vitest';

import { AA_NORMAL_TEXT, contrastRatio, meetsContrast } from '../accessibility/contrast';

import { colors } from './colors';
import { focusRing } from './layout';
import { TOKEN_PAIRS } from './pairs';

describe('[SPEC-803] contrastes des jetons', () => {
  it('respecte le seuil déclaré de chaque paire texte, grand texte et non-texte', () => {
    for (const pair of TOKEN_PAIRS) {
      const ratio = contrastRatio(colors[pair.foreground], colors[pair.background]);
      expect(
        ratio,
        `${pair.id} (${colors[pair.foreground]} sur ${colors[pair.background]}) = ${ratio.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(pair.minimum);
    }
  });

  it('vérifie explicitement #62626B sur #F4F4F1 et #F8F8F6 (ET-4)', () => {
    expect(meetsContrast('#62626B', '#F4F4F1')).toBe(true);
    expect(meetsContrast('#62626B', '#F8F8F6')).toBe(true);
    expect(colors['ink-muted']).toBe('#62626B');
    expect(colors.canvas).toBe('#F4F4F1');
    expect(colors['surface-subtle']).toBe('#F8F8F6');
  });

  it('déclare un contour de focus de 2 px, décalé de 2 px, contrasté sur clair et sombre', () => {
    expect(focusRing.width).toBe('2px');
    expect(focusRing.offset).toBe('2px');
    expect(focusRing.color).toBe('#3A3AA8');
    expect(meetsContrast(focusRing.color, colors.surface, 3)).toBe(true);
    expect(meetsContrast(focusRing.onDarkColor, colors.ink, 3)).toBe(true);
  });

  it('garde le texte normal au seuil AA de 4,5:1', () => {
    for (const pair of TOKEN_PAIRS.filter((entry) => entry.usage === 'text')) {
      expect(
        contrastRatio(colors[pair.foreground], colors[pair.background]),
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    }
  });
});
