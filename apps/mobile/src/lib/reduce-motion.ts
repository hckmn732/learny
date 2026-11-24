// Pure reduced-motion rule (SPEC-3001 CL-5, BR-PLA-03), kept free of React Native so that Vitest
// can cover it: every transition of the mobile application reads its duration here, and the
// duration is 0 when the system asks to reduce motion.
export function transitionDuration(reduceMotion: boolean, duration = 220): number {
  return reduceMotion ? 0 : duration;
}
