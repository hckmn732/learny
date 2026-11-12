'use client';

import { forwardRef, useEffect, useRef, useState, type HTMLAttributes } from 'react';

import { cn } from '../cn';

export type LivePoliteness = 'polite' | 'assertive';

export interface LiveRegionProps extends HTMLAttributes<HTMLDivElement> {
  /** Message to announce; consecutive identical messages are not repeated (CL-2). */
  message: string;
  politeness?: LivePoliteness;
  /** Keeps the region out of the visual layout while leaving it available to screen readers. */
  visuallyHidden?: boolean;
  'data-testid'?: string;
}

/**
 * Only a non-empty message that differs from the previous one is announced. Clearing the message
 * resets the memory, so the same result can be announced again after a new action.
 */
export function shouldAnnounce(previous: string | null, next: string): boolean {
  const normalized = next.trim();
  return normalized.length > 0 && normalized !== previous;
}

/**
 * `aria-live` region of SPEC-309 (EF-3). Errors use `role="alert"` and assertive politeness; the
 * `data-announcement-count` attribute makes duplicate suppression observable in tests.
 */
export const LiveRegion = forwardRef<HTMLDivElement, LiveRegionProps>(
  (
    {
      message,
      politeness = 'polite',
      visuallyHidden = true,
      className,
      'data-testid': testId,
      ...props
    },
    ref,
  ) => {
    const normalized = message.trim();
    const [announced, setAnnounced] = useState(normalized);
    const [announcementCount, setAnnouncementCount] = useState(normalized.length > 0 ? 1 : 0);
    const previous = useRef<string | null>(normalized.length > 0 ? normalized : null);

    useEffect(() => {
      if (normalized.length === 0) {
        previous.current = null;
        setAnnounced('');
        return;
      }
      if (!shouldAnnounce(previous.current, normalized)) return;
      previous.current = normalized;
      setAnnounced(normalized);
      setAnnouncementCount((count) => count + 1);
    }, [normalized]);

    return (
      <div
        {...props}
        ref={ref}
        role={politeness === 'assertive' ? 'alert' : 'status'}
        aria-live={politeness}
        aria-atomic="true"
        className={cn(visuallyHidden && 'learny-visually-hidden', className)}
        data-announcement-count={announcementCount}
        data-testid={testId}
      >
        {announced}
      </div>
    );
  },
);

LiveRegion.displayName = 'LiveRegion';
