'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Modal isolation shared by Dialog and AlertDialog (SPEC-303, EF-8, CL-2):
 * locks body scroll, marks every other body child `inert` so the background is not focusable
 * while a modal is open, and restores both on close. `inert` complements the `aria-hidden`
 * applied by Radix and keeps axe's `aria-hidden-focus` rule satisfied.
 */
export function useModalIsolation(open: boolean, portalRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const portal = portalRef.current;
    const siblings = [...document.body.children].filter((element) => {
      if (element === portal) return false;
      if (portal && element.contains(portal)) return false;
      return !['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'].includes(element.tagName);
    });
    const previousInert = siblings.map(
      (element) => [element, element.getAttribute('inert')] as const,
    );
    for (const element of siblings) element.setAttribute('inert', '');

    return () => {
      document.body.style.overflow = previousOverflow;
      for (const [element, value] of previousInert) {
        if (value === null) element.removeAttribute('inert');
        else element.setAttribute('inert', value);
      }
    };
  }, [open, portalRef]);
}
