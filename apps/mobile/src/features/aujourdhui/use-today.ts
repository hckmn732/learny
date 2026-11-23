// Focus of a tab screen (SPEC-3201 ET-2; extracted from the shell of SPEC-3102).
//
// « Dans N min » is recomputed every minute only while the screen is visible: the interval of the
// screen is stopped as soon as another tab is focused, and the header keeps polling its pastille on
// the same rule.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { clock } from '../../lib/clock';

/** True while the screen is the visible one of its tab. */
export function useScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
      };
    }, []),
  );
  return focused;
}

/** Interval of the minute-by-minute refresh of the screen (ET-2). */
export const MINUTE_TICK_MS = 60_000;

/** Current instant of the injected clock, refreshed every minute while `active` (ET-2). */
export function useNow(active = true): Date {
  // The tick only re-renders the screen: the instant itself is always read from the injected clock,
  // never from the state, so returning to the tab never shows a stale « Dans N min ».
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      setTick((current) => current + 1);
    }, MINUTE_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [active]);

  return clock.now();
}
