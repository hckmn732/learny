'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import type { LucideIcon } from 'lucide-react';
import { useRef, type ComponentPropsWithRef, type KeyboardEvent } from 'react';

import { cn } from '../../cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

const segmentedVariants = cva('inline-flex', {
  variants: {
    variant: {
      soft: 'gap-4 rounded-12 bg-canvas p-4',
      solid: 'gap-4 rounded-12 border border-solid border-border bg-surface p-4',
    },
    size: { sm: '', md: '' },
    fullWidth: { true: 'flex w-full', false: '' },
  },
  defaultVariants: { variant: 'soft', size: 'md', fullWidth: false },
});

const optionVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-6 border-0 bg-transparent',
  {
    variants: {
      variant: {
        soft: 'rounded-9 px-12 text-13',
        solid: 'rounded-9 px-12 text-13',
      },
      size: { sm: '', md: '' },
      fullWidth: { true: 'min-w-0 flex-1', false: '' },
    },
    compoundVariants: [
      { variant: 'soft', size: 'sm', class: 'min-h-32' },
      { variant: 'soft', size: 'md', class: 'min-h-36' },
      { variant: 'solid', size: 'sm', class: 'min-h-34' },
      { variant: 'solid', size: 'md', class: 'min-h-40 px-14 text-14' },
    ],
    defaultVariants: { variant: 'soft', size: 'md', fullWidth: false },
  },
);

type SegmentedVariants = VariantProps<typeof segmentedVariants>;

export type SegmentedControlProps<T extends string> = Omit<
  ComponentPropsWithRef<'div'>,
  'children' | 'onChange'
> &
  SegmentedVariants & {
    options: SegmentOption<T>[];
    value: T;
    onValueChange: (value: T) => void;
    'aria-label': string;
    fullWidth?: boolean;
    disabled?: boolean;
  };

export function SegmentedControl<T extends string>({
  className,
  options,
  value,
  onValueChange,
  variant = 'soft',
  size = 'md',
  fullWidth = false,
  disabled = false,
  ref,
  'aria-label': ariaLabel,
  ...props
}: SegmentedControlProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  // -1 is valid: a brick classification starts with no answer (SPEC-503 EF-7). In that case no
  // option is pressed and the first one keeps the group in the tab order.
  const selectedIndex = options.findIndex((option) => option.value === value);

  const moveTo = (index: number) => {
    const option = options[index];
    if (!option) return;
    onValueChange(option.value);
    buttons.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % options.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + options.length) % options.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = options.length - 1;
    }
    if (next !== undefined) {
      event.preventDefault();
      moveTo(next);
    }
  };

  return (
    <div
      aria-label={ariaLabel}
      className={cn(segmentedVariants({ variant, size, fullWidth }), className)}
      ref={ref}
      role="group"
      {...props}
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        const Icon = option.icon;
        return (
          <button
            aria-pressed={selected}
            className={cn(
              optionVariants({ variant, size, fullWidth }),
              selected
                ? variant === 'soft'
                  ? 'bg-surface font-700 text-ink shadow-segment'
                  : 'bg-ink font-600 text-white'
                : 'font-500 text-ink-muted hover:bg-surface-muted',
            )}
            disabled={disabled}
            key={option.value}
            onClick={() => {
              onValueChange(option.value);
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index);
            }}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            tabIndex={selected || (selectedIndex === -1 && index === 0) ? 0 : -1}
            title={fullWidth ? option.label : undefined}
            type="button"
          >
            {Icon ? <Icon aria-hidden="true" size={14} strokeWidth={2} /> : null}
            <span className={cn(fullWidth && 'truncate')}>{option.label}</span>
            {option.count !== undefined ? (
              <span className="text-12 font-700">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
