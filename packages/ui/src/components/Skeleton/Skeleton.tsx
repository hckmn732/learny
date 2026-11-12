import type { ReactNode } from 'react';

import { cn } from '../../cn';

const RADIUS_CLASS = {
  6: 'rounded-6',
  8: 'rounded-8',
  10: 'rounded-10',
  12: 'rounded-12',
  14: 'rounded-14',
  18: 'rounded-18',
  20: 'rounded-20',
  24: 'rounded-24',
} as const;

export type SkeletonRadius = keyof typeof RADIUS_CLASS;

export type SkeletonProps = {
  className?: string;
  radius?: SkeletonRadius;
  'data-testid'?: string;
};

/** Pulsing placeholder, hidden from assistive technologies (SPEC-303, EF-13, CL-6). */
export const Skeleton = ({ className, radius = 10, ...props }: SkeletonProps) => (
  <div
    aria-hidden="true"
    className={cn(
      'bg-surface-muted animate-skeleton-pulse motion-reduce:animate-none',
      RADIUS_CLASS[radius],
      className,
    )}
    {...props}
  />
);

export type SkeletonTextProps = {
  lines?: number;
  className?: string;
  lineClassName?: string;
};

export const SkeletonText = ({ lines = 3, className, lineClassName }: SkeletonTextProps) => (
  <div aria-hidden="true" className={cn('flex flex-col gap-8', className)}>
    {Array.from({ length: lines }, (_, index) => (
      <Skeleton
        key={index}
        className={cn('h-12', index === lines - 1 ? 'w-3/5' : 'w-full', lineClassName)}
      />
    ))}
  </div>
);

/** Card-shaped placeholder with a title bar and three lines. */
export const SkeletonCard = ({ className }: { className?: string }) => (
  <div
    aria-hidden="true"
    className={cn('rounded-24 border border-solid border-border bg-surface p-24', className)}
  >
    <Skeleton className="h-18 w-2/5" radius={8} />
    <div className="mt-16">
      <SkeletonText />
    </div>
  </div>
);

/** Row of three statistic placeholders. */
export const SkeletonStatRow = ({ className }: { className?: string }) => (
  <div aria-hidden="true" className={cn('flex flex-wrap gap-12', className)}>
    {[0, 1, 2].map((index) => (
      <div
        className="min-w-0 flex-[1_1_220px] rounded-22 border border-solid border-border bg-surface p-20"
        key={index}
      >
        <Skeleton className="h-28 w-1/2" radius={8} />
        <Skeleton className="mt-8 h-12 w-3/4" radius={6} />
      </div>
    ))}
  </div>
);

export type SkeletonGroupProps = {
  children: ReactNode;
  className?: string;
  label?: string;
  'data-testid'?: string;
};

/**
 * Region that announces a single loading state: `aria-busy="true"` and a hidden
 * « Chargement… » while the skeleton blocks themselves stay `aria-hidden` (EF-13, CL-3).
 */
export const SkeletonGroup = ({
  children,
  className,
  label = 'Chargement…',
  ...props
}: SkeletonGroupProps) => (
  <div aria-busy="true" className={cn('relative', className)} {...props}>
    <span className="sr-only">{label}</span>
    {children}
  </div>
);
