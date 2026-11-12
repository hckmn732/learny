// Motion durations of the overlay components (SPEC-303, ADR-0138).
export const motion = {
  /** Dialog, popover and toast entrance, in milliseconds. */
  fastMs: 150,
  /** Skeleton pulse cycle, in milliseconds. */
  skeletonMs: 1500,
  /** Toast default duration, in milliseconds. */
  toastMs: 5000,
  /** Toast with an action, in milliseconds. */
  toastActionMs: 8000,
} as const;

export type MotionToken = keyof typeof motion;
