// Reanimated helpers of the animated components (SPEC-3002 ET-4). Every animation runs on the UI
// thread and its duration is 0 when the system asks to reduce motion (BR-PLA-03).
import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { transitionDuration, useReducedMotion } from '../lib/motion';

/** Fade and rise of an entering overlay (a toast, a sheet). */
export function useEnterStyle(duration: number, distance = 12) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: transitionDuration(reduceMotion, duration) });
  }, [duration, progress, reduceMotion]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));
}

/** Opacity pulse of a skeleton; a frozen opacity when motion is reduced or the pulse is off. */
export function usePulseStyle(active: boolean, duration: number) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    if (!active || reduceMotion) {
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: duration / 2 }),
        withTiming(0.45, { duration: duration / 2 }),
      ),
      -1,
    );
    return () => {
      opacity.value = 0.6;
    };
  }, [active, duration, opacity, reduceMotion]);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}
