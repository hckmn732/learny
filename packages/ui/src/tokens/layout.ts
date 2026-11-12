// Layout and control metrics (SPEC-301, EF-8 and EF-9).
import { colors } from './colors';

/** Control heights in mockup pixels, in published order. */
export const controlHeightsPx = [28, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52] as const;

export type ControlHeightPx = (typeof controlHeightsPx)[number];

/** Page shell measurements in mockup pixels. The shell breakpoint is in CSS pixels (EF-8). */
export const layout = {
  sidebarWidthPx: 248,
  contentMaxPx: 1160,
  pagePadXPx: 40,
  pagePadTopPx: 28,
  pagePadBottomPx: 56,
  headerPadYPx: 12,
  popoverWidthPx: 400,
  menuWidthPx: 260,
  shellBreakpointPx: 900,
} as const;

export type LayoutToken = keyof typeof layout;

/**
 * Focus ring of `Inscription.dc.html` (EF-9). Outline values stay in CSS pixels: a focus contour
 * must not shrink with the 90 % scale.
 */
export const focusRing = {
  width: '3px',
  style: 'solid',
  color: colors.indigo,
  offset: '2px',
} as const;
