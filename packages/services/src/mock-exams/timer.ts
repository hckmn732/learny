// Server-authoritative timer of the mock exam (SPEC-614 EF-2, ET-4, BR-PRA-03, ADR-0028,
// ADR-0172). The deadline is an absolute instant computed once at the creation of the attempt:
// reopening the page, changing timezone or reading the attempt again never grants a new delay.
// The pure timer of SPEC-502 (`@learny/bricks`) formats the remaining time; this module only
// narrows it to the exam rules (five-minute warning, five-second network tolerance).
import { formatRemaining } from '@learny/bricks';

/** BR-PRA-03 — the counter turns orange under five minutes. */
export const EXAM_WARNING_SECONDS = 5 * 60;
/** ADR-0172 §2 — an answer received up to five seconds after the deadline is still accepted. */
export const EXAM_GRACE_SECONDS = 5;

export interface ExamTimerView {
  remainingMs: number;
  remainingSeconds: number;
  display: string;
  /** Orange state, strictly under five minutes (CA-2). */
  warning: boolean;
  expired: boolean;
}

/** `max(0, deadlineAt - now)`, never negative (ET-4). */
export function examRemainingMs(deadlineAt: Date | string, now: Date): number {
  const deadline = typeof deadlineAt === 'string' ? new Date(deadlineAt) : deadlineAt;
  return Math.max(0, deadline.getTime() - now.getTime());
}

/** ET-4 — server-side remaining time and orange state of the exam counter. */
export function examTimer(
  deadlineAt: Date | string,
  now: Date,
  options: { warningSeconds?: number } = {},
): ExamTimerView {
  const remainingMs = examRemainingMs(deadlineAt, now);
  const warningSeconds = options.warningSeconds ?? EXAM_WARNING_SECONDS;
  return {
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    display: formatRemaining(remainingMs),
    // Reuse the SPEC-502 rule: orange strictly under the threshold, never when expired.
    warning: remainingMs > 0 && remainingMs < warningSeconds * 1000,
    expired: remainingMs === 0,
  };
}

/** `deadline_at = started_at + duration` (ADR-0172 §1). */
export function examDeadline(startedAt: Date, durationSec: number): Date {
  return new Date(startedAt.getTime() + Math.max(0, durationSec) * 1000);
}

/** End of the five-second tolerance window of an answer (ADR-0172 §2). */
export function examGraceEndsAt(deadlineAt: Date | string): Date {
  const deadline = typeof deadlineAt === 'string' ? new Date(deadlineAt) : deadlineAt;
  return new Date(deadline.getTime() + EXAM_GRACE_SECONDS * 1000);
}

/** True once the tolerance window is over: the attempt must be submitted automatically. */
export function examExpired(deadlineAt: Date | string, now: Date): boolean {
  return now.getTime() > examGraceEndsAt(deadlineAt).getTime();
}

/** True while an answer may still be written (deadline plus tolerance). */
export function examAcceptsAnswer(deadlineAt: Date | string, now: Date): boolean {
  return !examExpired(deadlineAt, now);
}

/** Re-export of the SPEC-502 formatter so screens never format a timer themselves. */
export { formatRemaining };
