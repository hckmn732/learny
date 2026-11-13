'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { cn } from '../../cn';
import { ChoiceCard } from '../ChoiceCard';

export interface ChoiceOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  testId?: string;
}

export interface ChoiceGroupProps {
  /** Accessible name of the `radiogroup` (ET-7). */
  'aria-label': string;
  options: readonly ChoiceOption[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

/**
 * Exclusive choice cards (SPEC-601 ET-7): `radiogroup` with arrow-key navigation, Space/Enter
 * selection and a roving tabindex. Selection follows focus, as the ARIA radio pattern expects.
 */
export function ChoiceGroup({
  'aria-label': ariaLabel,
  options,
  value,
  onValueChange,
  className,
}: Readonly<ChoiceGroupProps>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const firstEnabled = options.findIndex((option) => option.disabled !== true);
  const tabbable = selectedIndex >= 0 ? selectedIndex : firstEnabled;

  const select = (index: number): void => {
    const option = options[index];
    if (option === undefined || option.disabled === true) return;
    onValueChange(option.value);
    refs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = options.length - 1;
    if (last < 0) return;
    let next: number | null = null;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
      next = index >= last ? 0 : index + 1;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = index <= 0 ? last : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    // Skip a disabled option rather than trapping focus on it.
    for (let tries = 0; tries <= last; tries += 1) {
      if (options[next]?.disabled !== true) break;
      next = (next + 1) % options.length;
    }
    select(next);
  };

  return (
    <div aria-label={ariaLabel} className={cn('flex flex-col gap-8', className)} role="radiogroup">
      {options.map((option, index) => (
        <ChoiceCard
          data-testid={option.testId}
          description={option.description}
          disabled={option.disabled}
          key={option.value}
          label={option.label}
          onClick={() => {
            select(index);
          }}
          onKeyDown={(event) => {
            onKeyDown(event, index);
          }}
          ref={(element) => {
            refs.current[index] = element;
          }}
          selected={option.value === value}
          tabIndex={index === tabbable ? 0 : -1}
          value={option.value}
        />
      ))}
    </div>
  );
}
