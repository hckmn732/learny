// Native theme of the mobile application (SPEC-3002 EF-1): the tokens of `./tokens` resolved for
// the running platform. A component imports `theme` and never writes a colour, a size or a radius
// (ET-1, ESLint `no-restricted-syntax`).
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import {
  colors,
  controlHeights,
  durations,
  fontFamilies,
  minTouchTarget,
  radii,
  shadows,
  spacing,
  typeScale,
} from './tokens';
import type { PlatformName, ShadowSpec, TypeToken } from './tokens';

export { colors, durations, fontFamilies, minTouchTarget, radii, shadows, spacing, typeScale };
export type { ColorName, FontFamilyName, PlatformName, ShadowSpec, TypeToken } from './tokens';

/** Platform of the running application: iOS or Android, never a third (canevas § 3). */
export const platform: PlatformName = Platform.OS === 'ios' ? 'ios' : 'android';

/** Picks the value of the running platform in a two-platform pair. */
function perPlatform<T>(values: { readonly ios: T; readonly android: T }): T {
  return platform === 'ios' ? values.ios : values.android;
}

function textStyle(token: TypeToken): TextStyle {
  return {
    fontFamily: fontFamilies[token.fontFamily],
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    letterSpacing: token.letterSpacing,
    ...(token.textTransform === undefined ? {} : { textTransform: token.textTransform }),
  };
}

const scale = typeScale[platform];

/**
 * Text styles. `largeTitle` and `sectionTitle` are headings: they stop growing at 160 %
 * (`maxFontSizeMultiplier.heading`); running text has no cap (ET-5).
 */
export const type = {
  eyebrow: textStyle(scale.eyebrow),
  largeTitle: textStyle(scale.largeTitle),
  sectionTitle: textStyle(scale.sectionTitle),
  title: textStyle(scale.title),
  body: textStyle(scale.body),
  bodySmall: textStyle(scale.bodySmall),
  label: textStyle(scale.label),
  caption: textStyle(scale.caption),
  figure: textStyle(scale.figure),
  button: textStyle(scale.button),
  buttonSmall: textStyle(scale.buttonSmall),
  chip: textStyle(scale.chip),
  rowTitle: textStyle(scale.rowTitle),
  rowSubtitle: textStyle(scale.rowSubtitle),
  statLabel: textStyle(scale.statLabel),
  toast: textStyle(scale.toast),
  badge: textStyle(scale.badge),
  sheetTitle: textStyle(scale.sheetTitle),
  // Aliases kept from SPEC-3001 so that the screens of the track share one vocabulary.
  value: textStyle(scale.title),
  detail: textStyle(scale.bodySmall),
  meta: textStyle(scale.caption),
} satisfies Record<string, TextStyle>;

/** Radii of the running platform. */
export const radius = {
  card: radii.card,
  option: radii.option,
  control: radii.control,
  sheet: perPlatform(radii.sheet),
  chip: perPlatform(radii.chip),
  stat: perPlatform(radii.stat),
  list: perPlatform(radii.list),
  iconButton: perPlatform(radii.iconButton),
  badge: radii.badge,
  pill: radii.pill,
} as const;

function viewStyle(spec: ShadowSpec): ViewStyle {
  if (platform === 'android') return { elevation: spec.android.elevation };
  return {
    shadowColor: spec.ios.shadowColor,
    shadowOpacity: spec.ios.shadowOpacity,
    shadowRadius: spec.ios.shadowRadius,
    shadowOffset: spec.ios.shadowOffset,
  };
}

/** Elevations of the running platform. */
export const elevation = {
  card: viewStyle(shadows.card),
  float: viewStyle(shadows.float),
  toast: viewStyle(shadows.toast),
  sheet: viewStyle(shadows.sheet),
} as const;

/** Minimum touch target of the platform (BR-PLA-02). */
export const touchTarget: { readonly width: number; readonly height: number } = perPlatform<{
  readonly width: number;
  readonly height: number;
}>(minTouchTarget);

/**
 * Vertical `hitSlop` that lifts a control of `height` to the platform minimum: a 40 dp button on
 * Android gets 4 dp on each side and never misses the 48 dp rule (CA-3).
 */
export function verticalHitSlop(height: number): number {
  return Math.max(0, Math.ceil((touchTarget.height - height) / 2));
}

/** Title growth stops at 160 %; running text follows the system without limit (canevas § 3). */
export const maxFontSizeMultiplier = { heading: 1.6, body: 0 } as const;

/** Control geometry of the running platform (see `controlHeights` in `./tokens`). */
export const controls = {
  button: perPlatform<{ readonly md: number; readonly sm: number }>(controlHeights.button),
  chip: perPlatform<number>(controlHeights.chip),
  iconButton: controlHeights.iconButton,
  row: controlHeights.row,
  avatar: controlHeights.avatar,
  fab: controlHeights.fab,
  progressTrack: controlHeights.progressTrack,
  progressSegment: controlHeights.progressSegment,
  sheetGrabber: controlHeights.sheetGrabber,
} as const;

export const theme = {
  platform,
  colors,
  fontFamilies,
  type,
  radius,
  elevation,
  spacing,
  durations,
  minTouchTarget: touchTarget,
  touchTarget,
  controls,
  maxFontSizeMultiplier,
} as const;

export type Theme = typeof theme;
