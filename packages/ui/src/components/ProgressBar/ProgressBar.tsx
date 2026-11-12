'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';

import { cn } from '../../cn';

const progressBarVariants = cva('w-full overflow-hidden', {
  variants: {
    size: {
      md: 'h-8 rounded-4 bg-surface-muted',
      sm: 'h-4 rounded-2 bg-border',
    },
    onDark: { true: '', false: '' },
  },
  compoundVariants: [{ size: 'sm', onDark: true, class: 'bg-dark-500' }],
  defaultVariants: { size: 'md', onDark: false },
});

const fillVariants = cva('h-full rounded-[inherit]', {
  variants: {
    tone: {
      orange: 'bg-orange',
      lime: 'bg-lime',
      indigo: 'bg-indigo',
      teal: 'bg-teal',
    },
  },
  defaultVariants: { tone: 'indigo' },
});

type ProgressBarVariants = VariantProps<typeof progressBarVariants>;
type ProgressBarFillVariants = VariantProps<typeof fillVariants>;

type ProgressBarA11y =
  | { decorative: true; label?: never; labelledBy?: never }
  | { decorative?: false; label: string; labelledBy?: never }
  | { decorative?: false; label?: never; labelledBy: string };

export type ProgressBarProps = ProgressBarVariants &
  ProgressBarFillVariants &
  ProgressBarA11y & {
    /** Mockup percentage; values outside 0–100 are clamped (CL-7). */
    value: number;
    className?: string;
    'data-testid'?: string;
  };

/** Horizontal progression bar (SPEC-303, EF-3). */
export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  ({ value, tone, size, onDark, decorative, label, labelledBy, className, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));
    const a11y = decorative
      ? { 'aria-hidden': true as const }
      : {
          role: 'progressbar' as const,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': clamped,
          ...(labelledBy ? { 'aria-labelledby': labelledBy } : { 'aria-label': label }),
        };
    return (
      <div
        ref={ref}
        className={cn(progressBarVariants({ size, onDark }), className)}
        {...a11y}
        {...props}
      >
        <div
          className={fillVariants({ tone })}
          // The fill width is the only inline style allowed by the specification (EF-3).
          style={{ width: `${String(clamped)}%` }}
        />
      </div>
    );
  },
);

ProgressBar.displayName = 'ProgressBar';
