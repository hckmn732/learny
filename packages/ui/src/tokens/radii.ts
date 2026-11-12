// Border radii (SPEC-301, EF-6). Tailwind classes are `rounded-<px>` plus `rounded-full`.

/** Radii in mockup pixels, in published order. */
export const radiiPx = [
  2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28,
] as const;

export type RadiusPx = (typeof radiiPx)[number];

/** Fully rounded elements (badges, avatars). */
export const radiusFull = '999px';
