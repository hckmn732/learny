'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

const statCardVariants = cva(
  'box-border flex min-w-0 flex-[1_1_220px] flex-col gap-4 rounded-22 p-20',
  {
    variants: {
      tone: {
        dark: 'bg-ink text-white',
        light: 'border border-solid border-border bg-surface',
      },
    },
    defaultVariants: { tone: 'light' },
  },
);

export type StatCardProps = Omit<ComponentPropsWithRef<'div'>, 'children'> &
  VariantProps<typeof statCardVariants> & {
    value: string;
    label: string;
  };

/** Figure of the statistics row (SPEC-303, EF-2): 34 px Space Grotesk value, 13 px label. */
export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ className, tone = 'light', value, label, ...props }, ref) => (
    <div ref={ref} className={cn(statCardVariants({ tone }), className)} {...props}>
      <span
        className={cn(
          'text-34 font-600 font-display leading-1.1',
          tone === 'dark' ? 'text-lime' : 'text-ink',
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          'text-13 leading-1.4',
          tone === 'dark' ? 'text-on-dark-secondary' : 'text-ink-muted',
        )}
      >
        {label}
      </span>
    </div>
  ),
);

StatCard.displayName = 'StatCard';

export type StatRowProps = ComponentPropsWithRef<'div'>;

/** Aligns the statistics cards: 12 px gap, wrapping, one column under 480 px (EF-2, CL-5). */
export const StatRow = forwardRef<HTMLDivElement, StatRowProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-wrap gap-12 max-[479px]:flex-col', className)}
    {...props}
  />
));

StatRow.displayName = 'StatRow';
