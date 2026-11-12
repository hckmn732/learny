import type { ReactNode } from 'react';

import { cn } from '../../cn';

export type PageHeaderProps = {
  /** Muted 14 px line above the title. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Breadcrumb rendered above the eyebrow (EF-16). */
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  className?: string;
  'data-testid'?: string;
};

/** Page heading of the mockups (SPEC-303, EF-16). */
export const PageHeader = ({
  eyebrow,
  title,
  breadcrumb,
  actions,
  className,
  ...props
}: PageHeaderProps) => (
  <header className={cn('min-w-0', className)} {...props}>
    {breadcrumb ? <div className="mb-8">{breadcrumb}</div> : null}
    <div className="flex flex-wrap items-end justify-between gap-16">
      <div className="flex min-w-0 flex-col gap-4">
        {eyebrow ? <p className="m-0 text-14 text-ink-muted">{eyebrow}</p> : null}
        <h1 className="m-0 text-34 font-600 font-display tracking-title">{title}</h1>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-8">{actions}</div> : null}
    </div>
  </header>
);
