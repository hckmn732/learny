// Single source of truth for the responsive breakpoints (SPEC-802 ET-1, ADR-0201).
// Values are CSS pixels of the window: media queries are not affected by the 90 % scale.
export const breakpoints = {
  sm: 768,
  nav: 900,
  lg: 1024,
  xl: 1280,
  '2xl': 1440,
} as const;

export type Breakpoint = keyof typeof breakpoints;

/** Mockup values in rem of 16 px, in the published order. */
export const breakpointsRem = {
  sm: 48,
  nav: 56.25,
  lg: 64,
  xl: 80,
  '2xl': 90,
} as const;
