// Spacing tokens (SPEC-301, EF-5). One Tailwind spacing unit is one mockup pixel.

/** Converts mockup pixels to rem without rounding (`px(11.5) === '0.71875rem'`, CL-2). */
export function px(n: number): string {
  return `${String(n / 16)}rem`;
}

/** Spacing values used by the mockups (EF-5). */
export const spacingPx = [
  1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40, 42, 48, 56,
] as const;

export type SpacingPx = (typeof spacingPx)[number];

/** `p-14` is 14 mockup pixels, i.e. 0.875 rem rendered at 14.4 px per rem. */
export const spacingUnit = px(1);
