import NextLink from 'next/link';
import type { ComponentProps } from 'react';

import { cn } from '../../cn';

type NextLinkProps = ComponentProps<typeof NextLink>;

export type LinkProps = NextLinkProps & {
  variant?: 'inline' | 'strong' | 'subtle';
  /** Weight of the `strong` variant (EF-3). */
  weight?: 'normal' | 'semibold' | 'bold';
};

const WEIGHT_CLASS = {
  normal: 'font-400',
  semibold: 'font-600',
  bold: 'font-700',
} as const;

const VARIANT_CLASS = {
  inline: 'text-indigo-ink underline-offset-2 hover:text-indigo-ink-hover hover:underline',
  strong: 'text-indigo-ink underline-offset-2 hover:text-indigo-ink-hover hover:underline',
  subtle: 'text-ink-muted hover:text-ink',
} as const;

export const Link = ({
  className,
  variant = 'inline',
  weight = 'semibold',
  children,
  href,
  target,
  rel,
  ...props
}: LinkProps) => {
  const external = typeof href === 'string' && href.startsWith('http');

  return (
    <NextLink
      className={cn(
        'font-500 transition-colors',
        VARIANT_CLASS[variant],
        WEIGHT_CLASS[weight],
        className,
      )}
      href={href}
      target={external ? '_blank' : target}
      rel={external ? 'noopener noreferrer' : rel}
      {...props}
    >
      {children}
      {external ? <span className="sr-only"> (nouvel onglet)</span> : null}
    </NextLink>
  );
};
