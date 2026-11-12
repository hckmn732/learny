'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef, type ComponentPropsWithRef } from 'react';

import { cn } from '../../cn';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export type TooltipContentProps = ComponentPropsWithRef<typeof TooltipPrimitive.Content>;

/** Dark 12 px tooltip (SPEC-303, EF-11): 400 ms opening, immediate closing. */
export const TooltipContent = forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, sideOffset = 6, children, ...props }, ref) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-popover rounded-8 bg-ink px-10 py-6 text-12 font-600 text-white shadow-menu',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-ink" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  ),
);

TooltipContent.displayName = 'TooltipContent';
