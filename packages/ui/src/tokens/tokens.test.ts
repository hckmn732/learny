import { RuleTester } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import { describe, expect, it } from 'vitest';

import { cn } from '../cn';

import { colors } from './colors';
import { controlHeightsPx, layout } from './layout';
import { radiiPx } from './radii';
import { shadows } from './shadows';
import { px, spacingUnit } from './spacing';
import { fontSizesPx, fontWeights, letterSpacings, lineHeights } from './typography';

const EXPECTED_SIZES = [
  10, 11, 11.5, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28, 30, 32, 34, 40, 44,
];

describe('[SPEC-301] jetons', () => {
  it('convertit les pixels maquette en rem sans arrondi (CL-2)', () => {
    expect(px(14)).toBe('0.875rem');
    expect(px(11.5)).toBe('0.71875rem');
    expect(px(1)).toBe('0.0625rem');
    expect(spacingUnit).toBe('0.0625rem');
  });

  it('déclare les 60 couleurs de EF-2 et les 16 couleurs d’états de brique de SPEC-503', () => {
    const entries = Object.entries(colors);
    expect(entries).toHaveLength(76);
    for (const [name, value] of entries) {
      if (value.startsWith('rgba(')) {
        expect(value, name).toMatch(/^rgba\(\d+, \d+, \d+, \d+(?:\.\d+)?\)$/);
      } else {
        expect(value, name).toMatch(/^#[0-9A-F]{6}$/);
      }
    }
    expect(colors.canvas).toBe('#F4F4F1');
    expect(colors.ink).toBe('#111113');
    expect(colors.lime).toBe('#C6F432');
    expect(colors.indigo).toBe('#5B5BD6');
    expect(colors.border).toBe('#E7E6E1');
    expect(colors['border-strong']).toBe('#DAD9D3');
  });

  it('déclare toutes les tailles, graisses et interlignages de EF-4', () => {
    expect([...fontSizesPx]).toEqual(EXPECTED_SIZES);
    expect([...fontWeights]).toEqual([400, 500, 600, 700]);
    expect([...lineHeights]).toEqual([
      1, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6, 1.7,
    ]);
    expect(letterSpacings).toEqual({
      eyebrow: '0.08em',
      kicker: '0.1em',
      label: '0.06em',
      title: '-0.02em',
      heading: '-0.01em',
    });
  });

  it('déclare les rayons, ombres, hauteurs et mesures de mise en page', () => {
    expect([...radiiPx]).toEqual([
      2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28,
    ]);
    expect(shadows.popover).toBe('0 1.125rem 3rem rgba(17, 17, 19, 0.16)');
    expect(shadows.menu).toBe('0 1rem 2.5rem rgba(17, 17, 19, 0.14)');
    expect([...controlHeightsPx]).toEqual([28, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52]);
    expect(layout).toEqual({
      sidebarWidthPx: 248,
      contentMaxPx: 1160,
      pagePadXPx: 40,
      pagePadTopPx: 28,
      pagePadBottomPx: 56,
      headerPadYPx: 12,
      popoverWidthPx: 400,
      menuWidthPx: 260,
      shellBreakpointPx: 900,
    });
  });

  it('fusionne les classes avec les échelles de jetons (ET-4)', () => {
    expect(cn('p-12', 'p-14')).toBe('p-14');
    expect(cn('bg-ink', 'bg-lime')).toBe('bg-lime');
    expect(cn('text-12', 'text-34')).toBe('text-34');
    expect(cn('rounded-8', 'rounded-24')).toBe('rounded-24');
    expect(cn('shadow-menu', 'shadow-popover')).toBe('shadow-popover');
    expect(cn('font-semibold', false, undefined, 'text-ink')).toBe('font-semibold text-ink');
  });

  RuleTester.describe = describe;
  RuleTester.it = it;
  RuleTester.itOnly = it.only;
  // RuleTester needs the core rule instance; the export is deprecated but still the supported
  // way to test a configuration of a built-in rule.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const rule = builtinRules.get('no-restricted-syntax');
  if (!rule) throw new Error('règle no-restricted-syntax introuvable');
  const ruleTester = new RuleTester({
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
  });
  ruleTester.run('[SPEC-301] règle ESLint no-restricted-syntax', rule, {
    valid: [{ code: 'const color = tokens.colors.ink;' }, { code: "const shade = 'canvas';" }],
    invalid: [
      {
        code: "const color = '#111113';",
        options: [
          {
            selector: 'Literal[value=/#[0-9A-Fa-f]{3,8}\\b/]',
            message: 'Couleur hors jetons : importer @learny/ui/tokens (SPEC-301, ET-7).',
          },
        ],
        errors: [{ message: 'Couleur hors jetons : importer @learny/ui/tokens (SPEC-301, ET-7).' }],
      },
    ],
  });
});
