// Elevation shadows (SPEC-301, EF-7), in rem where the mockups used mockup pixels.
export const shadows = {
  popover: '0 1.125rem 3rem rgba(17, 17, 19, 0.16)',
  menu: '0 1rem 2.5rem rgba(17, 17, 19, 0.14)',
  segment: '0 0.0625rem 0.1875rem rgba(17, 17, 19, 0.12)',
  knob: '0 0.0625rem 0.125rem rgba(17, 17, 19, 0.2)',
  float: '0 0.75rem 2rem rgba(17, 17, 19, 0.12)',
  drawer: '-1.5rem 0 3.75rem rgba(17, 17, 19, 0.12)',
  toast: '0 1rem 2.5rem rgba(17, 17, 19, 0.28)',
  'ring-white': '0 0 0 0.125rem #FFFFFF',
} as const;

export type ShadowToken = keyof typeof shadows;
