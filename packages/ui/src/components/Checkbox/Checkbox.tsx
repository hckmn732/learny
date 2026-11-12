'use client';

import { useEffect, useId, useRef, type ComponentPropsWithRef, type ReactNode } from 'react';

import { cn } from '../../cn';

export type CheckboxProps = Omit<ComponentPropsWithRef<'input'>, 'type'> & {
  /** Clickable label on the right of the box (EF-7). */
  label: ReactNode;
  hint?: string;
  error?: string;
};

export const Checkbox = ({
  className,
  id,
  label,
  hint,
  error,
  disabled,
  indeterminate = false,
  ...props
}: CheckboxProps & { indeterminate?: boolean }) => {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;
  const hintId = hint ? `${checkboxId}-hint` : undefined;
  const errorId = error ? `${checkboxId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-start gap-10">
        <input
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(
            'mt-1 size-18 shrink-0 cursor-pointer accent-ink',
            disabled && 'cursor-not-allowed opacity-55',
          )}
          disabled={disabled}
          id={checkboxId}
          ref={ref}
          type="checkbox"
          {...props}
        />
        <label
          className={cn(
            'cursor-pointer text-13 leading-1.5 text-ink-secondary',
            disabled && 'cursor-not-allowed opacity-55',
          )}
          htmlFor={checkboxId}
        >
          {label}
        </label>
      </div>
      {hint ? (
        <p className="pl-28 text-12 text-ink-muted" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="pl-28 text-13 font-600 text-orange-ink" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};
