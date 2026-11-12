'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { useId, type ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

export type SwitchProps = Omit<
  ComponentPropsWithRef<typeof SwitchPrimitive.Root>,
  'checked' | 'defaultChecked' | 'onCheckedChange'
> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Visible label; supply `aria-labelledby` instead when the label lives elsewhere. */
  label?: string | undefined;
  description?: string | undefined;
  /** Locked switch of SPEC-708: value never changes, `aria-disabled` (EF-8). */
  locked?: boolean;
};

export const Switch = ({
  className,
  checked,
  onCheckedChange,
  label,
  description,
  locked = false,
  id,
  ...props
}: SwitchProps) => {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const labelId = label ? `${switchId}-label` : undefined;
  const descriptionId = description ? `${switchId}-description` : undefined;

  return (
    <div className="flex items-start justify-between gap-12">
      {label || description ? (
        <div className="flex min-w-0 flex-col gap-2">
          {label ? (
            <label className="text-13 font-600 text-ink" htmlFor={switchId} id={labelId}>
              {label}
            </label>
          ) : null}
          {description ? (
            <p className="text-12 leading-1.45 text-ink-muted" id={descriptionId}>
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <SwitchPrimitive.Root
        aria-describedby={descriptionId}
        aria-disabled={locked || undefined}
        aria-labelledby={labelId}
        checked={checked}
        className={cn(
          'inline-flex h-28 w-46 shrink-0 cursor-pointer items-center rounded-full border-0 p-3 transition-colors data-[state=checked]:bg-ink data-[state=unchecked]:bg-border-strong',
          locked && 'cursor-default opacity-55',
          className,
        )}
        id={switchId}
        onCheckedChange={locked ? undefined : onCheckedChange}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'block size-22 rounded-full shadow-knob transition-transform duration-150 motion-reduce:transition-none data-[state=checked]:translate-x-18 data-[state=checked]:bg-lime data-[state=unchecked]:bg-surface',
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
};
