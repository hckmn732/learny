'use client';

import { useEffect, useState } from 'react';

import { breakpoints, breakpointsRem, type Breakpoint } from '../tokens/breakpoints';

/**
 * Media query of a breakpoint. The comparison is strict (`width < value`), so 768 px is no
 * longer mobile for `sm` and 900 px is no longer compact for `nav` (SPEC-802 ET-1).
 */
export function breakpointQuery(breakpoint: Breakpoint): string {
  return `(width < ${String(breakpointsRem[breakpoint])}rem)`;
}

/** Strict CSS-pixel comparison used by the hook and its boundary tests. */
export function isBelowBreakpoint(widthPx: number, breakpoint: Breakpoint): boolean {
  return widthPx < breakpoints[breakpoint];
}

/**
 * Behaviour-only viewport helper (SPEC-802 ET-2). The server and the first client render answer
 * `false` (desktop): layout is carried by CSS, so hydration never shifts the disposition. Use it
 * for behaviour (default agenda view, Popover vs ResponsivePanel), never for the layout itself.
 */
export function useBreakpoint(breakpoint: Breakpoint = 'sm'): boolean {
  const [below, setBelow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(breakpointQuery(breakpoint));
    const update = () => {
      setBelow(query.matches);
    };
    update();
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, [breakpoint]);

  return below;
}
