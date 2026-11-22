// Design tokens of the mobile application (SPEC-3002 EF-1, ET-2, ADR-3004 § 4).
//
// Colours come from `@learny/ui/tokens` and nowhere else; the native scales (34 pt on iOS, 31 sp
// on Android, 44/48 pt touch targets) and the radii of `design/app-mobile/README.md`
// § Choix de conception live here, outside React Native, so that Vitest can verify them (ET-2).
// ESLint refuses a colour literal outside `src/theme/` (ET-1).
import {
  colors as tokenColors,
  motion as tokenMotion,
  radiiPx,
  spacingPx,
} from '@learny/ui/tokens';
import type { RadiusPx, SpacingPx } from '@learny/ui/tokens';

/** The two supported platforms (canevas § 3). */
export type PlatformName = 'ios' | 'android';

/** Colour palette of the application, keyed by usage. Every value is a design-system token. */
export const colors = {
  canvas: tokenColors.canvas,
  surface: tokenColors.surface,
  surfaceSubtle: tokenColors['surface-subtle'],
  surfaceMuted: tokenColors['surface-muted'],
  ink: tokenColors.ink,
  inkSecondary: tokenColors['ink-secondary'],
  inkMuted: tokenColors['ink-muted'],
  border: tokenColors.border,
  borderStrong: tokenColors['border-strong'],
  divider: tokenColors.divider,
  handle: tokenColors['border-dashed'],
  lime: tokenColors.lime,
  limeSoft: tokenColors['lime-soft'],
  limeInk: tokenColors['lime-ink'],
  indigo: tokenColors.indigo,
  indigoSoft: tokenColors['indigo-soft'],
  indigoInk: tokenColors['indigo-ink'],
  indigoInkStrong: tokenColors['indigo-ink-strong'],
  orange: tokenColors.orange,
  orangeSoft: tokenColors['orange-soft'],
  orangeInk: tokenColors['orange-ink'],
  green: tokenColors.green,
  greenSoft: tokenColors['green-soft'],
  greenInk: tokenColors['green-ink'],
  danger: tokenColors.danger,
  dangerSoft: tokenColors['danger-soft'],
  offlineSoft: tokenColors['offline-soft'],
  white: tokenColors.white,
  darkSurface: tokenColors['dark-800'],
  onDarkMuted: tokenColors['on-dark-muted'],
  onDarkSecondary: tokenColors['on-dark-secondary'],
  onDarkFaint: tokenColors['on-dark-faint'],
  overlay: tokenColors.overlay,
} as const;

/** Colour names usable by a component: a typo in a tone is a compilation error. */
export type ColorName = keyof typeof colors;

/**
 * Embedded font families (`assets/fonts/`, expo-font plugin of `app.config.ts`). A family carries
 * its weight: React Native resolves the file, a `fontWeight` on top of a custom family is not
 * reliable on Android, so the style never sets one.
 */
export const fontFamilies = {
  displayMedium: 'SpaceGrotesk-Medium',
  display: 'SpaceGrotesk-SemiBold',
  displayBold: 'SpaceGrotesk-Bold',
  body: 'Inter-Regular',
  bodyMedium: 'Inter-Medium',
  bodySemiBold: 'Inter-SemiBold',
  bodyBold: 'Inter-Bold',
} as const;

export type FontFamilyName = keyof typeof fontFamilies;

/** One typographic step: the platform scale of `design/app-mobile/README.md` § Choix de conception. */
export interface TypeToken {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly fontFamily: FontFamilyName;
  readonly letterSpacing: number;
  readonly textTransform?: 'uppercase';
}

export interface TypeScale {
  /** Over-title, uppercase on Android (maquette `.kicker`). */
  readonly eyebrow: TypeToken;
  /** Large title of iOS and headline of Android (34 pt / 31 sp). */
  readonly largeTitle: TypeToken;
  /** Section title (20 pt / 20 sp). */
  readonly sectionTitle: TypeToken;
  /** Row or card title (16 pt). */
  readonly title: TypeToken;
  /** Running text (16 pt / 16 sp). */
  readonly body: TypeToken;
  /** Secondary running text (14 pt). */
  readonly bodySmall: TypeToken;
  /** Label (12 pt on iOS, 11 sp uppercase on Android). */
  readonly label: TypeToken;
  /** Detail under a label (12.5 pt). */
  readonly caption: TypeToken;
  /** Figures of the stat cards (Space Grotesk, 26 pt). */
  readonly figure: TypeToken;
  /** Label of a button (15 pt semibold on iOS, 15 pt medium on Android). */
  readonly button: TypeToken;
  /** Label of a small button (13 pt). */
  readonly buttonSmall: TypeToken;
  /** Label of a chip (12 pt). */
  readonly chip: TypeToken;
  /** Title of a `ListRow` (16 pt). */
  readonly rowTitle: TypeToken;
  /** Subtitle of a `ListRow` (13 pt). */
  readonly rowSubtitle: TypeToken;
  /** Label above the figure of a stat card (11 pt). */
  readonly statLabel: TypeToken;
  /** Toast message (13 pt medium). */
  readonly toast: TypeToken;
  /** Count of a badge (11 pt semibold). */
  readonly badge: TypeToken;
  /** Title of a large header or of a sheet (18 pt on iOS, 19 pt on Android). */
  readonly sheetTitle: TypeToken;
}

