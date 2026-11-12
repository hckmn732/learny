import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import type { ComponentPropsWithRef, ReactNode } from 'react';

import { cn } from '../../cn';

const iconButtonVariants = cva(
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center border border-solid transition-colors disabled:cursor-not-allowed disabled:opacity-55',
  {
    variants: {
      tone: {
        light: 'border-border bg-surface text-ink hover:bg-surface-subtle',
        dark: 'border-dark-600 bg-transparent text-on-dark-muted hover:bg-dark-700',
      },
      size: {
        md: 'size-42 rounded-12',
        sm: 'size-32 rounded-9',
        xs: 'size-28 rounded-8',
      },
    },
    defaultVariants: { tone: 'light', size: 'md' },
  },
);

const ICON_SIZE = { md: 18, sm: 16, xs: 14 } as const;

export type IconButtonProps = Omit<ComponentPropsWithRef<'button'>, 'children'> &
  VariantProps<typeof iconButtonVariants> & {
    /** Required accessible name (CL-4). */
    label: string;
    icon: LucideIcon;
    /** Notification dot or counter rendered at the top-right corner (SPEC-305). */
    badge?: ReactNode;
  };

export const IconButton = ({
  className,
  tone,
  size,
  label,
  icon: Icon,
  badge,
  type,
  ...props
}: IconButtonProps) => {
  const resolvedSize = size ?? 'md';
  return (
    <button
      aria-label={label}
      className={cn(iconButtonVariants({ tone, size: resolvedSize }), className)}
      type={type ?? 'button'}
      {...props}
    >
      <Icon aria-hidden="true" size={ICON_SIZE[resolvedSize]} strokeWidth={2} />
      {badge ? (
        <span aria-hidden="true" className="absolute -top-6 -right-6">
          {badge}
        </span>
      ) : null}
    </button>
  );
};
