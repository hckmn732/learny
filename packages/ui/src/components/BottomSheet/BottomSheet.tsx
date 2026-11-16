'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../cn';
import { IconButton } from '../IconButton';

export interface BottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  testId?: string;
  closeLabel?: string;
}

/**
 * Full-width bottom sheet of the agenda and the mock exam on mobile (SPEC-802 EF-5, EF-6, ET-2).
 * Radix Dialog supplies the overlay, the focus trap, Escape and the focus return.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  testId = 'bottom-sheet',
  closeLabel = 'Fermer',
}: BottomSheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          aria-hidden="true"
          className="fixed inset-0 z-[49] bg-overlay animate-overlay-in motion-reduce:animate-none"
        />
        <DialogPrimitive.Content
          data-testid={testId}
          aria-modal="true"
          className={cn(
            'fixed inset-x-0 bottom-0 z-dialog flex max-h-[85dvh] w-full flex-col rounded-t-24 border border-solid border-border bg-surface shadow-popover outline-none animate-dialog-in motion-reduce:animate-none sm:inset-x-auto sm:right-0 sm:bottom-24 sm:left-0 sm:mx-auto sm:max-w-[560px] sm:rounded-24',
            className,
          )}
        >
          <div className="flex items-center justify-between gap-12 border-b border-solid border-divider px-18 py-12">
            <DialogPrimitive.Title className="m-0 min-w-0 font-display text-18 font-600 text-ink">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton
                icon={X}
                label={closeLabel}
                size="md"
                tone="light"
                data-testid="panel-close"
              />
            </DialogPrimitive.Close>
          </div>
          {description === undefined ? null : (
            <DialogPrimitive.Description className="m-0 px-18 pt-8 text-13 text-ink-muted">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-18 py-14">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