/** Typography of both platforms: the only place where a font size is written down. */
export const typeScale = {
  ios: {
    eyebrow: { fontSize: 13, lineHeight: 18, fontFamily: 'bodyMedium', letterSpacing: 0 },
    largeTitle: { fontSize: 34, lineHeight: 36, fontFamily: 'display', letterSpacing: -1.2 },
    sectionTitle: { fontSize: 20, lineHeight: 24, fontFamily: 'display', letterSpacing: -0.4 },
    title: { fontSize: 16, lineHeight: 21, fontFamily: 'bodySemiBold', letterSpacing: 0 },
    body: { fontSize: 16, lineHeight: 23, fontFamily: 'body', letterSpacing: 0 },
    bodySmall: { fontSize: 14, lineHeight: 21, fontFamily: 'body', letterSpacing: 0 },
    label: { fontSize: 12, lineHeight: 16, fontFamily: 'bodySemiBold', letterSpacing: 0.2 },
    caption: { fontSize: 12, lineHeight: 17, fontFamily: 'body', letterSpacing: 0 },
    figure: { fontSize: 26, lineHeight: 29, fontFamily: 'display', letterSpacing: -0.8 },
    button: { fontSize: 15, lineHeight: 20, fontFamily: 'bodySemiBold', letterSpacing: -0.15 },
    buttonSmall: { fontSize: 13, lineHeight: 18, fontFamily: 'bodySemiBold', letterSpacing: 0 },
    chip: { fontSize: 12, lineHeight: 16, fontFamily: 'bodySemiBold', letterSpacing: 0 },
    rowTitle: { fontSize: 16, lineHeight: 21, fontFamily: 'bodyMedium', letterSpacing: 0 },
    rowSubtitle: { fontSize: 13, lineHeight: 18, fontFamily: 'body', letterSpacing: 0 },
    statLabel: { fontSize: 11, lineHeight: 15, fontFamily: 'bodySemiBold', letterSpacing: 0 },
    toast: { fontSize: 13, lineHeight: 18, fontFamily: 'bodyMedium', letterSpacing: 0 },
    badge: { fontSize: 11, lineHeight: 14, fontFamily: 'bodySemiBold', letterSpacing: 0 },
    sheetTitle: { fontSize: 18, lineHeight: 24, fontFamily: 'display', letterSpacing: -0.2 },
  },
  android: {
    eyebrow: {
      fontSize: 11,
      lineHeight: 15,
      fontFamily: 'bodySemiBold',
      letterSpacing: 0.99,
      textTransform: 'uppercase',
    },
    largeTitle: { fontSize: 31, lineHeight: 34, fontFamily: 'displayMedium', letterSpacing: -0.6 },
    sectionTitle: {
      fontSize: 20,
      lineHeight: 24,
      fontFamily: 'displayMedium',
      letterSpacing: -0.1,
    },
    title: { fontSize: 16, lineHeight: 21, fontFamily: 'body', letterSpacing: 0 },
    body: { fontSize: 16, lineHeight: 24, fontFamily: 'body', letterSpacing: 0 },
    bodySmall: { fontSize: 14, lineHeight: 21, fontFamily: 'body', letterSpacing: 0 },
    label: {
      fontSize: 11,
      lineHeight: 15,
      fontFamily: 'bodySemiBold',
      letterSpacing: 0.66,
      textTransform: 'uppercase',
    },
    caption: { fontSize: 12, lineHeight: 17, fontFamily: 'body', letterSpacing: 0 },
    figure: { fontSize: 26, lineHeight: 29, fontFamily: 'displayMedium', letterSpacing: -0.8 },
    button: { fontSize: 15, lineHeight: 20, fontFamily: 'bodyMedium', letterSpacing: 0.15 },
    buttonSmall: { fontSize: 13, lineHeight: 18, fontFamily: 'bodyMedium', letterSpacing: 0 },
    chip: { fontSize: 12, lineHeight: 16, fontFamily: 'bodyMedium', letterSpacing: 0 },
    rowTitle: { fontSize: 16, lineHeight: 21, fontFamily: 'body', letterSpacing: 0 },
    rowSubtitle: { fontSize: 13, lineHeight: 18, fontFamily: 'body', letterSpacing: 0 },
    statLabel: { fontSize: 11, lineHeight: 15, fontFamily: 'bodyMedium', letterSpacing: 0 },
    toast: { fontSize: 13, lineHeight: 18, fontFamily: 'bodyMedium', letterSpacing: 0 },
    badge: { fontSize: 11, lineHeight: 14, fontFamily: 'bodySemiBold', letterSpacing: 0 },
    sheetTitle: { fontSize: 19, lineHeight: 25, fontFamily: 'displayMedium', letterSpacing: -0.1 },
  },
} as const satisfies Record<PlatformName, TypeScale>;

