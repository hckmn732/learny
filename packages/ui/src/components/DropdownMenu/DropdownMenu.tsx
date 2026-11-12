'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { LucideIcon } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useContext,
  useRef,
  useState,
  type ComponentPropsWithRef,
} from 'react';

import { cn } from '../../cn';

type DropdownMenuProps = ComponentPropsWithRef<typeof DropdownMenuPrimitive.Root>;

type DropdownMenuClose = {
  closeFromTab: () => void;
  consumeTabbedOut: () => boolean;
};

const DropdownMenuCloseContext = createContext<DropdownMenuClose | null>(null);

/** Menu root that also closes on Tab, as required by CL-1. */
export const DropdownMenu = ({
  open: openProp,
  defaultOpen,
  onOpenChange,
  modal = false,
  children,
  ...props
}: DropdownMenuProps) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false);
  const tabbedOutRef = useRef(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const changeOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };
  const close: DropdownMenuClose = {
    consumeTabbedOut: () => {
      const tabbedOut = tabbedOutRef.current;
      tabbedOutRef.current = false;
      return tabbedOut;
    },
    closeFromTab: () => {
      tabbedOutRef.current = true;
      changeOpen(false);
    },
  };
  return (
    <DropdownMenuPrimitive.Root {...props} modal={modal} open={open} onOpenChange={changeOpen}>
      <DropdownMenuCloseContext.Provider value={close}>
        {children}
      </DropdownMenuCloseContext.Provider>
    </DropdownMenuPrimitive.Root>
  );
};

export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

export type DropdownMenuContentProps = ComponentPropsWithRef<typeof DropdownMenuPrimitive.Content>;

/** 260 px menu of `Main.dc.html` (SPEC-303, EF-7): radius 18, padding 8, menu shadow. */
export const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  (
    { className, align = 'end', sideOffset = 12, children, onKeyDown, onCloseAutoFocus, ...props },
    ref,
  ) => {
    const close = useContext(DropdownMenuCloseContext);
    return (
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          className={cn(
            'z-menu flex w-[260px] flex-col gap-2 rounded-18 border border-solid border-border bg-surface p-8 shadow-menu outline-none',
            className,
          )}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.key === 'Tab' && !event.defaultPrevented) close?.closeFromTab();
          }}
          onCloseAutoFocus={(event) => {
            if (close?.consumeTabbedOut()) {
              event.preventDefault();
            }
            onCloseAutoFocus?.(event);
          }}
          {...props}
        >
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    );
  },
);

DropdownMenuContent.displayName = 'DropdownMenuContent';

export type DropdownMenuItemProps = ComponentPropsWithRef<typeof DropdownMenuPrimitive.Item> & {
  /** Optional 18 px icon at 10 px of the label (EF-7). */
  icon?: LucideIcon;
  destructive?: boolean;
};

export const DropdownMenuItem = forwardRef<HTMLDivElement, DropdownMenuItemProps>(
  ({ className, icon: Icon, destructive, children, ...props }, ref) => (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'flex min-h-42 cursor-pointer select-none items-center gap-10 rounded-10 px-10 text-14 font-600 outline-none',
        destructive ? 'text-danger' : 'text-ink',
        'hover:bg-canvas focus:bg-canvas data-[highlighted]:bg-canvas',
        className,
      )}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={1.8} /> : null}
      {children}
    </DropdownMenuPrimitive.Item>
  ),
);

DropdownMenuItem.displayName = 'DropdownMenuItem';

export type DropdownMenuLabelProps = ComponentPropsWithRef<typeof DropdownMenuPrimitive.Label>;

/** Identity block of the account menu: padding 10/10/12, bottom divider, 4 px margin (EF-7). */
export const DropdownMenuLabel = forwardRef<HTMLDivElement, DropdownMenuLabelProps>(
  ({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Label
      ref={ref}
      className={cn(
        'mb-4 flex items-center gap-10 border-b border-solid border-divider px-10 pt-10 pb-12',
        className,
      )}
      {...props}
    />
  ),
);

DropdownMenuLabel.displayName = 'DropdownMenuLabel';

export type DropdownMenuSeparatorProps = ComponentPropsWithRef<
  typeof DropdownMenuPrimitive.Separator
>;

export const DropdownMenuSeparator = forwardRef<HTMLDivElement, DropdownMenuSeparatorProps>(
  ({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn('my-2 h-px bg-divider', className)}
      {...props}
    />
  ),
);

DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';
