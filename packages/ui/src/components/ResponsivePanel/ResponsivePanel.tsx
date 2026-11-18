'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { CSSProperties, ReactNode, RefObject } from 'react';

import { cn } from '../../cn';
import { IconButton } from '../IconButton';

export interface ResponsivePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Side of the lateral panel from `sm`; full screen below. */
  side?: 'left' | 'right';
  /** Width in CSS pixels of the lateral panel (default 460, the tutor panel). */
  widthPx?: number;
  className?: string;
  testId?: string;
  closeLabel?: string;
  /** Test id of the close button (default `panel-close`); callers keep their historical id. */
  closeTestId?: string;
  /** `false` keeps the page interactive (floating companion); `true` traps focus behind an overlay. */
  modal?: boolean;
  /** Floating card (below the header, rounded, inset) instead of a full-height drawer. */
  floating?: boolean;
  /** `id` of the title, for callers that anchor aria-labelledby or typography checks. */
  titleId?: string;
  /** Focused element when the panel closes; defaults to the element focused before opening. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Panel of the mobile disposition (SPEC-802 EF-3, ET-2, ADR-0201): full screen below `sm`, lateral
 * from 768 px. Layout is carried by CSS only; Radix Dialog traps the focus, closes on Escape and
 * returns the focus to the trigger. The title and the 44 px « Fermer » button are always present.
 */
export function ResponsivePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'right',
  widthPx = 460,
  className,
  testId,
  closeLabel = 'Fermer',
  closeTestId = 'panel-close',
  modal = true,
  floating = false,
  titleId,
  returnFocusRef,
}: ResponsivePanelProps) {
  return (
    <DialogPrimitive.Root modal={modal} open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {modal ? (
          <DialogPrimitive.Overlay
            aria-hidden="true"
            className="fixed inset-0 z-[49] bg-overlay animate-overlay-in motion-reduce:animate-none"
          />
        ) : null}
        <DialogPrimitive.Content
          data-testid={testId}
          aria-label={title}
          aria-modal={modal ? 'true' : 'false'}
          onCloseAutoFocus={(event) => {
            if (returnFocusRef?.current) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
          className={cn(
            'fixed z-dialog flex flex-col border-solid border-border bg-surface shadow-popover outline-none',
            'inset-0 h-dvh w-full border-0',
            floating
              ? 'sm:inset-auto sm:right-16 sm:bottom-16 sm:h-auto sm:max-h-[calc(100dvh-96px)] sm:w-[var(--panel-width)] sm:max-w-[calc(100vw-32px)] sm:rounded-24 sm:border'
              : side === 'right'
                ? 'sm:top-0 sm:right-0 sm:bottom-0 sm:left-auto sm:h-dvh sm:w-[var(--panel-width)] sm:max-w-full sm:rounded-l-24 sm:border-l'
                : 'sm:top-0 sm:right-auto sm:bottom-0 sm:left-0 sm:h-dvh sm:w-[var(--panel-width)] sm:max-w-full sm:rounded-r-24 sm:border-r',
            className,
          )}
          style={{ '--panel-width': `${String(widthPx)}px` } as CSSProperties}
        >
          <div className="flex items-center justify-between gap-12 border-b border-solid border-divider px-18 py-12">
            <DialogPrimitive.Title
              className="m-0 min-w-0 font-display text-18 font-600 text-ink"
              {...(titleId === undefined ? {} : { id: titleId })}
            >
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton
                icon={X}
                label={closeLabel}
                size="md"
                tone="light"
                data-testid={closeTestId}
              />
            </DialogPrimitive.Close>
          </div>
          {description === undefined ? null : (
            <DialogPrimitive.Description className="m-0 px-18 pt-8 text-13 text-ink-muted">
              {description}
            </DialogPrimitive.Description>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
          {footer === undefined ? null : (
            <div className="border-t border-solid border-border px-18 py-12">{footer}</div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
