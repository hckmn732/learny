import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

const countBadgeVariants = cva(
  'inline-flex items-center justify-center rounded-full px-8 py-1 text-12 font-700 tabular-nums',
  {
    variants: {
      tone: {
        lime: 'bg-lime text-ink',
        'orange-on-dark': 'bg-orange-dark text-orange-on-dark',
      },
    },
    defaultVariants: { tone: 'lime' },
  },
);

export type CountBadgeProps = Omit<ComponentPropsWithRef<'span'>, 'children'> &
  VariantProps<typeof countBadgeVariants> & {
    value: number;
  };

export const CountBadge = ({ className, tone, value, ...props }: CountBadgeProps) => (
  <span className={cn(countBadgeVariants({ tone }), className)} {...props}>
    {value > 99 ? '99+' : String(value)}
  </span>
);
