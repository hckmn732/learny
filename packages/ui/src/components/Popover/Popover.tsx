'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { forwardRef, type ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export type PopoverContentProps = ComponentPropsWithRef<typeof PopoverPrimitive.Content> & {
  /** Mockup width, 400 px by default; never wider than the viewport minus 32 px (EF-6). */
  width?: number;
  /** Below `sm`, the panel covers the whole window (SPEC-802 EF-3): overrides Radix positioning. */
  fullScreenOnMobile?: boolean;
};

/**
 * White rounded panel of the mockups (SPEC-303, EF-6): radius 20, border, popover shadow,
 * sideOffset 12, end alignment.
 */
export const PopoverContent = forwardRef<HTMLDivElement, PopoverContentProps>(
  (
    {
      className,
      width,
      align = 'end',
      sideOffset = 12,
      children,
      style,
      fullScreenOnMobile = false,
      ...props
    },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-popover box-border max-w-[calc(100vw-32px)] rounded-20 border border-solid border-border bg-surface shadow-popover outline-none',
          width === undefined ? 'w-[400px]' : undefined,
          fullScreenOnMobile &&
            'max-sm:fixed! max-sm:inset-0! max-sm:top-0! max-sm:left-0! max-sm:h-dvh! max-sm:w-screen! max-sm:max-w-none! max-sm:rounded-none! max-sm:border-0! max-sm:[transform:none]!',
          className,
        )}
        style={width === undefined ? style : { ...style, width }}
        {...props}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  ),
);

PopoverContent.displayName = 'PopoverContent';
