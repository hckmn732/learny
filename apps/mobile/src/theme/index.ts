// Native theme of the mobile application (canevas § 2, ADR-3004 § 4): every colour, size, radius
// and font comes from the tokens of `@learny/ui/tokens`. A literal is refused by ESLint.
import type { TextStyle } from 'react-native';

import {
  colors,
  fontFamilies,
  fontSizesPx,
  fontWeights,
  lineHeights,
  radiiPx,
  spacingPx,
} from '@learny/ui/tokens';
import type { FontSizePx, LineHeight, RadiusPx } from '@learny/ui/tokens';

/** Families of the embedded fonts (`app.config.ts` declares the same files). */
export const fonts = {
  display: 'SpaceGrotesk-Bold',
  displayMedium: 'SpaceGrotesk-Medium',
  body: 'Inter-Regular',
  bodyMedium: 'Inter-Medium',
  bodySemiBold: 'Inter-SemiBold',
} as const;

/** Safe indexed access to a token tuple (`noUncheckedIndexedAccess`). */
function at<T>(values: readonly T[], index: number, fallback: T): T {
  return values[index] ?? fallback;
}

/** Font size token by value: a size that is not in the design system cannot be used. */
export function size(px: FontSizePx): number {
  return at(fontSizesPx, fontSizesPx.indexOf(px), px);
}

/** Line height token by value. */
export function line(ratio: LineHeight): number {
  return at(lineHeights, lineHeights.indexOf(ratio), ratio);
}

/** Radius token by value. */
export function radiusToken(px: RadiusPx): number {
  return at(radiiPx, radiiPx.indexOf(px), px);
}

/** Spacing scale, in density-independent pixels. */
export const spacing = {
  xs: at(spacingPx, 2, 3),
  sm: at(spacingPx, 5, 6),
  md: at(spacingPx, 9, 12),
  lg: at(spacingPx, 13, 16),
  xl: at(spacingPx, 16, 24),
  xxl: at(spacingPx, 18, 28),
} as const;

/** Radii used by the components of SPEC-3001 (the mockups use 22 for their cards, § 10). */
export const radius = {
  card: radiusToken(22),
  control: radiusToken(12),
  pill: 999,
} as const;

/** Text styles: Space Grotesk for titles and figures, Inter for running text (canevas § 3). */
export const type = {
  eyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: size(12),
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.display,
    fontSize: size(30),
    lineHeight: size(30) * line(1.2),
    letterSpacing: -0.6,
  },
  figure: {
    fontFamily: fonts.display,
    fontSize: size(22),
  },
  body: {
    fontFamily: fonts.body,
    fontSize: size(15),
    lineHeight: size(15) * line(1.45),
  },
  value: {
    fontFamily: fonts.bodySemiBold,
    fontSize: size(15),
  },
  detail: {
    fontFamily: fonts.body,
    fontSize: size(13),
  },
  caption: {
    fontFamily: fonts.body,
    fontSize: size(12),
    lineHeight: size(12) * line(1.5),
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: size(12),
    letterSpacing: 0.3,
  },
} satisfies Record<string, TextStyle>;

/** Minimum touch target per platform (canevas § 3: 44 × 44 pt on iOS, 48 × 48 dp on Android). */
export const MIN_TOUCH_TARGET = { width: 48, height: 48 } as const;

export const theme = {
  colors,
  fonts,
  fontFamilies,
  fontWeights,
  spacing,
  radius,
  type,
  minTouchTarget: MIN_TOUCH_TARGET,
  /** Titles stop growing at 160 % (canevas § 3); running text has no cap (`0`). */
  maxFontSizeMultiplier: { heading: 1.6, body: 0 },
} as const;

export type Theme = typeof theme;
