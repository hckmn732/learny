// Normalised token export used by tests and visual helpers (SPEC-301, ET-5).
import { colors } from './colors';
import { radiiPx } from './radii';
import { shadows } from './shadows';
import { fontFamilies, fontSizesPx } from './typography';

export const tokensExport = {
  colors,
  fontSizesPx,
  radiiPx,
  shadows,
  fontFamilies: Object.values(fontFamilies),
} as const;

export type TokensExport = typeof tokensExport;
