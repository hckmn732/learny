// Reduced-motion hooks (SPEC-3001 CL-5, BR-PLA-03). The pure duration rule lives in
// `reduce-motion.ts` so that it stays testable without React Native.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export { transitionDuration } from './reduce-motion';

/** System preference `AccessibilityInfo.isReduceMotionEnabled`, kept up to date. */
export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
