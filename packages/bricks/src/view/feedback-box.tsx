import { cn } from '@learny/ui';

export type FeedbackTone = 'success' | 'error' | 'info';

const TONES: Record<FeedbackTone, string> = {
  success: 'bg-green-soft text-green-ink',
  error: 'bg-orange-soft text-orange-ink',
  info: 'bg-canvas text-ink-secondary',
};

export interface FeedbackBoxProps {
  tone: FeedbackTone;
  title: string;
  children?: React.ReactNode;
  className?: string;
}

/** Shared correction block (SPEC-503 EF-16), announced politely. */
export function FeedbackBox({ tone, title, children, className }: FeedbackBoxProps) {
  return (
    <div
      aria-live="polite"
      className={cn('flex flex-col gap-6 rounded-18 px-18 py-16', TONES[tone], className)}
      data-testid="brick-feedback"
      role="status"
    >
      <p className="m-0 text-15 font-700">{title}</p>
      {children ? <div className="text-15 leading-1.55">{children}</div> : null}
    </div>
  );
}
