'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

const chipVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-6 font-sans transition-colors disabled:cursor-not-allowed disabled:opacity-55',
  {
    variants: {
      shape: { rounded: '', pill: '' },
      size: { sm: '', md: '' },
      pressed: { true: '', false: '' },
    },
    compoundVariants: [
      {
        shape: 'rounded',
        size: 'md',
        class: 'min-h-40 min-w-44 rounded-12 px-14 text-14',
      },
      {
        shape: 'rounded',
        size: 'sm',
        class: 'min-h-36 min-w-40 rounded-10 px-12 text-13',
      },
      { shape: 'pill', size: 'md', class: 'min-h-40 rounded-full px-14 text-14' },
      { shape: 'pill', size: 'sm', class: 'min-h-36 rounded-full px-12 text-13' },
      {
        shape: 'rounded',
        pressed: true,
        class: 'border border-solid border-ink bg-ink font-700 text-white',
      },
      {
        shape: 'rounded',
        pressed: false,
        class: 'border border-solid border-border-strong bg-surface font-500 text-ink',
      },
      {
        shape: 'pill',
        pressed: true,
        class: 'border-0 bg-ink font-700 text-white',
      },
      {
        shape: 'pill',
        pressed: false,
        class: 'border border-solid border-border-strong bg-surface font-500 text-ink',
      },
      {
        shape: 'pill',
        size: 'sm',
        pressed: false,
        class: 'text-ink-muted',
      },
    ],
    defaultVariants: { shape: 'rounded', size: 'md', pressed: false },
  },
);

export type ChipProps = Omit<ComponentPropsWithRef<'button'>, 'aria-pressed'> &
  VariantProps<typeof chipVariants> & {
    pressed: boolean;
    onPressedChange: (pressed: boolean) => void;
    count?: number;
    /** Accessible name when the visible label is an abbreviation (e.g. « Lundi » for « L »). */
    ariaLabel?: string;
  };

export const Chip = ({
  className,
  shape = 'rounded',
  size = 'md',
  pressed,
  onPressedChange,
  count,
  ariaLabel,
  children,
  disabled,
  type,
  ...props
}: ChipProps) => (
  <button
    aria-label={ariaLabel}
    aria-pressed={pressed}
    className={cn(chipVariants({ shape, size, pressed }), className)}
    disabled={disabled}
    onClick={() => {
      onPressedChange(!pressed);
    }}
    type={type ?? 'button'}
    {...props}
  >
    {children}
    {count !== undefined ? (
      <span
        className={cn(
          'min-w-20 rounded-full px-6 py-1 text-12 font-700',
          pressed ? 'bg-lime text-ink' : 'bg-canvas text-ink-secondary',
        )}
      >
        {count}
      </span>
    ) : null}
  </button>
);
