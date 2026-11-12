// WCAG 2.2 contrast helpers for the design-system tokens (SPEC-309, ET-3, CA-3).
import { colors, type ColorToken } from '../tokens/colors';

/** Minimum contrast ratio for normal-size text (WCAG 2.2 AA, 1.4.3). */
export const AA_NORMAL_TEXT = 4.5;
/** Minimum contrast ratio for large text and graphical objects (WCAG 2.2 AA, 1.4.3/1.4.11). */
export const AA_LARGE_TEXT = 3;

export interface ContrastPair {
  /** Stable identifier used by the gallery and its tests. */
  id: string;
  foreground: ColorToken;
  background: ColorToken;
  /** Applicable WCAG threshold; these pairs carry normal-size text. */
  minimum: number;
}

/**
 * Token pairs rendered by the accessibility gallery. Every pair is used by visible text, so the
 * normal-text threshold applies; the list is also the regression contract of ET-3.
 */
export const ACCESSIBLE_TOKEN_PAIRS = [
  { id: 'ink-on-surface', foreground: 'ink', background: 'surface', minimum: AA_NORMAL_TEXT },
  { id: 'ink-on-canvas', foreground: 'ink', background: 'canvas', minimum: AA_NORMAL_TEXT },
  {
    id: 'ink-secondary-on-surface',
    foreground: 'ink-secondary',
    background: 'surface',
    minimum: AA_NORMAL_TEXT,
  },
  {
    id: 'ink-muted-on-surface',
    foreground: 'ink-muted',
    background: 'surface',
    minimum: AA_NORMAL_TEXT,
  },
  {
    id: 'indigo-ink-on-surface',
    foreground: 'indigo-ink',
    background: 'surface',
    minimum: AA_NORMAL_TEXT,
  },
  {
    id: 'lime-ink-on-lime-soft',
    foreground: 'lime-ink',
    background: 'lime-soft',
    minimum: AA_NORMAL_TEXT,
  },
  {
    id: 'orange-ink-on-orange-soft',
    foreground: 'orange-ink',
    background: 'orange-soft',
    minimum: AA_NORMAL_TEXT,
  },
  {
    id: 'green-ink-on-green-soft',
    foreground: 'green-ink',
    background: 'green-soft',
    minimum: AA_NORMAL_TEXT,
  },
  {
    id: 'violet-ink-on-violet-soft',
    foreground: 'violet-ink',
    background: 'violet-soft',
    minimum: AA_NORMAL_TEXT,
  },
  { id: 'danger-on-surface', foreground: 'danger', background: 'surface', minimum: AA_NORMAL_TEXT },
  {
    id: 'on-dark-secondary-on-dark-850',
    foreground: 'on-dark-secondary',
    background: 'dark-850',
    minimum: AA_NORMAL_TEXT,
  },
  { id: 'lime-on-ink', foreground: 'lime', background: 'ink', minimum: AA_NORMAL_TEXT },
  {
    id: 'orange-on-dark-on-dark-850',
    foreground: 'orange-on-dark',
    background: 'dark-850',
    minimum: AA_NORMAL_TEXT,
  },
  { id: 'white-on-indigo', foreground: 'white', background: 'indigo', minimum: AA_NORMAL_TEXT },
  { id: 'white-on-danger', foreground: 'white', background: 'danger', minimum: AA_NORMAL_TEXT },
] as const satisfies readonly ContrastPair[];

export type AccessibleTokenPairId = (typeof ACCESSIBLE_TOKEN_PAIRS)[number]['id'];

/** Parses the `#RRGGBB` form emitted by the token catalogue. */
function parseHex(value: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!match) {
    throw new Error(`Couleur non prise en charge pour le contraste WCAG : ${value}`);
  }
  const [, red, green, blue] = match;
  return [
    parseInt(red ?? '0', 16) / 255,
    parseInt(green ?? '0', 16) / 255,
    parseInt(blue ?? '0', 16) / 255,
  ];
}

function linearChannel(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 relative luminance (definition 0.2126 R + 0.7152 G + 0.0722 B). */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHex(hex).map(linearChannel);
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

/** WCAG 2.2 contrast ratio, between 1 and 21. */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** True when the pair reaches the requested threshold (AA normal text by default). */
export function meetsContrast(
  foreground: string,
  background: string,
  minimum: number = AA_NORMAL_TEXT,
): boolean {
  return contrastRatio(foreground, background) >= minimum;
}

/** Contrast ratio of a catalogue pair. */
export function pairContrast(pair: Pick<ContrastPair, 'foreground' | 'background'>): number {
  return contrastRatio(colors[pair.foreground], colors[pair.background]);
}
