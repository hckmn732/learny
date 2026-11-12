import { Fragment } from 'react';

import { cn } from '../../cn';
import type { BreadcrumbItem } from '../../navigation/breadcrumb';
import { Link } from '../Link';

const MAX_LABEL = 40;

function truncate(label: string): { text: string; full: string } {
  if (label.length <= MAX_LABEL) return { text: label, full: label };
  return { text: `${label.slice(0, MAX_LABEL)}…`, full: label };
}

export type BreadcrumbProps = {
  items: BreadcrumbItem[];
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
};

/**
 * Breadcrumb of BR-NAV-04 (SPEC-303, EF-15, CA-1): « Programme / Module 3 · … / Cours »,
 * links in indigo, last item `aria-current="page"` in muted ink like `Cours.dc.html`.
 */
export const Breadcrumb = ({
  items,
  ariaLabel = "Fil d'Ariane",
  className,
  ...props
}: BreadcrumbProps) => (
  <nav aria-label={ariaLabel} className={cn('text-14 text-ink-muted', className)} {...props}>
    <ol className="m-0 flex list-none flex-wrap items-center gap-x-6 gap-y-2 p-0">
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const { text, full } = truncate(item.label);
        return (
          <Fragment key={`${item.label}-${String(index)}`}>
            <li className="min-w-0">
              {last || !item.href ? (
                <span aria-current={last ? 'page' : undefined} className="text-ink-muted">
                  {text}
                </span>
              ) : (
                <Link className="text-indigo-ink" href={item.href} title={full}>
                  {text}
                </Link>
              )}
            </li>
            {last ? null : (
              <li aria-hidden="true" className="text-ink-muted">
                /
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  </nav>
);
