import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

const badgeVariants = cva('inline-flex items-center rounded-full', {
  variants: {
    tone: {
      neutral: 'bg-canvas text-ink-secondary',
      lime: 'bg-lime text-ink',
      'lime-soft': 'bg-lime-softer text-lime-ink-strong',
      indigo: 'bg-indigo-soft text-indigo-ink-strong',
      green: 'bg-green-soft text-green-ink',
      orange: 'bg-orange-soft text-orange-ink',
      violet: 'bg-violet-soft text-violet-ink',
      'on-dark': 'bg-dark-700 text-lime',
      'default-model': 'bg-surface-muted text-ink-secondary',
    },
    size: {
      md: 'px-10 py-4 text-12',
      sm: 'px-8 py-2 text-12',
    },
  },
  defaultVariants: { tone: 'neutral', size: 'md' },
});

export type BadgeProps = ComponentPropsWithRef<'span'> & VariantProps<typeof badgeVariants>;

export const Badge = ({ className, tone = 'neutral', size = 'md', ...props }: BadgeProps) => {
  const lightTone = tone === 'neutral' || tone === 'on-dark';
  const weight = size === 'sm' || lightTone ? 'font-600' : 'font-700';
  return <span className={cn(badgeVariants({ tone, size }), weight, className)} {...props} />;
};
