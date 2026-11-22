// Unit tests of the reduced-motion rule (SPEC-3001 CL-5, BR-PLA-03).
// The React hook (`useReducedMotion`) lives in `motion.ts` and touches React Native; the pure rule
// it applies to every transition is covered here, without a device.
import { describe, expect, it } from 'vitest';

import { transitionDuration } from './reduce-motion';

describe('[SPEC-3001] réduction des animations', () => {
  it('anime pendant 220 ms quand la réduction est désactivée', () => {
    expect(transitionDuration(false)).toBe(220);
  });

  it('utilise la durée 0 quand la réduction des animations est activée (CL-5)', () => {
    expect(transitionDuration(true)).toBe(0);
  });

  it('accepte une durée explicite et la remet à zéro si nécessaire', () => {
    expect(transitionDuration(false, 500)).toBe(500);
    expect(transitionDuration(true, 500)).toBe(0);
  });
});
