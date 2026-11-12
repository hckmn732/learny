'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useContext,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type ReactNode,
  type RefObject,
} from 'react';

import { cn } from '../../cn';
import { IconButton } from '../IconButton';

import { useModalIsolation } from './use-modal-isolation';

type DialogProps = ComponentPropsWithRef<typeof DialogPrimitive.Root>;

const DialogOpenContext = createContext<boolean | null>(null);

/** Dialog root that exposes its open state so the content can lock the body scroll (CL-2). */
export const Dialog = ({
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: DialogProps) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  return (
    <DialogPrimitive.Root
      {...props}
      open={open}
      onOpenChange={(next) => {
        if (!isControlled) setInternalOpen(next);
        onOpenChange?.(next);
      }}
    >
      <DialogOpenContext.Provider value={open}>{children}</DialogOpenContext.Provider>
    </DialogPrimitive.Root>
  );
};

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export type DialogContentProps = ComponentPropsWithRef<typeof DialogPrimitive.Content> & {
  size?: 'md' | 'lg';
  /** Element focused when the dialog opens (otherwise the first interactive element). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Focus fallback when the trigger no longer exists at closing time. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Hides the top-right close button (AlertDialog uses its own actions). */
  hideClose?: boolean;
};

/**
 * Centred dialog of the mockups (SPEC-303, EF-8): radius 24, padding 28, 560/720 px maximum,
 * internal scrolling, trapped focus, Escape to close, focus returned to the trigger.
 */
export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  (
    {
      className,
      size = 'md',
      initialFocusRef,
      returnFocusRef,
      hideClose = false,
      children,
      onOpenAutoFocus,
      onCloseAutoFocus,
      ...props
    },
    ref,
  ) => {
    const open = useContext(DialogOpenContext);
    const portalRef = useRef<HTMLDivElement>(null);
    useModalIsolation(open === true, portalRef);

    return (
      <DialogPrimitive.Portal>
        <div ref={portalRef}>
          <DialogPrimitive.Overlay
            aria-hidden="true"
            className="fixed inset-0 z-[49] animate-overlay-in bg-overlay motion-reduce:animate-none"
          />
          <DialogPrimitive.Content
            ref={ref}
            aria-modal="true"
            className={cn(
              'fixed top-1/2 left-1/2 z-dialog flex max-h-[calc(100dvh-48px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-24 bg-surface p-28 shadow-popover outline-none animate-dialog-in motion-reduce:animate-none',
              size === 'md' ? 'shell:max-w-[560px]' : 'shell:max-w-[720px]',
              className,
            )}
            onOpenAutoFocus={(event) => {
              if (initialFocusRef?.current) {
                event.preventDefault();
                initialFocusRef.current.focus();
              }
              onOpenAutoFocus?.(event);
            }}
            onCloseAutoFocus={(event) => {
              if (returnFocusRef?.current) {
                event.preventDefault();
                returnFocusRef.current.focus();
              }
              onCloseAutoFocus?.(event);
            }}
            {...props}
          >
            {children}
            {hideClose ? null : (
              <DialogPrimitive.Close asChild>
                <IconButton
                  className="absolute top-20 right-20"
                  icon={X}
                  label="Fermer"
                  size="sm"
                  tone="light"
                />
              </DialogPrimitive.Close>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    );
  },
);

DialogContent.displayName = 'DialogContent';

export type DialogTitleProps = ComponentPropsWithRef<typeof DialogPrimitive.Title>;

export const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('m-0 pr-40 text-22 font-600 font-display tracking-heading', className)}
      {...props}
    />
  ),
);

DialogTitle.displayName = 'DialogTitle';

export type DialogDescriptionProps = ComponentPropsWithRef<typeof DialogPrimitive.Description>;

export const DialogDescription = forwardRef<HTMLParagraphElement, DialogDescriptionProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('mt-8 text-15 leading-1.55 text-ink-secondary', className)}
      {...props}
    />
  ),
);

DialogDescription.displayName = 'DialogDescription';

export type DialogFooterProps = { children: ReactNode; className?: string };

/** Right-aligned actions, stacked full width under 900 px (EF-8, CL-5). */
export const DialogFooter = ({ children, className }: DialogFooterProps) => (
  <div
    className={cn(
      'mt-24 flex flex-wrap items-center justify-end gap-8 max-[899px]:flex-col-reverse max-[899px]:[&>*]:w-full',
      className,
    )}
  >
    {children}
  </div>
);
