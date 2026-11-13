'use client';

import { formatRemaining } from '@learny/bricks';
import { cn } from '@learny/ui';

import { fr } from '../../messages/fr';

const t = fr.mockExam;

export interface ExamTimerProps {
  remainingMs: number;
  warning: boolean;
}

/** BR-PRA-03, CA-2 — server-driven counter; orange strictly under five minutes. */
export function ExamTimer({ remainingMs, warning }: ExamTimerProps) {
  const minutes = Math.ceil(remainingMs / 60_000);
  return (
    <span
      aria-label={t.timerAria(minutes)}
      className={cn(
        'min-w-72 rounded-10 px-12 py-6 text-center font-display text-20 font-600 tabular-nums',
        warning ? 'bg-orange text-ink' : 'bg-dark-750 text-white',
      )}
      data-testid="exam-timer"
      data-warning={warning ? 'true' : 'false'}
      role="timer"
    >
      {formatRemaining(remainingMs)}
    </span>
  );
}
