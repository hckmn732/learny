'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { cn } from '../../cn';

export interface BottomActionBarProps {
  children: ReactNode;
  className?: string;
  /** Safe-area padding is on by default (EF-6). */
  safeArea?: boolean;
}

const TEXT_FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Fixed action bar of the mobile exercise screens (SPEC-802 EF-6, CL-4): 72 CSS px, safe-area
 * padding, static from `sm`. It hides below `sm` while a text field has the focus so the virtual
 * keyboard never covers the field.
 */
export function BottomActionBar({ children, className, safeArea = true }: BottomActionBarProps) {
  const [textFocused, setTextFocused] = useState(false);

  useEffect(() => {
    const update = (target: EventTarget | null) => {
      setTextFocused(target instanceof HTMLElement && TEXT_FIELDS.has(target.tagName));
    };
    const onFocusIn = (event: FocusEvent) => {
      update(event.target);
    };
    const onFocusOut = () => {
      setTextFocused(false);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return (
    <div
      data-testid="bottom-action-bar"
      data-text-focus={textFocused ? 'true' : undefined}
      className={cn(
        'fixed inset-x-0 bottom-0 z-header flex min-h-[72px] items-center gap-12 border-t border-solid border-border bg-surface px-16 sm:static sm:mt-16 sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0',
        safeArea && 'pb-[env(safe-area-inset-bottom)] sm:pb-0',
        textFocused && 'max-sm:hidden',
        className,
      )}
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-8">{children}</div>
    </div>
  );
}
