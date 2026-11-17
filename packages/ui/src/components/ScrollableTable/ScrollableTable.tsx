import type { ReactNode } from 'react';

import { cn } from '../../cn';

export interface ScrollableTableProps {
  /** Caption of the table: also the accessible name of the scrolling region (EF-4). */
  label: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}

/**
 * Keyboard-scrollable wrapper of every data table (SPEC-802 EF-4): the region is focusable and
 * announces the table caption, so the arrow keys scroll it horizontally on small screens.
 */
export function ScrollableTable({ label, children, className, testId }: ScrollableTableProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      data-testid={testId}
      className={cn(
        // `relative` makes the region the containing block of absolutely positioned cells
        // content (visually hidden labels): otherwise they escape the clip and widen the page.
        'relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo',
        className,
      )}
    >
      {children}
    </div>
  );
}