/** Refuses a radius that is not in the design-system scale (ET-2). */
function radiusToken(value: RadiusPx): RadiusPx {
  if (!radiiPx.includes(value)) throw new Error(`Rayon hors jetons : ${String(value)}`);
  return value;
}

/**
 * Radii: cards are 22 and options 20 on both platforms (EF-1); the sheet and the list keep their
 * native form (ADR-3003 § 3). The pill is `radiusFull` of the design system, as a number because
 * React Native wants one.
 */
export const radii = {
  card: radiusToken(22),
  option: radiusToken(20),
  control: radiusToken(12),
  sheet: { ios: radiusToken(24), android: radiusToken(28) },
  chip: { ios: 999, android: radiusToken(8) },
  stat: { ios: radiusToken(16), android: radiusToken(14) },
  list: { ios: radiusToken(20), android: radiusToken(18) },
  iconButton: { ios: radiusToken(14), android: 999 },
  badge: radiusToken(8),
  pill: 999,
} as const;

/** Refuses a spacing that is not in the design-system scale (ET-2). */
function spacingToken(value: SpacingPx): SpacingPx {
  if (!spacingPx.includes(value)) throw new Error(`Espacement hors jetons : ${String(value)}`);
  return value;
}

/** Spacing scale of the mockups, in density-independent pixels. */
export const spacing = {
  xs: spacingToken(4),
  sm: spacingToken(6),
  md: spacingToken(10),
  lg: spacingToken(14),
  xl: spacingToken(20),
  xxl: spacingToken(24),
  xxxl: spacingToken(32),
  huge: spacingToken(48),
} as const;

/** Geometry of a shadow for both platforms: `shadow*` on iOS, `elevation` on Android. */
export interface ShadowSpec {
  readonly ios: {
    readonly shadowColor: string;
    readonly shadowOpacity: number;
    readonly shadowRadius: number;
    readonly shadowOffset: { readonly width: number; readonly height: number };
  };
  readonly android: { readonly elevation: number };
}

/** Elevations of the mockups (`--shadow-soft`, `.fab`, `.toast`, `.sheet`). */
export const shadows = {
  card: {
    ios: {
      shadowColor: colors.ink,
      shadowOpacity: 0.04,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
    },
    android: { elevation: 1 },
  },
  float: {
    ios: {
      shadowColor: colors.ink,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
    android: { elevation: 6 },
  },
  toast: {
    ios: {
      shadowColor: colors.ink,
      shadowOpacity: 0.45,
      shadowRadius: 17,
      shadowOffset: { width: 0, height: 14 },
    },
    android: { elevation: 12 },
  },
  sheet: {
    ios: {
      shadowColor: colors.ink,
      shadowOpacity: 0.45,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: -24 },
    },
    android: { elevation: 16 },
  },
} as const satisfies Record<string, ShadowSpec>;

/** Motion durations, in milliseconds (ETH-4: 0 when the system reduces motion). */
export const durations = {
  fast: tokenMotion.fastMs,
  sheet: 280,
  toast: tokenMotion.toastMs,
  toastAction: tokenMotion.toastActionMs,
  skeleton: tokenMotion.skeletonMs,
} as const;

/** Minimum touch target per platform (BR-PLA-02, canevas § 3). */
export const minTouchTarget = {
  ios: { width: 44, height: 44 },
  android: { width: 48, height: 48 },
} as const;

/**
 * Control geometry of the mockups (`design/app-mobile/assets/app.css`), in pt/dp. The heights
 * follow the native scales of § Choix de conception (50/52 for a button, 30/32 for a chip); the
 * mockup-only values (row 56, avatar 64) are listed here so that no component writes one (ET-1).
 */
export const controlHeights = {
  button: { ios: { md: 50, sm: 38 }, android: { md: 52, sm: 40 } },
  chip: { ios: 30, android: 32 },
  iconButton: 44,
  row: 56,
  avatar: { sm: 32, md: 44, lg: 64 },
  fab: 56,
  progressTrack: 6,
  progressSegment: 4,
  sheetGrabber: { width: 36, height: 5 },
} as const;
