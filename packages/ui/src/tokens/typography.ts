// Typography tokens (SPEC-301, EF-3 and EF-4). Sizes are mockup pixels; the theme converts them
// to rem with `px()` so that `html { font-size: 90% }` reproduces the 90 % scale of the mockups.

/** Font stacks. The web app fills the CSS variables with the next/font families (EF-3). */
export const fontFamilies = {
  sans: 'Inter, system-ui, sans-serif',
  display: '"Space Grotesk", sans-serif',
  mono: 'ui-monospace, monospace',
} as const;

export type FontFamilyToken = keyof typeof fontFamilies;

/** Text sizes in mockup pixels, in published order (EF-4). */
export const fontSizesPx = [
  10, 11, 11.5, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28, 30, 32, 34, 40, 44,
] as const;

export type FontSizePx = (typeof fontSizesPx)[number];

/** Font weights exposed by the design system (EF-4). */
export const fontWeights = [400, 500, 600, 700] as const;

export type FontWeight = (typeof fontWeights)[number];

/** Unitless line heights used by the mockups (EF-4). */
export const lineHeights = [
  1, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.45, 1.5, 1.55, 1.6, 1.7,
] as const;

export type LineHeight = (typeof lineHeights)[number];

/** Letter spacings, in em, named by their mockup usage (EF-4). */
export const letterSpacings = {
  eyebrow: '0.08em',
  kicker: '0.1em',
  label: '0.06em',
  title: '-0.02em',
  heading: '-0.01em',
} as const;

export type LetterSpacingToken = keyof typeof letterSpacings;
