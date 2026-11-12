'use client';

import { useId, type ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export type SelectProps = Omit<ComponentPropsWithRef<'select'>, 'children'> & {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  options: SelectOption[];
  hideLabel?: boolean;
};

export const Select = ({
  className,
  id,
  label,
  hint,
  error,
  options,
  hideLabel = false,
  'aria-describedby': ariaDescribedBy,
  ...props
}: SelectProps) => {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <label className={cn('text-13 font-700 text-ink', hideLabel && 'sr-only')} htmlFor={selectId}>
        {label}
      </label>
      <select
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(
          'min-h-48 w-full rounded-12 border border-solid border-border-strong bg-surface px-12 text-15 text-ink',
          error && 'border-orange-ink',
        )}
        id={selectId}
        {...props}
      >
        {options.map((option) => (
          <option disabled={option.disabled} key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p className="text-12 text-ink-muted" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="text-13 font-600 text-orange-ink" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};
