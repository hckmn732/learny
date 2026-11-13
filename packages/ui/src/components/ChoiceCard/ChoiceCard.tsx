'use client';

import { forwardRef, type ComponentPropsWithRef, type ReactNode } from 'react';

import { cn } from '../../cn';

export type ChoiceCardProps = Omit<ComponentPropsWithRef<'button'>, 'role' | 'value'> & {
  /** Stable value carried by the option. */
  value: string;
  /** Selection state exposed as `aria-checked` (ET-7, SPEC-601). */
  selected: boolean;
  label: ReactNode;
  description?: ReactNode;
};

/**
 * One radio card of a choice group (SPEC-601 ET-7): 18 px dot, 2 px ink border and `#F8F8F6`
 * background when selected, 1 px `#DAD9D3` border otherwise. The caller owns the `radiogroup`.
 */
export const ChoiceCard = forwardRef<HTMLButtonElement, ChoiceCardProps>(
  ({ className, value, selected, label, description, disabled, ...props }, ref) => (
    <button
      ref={ref}
      aria-checked={selected}
      className={cn(
        'flex min-h-44 w-full cursor-pointer items-center gap-12 rounded-14 px-14 py-12 text-left font-sans text-ink',
        selected
          ? 'border-2 border-ink bg-surface-subtle'
          : 'border border-border-strong bg-surface',
        disabled && 'cursor-not-allowed opacity-55',
        className,
      )}
      data-value={value}
      disabled={disabled}
      role="radio"
      type="button"
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-18 shrink-0 rounded-full',
          selected ? 'border-6 border-ink' : 'border-2 border-on-dark-muted',
        )}
      />
      <span className="flex min-w-0 flex-col gap-2">
        <span className="text-14 font-700">{label}</span>
        {description ? <span className="text-13 text-ink-muted">{description}</span> : null}
      </span>
    </button>
  ),
);

ChoiceCard.displayName = 'ChoiceCard';
