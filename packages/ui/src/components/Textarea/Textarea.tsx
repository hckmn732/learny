'use client';

import { useId, useState, type ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

export type TextareaProps = ComponentPropsWithRef<'textarea'> & {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  hideLabel?: boolean;
};

export const Textarea = ({
  className,
  id,
  label,
  hint,
  error,
  hideLabel = false,
  maxLength,
  value,
  defaultValue,
  onChange,
  'aria-describedby': ariaDescribedBy,
  ...props
}: TextareaProps) => {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;
  const countId = maxLength ? `${textareaId}-count` : undefined;
  const describedBy =
    [ariaDescribedBy, hintId, errorId, countId].filter(Boolean).join(' ') || undefined;

  const [uncontrolledLength, setUncontrolledLength] = useState(
    typeof defaultValue === 'string' ? defaultValue.length : 0,
  );
  const length = typeof value === 'string' ? value.length : uncontrolledLength;
  const announce = maxLength !== undefined && length >= maxLength * 0.9;

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <label
        className={cn('text-13 font-700 text-ink', hideLabel && 'sr-only')}
        htmlFor={textareaId}
      >
        {label}
      </label>
      <textarea
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(
          'min-h-96 w-full resize-y rounded-12 border border-solid border-border-strong bg-surface px-14 py-12 text-15 leading-1.5 text-ink placeholder:text-ink-muted',
          error && 'border-orange-ink',
        )}
        defaultValue={value === undefined ? defaultValue : undefined}
        id={textareaId}
        maxLength={maxLength}
        onChange={(event) => {
          setUncontrolledLength(event.currentTarget.value.length);
          onChange?.(event);
        }}
        value={value}
        {...props}
      />
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
      {maxLength !== undefined ? (
        <p aria-live={announce ? 'polite' : 'off'} className="text-12 text-ink-muted" id={countId}>
          {`${String(length)} / ${String(maxLength)}`}
        </p>
      ) : null}
    </div>
  );
};
