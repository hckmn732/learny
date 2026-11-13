'use client';

import type { LucideIcon } from 'lucide-react';
import { useId, type ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

export type TextFieldProps = Omit<ComponentPropsWithRef<'input'>, 'size'> & {
  /** Visible label; never omitted, visually hidden with `hideLabel` (EF-4). */
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  variant?: 'form' | 'search';
  leadingIcon?: LucideIcon;
  hideLabel?: boolean;
  /** Numeric table cells align right (SPEC-503 EF-10). */
  align?: 'left' | 'right';
};

const FORM_CLASS =
  'min-h-48 w-full rounded-12 border border-solid border-border-strong bg-surface px-14 text-15 text-ink placeholder:text-ink-muted';
const SEARCH_CLASS =
  'min-h-42 w-full rounded-12 border border-solid border-border bg-surface pr-14 pl-42 text-14 text-ink placeholder:text-ink-muted';

export const TextField = ({
  className,
  id,
  label,
  hint,
  error,
  variant = 'form',
  leadingIcon: LeadingIcon,
  hideLabel = false,
  align = 'left',
  'aria-describedby': ariaDescribedBy,
  ...props
}: TextFieldProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <label className={cn('text-13 font-700 text-ink', hideLabel && 'sr-only')} htmlFor={inputId}>
        {label}
      </label>
      <div className="relative">
        {LeadingIcon ? (
          <LeadingIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-14 -translate-y-1/2 text-ink-muted"
            size={18}
            strokeWidth={2}
          />
        ) : null}
        <input
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={cn(
            variant === 'form' ? FORM_CLASS : SEARCH_CLASS,
            align === 'right' && 'text-right tabular-nums',
            error && 'border-orange-ink',
          )}
          id={inputId}
          {...props}
        />
      </div>
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
