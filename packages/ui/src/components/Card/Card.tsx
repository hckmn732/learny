'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ElementType, type ReactNode } from 'react';

import { cn } from '../../cn';

/** Surface, padding and radius of a card (SPEC-303, EF-1). */
export const cardVariants = cva('box-border min-w-0', {
  variants: {
    tone: {
      default: 'border border-solid border-border bg-surface',
      dark: 'bg-ink text-white',
      lime: 'bg-lime text-ink',
      subtle: 'bg-surface-subtle',
    },
    padding: {
      none: 'p-0',
      sm: 'p-16',
      // 22 vertical / 24 horizontal mockup pixels, as `Cours.dc.html`.
      md: 'py-22 px-24',
      // 24 vertical / 28 horizontal mockup pixels.
      lg: 'py-24 px-28',
    },
    radius: {
      18: 'rounded-18',
      20: 'rounded-20',
      22: 'rounded-22',
      24: 'rounded-24',
    },
  },
  defaultVariants: { tone: 'default', padding: 'md', radius: 24 },
});

type CardVariants = VariantProps<typeof cardVariants>;

export type CardProps = Omit<CardVariants, 'radius'> & {
  /** Semantic element, `section` by default. */
  as?: 'section' | 'article' | 'div';
  radius?: 18 | 20 | 22 | 24;
  /** Id of the heading that labels the card. */
  labelledBy?: string;
  className?: string;
  children?: ReactNode;
  'data-testid'?: string;
};

export const Card = forwardRef<HTMLElement, CardProps>(
  ({ as = 'section', tone, padding, radius, labelledBy, className, children, ...props }, ref) => {
    const Component = as as ElementType;
    const resolvedRadius = radius ?? (tone === 'subtle' ? 18 : 24);
    return (
      <Component
        ref={ref}
        aria-labelledby={labelledBy}
        className={cn(cardVariants({ tone, padding, radius: resolvedRadius }), className)}
        {...props}
      >
        {children}
      </Component>
    );
  },
);

Card.displayName = 'Card';

export type CardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** `md`: 18 px 600; `lg`: 22 px Space Grotesk 600 (EF-1). */
  titleSize?: 'md' | 'lg';
  titleId?: string;
  actions?: ReactNode;
  className?: string;
};

export const CardHeader = ({
  title,
  description,
  titleSize = 'md',
  titleId,
  actions,
  className,
}: CardHeaderProps) => (
  <header className={cn('flex flex-wrap items-start justify-between gap-x-16 gap-y-8', className)}>
    <div className="min-w-0 flex-1">
      <h2
        className={cn(
          'm-0',
          titleSize === 'md'
            ? 'text-18 font-600'
            : 'text-22 font-600 font-display tracking-heading',
        )}
        id={titleId}
      >
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-13 leading-1.45 text-ink-muted">{description}</p>
      ) : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-8">{actions}</div> : null}
  </header>
);
