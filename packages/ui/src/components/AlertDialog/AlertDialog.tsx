'use client';

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { TriangleAlert } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { cn } from '../../cn';
import { Button } from '../Button';
import { useModalIsolation } from '../Dialog/use-modal-isolation';

export type AlertDialogProps = {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** May return a promise: the confirm button shows its loading state until it settles. */
  onConfirm?: () => void | Promise<void>;
  /** Dark confirm button with a warning icon and an orange dot before the title (EF-9). */
  destructive?: boolean;
  size?: 'md' | 'lg';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  'data-testid'?: string;
};

/**
 * Confirmation dialog (SPEC-303, EF-9). Initial focus is on « Annuler »; confirming an
 * asynchronous action keeps the dialog open with a loading button until it resolves.
 */
export const AlertDialog = ({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Annuler',
  onConfirm,
  destructive = false,
  size = 'md',
  open,
  onOpenChange,
  className,
  ...props
}: AlertDialogProps) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;
  useModalIsolation(resolvedOpen, portalRef);

  const changeOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  // Explicit body lock and inert background, like DialogContent (CL-2).
  const confirm = async () => {
    const result = onConfirm?.();
    if (result instanceof Promise) {
      setLoading(true);
      try {
        await result;
        changeOpen(false);
      } finally {
        setLoading(false);
      }
      return;
    }
    changeOpen(false);
  };

  return (
    <AlertDialogPrimitive.Root open={resolvedOpen} onOpenChange={changeOpen}>
      <AlertDialogPrimitive.Trigger asChild>{trigger}</AlertDialogPrimitive.Trigger>
      <AlertDialogPrimitive.Portal>
        <div ref={portalRef}>
          <AlertDialogPrimitive.Overlay
            aria-hidden="true"
            className="fixed inset-0 z-[49] animate-overlay-in bg-overlay motion-reduce:animate-none"
          />
          <AlertDialogPrimitive.Content
            aria-modal="true"
            className={cn(
              'fixed top-1/2 left-1/2 z-dialog flex max-h-[calc(100dvh-48px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-24 bg-surface p-28 shadow-popover outline-none animate-dialog-in motion-reduce:animate-none',
              size === 'md' ? 'shell:max-w-[560px]' : 'shell:max-w-[720px]',
              className,
            )}
            onOpenAutoFocus={(event) => {
              if (cancelRef.current) {
                event.preventDefault();
                cancelRef.current.focus();
              }
            }}
            {...props}
          >
            <div className="flex items-center gap-10">
              {destructive ? (
                <span aria-hidden="true" className="size-8 shrink-0 rounded-full bg-orange" />
              ) : null}
              <AlertDialogPrimitive.Title className="m-0 text-22 font-600 font-display tracking-heading">
                {title}
              </AlertDialogPrimitive.Title>
            </div>
            {description ? (
              <AlertDialogPrimitive.Description className="mt-8 text-15 leading-1.55 text-ink-secondary">
                {description}
              </AlertDialogPrimitive.Description>
            ) : null}
            <div className="mt-24 flex flex-wrap items-center justify-end gap-8 max-[899px]:flex-col-reverse max-[899px]:[&>*]:w-full">
              <Button
                ref={cancelRef}
                data-testid="ui-alert-dialog-cancel"
                variant="outline"
                onClick={() => {
                  changeOpen(false);
                }}
              >
                {cancelLabel}
              </Button>
              <Button
                data-testid="ui-alert-dialog-confirm"
                loading={loading}
                {...(destructive ? { leadingIcon: TriangleAlert } : {})}
                variant="dark"
                onClick={() => {
                  void confirm();
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </AlertDialogPrimitive.Content>
        </div>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
};

/** Low-level primitives, kept for callers that need a custom confirmation body. */
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogRoot = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
