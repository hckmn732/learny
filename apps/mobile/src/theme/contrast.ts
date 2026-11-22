// WCAG 2.2 contrast checks of the mobile theme (SPEC-3002 BR-PLA-03, CA-2).
//
// The formulas are the ones of the design system (`packages/ui/src/accessibility/contrast.ts`);
// they are imported through the `@learny/ui/accessibility/contrast` entry point so that the web
// and the mobile cannot diverge. The pairs below are the text/background combinations the
// components of `src/ui/` actually render; the test asserts the AA thresholds.
import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
  type ContrastPair,
} from '@learny/ui/accessibility/contrast';

import { colors, type ColorName } from './tokens';

/** A text/background pair of the mobile theme, with the WCAG threshold that applies to it. */
export interface ThemeContrastPair extends ContrastPair {
  /** Foreground colour of the theme (not only a web token). */
  readonly foreground: ColorName;
  /** Background colour of the theme. */
  readonly background: ColorName;
}

function pair(
  id: string,
  foreground: ColorName,
  background: ColorName,
  minimum: number = AA_NORMAL_TEXT,
): ThemeContrastPair {
  return { id, foreground, background, minimum };
}

/** Every text/background pair rendered by the components of SPEC-3002 (CA-2). */
export const TEXT_PAIRS: readonly ThemeContrastPair[] = [
  pair('ink-on-canvas', 'ink', 'canvas'),
  pair('ink-on-surface', 'ink', 'surface'),
  pair('ink-secondary-on-surface', 'inkSecondary', 'surface'),
  pair('ink-muted-on-surface', 'inkMuted', 'surface'),
  pair('ink-muted-on-canvas', 'inkMuted', 'canvas'),
  pair('white-on-ink', 'white', 'ink'),
  pair('lime-on-ink', 'lime', 'ink'),
  pair('ink-on-lime', 'ink', 'lime'),
  pair('lime-ink-on-lime', 'limeInk', 'lime'),
  pair('lime-ink-on-lime-soft', 'limeInk', 'limeSoft'),
  pair('white-on-indigo', 'white', 'indigo'),
  pair('indigo-ink-on-indigo-soft', 'indigoInk', 'indigoSoft'),
  pair('orange-ink-on-orange-soft', 'orangeInk', 'orangeSoft'),
  pair('green-ink-on-green-soft', 'greenInk', 'greenSoft'),
  pair('ink-on-green', 'ink', 'green'),
  pair('ink-on-orange', 'ink', 'orange'),
  pair('danger-on-surface', 'danger', 'surface'),
  pair('danger-on-danger-soft', 'danger', 'dangerSoft'),
  pair('ink-on-offline-soft', 'ink', 'offlineSoft'),
  pair('orange-ink-on-offline-soft', 'orangeInk', 'offlineSoft'),
  pair('ink-on-surface-muted', 'ink', 'surfaceMuted'),
  pair('on-dark-secondary-on-dark-surface', 'onDarkSecondary', 'darkSurface'),
  pair('on-dark-muted-on-dark-surface', 'onDarkMuted', 'darkSurface'),
  pair('lime-on-dark-surface', 'lime', 'darkSurface'),
  // Large text only: the mockups use these for titles and figures (18 pt and above).
  pair('orange-ink-on-canvas', 'orangeInk', 'canvas', AA_LARGE_TEXT),
];

/** Contrast ratio of a theme pair. */
export function themePairRatio(value: ThemeContrastPair): number {
  return contrastRatio(colors[value.foreground], colors[value.background]);
}

/** The pairs that miss their WCAG threshold; empty when the theme is compliant. */
export function failingPairs(
  values: readonly ThemeContrastPair[] = TEXT_PAIRS,
): readonly ThemeContrastPair[] {
  return values.filter((value) => themePairRatio(value) < value.minimum);
}

export interface ContrastRow extends ThemeContrastPair {
  /** Measured ratio, rounded to two decimals for the evidence table. */
  readonly ratio: number;
}

/** The evidence table of CA-2, in the declared order. */
export function contrastReport(
  values: readonly ThemeContrastPair[] = TEXT_PAIRS,
): readonly ContrastRow[] {
  return values.map((value) => ({
    ...value,
    ratio: Math.round(themePairRatio(value) * 100) / 100,
  }));
}
