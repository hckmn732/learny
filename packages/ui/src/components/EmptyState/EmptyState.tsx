import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../cn';

const PICTURE_TONE = {
  lime: 'bg-lime-softer text-lime-ink-strong',
  indigo: 'bg-indigo-soft text-indigo-ink',
  neutral: 'bg-canvas text-ink-secondary',
} as const;

export type EmptyStateProps = {
  icon?: LucideIcon;
  tone?: keyof typeof PICTURE_TONE;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Text-only variant used inside a panel (EF-12). */
  compact?: boolean;
  className?: string;
  'data-testid'?: string;
};

/** Empty state of the mockups (SPEC-303, EF-12). */
export const EmptyState = ({
  icon: Pictogram,
  tone = 'lime',
  title,
  description,
  action,
  compact = false,
  className,
  ...props
}: EmptyStateProps) => {
  if (compact) {
    return (
      <div className={cn('px-16 py-28 text-center text-14 text-ink-muted', className)} {...props}>
        <p className="m-0 leading-1.5">{description ?? title}</p>
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col items-center gap-12 p-32 text-center', className)} {...props}>
      {Pictogram ? (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-64 items-center justify-center rounded-20',
            PICTURE_TONE[tone],
          )}
        >
          <Pictogram aria-hidden="true" size={28} strokeWidth={1.8} />
        </span>
      ) : null}
      <h2 className="m-0 text-22 font-600 font-display tracking-heading">{title}</h2>
      {description ? (
        <p className="m-0 max-w-[480px] text-15 leading-1.55 text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
};
