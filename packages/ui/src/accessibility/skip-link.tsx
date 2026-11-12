'use client';

import { forwardRef, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

import { cn } from '../cn';

import { focusMainContent } from './focus-return';

export interface SkipLinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'href' | 'children'
> {
  /** Id of the main landmark; defaults to the connected-layout contract (ET-1). */
  targetId?: string;
  children?: ReactNode;
  'data-testid'?: string;
}

/**
 * First focusable link of a connected screen (EF-1). It stays off-screen until focused, then
 * moves the keyboard focus to the main landmark while keeping an `href` for no-JavaScript use.
 */
export const SkipLink = forwardRef<HTMLAnchorElement, SkipLinkProps>(
  (
    {
      targetId = 'contenu-principal',
      children = 'Aller au contenu',
      className,
      onClick,
      'data-testid': testId = 'skip-link',
      ...props
    },
    ref,
  ) => {
    const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (focusMainContent(targetId)) event.preventDefault();
    };

    return (
      <a
        {...props}
        ref={ref}
        className={cn('learny-skip-link', className)}
        data-testid={testId}
        href={`#${targetId}`}
        onClick={handleClick}
      >
        {children}
      </a>
    );
  },
);

SkipLink.displayName = 'SkipLink';
